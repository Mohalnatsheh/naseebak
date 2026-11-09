import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/push/push_permission.dart';
import '../../core/review/store_review.dart';
import '../../core/storage/picker_files.dart';
import '../../core/system/app_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../matches/match_detail_screen.dart' show ReportSheet;
import '../matches/matches_repository.dart';
import '../pro/pro_badge.dart';
import '../pro/pro_repository.dart';
import 'chat_background.dart';
import 'chat_bubble.dart';
import 'chat_cache.dart';
import 'chat_drafts.dart';
import 'chat_format.dart';
import 'chat_live.dart';
import 'chat_media_picker.dart';
import 'chat_models.dart';
import 'chat_status_bar.dart';
import 'hold_to_record.dart';
import 'media_bubbles.dart' show ChatPhotoGallery, formatVoiceDuration;
import 'message_menu.dart';
import 'photo_preview_screen.dart';
import 'reply_strip.dart';
import 'starter_chips.dart';
import 'typing_signal.dart';
import 'voice_playback.dart';
import 'voice_recorder.dart';

/// One conversation. It opens at once from the messages kept on the device (`ChatCache`), then the newest page from
/// the API is merged in. With Ably configured on the server, live events (`ChatLive`) trigger a fetch at once and the
/// `?after=` poll slows to a safety net every 20 s; without it the app polls every 4 s while open. A chat that can't
/// change any more (ended, expired, blocked) has no live link and is only checked every minute.
class ChatRoomScreen extends ConsumerStatefulWidget {
  const ChatRoomScreen({super.key, required this.chatId, this.pollInterval = const Duration(seconds: 4)});
  final String chatId;
  final Duration pollInterval;

  @override
  ConsumerState<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

/// A failed photo or voice note whose file the phone has since removed
const mediaFileGoneText = 'لم يعد الملف موجوداً على الهاتف، يمكنك إرساله من جديد';

/// The microphone refused: the first time, and once the phone no longer asks (refused before)
const micRefusedText = 'لإرسال رسالة صوتية يلزم السماح باستخدام الميكروفون.';
const micBlockedText = 'الميكروفون غير مسموح لنصيبك. يمكنك السماح به من إعدادات الهاتف.';

/// Shared preferences: the microphone was refused once on this phone (the next refusal points to the settings)
const micRefusedKey = 'mic_refused_once';

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen> with WidgetsBindingObserver {
  final _input = TextEditingController();
  final _inputFocus = FocusNode();

  /// The message my next send answers (the strip above the composer); null for none
  ReplyQuote? _replyTo;

  /// Conversation starters from the server (only while I haven't written anything)
  List<String> _starters = const [];

  /// «يكتب الآن…» in the header until then (live `typing` event or the poll's `partnerTyping`)
  DateTime? _partnerTypingUntil;
  Timer? _typingTimer;
  final _typingThrottle = TypingThrottle();

  /// The mic is held down (release sends, slide cancels or locks); false once locked, cancelled or stopped
  bool _holding = false;
  Offset _holdDrag = Offset.zero;

  /// The live level bars while the mic is held (newest last)
  List<double> _levels = const [];

  /// The original of a tapped quote, tinted for a moment
  String? _highlightId;
  Timer? _highlightTimer;

  /// Message rows on screen by message id (scrolling to a quote's original or to «رسائل جديدة»)
  final Map<String, BuildContext> _rowsById = {};
  final _scroll = ScrollController();
  ChatSummary? _chat;
  bool _chatEnabled = true;
  final List<ChatMessage> _messages = [];
  bool _hasMore = false;
  bool _loading = true;
  bool _loadingOlder = false;
  Object? _error;
  Timer? _timer;
  Duration? _timerEvery;
  bool _polling = false;
  bool _pollAgain = false;

  /// The last poll hit the server's 100-message cap: the next one reads on from the newest message held
  bool _catchUp = false;

  /// In the background (no polling, no live link until resumed)
  bool _background = false;
  StreamSubscription<void>? _live;
  bool _liveConnected = false;
  static const _livePollInterval = Duration(seconds: 20);
  static const _readOnlyPollInterval = Duration(seconds: 60);

  /// A send that got no answer matches a message of mine with the same text this close to it (device vs server clock)
  static const _reconcileWindow = Duration(minutes: 1);

  /// A photo or voice note: the server saves it at the end of an upload of up to 120 s
  static const _mediaReconcileWindow = Duration(minutes: 3);
  int _nonceSeq = 0;

  /// Server copies of my own sends that succeeded here: never the copy of another, failed send
  final Set<String> _confirmedIds = {};

  /// The gallery is open (a second tap does nothing)
  bool _picking = false;

  /// The voice note being recorded (one recorder per note; null when idle or released)
  _Voice _voice = _Voice.idle;
  VoiceRecorder? _recorder;
  Timer? _voiceTimer;
  Duration _voiceElapsed = Duration.zero;

  /// Stopped (the limit, or the app went to the background): the file waiting for «إرسال» or «إلغاء»
  String? _voicePath;

  /// The stop came from the 3-minute limit (the bar says so); otherwise the app left the foreground
  bool _voiceAtLimit = false;

  /// Scrolled up to read history (shows «الأحدث» with what arrived meanwhile)
  bool _away = false;
  int _unseen = 0;

  /// «رسائل جديدة» above this message: the first of theirs that was unread when the chat opened (fixed for this
  /// visit, gone once I write)
  String? _unreadFromId;
  bool _unreadFixed = false;

  /// The family step for the status bar (`/api/matches/{id}/intro`); null when there is none or it couldn't load
  FamilyStep? _family;

  /// The date chip that stays at the top while scrolling: the day of the topmost message on screen
  String? _stickyDay;
  bool _scrolling = false;
  Timer? _stickyHide;
  final Map<int, BuildContext> _rows = {};
  final GlobalKey _listKey = GlobalKey();

  ChatRepository get _repo => ref.read(chatRepositoryProvider);
  ChatCache get _cache => ref.read(chatCacheProvider);
  String? get _memberId => ref.read(authControllerProvider).me?.id;

  /// The chat's voice notes (players outlive their bubbles; all closed when the chat is left). Given to the bubbles
  /// through a ProviderScope override of [voicePlaybackProvider].
  late final VoicePlayback _playback;

  /// Sent voice notes still playing from their local file: deleted when the chat is left
  final List<String> _filesInUse = [];
  ProviderSubscription<bool?>? _countsPro;

  /// Pro, payments and the counts: a recording stops when they no longer allow voice notes
  final List<ProviderSubscription<Object?>> _voiceWatch = [];

  /// Read once: used again in dispose (no ref there)
  late final ChatDrafts _drafts;
  late final int _draftsGeneration;
  late final StoreReview _review;
  late final String? _draftOwner;

  /// The member who opened this chat is no longer signed in (a sign-out, a 401): nothing is kept or asked any more
  bool _signedOut = false;
  ProviderSubscription<String?>? _session;

  /// Reported or ended in this visit: no rating sheet on leaving
  bool _reportedOrEnded = false;

  /// While the media buttons are locked (no Pro), `/api/pro` is re-read now and then: Pro bought in the browser or on
  /// another phone unlocks them without leaving the chat
  Timer? _proCheck;
  static const _proCheckEvery = Duration(seconds: 60);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // This chat's own (another chat pushed on top, e.g. from a notice, has its own and never touches this one's)
    _playback = VoicePlayback(
      createPlayer: ref.read(voicePlayerFactoryProvider),
      beforePlay: ref.read(voiceAudioSessionProvider),
    )..canPlay = () => _voice == _Voice.idle || _voice == _Voice.stopped;
    // Pro bought or lapsed elsewhere: the counts poll sees it first, then the buttons follow `/api/pro`
    _countsPro = ref.listenManual(countsProvider.select((c) => c.valueOrNull?.isPro), (prev, next) {
      if (next == null || prev == next) return;
      if (ref.read(proStateProvider).valueOrNull?.isPro != next) ref.invalidate(proStateProvider);
    });
    // The chat closing (poll / load) or Pro going away mid-recording releases the microphone: from these changes,
    // never as a side effect of build
    _voiceWatch
      ..add(ref.listenManual(proStateProvider, (_, _) => _dropVoiceIfNotAllowed()))
      ..add(ref.listenManual(countsProvider, (_, _) => _dropVoiceIfNotAllowed()))
      ..add(ref.listenManual(appPaymentsProvider, (_, _) => _dropVoiceIfNotAllowed()));
    _scroll.addListener(_onScroll);
    // What was typed here before (back, or the app killed in the background)
    _drafts = ref.read(chatDraftsProvider);
    _review = ref.read(storeReviewProvider);
    _draftsGeneration = _drafts.generation;
    _draftOwner = _memberId;
    // Heard before the router removes this screen after a sign-out (its dispose then keeps nothing)
    _session = ref.listenManual(
      authControllerProvider.select((a) => a.isSignedIn ? a.me?.id : null),
      (_, id) {
        if (id != _draftOwner) _signedOut = true;
      },
    );
    final owner = _draftOwner;
    if (owner != null) {
      _drafts.read(owner, widget.chatId).then((draft) {
        if (draft != null && mounted && !_signedOut && _input.text.isEmpty) _input.text = draft;
      });
    }
    _proCheck = Timer.periodic(_proCheckEvery, (_) {
      if (!mounted || _background || !ref.read(appPaymentsProvider)) return;
      final chat = _chat;
      if (chat != null && _mediaModeNow(chat) == MediaButtons.locked) ref.invalidate(proStateProvider);
    });
    _load();
  }

  void _saveDraft() {
    final owner = _draftOwner;
    if (owner == null || _signedOut) return;
    unawaited(_drafts.write(owner, widget.chatId, _input.text, since: _draftsGeneration));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _saveDraft();
    // A real conversation (both have written): the store's rating sheet, once per install, as the chat is left
    // Not after a sign-out (it would show over the sign-in page), nor after a report, an end or a block
    final sent = _messages.where((m) => m.state == SendState.sent);
    final stillOpen = _chat?.status == 'ACTIVE' && !(_chat?.blocked ?? false) && !_reportedOrEnded;
    if (!_signedOut && stillOpen && sent.any((m) => m.mine) && sent.any((m) => !m.mine)) {
      unawaited(_review.afterConversation());
    }
    _session?.close();
    _proCheck?.cancel();
    _stopPolling();
    _live?.cancel();
    // Leaving mid-recording (or during the microphone prompt): release the microphone, send nothing
    _releaseVoice();
    // A failed photo or voice note is not kept after leaving (never cached): its temporary file goes with it
    for (final m in _messages) {
      if (m.state == SendState.failed && m.kind != MessageKind.text && m.localPath != null) {
        m.kind == MessageKind.image ? deletePickedFile(m.localPath!) : _deleteQuietly(m.localPath!);
      }
    }
    _countsPro?.close();
    for (final w in _voiceWatch) {
      w.close();
    }
    _playback
      ..canPlay = null
      ..closeAll();
    for (final f in _filesInUse) {
      _deleteQuietly(f);
    }
    _stickyHide?.cancel();
    _typingTimer?.cancel();
    _highlightTimer?.cancel();
    _input.dispose();
    _inputFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // A private note never plays on outside the app (Android keeps playing in the background otherwise)
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _playback.pauseCurrent();
      // Android may kill the app in the background: what was typed stays
      _saveDraft();
    }
    // Backgrounded or locked mid-recording: Android would record silence and iOS cuts the microphone, so stop now,
    // keep what was really recorded and wait for «إرسال» or «إلغاء»
    if ((state == AppLifecycleState.inactive || state == AppLifecycleState.paused || state == AppLifecycleState.hidden) &&
        _voice == _Voice.recording) {
      final rec = _recorder;
      if (rec != null) _stopRecording(rec, limit: false);
    }
    if (state == AppLifecycleState.resumed) {
      _background = false;
      // Pro may have changed elsewhere meanwhile (the buttons follow it)
      if (ref.read(appPaymentsProvider)) ref.invalidate(proStateProvider);
      // Not before the chat is known (the first load starts watching itself)
      if (_chat == null) return;
      _watch();
      _poll();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _background = true;
      _stopPolling();
      _stopLive();
    }
  }

  /// Messages can still arrive or change: an open chat (a closed one only gets an occasional check)
  bool get _open => (_chat?.canSend ?? false) && _chatEnabled;

  /// Live link and poll for the chat's current state; nothing once closed or in the background.
  void _watch() {
    if (!mounted || _background) return;
    _open ? _startLive() : _stopLive();
    _startPolling();
  }

  void _startPolling() {
    if (!mounted || _background) return;
    final every = !_open
        ? _readOnlyPollInterval
        : _liveConnected
            ? _livePollInterval
            : widget.pollInterval;
    if (_timer != null && _timerEvery == every) return;
    _timer?.cancel();
    _timerEvery = every;
    _timer = Timer.periodic(every, (_) => _poll());
  }

  void _stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  void _startLive() {
    if (_live != null || !mounted || _background) return;
    _live = ref.read(chatLiveProvider).events(widget.chatId, connected: (on) {
      if (!mounted || on == _liveConnected) return;
      _liveConnected = on;
      _startPolling();
      if (on) _poll();
    }).listen(_onLive, onDone: () => _live = null);
  }

  /// A live event: typing and reactions carry what changed; anything else (a message, a read tick) fetches
  void _onLive(ChatLiveEvent e) {
    if (!mounted) return;
    switch (e.name) {
      case 'typing':
        final who = asString(e.data?['userId']);
        if (who != null && who != _memberId) _notePartnerTyping(true);
      case 'reaction':
        final id = asString(e.data?['messageId']);
        final i = id == null ? -1 : _messages.indexWhere((m) => m.id == id && m.state == SendState.sent);
        if (i < 0) return;
        setState(() => _messages[i] = _messages[i].withReactions(reactionsFromLive(e.data?['reactions'], _memberId)));
        _saveCache();
      default:
        _poll();
    }
  }

  /// The other person is typing: shown for 5 s from now, only in an open chat
  void _notePartnerTyping(bool typing) {
    if (!typing || !mounted || !_open) return;
    _typingTimer?.cancel();
    setState(() => _partnerTypingUntil = DateTime.now().add(typingShowFor));
    _typingTimer = Timer(typingShowFor, () {
      if (mounted) setState(() => _partnerTypingUntil = null);
    });
  }

  void _clearPartnerTyping() {
    _typingTimer?.cancel();
    _partnerTypingUntil = null;
  }

  bool get _partnerTyping {
    final until = _partnerTypingUntil;
    return until != null && _open && DateTime.now().isBefore(until);
  }

  /// I typed: tell the other person, at most every 3 s (quiet on failure)
  void _onTyped(String text) {
    if (text.trim().isEmpty || !_open || !_typingThrottle.tryNow()) return;
    unawaited(_repo.typing(widget.chatId).catchError((_) {}));
  }

  void _stopLive() {
    _live?.cancel();
    _live = null;
    _liveConnected = false;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    // What this device already has: the chat shows at once, the network only adds what changed
    final member = _memberId;
    if (member != null && _chat == null) {
      final cached = await _cache.read(member, widget.chatId);
      if (cached != null && mounted && _chat == null) {
        setState(() {
          _chat = cached.conversation;
          _messages
            ..clear()
            ..addAll(cached.messages);
          _hasMore = cached.hasMore;
        });
      }
    }
    try {
      final page = await _repo.load(widget.chatId);
      if (!mounted) return;
      setState(() {
        _chat = page.conversation;
        _chatEnabled = page.chatEnabled;
        _starters = page.starters;
        _mergeLatest(page);
        // A text kept as failed (offline) that the server saved after all
        _reconcile(page.messages);
      });
      _notePartnerTyping(page.partnerTyping);
      if (!_unreadFixed) {
        _unreadFixed = true;
        _unreadFromId = firstUnreadId(page.messages);
        // Opened on unread messages: «رسائل جديدة» in view, not only the newest
        if (_unreadFromId != null) WidgetsBinding.instance.addPostFrameCallback((_) => _revealUnread());
      }
      _dropVoiceIfNotAllowed();
      _saveCache();
      _markRead();
      _watch();
      _fillScreen();
      _loadFamilyStep();
    } catch (e) {
      if (!mounted) return;
      final gone = e is ApiException && (e.kind == ApiErrorKind.notFound || e.kind == ApiErrorKind.forbidden);
      if (gone && member != null) {
        // No longer mine to read (hidden after a block, account left…): forget the copy on this device
        await _cache.remove(member, widget.chatId);
        if (!mounted) return;
        setState(() {
          _chat = null;
          _messages.clear();
        });
      }
      if (_chat == null) {
        setState(() => _error = e);
      } else {
        // Offline with a cached copy: keep showing it, the poll retries
        _watch();
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The newest page over what the device had: contiguous → keep the older cached messages and take the page for
  /// the rest (new messages, read ticks); a gap (more than a page arrived meanwhile) → start again from the page.
  void _mergeLatest(ChatPage page) {
    final pending = _messages.where((m) => m.state != SendState.sent).toList();
    final cached = _messages.where((m) => m.state == SendState.sent).toList();
    final oldestNew = page.messages.isEmpty ? null : page.messages.first;
    final contiguous =
        !page.hasMore || cached.isEmpty || (oldestNew != null && cached.any((m) => m.id == oldestNew.id));
    final older = contiguous && oldestNew != null && page.hasMore
        ? cached.takeWhile((m) => m.id != oldestNew.id).toList()
        : <ChatMessage>[];
    final pageIds = page.messages.map((m) => m.id).toSet();
    final merged = sortedForChat([
      ...older.where((m) => !pageIds.contains(m.id)),
      ...page.messages,
      ...pending.where((m) => !pageIds.contains(m.id)),
    ]);
    _messages
      ..clear()
      ..addAll(merged);
    _hasMore = older.isEmpty ? page.hasMore : (_hasMore || page.hasMore);
  }

  void _saveCache() {
    final member = _memberId;
    final chat = _chat;
    if (member == null || chat == null) return;
    _cache.write(member, widget.chatId, CachedChat(conversation: chat, messages: _messages, hasMore: _hasMore));
  }

  DateTime? get _lastServerTime {
    for (final m in _messages.reversed) {
      if (m.state == SendState.sent) return m.createdAt;
    }
    return null;
  }

  /// `?after=` for the poll: the newest message held, or — while one of my last 30 is still unread — the oldest such,
  /// so its read tick (and those after it) come back with the page.
  DateTime? get _pollSince {
    final last = _lastServerTime;
    if (last == null || _catchUp) return last;
    DateTime? since;
    var seen = 0;
    for (final m in _messages.reversed) {
      if (m.state != SendState.sent) continue;
      if (++seen > 30) break;
      if (m.mine && m.readAt == null) since = m.createdAt;
    }
    return since ?? last;
  }

  Future<void> _poll() async {
    if (_polling) {
      // A live event during a fetch: fetch once more right after it
      _pollAgain = true;
      return;
    }
    if (_loading || !mounted) return;
    _polling = true;
    try {
      final after = _pollSince;
      final catchUp = _catchUp;
      final page = await _repo.load(widget.chatId, after: after);
      if (!mounted) return;
      _catchUp = false;
      final known = _messages.map((m) => m.id).toSet();
      final fresh = page.messages.where((m) => !known.contains(m.id)).toList();
      var changed = false;
      setState(() {
        _chat = page.conversation;
        _chatEnabled = page.chatEnabled;
        _starters = page.starters;
        // A message from them ends their «يكتب الآن…»
        if (fresh.any((m) => !m.mine)) _clearPartnerTyping();
        if (after == null) {
          // Nothing loaded yet (the first load failed offline): take the latest page as is
          _messages.removeWhere((m) => m.state == SendState.sent);
          _messages.insertAll(0, page.messages);
          _hasMore = page.hasMore;
        } else {
          changed = _replaceChanged(page.messages);
          _insertSorted(fresh);
          if (_away) _unseen += fresh.where((m) => !m.mine).length;
          // Cut at the cap: read the rest from the newest message right away
          if (page.messages.length >= 100 && !catchUp && after != _lastServerTime) _catchUp = _pollAgain = true;
        }
        _reconcile(fresh);
      });
      _notePartnerTyping(page.partnerTyping);
      _dropVoiceIfNotAllowed();
      if (fresh.isNotEmpty || changed) _saveCache();
      if (fresh.any((m) => !m.mine)) _markRead();
      _watch();
      if (after == null) _fillScreen();
    } catch (_) {
      // Silent: the next tick retries; a 401 signs out through the API client
    } finally {
      _polling = false;
      if (_pollAgain && mounted) {
        _pollAgain = false;
        _poll();
      }
    }
  }

  /// Messages already held come back with a newer state (read ticks): take the server copy, same place.
  bool _replaceChanged(List<ChatMessage> page) {
    final byId = {for (final m in page) m.id: m};
    var changed = false;
    for (var i = 0; i < _messages.length; i++) {
      final held = _messages[i];
      final server = held.state == SendState.sent ? byId[held.id] : null;
      if (server != null && !server.sameAs(held)) {
        _messages[i] = server;
        changed = true;
      }
    }
    return changed;
  }

  /// A send that got no answer (offline, timeout) may have been saved all the same: once a message of mine with the
  /// same text arrives within a minute of it, that's the one — drop the failed bubble instead of asking for a retry.
  /// A photo or voice note has no text of its own (the server copy carries the old-app fallback «📷 صورة», and the GET
  /// returns no nonce): it matches a message of mine of the same kind within the upload window.
  void _reconcile(Iterable<ChatMessage> arrived) {
    final candidates =
        arrived.where((m) => m.mine && m.state == SendState.sent && !_confirmedIds.contains(m.id)).toList();
    if (candidates.isEmpty) return;
    // A copy that arrives while another photo / voice note of that kind is still uploading may be that one's
    bool uploading(MessageKind k) => _messages.any((x) => x.state == SendState.sending && x.kind == k);
    bool same(ChatMessage m, ChatMessage local) {
      final gap = m.createdAt.difference(local.createdAt).abs();
      if (local.kind != MessageKind.text) return m.kind == local.kind && gap <= _mediaReconcileWindow;
      return m.kind == MessageKind.text && m.body == local.body && gap <= _reconcileWindow;
    }

    _messages.removeWhere((local) {
      if (local.state != SendState.failed || !local.maybeSent) return false;
      if (local.kind != MessageKind.text && uploading(local.kind)) return false;
      final i = candidates.indexWhere((m) => same(m, local));
      if (i < 0) return false;
      candidates.removeAt(i);
      return true;
    });
  }

  /// Same order as the server (time, then id); a failed or refused bubble stays at its own time, only what is still
  /// sending stays under everything
  void _insertSorted(List<ChatMessage> fresh) {
    if (fresh.isEmpty) return;
    final all = sortedForChat([..._messages, ...fresh]);
    _messages
      ..clear()
      ..addAll(all);
  }

  /// «حذف» on a failed or refused message: it never reached the other person, it only leaves this phone
  void _deleteFailed(ChatMessage m) {
    setState(() => _messages.removeWhere((x) => x.nonce == m.nonce));
    final file = m.localPath;
    if (file != null) m.kind == MessageKind.image ? deletePickedFile(file) : _deleteQuietly(file);
    _saveCache();
  }

  /// The family step for the one status bar. Quiet on failure (the bar just doesn't show it).
  Future<void> _loadFamilyStep() async {
    final chat = _chat;
    if (chat == null || chat.matchHidden || !_open) return;
    try {
      final s = await ref.read(matchesRepositoryProvider).intro(chat.matchId);
      if (!mounted) return;
      final step = familyStepOf(s.familyStatus, introRequests: s.flags.introRequests, closed: s.closed);
      if (step != _family) setState(() => _family = step);
    } catch (_) {}
  }

  /// The match page (family introduction, guardian details); the bar follows what happened there
  Future<void> _openMatch() async {
    final chat = _chat;
    if (chat == null || chat.matchHidden) return;
    await context.push('/matches/${chat.matchId}');
    if (!mounted) return;
    _loadFamilyStep();
  }

  static const _pushChipKey = 'chat_push_chip_dismissed';

  void _dismissPushChip() {
    unawaited(ref.read(sharedPreferencesProvider).setBool(_pushChipKey, true));
    setState(() {});
  }

  /// Sticky date chip: the day of the topmost message row on screen, shown while scrolling and briefly after
  void _onScrollNotification(ScrollNotification n) {
    if (n.depth != 0) return;
    if (n is ScrollStartNotification || n is ScrollUpdateNotification) {
      _stickyHide?.cancel();
      final day = _topDay();
      if (!_scrolling || day != _stickyDay) {
        setState(() {
          _scrolling = true;
          _stickyDay = day;
        });
      }
    } else if (n is ScrollEndNotification) {
      _stickyHide?.cancel();
      _stickyHide = Timer(const Duration(milliseconds: 1400), () {
        if (mounted && _scrolling) setState(() => _scrolling = false);
      });
    }
  }

  String? _topDay() {
    final list = _listKey.currentContext?.findRenderObject();
    if (list is! RenderBox || !list.hasSize) return null;
    final top = list.localToGlobal(Offset.zero).dy;
    final items = _messages.reversed.toList();
    int? best;
    double bestTop = double.negativeInfinity;
    for (final e in _rows.entries) {
      if (!e.value.mounted || e.key >= items.length) continue;
      final box = e.value.findRenderObject();
      if (box is! RenderBox || !box.hasSize || !box.attached) continue;
      final y = box.localToGlobal(Offset.zero).dy;
      // The row crossing the top edge (or the last one starting above it)
      if (y <= top + 8 && y > bestTop) {
        bestTop = y;
        best = e.key;
      }
    }
    return best == null ? null : chatDayLabel(items[best].createdAt);
  }

  void _onScroll() {
    // reverse: true — offset 0 is the newest message, older ones are at the far end
    final pos = _scroll.position;
    if (pos.pixels > pos.maxScrollExtent - 200) _loadOlder();
    final away = pos.pixels > 300;
    if (away != _away) {
      setState(() {
        _away = away;
        if (!away) _unseen = 0;
      });
    }
  }

  /// A first page too short to scroll can't trigger «older»: keep loading until the list fills the screen
  void _fillScreen() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || !_hasMore || !_scroll.hasClients) return;
      if (_scroll.position.maxScrollExtent > 0) return;
      await _loadOlder();
      _fillScreen();
    });
  }

  void _toNewest() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
  }

  Future<void> _loadOlder() async {
    if (!_hasMore || _loadingOlder || _messages.isEmpty) return;
    setState(() => _loadingOlder = true);
    try {
      final first = _messages.first;
      final page = await _repo.load(widget.chatId, before: first.createdAt, beforeId: first.id);
      if (!mounted) return;
      final known = _messages.map((m) => m.id).toSet();
      setState(() {
        _messages.insertAll(0, page.messages.where((m) => !known.contains(m.id)));
        _hasMore = page.hasMore;
      });
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  Future<void> _markRead() async {
    final last = _lastServerTime;
    try {
      await _repo.markRead(widget.chatId, upTo: last);
    } catch (_) {}
  }

  Future<void> _send([ChatMessage? retry]) async {
    final text = retry?.body ?? _input.text.trim();
    if (text.isEmpty) return;
    final nonce = retry?.nonce ?? _newNonce();
    final reply = retry != null ? retry.replyTo : _replyTo;
    final local = ChatMessage(
      id: 'local-$nonce',
      body: text,
      createdAt: DateTime.now(),
      mine: true,
      state: SendState.sending,
      nonce: nonce,
      replyTo: reply,
    );
    // What a poll during the send can bring (the copy of this message, if the answer gets lost)
    final before = _messages.map((m) => m.id).toSet();
    // My first message in this chat (the whole history is loaded and none of it is mine)
    final first = retry == null && !_hasMore && !_messages.any((m) => m.mine);
    setState(() {
      if (retry != null) _messages.removeWhere((m) => m.nonce == nonce);
      _messages.add(local);
      if (retry == null) {
        _input.clear();
        _replyTo = null;
      }
      // I answered: what was new has been read
      _unreadFromId = null;
    });
    if (retry == null) _saveDraft();
    // The next keystroke tells the other person again at once
    _typingThrottle.reset();
    _toNewest();
    try {
      final sent = await _repo.send(widget.chatId, text, nonce: nonce, replyToId: reply?.id);
      _confirmedIds.add(sent.id);
      if (first) ref.read(analyticsProvider).chatStarted();
      if (!mounted) return;
      setState(() {
        _messages.removeWhere((m) => m.nonce == nonce || m.id == sent.id);
        _insertSorted([sent]);
      });
      _saveCache();
      // «المحادثات» shows the last message and orders by it: my own message changes no unread count, so reload it here
      ref.invalidate(chatListProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        final i = _messages.indexWhere((m) => m.nonce == nonce);
        if (i >= 0) {
          _messages[i] = _messages[i].copyWith(
              state: SendState.failed, error: e.message, filtered: e.code == 'FILTERED', maybeSent: e.isNetwork);
        }
        // Its copy may already be here (a poll during the send); otherwise the next poll reconciles
        if (e.isNetwork) _reconcile(_messages.where((m) => !before.contains(m.id)));
      });
      // Kept on the phone: leaving the chat doesn't lose it
      _saveCache();
      if (e.code == 'EXPIRED' || e.code == 'NOT_ALLOWED' || e.code == 'DISABLED') _poll();
    }
  }

  String _newNonce() => 'app-${DateTime.now().microsecondsSinceEpoch}-${_nonceSeq++}';

  /// The photo button (Pro): pick from the gallery, refuse over 10 MB, then send.
  Future<void> _pickPhoto() async {
    if (_picking) return;
    _picking = true;
    PickedPhoto? photo;
    try {
      photo = await ref.read(chatPhotoPickerProvider)();
    } catch (_) {
      if (mounted) showSnack(context, 'تعذّر اختيار الصورة');
    } finally {
      _picking = false;
    }
    if (!mounted || photo == null) return;
    if (photo.bytes > maxChatPhotoBytes) {
      deletePickedFile(photo.path);
      showSnack(context, 'الصورة كبيرة جداً');
      return;
    }
    // Seen full screen before anything is uploaded: «إرسال» or «إلغاء»
    final send = await PhotoPreviewScreen.confirm(context, photo.path);
    if (!mounted || !send || !_open) {
      deletePickedFile(photo.path);
      return;
    }
    await _sendMedia(kind: MessageKind.image, path: photo.path, reply: _takeReply());
  }

  /// The reply being written goes with this send (the strip closes)
  ReplyQuote? _takeReply() {
    final r = _replyTo;
    if (r != null) setState(() => _replyTo = null);
    return r;
  }

  /// A greyed media button (and the link under a PRO_REQUIRED failure): the Pro screen
  void _openPro() => context.push('/pro');

  /// A photo or voice note: a bubble from the local file at once, replaced by the server copy. A retry passes the
  /// failed bubble and resends its file with the same nonce. `PRO_REQUIRED` (Pro lapsed while the chat was open)
  /// fails the bubble with the server's text and reloads the Pro state, so the buttons follow.
  Future<void> _sendMedia({
    MessageKind? kind,
    String? path,
    int? durationSec,
    ChatMessage? retry,
    ReplyQuote? reply,
  }) async {
    final k = retry?.kind ?? kind ?? MessageKind.image;
    final file = retry?.localPath ?? path;
    if (file == null || k == MessageKind.text) return;
    // The phone cleared its temporary files meanwhile: the retry could never work, so the bubble goes
    if (retry != null && !File(file).existsSync()) {
      setState(() => _messages.removeWhere((m) => m.nonce == retry.nonce));
      showSnack(context, mediaFileGoneText);
      return;
    }
    final seconds = retry?.media?.durationSec ?? durationSec;
    final voice = k == MessageKind.voice;
    // A photo is always JPEG: `chatPhotoPickerProvider` sets imageQuality, which makes image_picker re-encode (HEIC
    // included); the server also checks the bytes. Keep the two together if the picker changes.
    final mime = voice ? 'audio/mp4' : 'image/jpeg';
    final nonce = retry?.nonce ?? _newNonce();
    final quote = retry != null ? retry.replyTo : reply;
    final local = ChatMessage(
      id: 'local-$nonce',
      body: '',
      createdAt: DateTime.now(),
      mine: true,
      state: SendState.sending,
      nonce: nonce,
      kind: k,
      localPath: file,
      media: seconds == null ? null : ChatMedia(url: '', type: mime, durationSec: seconds),
      replyTo: quote,
    );
    // Refreshes that must happen even if the member leaves the chat meanwhile
    final container = ProviderScope.containerOf(context, listen: false);
    final first = retry == null && !_hasMore && !_messages.any((m) => m.mine);
    // What a poll during the upload can bring (the copy of this message, if the answer gets lost)
    final before = _messages.map((m) => m.id).toSet();
    setState(() {
      if (retry != null) _messages.removeWhere((m) => m.nonce == nonce);
      _messages.add(local);
    });
    _toNewest();
    try {
      final sent = await _repo.sendMedia(
        widget.chatId,
        kind: messageKindName(k),
        filePath: file,
        mime: mime,
        durationSec: voice ? seconds : null,
        nonce: nonce,
        replyToId: quote?.id,
      );
      _confirmedIds.add(sent.id);
      if (first) container.read(analyticsProvider).chatStarted();
      container.invalidate(chatListProvider);
      // The voice note's temporary file is no longer needed (the server copy plays from now on), unless it is playing
      // from that file right now: its session moves to the server id and the file stays until the chat is left
      if (voice) {
        if (mounted && _playback.handOver(file, sent.id)) {
          _filesInUse.add(file);
        } else {
          _deleteQuietly(file);
        }
      }
      // The picker's copy of a photo: the server copy shows from now on
      if (!voice) deletePickedFile(file);
      if (!mounted) return;
      setState(() {
        _messages.removeWhere((m) => m.nonce == nonce || m.id == sent.id);
        _insertSorted([sent]);
      });
      _saveCache();
    } catch (e) {
      final api = e is ApiException ? e : null;
      if (api?.code == 'PRO_REQUIRED') {
        container.invalidate(proStateProvider);
        container.invalidate(countsProvider);
      }
      if (!mounted) return;
      setState(() {
        final i = _messages.indexWhere((m) => m.nonce == nonce);
        if (i >= 0) {
          _messages[i] = _messages[i].copyWith(
            state: SendState.failed,
            error: ApiException.messageOf(e),
            maybeSent: api?.isNetwork ?? false,
            proRequired: api?.code == 'PRO_REQUIRED',
          );
        }
        // Its copy may already be here (a poll during the upload); otherwise the next poll reconciles
        if (api?.isNetwork ?? false) _reconcile(_messages.where((m) => !before.contains(m.id)));
      });
      if (api?.code == 'EXPIRED' || api?.code == 'NOT_ALLOWED' || api?.code == 'DISABLED') _poll();
    }
  }

  /// Photo and voice buttons for this chat (watched: the footer rebuilds when Pro or payments change)
  MediaButtons _mediaMode(ChatSummary chat) {
    final pro = ref.watch(proStateProvider).valueOrNull;
    final countsPro = ref.watch(countsProvider.select((c) => c.valueOrNull?.isPro));
    return mediaButtonsMode(
      isPro: pro?.isPro ?? countsPro ?? false,
      appPayments: ref.watch(appPaymentsProvider),
      canBuy: pro?.canBuy ?? false,
      chatActive: chat.status == 'ACTIVE',
    );
  }

  /// The media buttons right now (read, not watched: used after an await and from a timer)
  MediaButtons _mediaModeNow(ChatSummary chat) {
    final pro = ref.read(proStateProvider).valueOrNull;
    final countsPro = ref.read(countsProvider).valueOrNull?.isPro;
    return mediaButtonsMode(
      isPro: pro?.isPro ?? countsPro ?? false,
      appPayments: ref.read(appPaymentsProvider),
      canBuy: pro?.canBuy ?? false,
      chatActive: chat.status == 'ACTIVE',
    );
  }

  /// The chat closed or Pro went away mid-recording: release the microphone, the bar goes back to idle
  void _dropVoiceIfNotAllowed() {
    if (_voice == _Voice.idle) return;
    // Not in the middle of a provider notification or a build
    Future.microtask(() {
      if (!mounted || _voice == _Voice.idle || _voiceAllowed) return;
      _releaseVoice();
      setState(() {
        _voice = _Voice.idle;
        _holding = false;
      });
    });
  }

  /// Voice notes are still allowed right now (Pro, chat open). Read, not watched: used after an await.
  bool get _voiceAllowed {
    final chat = _chat;
    if (chat == null || !chat.canSend || !_chatEnabled) return false;
    return _mediaModeNow(chat) == MediaButtons.enabled;
  }

  /// The mic: ask for the microphone (the system asks only the first time), then record until «إرسال», «إلغاء» or
  /// the 3-minute limit. Leaving the chat, or the chat closing, during the prompt drops the recorder unused.
  Future<void> _startVoice() async {
    if (_voice != _Voice.idle || _recorder != null) return;
    final rec = ref.read(voiceRecorderProvider)();
    _recorder = rec;
    // Recording and playback never overlap (they share the phone's audio session)
    _playback.pauseCurrent();
    setState(() => _voice = _Voice.starting);
    var allowed = false;
    try {
      allowed = await rec.hasPermission();
    } catch (_) {}
    if (_recorder != rec || !mounted || !_voiceAllowed) return _drop(rec);
    if (!allowed) {
      _drop(rec);
      _micRefused();
      return;
    }
    try {
      await rec.start();
    } catch (_) {
      _drop(rec);
      if (mounted) showSnack(context, 'تعذّر بدء التسجيل');
      return;
    }
    if (_recorder != rec || !mounted || !_voiceAllowed) return _drop(rec);
    setState(() {
      _voice = _Voice.recording;
      _voiceAtLimit = false;
      _voiceElapsed = Duration.zero;
    });
    _voiceTimer = Timer.periodic(const Duration(milliseconds: 250), (_) => _tickVoice());
  }

  /// The microphone refused: the first time a short reason; after that (the phone no longer asks) the way to the
  /// phone's settings. Both carry «الإعدادات».
  void _micRefused() {
    final prefs = ref.read(sharedPreferencesProvider);
    final before = prefs.getBool(micRefusedKey) ?? false;
    unawaited(prefs.setBool(micRefusedKey, true));
    final open = ref.read(openAppSettingsProvider);
    showSnack(
      context,
      before ? micBlockedText : micRefusedText,
      action: SnackBarAction(label: 'الإعدادات', onPressed: () => open()),
    );
  }

  /// A recorder let go during an await (prompt, start, stop) or refused: cancel it (deleting its file) and dispose it.
  /// The State is touched only if still mounted and no other recording took over.
  void _drop(VoiceRecorder rec) {
    if (_recorder == rec) _recorder = null;
    _endRecorder(rec);
    if (mounted && _recorder == null && _voice != _Voice.idle) setState(() => _voice = _Voice.idle);
  }

  void _endRecorder(VoiceRecorder rec) {
    unawaited(() async {
      try {
        await rec.cancel();
      } catch (_) {}
      try {
        await rec.dispose();
      } catch (_) {}
    }());
  }

  Duration _elapsedOf(VoiceRecorder rec) => rec.elapsed > maxVoiceDuration ? maxVoiceDuration : rec.elapsed;

  void _tickVoice() {
    final rec = _recorder;
    if (!mounted || rec == null || _voice != _Voice.recording) return;
    final elapsed = _elapsedOf(rec);
    if (elapsed >= maxVoiceDuration) {
      _stopRecording(rec, limit: true);
      return;
    }
    if (elapsed.inSeconds != _voiceElapsed.inSeconds) setState(() => _voiceElapsed = elapsed);
    // The live bars beside the held mic
    if (_holding) {
      rec.level().then((l) {
        if (!mounted || _recorder != rec || _voice != _Voice.recording || !_holding) return;
        setState(() => _levels = [..._levels.length >= 60 ? _levels.skip(1) : _levels, l]);
      }).catchError((_) {});
    }
  }

  /// The limit, or the app leaving the foreground: the recorder stops, the real time recorded is frozen and the bar
  /// waits for «إرسال» or «إلغاء» (never sent on its own)
  Future<void> _stopRecording(VoiceRecorder rec, {required bool limit}) async {
    _voiceTimer?.cancel();
    _voiceTimer = null;
    final elapsed = limit ? maxVoiceDuration : _elapsedOf(rec);
    setState(() {
      _voice = _Voice.stopping;
      _voiceAtLimit = limit;
      _voiceElapsed = elapsed;
      // A held mic stops holding: the bar waits for «إرسال» or «إلغاء» whatever the finger does next
      _holding = false;
    });
    String? path;
    try {
      path = await rec.stop();
    } catch (_) {}
    if (_recorder != rec || !mounted) return _drop(rec);
    if (path == null) {
      _drop(rec);
      showSnack(context, 'تعذّر حفظ التسجيل');
      return;
    }
    setState(() {
      _voicePath = path;
      _voice = _Voice.stopped;
    });
  }

  /// «إرسال»: stop (unless already stopped at the limit), let the microphone go and send like a photo
  Future<void> _sendVoice() async {
    final rec = _recorder;
    if (rec == null) return;
    String? path;
    Duration elapsed;
    if (_voice == _Voice.stopped) {
      path = _voicePath;
      // Frozen when it stopped (the limit or the app going to the background)
      elapsed = _voiceElapsed;
    } else if (_voice == _Voice.recording) {
      _voiceTimer?.cancel();
      _voiceTimer = null;
      elapsed = _elapsedOf(rec);
      setState(() => _voice = _Voice.stopping);
      try {
        path = await rec.stop();
      } catch (_) {}
      if (_recorder != rec || !mounted) return _drop(rec);
    } else {
      return;
    }
    // The file stays for the upload (and a retry); only the microphone is released
    _recorder = null;
    _voicePath = null;
    rec.dispose().catchError((_) {});
    setState(() => _voice = _Voice.idle);
    if (path == null) {
      showSnack(context, 'تعذّر حفظ التسجيل');
      return;
    }
    await _sendMedia(kind: MessageKind.voice, path: path, durationSec: voiceDurationSec(elapsed), reply: _takeReply());
  }

  // Hold to record: press and hold the mic, release to send, slide towards the start edge to cancel, slide up to
  // lock (the bar then has stop, cancel and send). A tap records hands-free at once (the same locked bar), which also
  // serves screen readers. Whatever ends a hold other than a plain release (a cancelled pointer, a second finger, a
  // finger that wandered off, the app leaving, the limit) stops and waits: a held note is never sent silently.

  void _onHoldStart() {
    if (_voice != _Voice.idle || _recorder != null) return;
    unawaited(HapticFeedback.mediumImpact());
    setState(() {
      _holding = true;
      _holdDrag = Offset.zero;
      _levels = const [];
    });
    _startVoice();
  }

  void _onHoldMove(Offset delta) {
    if (!_holding || !mounted) return;
    switch (holdSlideFor(delta, Directionality.of(context))) {
      case HoldSlide.cancel:
        unawaited(HapticFeedback.heavyImpact());
        _releaseVoice();
        setState(() {
          _holding = false;
          _voice = _Voice.idle;
        });
      case HoldSlide.lock:
        unawaited(HapticFeedback.selectionClick());
        // Hands-free from here: the locked bar (stop, cancel, send)
        setState(() => _holding = false);
      case HoldSlide.none:
        setState(() => _holdDrag = delta);
    }
  }

  void _onHoldRelease(Offset delta) {
    if (!_holding || !mounted) return;
    _holding = false;
    final rec = _recorder;
    if (_voice == _Voice.starting || rec == null) {
      // Let go during the microphone prompt or before the recorder started: nothing is recorded
      _releaseVoice();
      setState(() => _voice = _Voice.idle);
      return;
    }
    if (_voice != _Voice.recording) {
      // Already stopped (the limit, the app leaving): it waits for «إرسال» or «إلغاء»
      setState(() {});
      return;
    }
    if (!holdReleaseSends(delta)) {
      _stopRecording(rec, limit: false);
      return;
    }
    if (rec.elapsed < holdMinDuration) {
      _releaseVoice();
      setState(() => _voice = _Voice.idle);
      showSnack(context, holdTooShortText);
      return;
    }
    unawaited(HapticFeedback.lightImpact());
    _sendVoice();
  }

  void _onHoldInterrupted() {
    if (!_holding || !mounted) return;
    _holding = false;
    final rec = _recorder;
    if (_voice == _Voice.recording && rec != null) {
      _stopRecording(rec, limit: false);
    } else if (_voice == _Voice.starting) {
      _releaseVoice();
      setState(() => _voice = _Voice.idle);
    } else {
      setState(() {});
    }
  }

  /// «إلغاء»: stop and delete the file
  void _cancelVoice() {
    if (_voice != _Voice.recording && _voice != _Voice.stopped) return;
    _releaseVoice();
    setState(() => _voice = _Voice.idle);
  }

  /// Stops the clock and lets the recorder go, deleting its file. A step still awaiting the recorder (the permission
  /// prompt, start, stop) sees it gone and drops it itself. Never calls setState (runs from dispose).
  void _releaseVoice() {
    _voiceTimer?.cancel();
    _voiceTimer = null;
    final rec = _recorder;
    final waiting = _voicePath;
    _recorder = null;
    _voicePath = null;
    if (waiting != null) _deleteQuietly(waiting);
    if (rec == null || _voice == _Voice.starting || _voice == _Voice.stopping) return;
    _endRecorder(rec);
  }

  void _deleteQuietly(String path) {
    try {
      final f = File(path);
      if (f.existsSync()) f.deleteSync();
    } catch (_) {}
  }

  /// In place of the text box while recording (or stopped at the limit): «إلغاء», the clock, «إرسال»
  Widget _recordingBar() {
    final stopped = _voice == _Voice.stopped;
    final busy = _voice == _Voice.stopping;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.line))),
        child: Row(
          children: [
            if (_voice == _Voice.recording)
              IconButton(
                key: const Key('voice-stop'),
                tooltip: 'إيقاف التسجيل',
                onPressed: () {
                  final rec = _recorder;
                  if (rec != null && _voice == _Voice.recording) _stopRecording(rec, limit: false);
                },
                style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                icon: Icon(Icons.stop_circle_rounded, color: Theme.of(context).colorScheme.error, size: 28),
              ),
            TextButton(
              key: const Key('voice-cancel'),
              onPressed: busy ? null : _cancelVoice,
              style: TextButton.styleFrom(minimumSize: const Size(64, 48), foregroundColor: AppColors.muted),
              child: const Text('إلغاء'),
            ),
            Expanded(
              child: Column(
                key: const Key('voice-clock'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        stopped || busy ? Icons.stop_circle_outlined : Icons.fiber_manual_record_rounded,
                        size: 14,
                        color: stopped || busy ? AppColors.muted : Theme.of(context).colorScheme.error,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        formatVoiceDuration(_voiceElapsed),
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.ink),
                      ),
                    ],
                  ),
                  if (stopped || busy)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        _voiceAtLimit ? 'بلغ التسجيل الحد الأقصى' : 'توقف التسجيل',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ),
                ],
              ),
            ),
            FilledButton.icon(
              key: const Key('voice-send'),
              onPressed: busy ? null : _sendVoice,
              style: FilledButton.styleFrom(backgroundColor: AppColors.navy, minimumSize: const Size(96, 48)),
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('إرسال'),
            ),
          ],
        ),
      ),
    );
  }

  /// A filtered message can't be resent as is: put it back in the box to edit.
  void _editFailed(ChatMessage m) {
    setState(() {
      _messages.removeWhere((x) => x.nonce == m.nonce);
      _input.text = m.body;
      _replyTo = m.replyTo;
    });
  }

  Future<void> _end({bool report = false, ChatMessage? message}) async {
    String? reason;
    String? details;
    if (report) {
      final res = await showModalBottomSheet<(String, String)>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => ReportSheet(
          title: message == null ? 'إبلاغ' : 'إبلاغ عن الرسالة',
          description: 'يصل البلاغ إلى فريق نصيبك، وتنتهي المحادثة للطرفين ولا يمكن فتحها مرة أخرى.',
          submitLabel: 'إبلاغ وإنهاء المحادثة',
          // The message reported, named in the details (still editable); the team sees the chat with the report
          initialDetails: message == null ? null : 'بخصوص الرسالة: «${replySnippetOf(message)}»',
        ),
      );
      if (res == null) return;
      reason = res.$1;
      details = res.$2;
    } else {
      final ok = await confirmDialog(
        context,
        title: 'إنهاء المحادثة',
        body: 'تنتهي المحادثة للطرفين ولا يمكن فتحها مرة أخرى.',
        confirmLabel: 'إنهاء',
        destructive: true,
      );
      if (!ok) return;
    }
    try {
      await _repo.end(widget.chatId, reportReason: reason, details: details);
      _reportedOrEnded = true;
      if (mounted) showSnack(context, report ? 'تم إنهاء المحادثة والإبلاغ' : 'تم إنهاء المحادثة');
      await _poll();
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  Future<void> _extend() async {
    try {
      await _repo.extend(widget.chatId);
      if (mounted) showSnack(context, 'تم تمديد المحادثة 7 أيام');
      await _poll();
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  /// Long-press on a sent message: reply, react, copy (text), report (theirs)
  Future<void> _openMenu(ChatMessage m) async {
    if (m.state != SendState.sent) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final choice = await showMessageMenu(context, message: m, canInteract: _open);
    if (!mounted || choice == null) return;
    switch (choice) {
      case MenuReply():
        _startReply(m);
      case MenuReact(:final emoji):
        _react(m.id, emoji);
      case MenuCopy():
        await Clipboard.setData(ClipboardData(text: m.body));
        if (mounted) showSnack(context, 'تم نسخ الرسالة');
      case MenuReport():
        _end(report: true, message: m);
    }
  }

  void _startReply(ChatMessage m) {
    if (!_open || m.state != SendState.sent) return;
    unawaited(HapticFeedback.selectionClick());
    setState(() => _replyTo = quoteOf(m));
    _inputFocus.requestFocus();
  }

  /// My reaction on a message: shown at once, then the server's list (reverted with its message on failure).
  /// [emoji] null removes mine.
  Future<void> _react(String messageId, String? emoji) async {
    if (!_open) return;
    final i = _messages.indexWhere((m) => m.id == messageId && m.state == SendState.sent);
    if (i < 0) return;
    final before = _messages[i].reactions;
    void set(List<ChatReaction> r) {
      final j = _messages.indexWhere((m) => m.id == messageId);
      if (j >= 0) _messages[j] = _messages[j].withReactions(r);
    }

    setState(() => set(toggledReactions(before, emoji)));
    try {
      final next = await _repo.react(widget.chatId, messageId, emoji);
      if (!mounted) return;
      setState(() => set(next));
      _saveCache();
    } catch (e) {
      if (!mounted) return;
      setState(() => set(before));
      showSnack(context, ApiException.messageOf(e));
    }
  }

  /// A tapped quote: the original, loading older pages if needed, scrolled into view and tinted for a moment
  Future<void> _goToQuoted(String id) async {
    for (var i = 0; i < 5 && _hasMore && !_messages.any((m) => m.id == id); i++) {
      await _loadOlder();
      if (!mounted) return;
    }
    if (!_messages.any((m) => m.id == id)) {
      showSnack(context, 'الرسالة الأصلية غير متاحة');
      return;
    }
    final found = await _scrollToRow(id, alignment: 0.5);
    if (!mounted || !found) return;
    _highlightTimer?.cancel();
    setState(() => _highlightId = id);
    _highlightTimer = Timer(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _highlightId = null);
    });
  }

  /// «رسائل جديدة» when the chat opens on unread messages: brought into view near the top unless already on screen
  Future<void> _revealUnread() async {
    final id = _unreadFromId;
    if (!mounted || id == null) return;
    final ctx = _rowsById[id];
    if (ctx != null && ctx.mounted && _rowOnScreen(ctx)) return;
    await _scrollToRow(id, alignment: 1);
  }

  bool _rowOnScreen(BuildContext ctx) {
    final list = _listKey.currentContext?.findRenderObject();
    final row = ctx.findRenderObject();
    if (list is! RenderBox || row is! RenderBox || !list.hasSize || !row.hasSize || !row.attached) return false;
    final top = list.localToGlobal(Offset.zero).dy;
    final y = row.localToGlobal(Offset.zero).dy;
    return y >= top && y + row.size.height <= top + list.size.height;
  }

  /// Scrolls towards older messages until the row of [id] is built, then brings it into view. [alignment] 1 puts it
  /// at the top of the screen (the list runs upwards), 0.5 in the middle.
  Future<bool> _scrollToRow(String id, {required double alignment}) async {
    for (var tries = 0; tries < 40; tries++) {
      if (!mounted || !_scroll.hasClients) return false;
      final ctx = _rowsById[id];
      if (ctx != null && ctx.mounted) {
        await Scrollable.ensureVisible(
          ctx,
          alignment: alignment,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutCubic,
        );
        return true;
      }
      final pos = _scroll.position;
      if (pos.pixels >= pos.maxScrollExtent) return false;
      _scroll.jumpTo((pos.pixels + pos.viewportDimension * 0.8).clamp(0.0, pos.maxScrollExtent));
      await WidgetsBinding.instance.endOfFrame;
    }
    return false;
  }

  void _pickStarter(String text) {
    _input.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
    _inputFocus.requestFocus();
  }

  void _safetyInfo(bool female) {
    String g(String m, String f) => forViewer(female, m, f);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.shield_outlined, color: AppColors.navy),
        title: Text(g('لحمايتك', 'لحمايتكِ')),
        content: Text(
          '${g('لا تُشارك', 'لا تُشاركي')} الأرقام أو الروابط أو حسابات التواصل في المحادثة. '
          'التواصل العائلي يتم عبر التعارف العائلي من صفحة التوافق، '
          'وإن ${g('شعرت', 'شعرتِ')} بأي إساءة ${g('استخدم', 'استخدمي')} «إبلاغ» من القائمة.',
          style: const TextStyle(height: 1.6),
        ),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('حسناً'))],
      ),
    );
  }

  /// A voice note is being recorded or waits for «إرسال»: back asks before it is thrown away
  bool get _voiceUnsent => _voice == _Voice.recording || _voice == _Voice.stopping || _voice == _Voice.stopped;

  Future<void> _backWhileRecording() async {
    final ok = await confirmDialog(
      context,
      title: 'حذف الرسالة الصوتية؟',
      body: 'لم تُرسل الرسالة الصوتية بعد. إذا خرجت من المحادثة تُحذف.',
      confirmLabel: 'حذف والخروج',
      destructive: true,
    );
    if (!ok || !mounted) return;
    _releaseVoice();
    setState(() => _voice = _Voice.idle);
    // pop, not maybePop: the PopScope above still holds the old answer until the next frame
    if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) => ProviderScope(
    overrides: [voicePlaybackProvider.overrideWithValue(_playback)],
    child: PopScope(
      canPop: !_voiceUnsent,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _backWhileRecording();
      },
      child: _screen(context),
    ),
  );

  Widget _screen(BuildContext context) {
    final chat = _chat;
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    final left = chat != null && chat.status == 'ACTIVE' ? chatTimeLeft(chat.expiresAt) : null;
    final canOpenMatch = chat != null && !chat.matchHidden;
    // Under a PRO_REQUIRED failure, a link to «عضوية Pro» only where the member could buy it (never a test account)
    final proPurchasable =
        ref.watch(appPaymentsProvider) && (ref.watch(proStateProvider).valueOrNull?.canBuy ?? false);
    // Larger system text: the header grows with it, so the status line isn't cut under the name
    final textScale = MediaQuery.textScalerOf(context).scale(14) / 14;
    final status = _statusLine(chat, left, female);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        toolbarHeight: kToolbarHeight * (textScale < 1 ? 1 : textScale),
        title: InkWell(
          key: const Key('chat-header'),
          borderRadius: BorderRadius.circular(12),
          // The match page: the family introduction, the photos, ending the match
          onTap: canOpenMatch ? _openMatch : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 19,
                  backgroundColor: AppColors.navy,
                  child: Text(
                    (chat?.partnerName ?? '').isEmpty ? '؟' : chat!.partnerName.characters.first,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      NameWithBadge(
                        isPro: chat?.partnerIsPro ?? false,
                        child: Text(chat?.partnerName ?? 'المحادثة', maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      ?status,
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          if (chat != null)
            PopupMenuButton<String>(
              tooltip: 'خيارات',
              onSelected: (v) {
                switch (v) {
                  case 'match':
                    _openMatch();
                  case 'extend':
                    _extend();
                  case 'end':
                    _end();
                  case 'report':
                    _end(report: true);
                }
              },
              itemBuilder: (_) => [
                if (!chat.matchHidden) const PopupMenuItem(value: 'match', child: Text('صفحة التوافق')),
                if (chat.canExtend) const PopupMenuItem(value: 'extend', child: Text('تمديد 7 أيام')),
                if (chat.canSend) const PopupMenuItem(value: 'end', child: Text('إنهاء المحادثة')),
                const PopupMenuItem(value: 'report', child: Text('إبلاغ')),
              ],
            ),
        ],
      ),
      // The chat: no screenshots (Android), hidden during screen recording (iOS)
      body: SecureArea(
        screenshotNote: 'المحادثة خاصة بينكما، ومشاركتها خارج نصيبك مخالفة للشروط.',
        child: Builder(builder: (context) {
          if (_loading && chat == null) return const Center(child: CircularProgressIndicator());
          if (_error != null && chat == null) return ErrorView(error: _error!, onRetry: _load);
          final items = _messages.reversed.toList();
          final safety = _open ? _safetyChip(female) : null;
          return Column(
            children: [
              _statusBar(chat, left, female),
              Expanded(
                child: ChatBackground(
                  child: items.isEmpty
                      ? ListView(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                          children: [
                            ?safety,
                            SizedBox(
                              height: 360,
                              child: !_open
                                  ? const MessageView(icon: Icons.forum_outlined, title: 'لا توجد رسائل في هذه المحادثة')
                                  : MessageView(
                                      icon: Icons.waving_hand_outlined,
                                      title: forViewer(female, 'ابدأ المحادثة بالسلام', 'ابدئي المحادثة بالسلام'),
                                      body: 'تعرّفا على بعض باحترام: القيم، والطموحات، وتصوّر الحياة الأسرية.',
                                    ),
                            ),
                          ],
                        )
                      : _messageList(items, safety, proPurchasable),
                ),
              ),
              _footer(chat),
            ],
          );
        }),
      ),
    );
  }

  /// Under the name: «يكتب الآن…» while the other person types, else the activity label («نشط اليوم») when the
  /// server sends one, else the time left while it isn't urgent yet (an urgent one is the status bar).
  Widget? _statusLine(ChatSummary? chat, ({String text, bool urgent})? left, bool female) {
    if (chat == null) return null;
    if (_partnerTyping) {
      return Text(
        forPartner(female, 'يكتب الآن…', 'تكتب الآن…'),
        key: const Key('chat-typing'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.success),
      );
    }
    final activity = chat.partnerActivity;
    if (activity != null && activity.isNotEmpty && _open) {
      return Text(
        activity,
        key: const Key('chat-status-line'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.success),
      );
    }
    if (left == null) return null;
    return Text(
      left.text,
      key: const Key('chat-time-left'),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: left.urgent ? AppColors.warning : AppColors.muted,
      ),
    );
  }

  /// One slim bar under the header, by priority: ending soon, the family step, the push chip
  Widget _statusBar(ChatSummary? chat, ({String text, bool urgent})? left, bool female) {
    if (chat == null) return const SizedBox.shrink();
    final pushOff = !chat.blocked && ref.watch(pushAllowedProvider).valueOrNull == false;
    final bar = chatStatusBar(
      open: _open && !chat.blocked,
      left: left,
      family: chat.matchHidden ? null : _family,
      pushOff: pushOff,
      pushDismissed: ref.read(sharedPreferencesProvider).getBool(_pushChipKey) ?? false,
    );
    String g(String m, String f) => forViewer(female, m, f);
    return switch (bar) {
      ChatBar.none => const SizedBox.shrink(),
      ChatBar.expiry => ChatStatusStrip(
          key: const Key('chat-bar-expiry'),
          icon: Icons.schedule_rounded,
          tone: AppColors.warning,
          text: 'تنتهي المحادثة قريباً · ${left!.text}',
          actionLabel: chat.canExtend ? 'تمديد 7 أيام' : null,
          onAction: chat.canExtend ? _extend : null,
        ),
      ChatBar.family => switch (_family!) {
          FamilyStep.offer => ChatStatusStrip(
              key: const Key('chat-bar-family'),
              icon: Icons.family_restroom_rounded,
              text: 'جاهزان للخطوة التالية؟',
              actionLabel: 'تعارف عائلي',
              onAction: _openMatch,
            ),
          FamilyStep.pendingSent => const ChatStatusStrip(
              key: Key('chat-bar-family'),
              icon: Icons.hourglass_top_rounded,
              tone: AppColors.warning,
              text: 'طلب التعارف العائلي بانتظار الرد',
            ),
          FamilyStep.pendingReceived => ChatStatusStrip(
              key: const Key('chat-bar-family'),
              icon: Icons.family_restroom_rounded,
              text: g('وصلك طلب تعارف عائلي', 'وصلكِ طلب تعارف عائلي'),
              onTap: _openMatch,
            ),
          FamilyStep.accepted => ChatStatusStrip(
              key: const Key('chat-bar-family'),
              icon: Icons.verified_user_outlined,
              tone: AppColors.success,
              text: 'بيانات وليّ الأمر',
              onTap: _openMatch,
            ),
        },
      ChatBar.push => ChatStatusStrip(
          key: const Key('chat-bar-push'),
          icon: Icons.notifications_off_outlined,
          text: g('فعّل الإشعارات لتصلك الرسائل', 'فعّلي الإشعارات لتصلكِ الرسائل'),
          actionLabel: 'تفعيل',
          onAction: () => enablePushNotifications(context, ref),
          onClose: _dismissPushChip,
        ),
    };
  }

  /// «لحمايتك…» once at the top of the conversation (its full advice behind a tap). Not in a chat that can't be
  /// written in.
  Widget _safetyChip(bool female) => Center(
        child: Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 6),
          child: Material(
            color: AppColors.goldLight.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              key: const Key('chat-safety'),
              borderRadius: BorderRadius.circular(10),
              onTap: () => _safetyInfo(female),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.shield_outlined, size: 15, color: AppColors.goldText),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          forViewer(female, 'لحمايتك: لا تُشارك أرقاماً أو روابط', 'لحمايتكِ: لا تُشاركي أرقاماً أو روابط'),
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.goldText, fontSize: 12.5),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.info_outline_rounded, size: 15, color: AppColors.goldText),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );

  Widget _messageList(List<ChatMessage> items, Widget? safety, bool proPurchasable) {
    // The safety chip sits above the oldest message once the whole history is loaded
    final showSafety = safety != null && !_hasMore;
    final extra = (_loadingOlder ? 1 : 0) + (showSafety ? 1 : 0);
    return Stack(
      children: [
        // A tapped photo opens full screen with every photo of the chat (oldest first) to swipe through
        ChatPhotoGallery(
          photos: () => _messages,
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              _onScrollNotification(n);
              return false;
            },
            child: ListView.builder(
              key: _listKey,
              controller: _scroll,
              reverse: true,
              // Scrolling the messages closes the keyboard
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 10),
              itemCount: items.length + extra,
              itemBuilder: (context, i) {
                if (i >= items.length) {
                  if (_loadingOlder && i == items.length) {
                    return const Padding(
                      padding: EdgeInsets.all(12),
                      child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                    );
                  }
                  return safety!;
                }
                final m = items[i];
                final layout = chatRowLayout(items, i, unreadFromId: _unreadFromId);
                final sent = m.state == SendState.sent;
                final bubble = ChatBubble(
                  key: ValueKey(m.id),
                  message: m,
                  tail: layout.tail,
                  tightTop: layout.tightTop,
                  partnerName: _chat?.partnerName ?? '',
                  onQuoteTap: _goToQuoted,
                  onReactionTap: _open && m.myReaction != null ? () => _react(m.id, null) : null,
                  onOpenPro: m.proRequired && proPurchasable ? _openPro : null,
                  onDelete: m.state == SendState.failed ? () => _deleteFailed(m) : null,
                  onRetry: m.state == SendState.failed && !m.proRequired
                      ? () => m.kind != MessageKind.text
                          ? _sendMedia(retry: m)
                          : m.filtered
                          ? _editFailed(m)
                          : _send(m)
                      : null,
                );
                // Long-press: the menu; swipe towards the end side: reply. A tapped quote's original is tinted briefly.
                final row = AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  color: _highlightId == m.id ? AppColors.gold.withValues(alpha: 0.22) : Colors.transparent,
                  child: SwipeToReply(
                    enabled: _open && sent,
                    onReply: () => _startReply(m),
                    child: GestureDetector(
                      onLongPress: sent ? () => _openMenu(m) : null,
                      child: bubble,
                    ),
                  ),
                );
                return _RowProbe(
                  key: ValueKey('row-${m.id}'),
                  index: i,
                  id: m.id,
                  rows: _rows,
                  rowsById: _rowsById,
                  child: !layout.daySeparator && !layout.unreadDivider
                      ? row
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (layout.daySeparator) _DayChip(label: chatDayLabel(m.createdAt)),
                            if (layout.unreadDivider) const _UnreadDivider(),
                            row,
                          ],
                        ),
                );
              },
            ),
          ),
        ),
        // The day of what's at the top, kept in view while scrolling
        PositionedDirectional(
          top: 4,
          start: 0,
          end: 0,
          child: IgnorePointer(
            child: AnimatedOpacity(
              opacity: _scrolling && _stickyDay != null ? 1 : 0,
              duration: const Duration(milliseconds: 180),
              child: _stickyDay == null
                  ? const SizedBox.shrink()
                  : _DayChip(key: const Key('chat-sticky-day'), label: _stickyDay!, floating: true),
            ),
          ),
        ),
        if (_away)
          PositionedDirectional(
            bottom: 12,
            start: 12,
            child: FilledButton.tonalIcon(
              key: const Key('chat-newest'),
              onPressed: _toNewest,
              icon: const Icon(Icons.arrow_downward_rounded, size: 18),
              label: Text(_unseen > 0 ? 'الأحدث ($_unseen)' : 'الأحدث'),
            ),
          ),
      ],
    );
  }

  Widget _footer(ChatSummary? chat) {
    if (chat == null) return const SizedBox.shrink();
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    // Photo and voice follow Pro: usable, greyed with a «Pro» tag for a member who could buy it, or hidden
    final media = _mediaMode(chat);
    final canSend = chat.canSend && _chatEnabled;
    if (!canSend) {
      final text = !_chatEnabled
          ? 'المحادثات متوقفة حالياً.'
          : chat.blocked
              ? 'هذه المحادثة للقراءة فقط.'
              : chat.status == 'ENDED'
                  ? (chat.endedByMe ? 'أنهيت هذه المحادثة.' : 'انتهت هذه المحادثة.')
                  : 'انتهت مدة المحادثة.';
      return SafeArea(
        top: false,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          color: AppColors.line.withValues(alpha: 0.5),
          child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
        ),
      );
    }
    final holdUi = _holding && (_voice == _Voice.starting || _voice == _Voice.recording);
    if (!holdUi && (_voice == _Voice.recording || _voice == _Voice.stopping || _voice == _Voice.stopped)) {
      return _recordingBar();
    }
    final locked = media == MediaButtons.locked;
    // Starters while I haven't written anything (the server stops sending them after my first message)
    final starters = !holdUi && _replyTo == null && !_messages.any((m) => m.mine) ? _starters : const <String>[];
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.line))),
        child: ValueListenableBuilder<TextEditingValue>(
          valueListenable: _input,
          builder: (context, value, _) {
            final hasText = value.text.trim().isNotEmpty;
            final reply = _replyTo;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (starters.isNotEmpty && !hasText) StarterChips(starters: starters, onPick: _pickStarter),
                if (reply != null && !holdUi)
                  ReplyStrip(
                    quote: reply,
                    partnerName: chat.partnerName,
                    onClose: () => setState(() => _replyTo = null),
                  ),
                Padding(
                  key: const ValueKey('composer-row'),
                  padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: holdUi
                            ? HoldRecordBar(
                                elapsed: _voiceElapsed,
                                levels: _levels,
                                slide: (Directionality.of(context) == TextDirection.rtl ? _holdDrag.dx : -_holdDrag.dx)
                                    .clamp(0.0, holdCancelDistance),
                              )
                            : _pill(female, media, locked),
                      ),
                      const SizedBox(width: 6),
                      // Part of the input's tap region: sending keeps the keyboard open for the next message
                      TextFieldTapRegion(child: _roundButton(hasText, media, locked, holdUi)),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// The pill: the text box, with the photo button inside at its end (Pro; greyed with «Pro» where it can be bought;
  /// else hidden)
  Widget _pill(bool female, MediaButtons media, bool locked) {
    const none = OutlineInputBorder(borderSide: BorderSide.none);
    return Container(
      constraints: const BoxConstraints(minHeight: 48),
      decoration: BoxDecoration(
        color: AppColors.offWhite,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              key: const Key('chat-input'),
              controller: _input,
              focusNode: _inputFocus,
              minLines: 1,
              maxLines: 5,
              maxLength: 2000,
              textInputAction: TextInputAction.newline,
              onChanged: _onTyped,
              // A tap anywhere else (the messages, the header) closes the keyboard
              onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
              style: const TextStyle(fontSize: 16),
              decoration: InputDecoration(
                hintText: forViewer(female, 'اكتب رسالتك…', 'اكتبي رسالتكِ…'),
                counterText: '',
                filled: false,
                isDense: true,
                border: none,
                enabledBorder: none,
                focusedBorder: none,
                contentPadding: const EdgeInsetsDirectional.fromSTEB(16, 13, 8, 13),
              ),
            ),
          ),
          if (media != MediaButtons.hidden)
            TextFieldTapRegion(
              child: _MediaButton(
                key: const Key('chat-photo'),
                tagKey: const Key('chat-media-pro-tag'),
                icon: Icons.photo_camera_back_outlined,
                tooltip: locked ? 'إرسال الصور مع Pro' : 'إرسال صورة',
                locked: locked,
                onPressed: locked ? _openPro : _pickPhoto,
              ),
            ),
        ],
      ),
    );
  }

  /// One round button: send while there is text, else the mic (hold to record, tap for hands-free); greyed with
  /// «Pro» where voice notes can be bought; send alone when media is hidden
  Widget _roundButton(bool hasText, MediaButtons media, bool locked, bool holdUi) {
    if (hasText || media == MediaButtons.hidden) {
      return IconButton.filled(
        key: const Key('chat-send'),
        tooltip: 'إرسال',
        style: IconButton.styleFrom(backgroundColor: AppColors.navy, minimumSize: const Size(52, 52)),
        onPressed: () => _send(),
        icon: const Icon(Icons.send_rounded, color: Colors.white),
      );
    }
    if (locked) {
      return _MediaButton(
        key: const Key('chat-mic'),
        tagKey: const Key('chat-mic-pro-tag'),
        icon: Icons.mic_none_rounded,
        tooltip: 'الرسائل الصوتية مع Pro',
        locked: true,
        onPressed: _openPro,
      );
    }
    final busy = _voice == _Voice.starting;
    final rise = (-_holdDrag.dy).clamp(0.0, holdLockDistance);
    return HoldToRecordDetector(
      key: const Key('chat-mic'),
      label: 'رسالة صوتية',
      onTap: _startVoice,
      onHoldStart: _onHoldStart,
      onHoldMove: _onHoldMove,
      onHoldRelease: _onHoldRelease,
      onHoldInterrupted: _onHoldInterrupted,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: 52,
            height: 52,
            transform: Matrix4.diagonal3Values(holdUi ? 1.15 : 1, holdUi ? 1.15 : 1, 1),
            transformAlignment: Alignment.center,
            decoration: BoxDecoration(
              color: holdUi ? Theme.of(context).colorScheme.error : AppColors.navy,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: busy && !holdUi
                  ? const SizedBox(
                      key: Key('chat-media-busy'),
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.mic_rounded, color: Colors.white),
            ),
          ),
          if (holdUi) Positioned(bottom: 64 + rise * 0.3, child: HoldLockHint(rise: rise)),
        ],
      ),
    );
  }
}

/// Recording a voice note: the permission prompt and start (`starting`), the clock running, the recorder finishing
/// the file (`stopping`), stopped at the limit and waiting for «إرسال» or «إلغاء» (`stopped`)
enum _Voice { idle, starting, recording, stopping, stopped }

/// A composer media button. Locked: greyed, with a small «Pro» tag; the whole button (tag included) opens the plans.
class _MediaButton extends StatelessWidget {
  const _MediaButton({
    super.key,
    required this.tagKey,
    required this.icon,
    required this.tooltip,
    required this.locked,
    required this.onPressed,
  });

  final Key tagKey;
  final IconData icon;
  final String tooltip;
  final bool locked;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 52,
      child: Stack(
        alignment: Alignment.center,
        children: [
          IconButton(
              tooltip: tooltip,
              onPressed: onPressed,
              style: IconButton.styleFrom(minimumSize: const Size(48, 52)),
              icon: Icon(icon, color: locked ? AppColors.muted.withValues(alpha: 0.6) : AppColors.navy),
            ),
          if (locked)
            PositionedDirectional(
              top: 4,
              end: 2,
              child: GestureDetector(
                onTap: onPressed,
                child: Container(
                  key: tagKey,
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(6)),
                  child: const Text(
                    'Pro',
                    style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, height: 1.2),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// «اليوم» / «أمس» / a date between the messages of two days; [floating] is the copy kept at the top while scrolling
class _DayChip extends StatelessWidget {
  const _DayChip({super.key, required this.label, this.floating = false});
  final String label;
  final bool floating;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: floating ? EdgeInsets.zero : const EdgeInsets.only(top: 12, bottom: 4),
      child: Center(
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.line),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
          ),
        ),
      ),
    );
  }
}

/// «رسائل جديدة» above the first message that was unread when the chat opened
class _UnreadDivider extends StatelessWidget {
  const _UnreadDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('chat-unread-divider'),
      padding: const EdgeInsets.only(top: 10, bottom: 2),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 5),
        color: Colors.white.withValues(alpha: 0.75),
        alignment: Alignment.center,
        child: const Text(
          'رسائل جديدة',
          style: TextStyle(fontSize: 12.5, color: AppColors.navy, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

/// Registers a message row while it is built, so the sticky date chip can find the topmost one on screen
class _RowProbe extends StatefulWidget {
  const _RowProbe({
    super.key,
    required this.index,
    required this.id,
    required this.rows,
    required this.rowsById,
    required this.child,
  });
  final int index;
  final String id;
  final Map<int, BuildContext> rows;
  final Map<String, BuildContext> rowsById;
  final Widget child;

  @override
  State<_RowProbe> createState() => _RowProbeState();
}

class _RowProbeState extends State<_RowProbe> {
  @override
  Widget build(BuildContext context) {
    widget.rows[widget.index] = context;
    widget.rowsById[widget.id] = context;
    return widget.child;
  }

  @override
  void dispose() {
    if (identical(widget.rows[widget.index], context)) widget.rows.remove(widget.index);
    if (identical(widget.rowsById[widget.id], context)) widget.rowsById.remove(widget.id);
    super.dispose();
  }
}
