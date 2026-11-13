import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/push/push_permission.dart';
import '../../core/review/store_review.dart';
import '../../core/routing/route_observer.dart';
import '../../core/storage/picker_files.dart';
import '../../core/system/app_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../matches/match_detail_screen.dart' show ReportAnswer, ReportSheet;
import '../matches/matches_repository.dart';
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
import 'emoji_panel.dart';
import 'hold_to_record.dart';
import 'last_chat.dart';
import 'wa_chat_header.dart';
import 'wa_composer.dart';
import 'media_bubbles.dart' show ChatPhotoGallery, formatVoiceDuration;
import 'message_menu.dart';
import 'photo_preview_screen.dart';
import 'reply_strip.dart';
import 'starter_chips.dart';
import 'typing_signal.dart';
import 'voice_playback.dart';
import 'wa_selection.dart';
import 'voice_recorder.dart';

export 'wa_composer.dart' show composerHintGap;

/// One conversation. It opens at once from the messages kept on the device (`ChatCache`), then the newest page from
/// the API is merged in. With Ably configured on the server, live events (`ChatLive`) trigger a fetch at once and the
/// `?after=` poll slows to a safety net every 20 s; without it the app polls every 4 s while open. A chat that can't
/// change any more (ended, expired, blocked) has no live link and is only checked every minute.
/// The report sheet's words (QA A-M02, final review minor 7): «إبلاغ فقط» files the report and the chat goes on; the
/// other choice says exactly what else happens. In an open chat it ends the chat, blocks and closes the match; in a
/// closed one (ended, expired) there is nothing to end, so it reports and blocks.
({String description, String onlyConsequence, String submitLabel, String submitConsequence}) reportSheetCopy({required bool open}) {
  const other = 'الطرف الآخر';
  return (
    description: 'يصل البلاغ إلى فريق نصيبك ويراجعه.',
    onlyConsequence: open ? 'تبقى المحادثة مفتوحة، ولا يُحظر أحد.' : 'لا يتغير شيء آخر.',
    submitLabel: open ? 'إبلاغ وإنهاء المحادثة' : 'إبلاغ وحظر',
    submitConsequence: open
        ? 'تنتهي المحادثة للطرفين ولا تُفتح مرة أخرى، ويُحظر $other ويُغلق التوافق.'
        : 'يُحظر $other ويُغلق التوافق.',
  );
}

/// Whether the server would end this chat on a report (its `endConversation` «open»): ACTIVE, not expired, no block
bool chatOpenForReport(ChatSummary? c, {DateTime? now}) =>
    c != null &&
    c.status == 'ACTIVE' &&
    (c.expiresAt == null || c.expiresAt!.isAfter(now ?? DateTime.now())) &&
    !c.blocked;

/// The snack after a report or an end: never «تم إنهاء المحادثة» for a chat that was already closed
String reportDoneText({required bool report, required bool end, required bool open}) {
  if (!report) return 'تم إنهاء المحادثة';
  if (!end) return 'تم إرسال البلاغ، وسيراجعه فريق نصيبك.';
  return open ? 'تم إنهاء المحادثة والإبلاغ' : 'تم الإبلاغ والحظر';
}

/// The cursor for «older messages»: the oldest message held that the server saved (never a failed or sending bubble
/// of mine); null when none is
ChatMessage? olderCursorOf(List<ChatMessage> oldestFirst) {
  for (final m in oldestFirst) {
    if (m.state == SendState.sent) return m;
  }
  return null;
}

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

/// The hold ended while the microphone prompt was up and the answer was «سماح»: how to record now (audit U3).
/// Follows the viewer's gender, as on the website (never a masculine command for everyone)
String micAllowedHint(bool female) => 'تم السماح بالميكروفون، ${forViewer(female, 'اضغط', 'اضغطي')} مطولاً للتسجيل';

/// A camera that couldn't open (none, or refused)
const cameraFailedText = 'تعذّر فتح الكاميرا';

/// The emoji panel is never shorter than this (no keyboard seen yet)
const emojiPanelMinHeight = 260.0;

/// …nor taller than this share of the screen
const emojiPanelMaxShare = 0.45;

/// The emoji panel's full height: the tallest keyboard seen (at least [emojiPanelMinHeight]), at most
/// [emojiPanelMaxShare] of the screen
double emojiPanelHeight({required double keyboard, required double screen}) {
  final h = keyboard < emojiPanelMinHeight ? emojiPanelMinHeight : keyboard;
  final cap = screen * emojiPanelMaxShare;
  return h > cap ? cap : h;
}

/// How long the panel's room is held for a keyboard on its way up (it gives way as soon as the keyboard is up)
const emojiHandover = Duration(milliseconds: 450);

/// Shared preferences: the microphone was refused once on this phone (the next refusal points to the settings)
const micRefusedKey = 'mic_refused_once';

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen> with WidgetsBindingObserver, RouteAware {
  final _input = TextEditingController();
  final _inputFocus = FocusNode();

  /// The message my next send answers (the strip above the composer); null for none
  ReplyQuote? _replyTo;

  /// Conversation starters from the server (only while I haven't written anything)
  List<String> _starters = const [];

  /// The server said both have written (the whole chat); it never goes back to false
  bool _serverBothWrote = false;

  /// «يكتب الآن…» in the header until then (live `typing` event or the poll's `partnerTyping`)
  DateTime? _partnerTypingUntil;
  Timer? _typingTimer;
  final _typingThrottle = TypingThrottle();

  /// Just after their message: a `typing` event Ably delivers late (its order across publishes isn't guaranteed)
  /// would show «يكتب الآن…» again under the message that ended it
  Timer? _typingMute;

  /// The mic is held down (release sends, slide cancels or locks); false once locked, cancelled or stopped
  bool _holding = false;

  /// The microphone permission is being asked (the system prompt may be up): a release then says nothing
  VoiceRecorder? _askingMic;
  Offset _holdDrag = Offset.zero;

  /// The live level bars while the mic is held (newest last)
  List<double> _levels = const [];

  /// The original of a tapped quote, tinted for a moment
  String? _highlightId;
  Timer? _highlightTimer;

  /// The one selected message (long-press): the top bar and the reactions follow it. Only the id is kept; the message
  /// is read from the live list every build, and the selection ends when it is gone or nothing can be done with it.
  String? _selectedId;

  /// Where the reaction picker floats: the selected row; below it when the row is too near the top of the list
  final _pickerLink = LayerLink();
  bool _pickerBelow = false;

  /// Message rows on screen by message id (the sticky date chip, scrolling to a quote's original or to «رسائل جديدة»).
  /// Keyed by id, not list index: an arriving message shifts every index.
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

  /// This chat's route, watched so read marks follow whether it is on top (audit B1)
  ModalRoute<dynamic>? _route;

  /// The chat is the screen on top: nothing pushed over it (a page, a sheet, a dialog, a menu)
  bool get _onTop => _route?.isCurrent ?? true;

  /// The newest point a read mark was sent for (null: none yet), and the one being sent now
  DateTime? _readUpTo;
  DateTime? _readingUpTo;
  StreamSubscription<void>? _live;
  bool _liveConnected = false;

  /// The server said live chat isn't available (no token): polling only, asked again when the app comes back
  bool _liveUnavailable = false;
  static const _livePollInterval = Duration(seconds: 20);
  static const _readOnlyPollInterval = Duration(seconds: 60);

  /// The server's time of its last answer (`polledAt`): a poll asks for reaction changes since then, less
  /// [_reactionsOverlap] (nothing missed in between), so reactions on older messages follow without the live link too.
  /// Server time only, never the phone's clock.
  DateTime? _polledAt;
  static const _reactionsOverlap = Duration(seconds: 5);

  /// The family step can change while the chat is open (their request arrives): re-read about once a minute
  static const _familyRecheck = Duration(seconds: 60);
  int _pollsSinceFamily = 0;

  /// A send that got no answer matches a message of mine with the same text this close to it (device vs server clock)
  static const _reconcileWindow = Duration(minutes: 1);

  /// A photo or voice note: the server saves it at the end of an upload of up to 120 s
  static const _mediaReconcileWindow = Duration(minutes: 3);
  int _nonceSeq = 0;

  /// Server copies of my own sends that succeeded here: never the copy of another, failed send
  final Set<String> _confirmedIds = {};

  /// My voice notes confirmed in this visit: server id → the sending bubble's id, so the waveform (seeded by id)
  /// doesn't change shape when the server copy replaces it
  final Map<String, String> _waveSeeds = {};

  /// The gallery or the camera is open (a second tap does nothing)
  bool _picking = false;

  /// The emoji panel is in the keyboard's place (back closes it first)
  bool _emojiOpen = false;

  /// The tallest keyboard seen (logical px): the emoji panel takes it. The tallest, not the last: the inset is reported
  /// per frame while the keyboard animates, so the last non-zero one is a few px from the end of the close
  double _keyboardHeight = 0;

  /// The keyboard's inset right now (logical px): while the panel's room is shown it takes only what the keyboard
  /// doesn't, so the composer stays put while one replaces the other
  double _keyboardInset = 0;

  /// The panel was closed for the keyboard: its room is held (shrinking as the keyboard rises) until the keyboard is up
  bool _emojiHandover = false;
  Timer? _handoverTimer;

  /// The hold on the mic ended while the microphone prompt was up for this recorder (U3: «سماح» then says how)
  VoiceRecorder? _releasedAsking;

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

  /// The count the strip reads: fixed at open, never changed by what arrives later
  int _unreadAtOpen = 0;

  /// The family step for the status bar (`/api/matches/{id}/intro`); null when there is none or it couldn't load
  FamilyStep? _family;

  /// The date chip that stays at the top while scrolling: the day of the topmost message on screen
  String? _stickyDay;
  bool _scrolling = false;
  Timer? _stickyHide;
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
  late final SharedPreferences _prefs;
  late final String? _draftOwner;

  /// The member who opened this chat is no longer signed in (a sign-out, a 401): nothing is kept or asked any more
  bool _signedOut = false;
  ProviderSubscription<String?>? _session;

  /// Reported or ended in this visit: no rating sheet on leaving
  bool _reportedOrEnded = false;

  /// The messages on screen when the chat opened (they don't rise in), and whether that first load is done
  final Set<String> _shownAtOpen = {};
  bool _loadedOnce = false;

  /// While the media buttons are locked (no Pro), `/api/pro` is re-read now and then: Pro bought in the browser or on
  /// another phone unlocks them without leaving the chat
  Timer? _proCheck;
  static const _proCheckEvery = Duration(seconds: 60);

  /// Pro chat delete: the server's switch (every GET says it; off from servers before the field)
  bool _deleteEnabled = false;

  /// My clear point: the server's (`clearedBefore`, a live `cleared`) or my own clear on its way. Saved messages at or
  /// before it leave the list.
  DateTime? _clearedBefore;

  /// Deleted for everyone / hidden for me, as known in this visit (mine, the server's, live events): a poll that left
  /// before the change can't bring them back, and undoing a refused change of mine never undoes them
  final Set<String> _goneForAll = {};
  final Set<String> _hiddenHere = {};

  /// The device copy kept messages older than the first page: the next poll asks for deletions and hides since the
  /// oldest of them (once), so a copy made before a delete never shows the deleted text
  DateTime? _deletionsSince;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // The field taken back (a tap on it, «رد»): the keyboard returns and the emoji panel leaves
    _inputFocus.addListener(() {
      if (_inputFocus.hasFocus && _emojiOpen && mounted) _emojiToKeyboard();
    });
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
    _prefs = ref.read(sharedPreferencesProvider);
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
    appRouteObserver.unsubscribe(this);
    _saveDraft();
    // Left normally: a later cold start opens home, not this chat
    unawaited(LastChat.forget(_prefs, widget.chatId));
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
    _typingMute?.cancel();
    _handoverTimer?.cancel();
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
      // Android may kill the app in the background: what was typed stays, and so does which chat was open
      _saveDraft();
      if (!_signedOut) unawaited(LastChat.remember(_prefs, widget.chatId));
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
      _liveUnavailable = false;
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
    if (_live != null || _liveUnavailable || !mounted || _background) return;
    _live = ref.read(chatLiveProvider).events(widget.chatId, connected: (on) {
      if (!mounted || on == _liveConnected) return;
      _liveConnected = on;
      _startPolling();
      if (on) _poll();
    }).listen(_onLive, onDone: () {
      // The stream only ends by itself when the server has no live chat: not asked again on every poll
      _live = null;
      _liveUnavailable = true;
    });
  }

  /// A live event: typing and reactions carry what changed; anything else (a message, a read tick) fetches
  void _onLive(ChatLiveEvent e) {
    if (!mounted) return;
    final me = _memberId;
    switch (e.name) {
      case 'typing':
        final who = asString(e.data?['userId']);
        // Never my own echo (nor anyone's while I'm not known)
        if (who != null && me != null && who != me && _typingMute == null) _notePartnerTyping(true);
      case 'reaction':
        // Before I'm known every reaction would read as not mine: skip it (like `typing`); the next fetch brings it
        if (me == null) return;
        final id = asString(e.data?['messageId']);
        final i = id == null ? -1 : _messages.indexWhere((m) => m.id == id && m.state == SendState.sent);
        if (i < 0) return;
        setState(() => _messages[i] = _messages[i].withReactions(reactionsFromLive(e.data?['reactions'], me)));
        _saveCache();
      case 'deleted':
        // A message deleted for everyone (theirs, or my own from another device): the trace, if it is loaded
        final id = asString(e.data?['messageId']);
        if (id == null || id.isEmpty) return;
        _goneForAll.add(id);
        var changed = false;
        setState(() => changed = _applyDeletes());
        if (changed) _saveCache();
      case 'cleared':
        // The chat was cleared for everyone: what was said up to then leaves the list (no traces)
        final before = asDate(e.data?['before']);
        if (before == null) return;
        var changed = false;
        setState(() => changed = _applyDeletes(clearedBefore: before));
        if (changed) _saveCache();
      case 'message':
        final sender = asString(e.data?['senderId']);
        if (sender != null && me != null && sender != me) setState(_partnerSent);
        // The event's own copy is not used (its quote carries a sender id, not `mine`): the fetch brings the message
        // with `replyTo` and reactions as the GET shapes them. Parse `replyTo` here before ever dropping this fetch.
        _poll();
      default:
        // A read tick or a status change: the fetch brings it
        _poll();
    }
  }

  /// Their message arrived: their «يكتب الآن…» ends, and a late `typing` signal is ignored for a moment
  void _partnerSent() {
    _clearPartnerTyping();
    _typingMute?.cancel();
    _typingMute = Timer(const Duration(milliseconds: 1500), () => _typingMute = null);
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
    // Messages the device copy already held as sent: never the server's copy of a text kept as failed (audit B10,
    // an earlier identical text of mine would otherwise take its place); a retry is safe, the server knows the nonce
    final heldAtOpen = <String>{};
    if (member != null && _chat == null) {
      final cached = await _cache.read(member, widget.chatId);
      if (cached != null && mounted && _chat == null) {
        heldAtOpen.addAll(cached.messages.where((m) => m.state == SendState.sent).map((m) => m.id));
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
      _polledAt = page.polledAt;
      setState(() {
        _chat = page.conversation;
        _chatEnabled = page.chatEnabled;
        _starters = page.starters;
        if (page.bothWrote == true) _serverBothWrote = true;
        _mergeLatest(page);
        // A text kept as failed (offline) that the server saved after all
        _reconcile(page.messages.where((m) => !heldAtOpen.contains(m.id)));
        _deleteEnabled = page.deleteEnabled;
        // The device copy too: what was cleared, hidden or deleted meanwhile
        _applyDeletes(clearedBefore: page.clearedBefore, hidden: page.hiddenIds, deleted: page.deletedIds);
        final firstOfPage = page.messages.firstOrNull;
        final oldestHeld = olderCursorOf(_messages);
        if (firstOfPage != null && oldestHeld != null && oldestHeld.createdAt.isBefore(firstOfPage.createdAt)) {
          _deletionsSince = oldestHeld.createdAt;
        }
      });
      _notePartnerTyping(page.partnerTyping);
      if (!_loadedOnce) {
        _loadedOnce = true;
        _shownAtOpen.addAll(_messages.map((m) => m.id));
      }
      if (!_unreadFixed) {
        _unreadFixed = true;
        _unreadFromId = firstUnreadId(page.messages);
        _unreadAtOpen = _unreadFromId == null ? 0 : unreadCountFrom(page.messages, _unreadFromId!);
        // Opened on unread messages: «رسائل جديدة» in view, not only the newest
        if (_unreadFromId != null) WidgetsBinding.instance.addPostFrameCallback((_) => _revealUnread());
      }
      _dropVoiceIfNotAllowed();
      _saveCache();
      _markRead();
      _watch();
      // Deletions in the older part of the device copy: asked right away (after this load has finished)
      if (_deletionsSince != null) {
        scheduleMicrotask(() {
          if (mounted) _poll();
        });
      }
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

  /// A poll's `reactionUpdates` on the messages held (sent ones only); true when any changed
  bool _applyReactionUpdates(Map<String, List<ChatReaction>>? updates) {
    if (updates == null || updates.isEmpty) return false;
    var changed = false;
    for (var i = 0; i < _messages.length; i++) {
      final held = _messages[i];
      final next = held.state == SendState.sent ? updates[held.id] : null;
      if (next == null) continue;
      final updated = held.withReactions(next);
      if (updated.sameAs(held)) continue;
      _messages[i] = updated;
      changed = true;
    }
    return changed;
  }

  static DateTime? _later(DateTime? a, DateTime? b) => a == null ? b : (b == null || a.isAfter(b) ? a : b);

  /// Hides and clears (dropped), then deletions for everyone (the trace) over the messages held, with this visit's own
  /// on top; true when the list changed. Never adds a row: ids that aren't loaded change nothing. Called inside
  /// setState.
  bool _applyDeletes({DateTime? clearedBefore, Iterable<String> hidden = const [], Iterable<String> deleted = const []}) {
    _goneForAll
      ..addAll(deleted)
      ..addAll(_messages.where((m) => m.deleted).map((m) => m.id));
    _hiddenHere.addAll(hidden);
    final cutoff = _later(_clearedBefore, clearedBefore);
    final newClear = cutoff != null && cutoff != _clearedBefore;
    _clearedBefore = cutoff;
    // A newer clear point at or after the oldest message held: every older page is cleared too
    final oldest = olderCursorOf(_messages);
    if (newClear && (oldest == null || !cutoff.isBefore(oldest.createdAt))) _hasMore = false;
    final next = applyDeletions(dropHidden(_messages, {...hidden, ..._hiddenHere}, cutoff), {...deleted, ..._goneForAll});
    if (identical(next, _messages)) return false;
    // A voice note that left (or became the trace) stops playing, once its bubble has gone
    final stillVoice = {for (final m in next) if (m.kind == MessageKind.voice) m.id};
    for (final m in _messages) {
      if (m.kind == MessageKind.voice && m.state == SendState.sent && !stillVoice.contains(m.id)) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _playback.forget(m.id));
      }
    }
    _messages
      ..clear()
      ..addAll(next);
    // The reply being written quotes a message that left or was deleted: the strip closes
    final reply = _replyTo;
    if (reply != null && !_messages.any((m) => m.id == reply.id && !m.deleted)) _replyTo = null;
    return true;
  }

  /// An optimistic delete or clear was refused: every message back as it was in [snapshot] (the trace undone, quotes
  /// that read as the trace given their text again, dropped messages re-inserted), keeping what a poll or live event
  /// added meanwhile; then what is really deleted, hidden or cleared applies again. Called inside setState, after the
  /// caller has taken its own change out of the sets and the clear point.
  void _restoreFrom(List<ChatMessage> snapshot) {
    final before = {for (final m in snapshot) m.id: m};
    for (var i = 0; i < _messages.length; i++) {
      final now = _messages[i];
      final was = before[now.id];
      if (was == null) continue;
      // Untraced only if nothing else says it is deleted (a poll, a live event, the server's own copy)
      if (now.deleted && !was.deleted && !_goneForAll.contains(now.id)) {
        _messages[i] = was;
      } else if (now.replyTo?.snippet != was.replyTo?.snippet || now.replyTo?.kind != was.replyTo?.kind) {
        _messages[i] = now.withQuote(was.replyTo);
      }
    }
    final held = _messages.map((m) => m.id).toSet();
    _insertSorted(snapshot.where((m) => m.state == SendState.sent && !held.contains(m.id)).toList());
    _applyDeletes();
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
      final polledAt = _polledAt;
      final sync = _deletionsSince;
      final since = polledAt?.subtract(_reactionsOverlap);
      final page = await _repo.load(
        widget.chatId,
        after: after,
        reactionsSince: sync != null && (since == null || sync.isBefore(since)) ? sync : since,
      );
      if (!mounted) return;
      _catchUp = false;
      _polledAt = page.polledAt;
      if (identical(_deletionsSince, sync)) _deletionsSince = null;
      final known = _messages.map((m) => m.id).toSet();
      final fresh = page.messages.where((m) => !known.contains(m.id)).toList();
      var changed = false;
      setState(() {
        _chat = page.conversation;
        _chatEnabled = page.chatEnabled;
        _starters = page.starters;
        if (page.bothWrote == true) _serverBothWrote = true;
        // A message from them ends their «يكتب الآن…»
        if (fresh.any((m) => !m.mine)) _partnerSent();
        _deleteEnabled = page.deleteEnabled;
        if (after == null) {
          // Nothing loaded yet (the first load failed offline): take the latest page as is
          _messages.removeWhere((m) => m.state == SendState.sent);
          _messages.insertAll(0, page.messages);
          _hasMore = page.hasMore;
        } else {
          changed = _replaceChanged(page.messages);
          if (_applyReactionUpdates(page.reactionUpdates)) changed = true;
          _insertSorted(fresh);
          if (_away) _unseen += fresh.where((m) => !m.mine).length;
          // Cut at the cap: read the rest from the newest message right away
          if (page.messages.length >= 100 && !catchUp && after != _lastServerTime) _catchUp = _pollAgain = true;
        }
        // After the reactions (a trace never shows any); ids that aren't loaded change nothing
        if (_applyDeletes(clearedBefore: page.clearedBefore, hidden: page.hiddenIds, deleted: page.deletedIds)) {
          changed = true;
        }
        _reconcile(fresh);
      });
      _notePartnerTyping(page.partnerTyping);
      _dropVoiceIfNotAllowed();
      if (fresh.isNotEmpty || changed) _saveCache();
      // Also retries a read that failed or waited (the chat was covered or in the background)
      _markReadIfDue();
      _watch();
      if (after == null) _fillScreen();
      if (++_pollsSinceFamily * (_timerEvery ?? widget.pollInterval).inMilliseconds >= _familyRecheck.inMilliseconds) {
        _pollsSinceFamily = 0;
        _loadFamilyStep();
      }
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

  /// ✕ on the push chip hides it for one day, then it asks again (owner, 2026-11-11: daily). The old bool key
  /// ('chat_push_chip_dismissed', hidden for good) is no longer read
  static const _pushChipKey = 'chat_push_chip_hidden_at';

  void _dismissPushChip() {
    unawaited(ref.read(sharedPreferencesProvider).setInt(_pushChipKey, DateTime.now().millisecondsSinceEpoch));
    setState(() {});
  }

  bool get _pushChipDismissed {
    final at = ref.read(sharedPreferencesProvider).getInt(_pushChipKey);
    return at != null && DateTime.now().millisecondsSinceEpoch - at < pushChipHide.inMilliseconds;
  }

  /// Sticky date chip: the day of the topmost message row on screen, shown while scrolling and briefly after
  /// The rows move after the notification (the keyboard closing mid-scroll resizes the list): the day is read again
  /// once they are laid out, so the chip never shows the day before (QA A2-L8)
  bool _stickyCheckQueued = false;
  void _stickyAfterLayout() {
    if (_stickyCheckQueued) return;
    _stickyCheckQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _stickyCheckQueued = false;
      if (!mounted || !_scrolling) return;
      final day = _topDay();
      if (day != null && day != _stickyDay) setState(() => _stickyDay = day);
    });
  }

  @override
  void didChangeMetrics() {
    _stickyAfterLayout();
    _followKeyboard();
  }

  /// The keyboard is up: the composer sits right on it, with no home-indicator inset under it (simulator QA D2).
  /// Read from the view, not the Scaffold's body (whose keyboard inset is already taken out); only a change rebuilds.
  bool _keyboardOpen = false;
  void _followKeyboard() {
    if (!mounted) return;
    final view = View.maybeOf(context);
    final inset = view == null ? 0.0 : view.viewInsets.bottom / view.devicePixelRatio;
    if (inset > _keyboardHeight) _keyboardHeight = inset;
    final open = inset > 0;
    final changed = inset != _keyboardInset;
    _keyboardInset = inset;
    // The keyboard is up: the room held for it goes
    if (_emojiHandover && inset >= _panelFull() - 1) _endHandover();
    if (open != _keyboardOpen || (changed && (_emojiOpen || _emojiHandover))) setState(() => _keyboardOpen = open);
  }

  double _panelFull() => emojiPanelHeight(keyboard: _keyboardHeight, screen: MediaQuery.sizeOf(context).height);

  /// The emoji panel gives way to the keyboard (the field takes the focus): its room stays until the keyboard is up
  void _emojiToKeyboard() {
    _handoverTimer?.cancel();
    setState(() {
      _emojiOpen = false;
      _emojiHandover = true;
    });
    // No keyboard comes (a hardware keyboard, a refused focus): the room goes anyway
    _handoverTimer = Timer(emojiHandover, _endHandover);
  }

  void _endHandover() {
    _handoverTimer?.cancel();
    _handoverTimer = null;
    if (!_emojiHandover || !mounted) return;
    setState(() => _emojiHandover = false);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final view = View.maybeOf(context);
    _keyboardInset = view == null ? 0.0 : view.viewInsets.bottom / view.devicePixelRatio;
    if (_keyboardInset > _keyboardHeight) _keyboardHeight = _keyboardInset;
    _keyboardOpen = _keyboardInset > 0;
    final route = ModalRoute.of(context);
    if (route != null && route != _route) {
      if (_route != null) appRouteObserver.unsubscribe(this);
      _route = route;
      appRouteObserver.subscribe(this, route);
    }
  }

  /// Back on top (what covered the chat was closed): what they wrote meanwhile is read now
  @override
  void didPopNext() => _markReadIfDue();

  // A page or a sheet over the chat: polling goes on (the unseen count), read marks wait (`_markRead`)
  @override
  void didPushNext() {}

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
      _stickyAfterLayout();
    } else if (n is ScrollEndNotification) {
      _stickyAfterLayout();
      _stickyHide?.cancel();
      _stickyHide = Timer(dateChipHideAfter, () {
        if (mounted && _scrolling) setState(() => _scrolling = false);
      });
    }
  }

  String? _topDay() {
    final list = _listKey.currentContext?.findRenderObject();
    if (list is! RenderBox || !list.hasSize) return null;
    final top = list.localToGlobal(Offset.zero).dy;
    // Runs on every scroll frame: no list copies, only the rows built right now
    String? best;
    double bestTop = double.negativeInfinity;
    for (final e in _rowsById.entries) {
      if (!e.value.mounted) continue;
      final box = e.value.findRenderObject();
      if (box is! RenderBox || !box.hasSize || !box.attached) continue;
      final y = box.localToGlobal(Offset.zero).dy;
      // The row crossing the top edge (or the last one starting above it)
      if (y <= top + 8 && y > bestTop) {
        bestTop = y;
        best = e.key;
      }
    }
    if (best == null) return null;
    for (final m in _messages) {
      if (m.id == best) return chatDayLabel(m.createdAt);
    }
    return null;
  }

  /// The list is attached AND laid out. `hasClients` alone is not enough: until the first layout the position's
  /// `pixels` / `maxScrollExtent` / `viewportDimension` are null and their getters throw «Null check operator used on
  /// a null value» (Crashlytics, 1.2.x: `_fillScreen` and `_revealUnread` → `_scrollToRow` right after a load).
  bool get _scrollReady {
    if (!_scroll.hasClients) return false;
    final pos = _scroll.position;
    return pos.hasContentDimensions && pos.hasPixels && pos.hasViewportDimension;
  }

  void _onScroll() {
    if (!_scrollReady) return;
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
  void _fillScreen([int waits = 0]) {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || !_hasMore || !_scroll.hasClients) return;
      // Attached but not laid out yet: look again next frame (a few times), never read the null extent
      if (!_scrollReady) {
        if (waits < 10) _fillScreen(waits + 1);
        return;
      }
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
    // The oldest message the server knows: a failed bubble above it has a local id and the phone's time, and paging
    // from it would skip everything between it and the loaded page
    final first = olderCursorOf(_messages);
    if (!_hasMore || _loadingOlder || first == null) return;
    setState(() => _loadingOlder = true);
    try {
      final page = await _repo.load(widget.chatId, before: first.createdAt, beforeId: first.id);
      if (!mounted) return;
      final known = _messages.map((m) => m.id).toSet();
      setState(() {
        _messages.insertAll(0, page.messages.where((m) => !known.contains(m.id)));
        _hasMore = page.hasMore;
        // The server already filtered this page (hides, clears, traces): only this visit's own changes still in
        // flight can apply, and nothing here needs saving, so the result is not used
        _applyDeletes();
      });
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  /// Marks the partner's messages read, only while the chat is on top and the app in front (audit B1)
  Future<void> _markRead() async {
    if (!mounted || !_onTop || _background) return;
    final last = _lastServerTime;
    // The same mark already on its way
    if (last != null && last == _readingUpTo) return;
    _readingUpTo = last;
    try {
      await _repo.markRead(widget.chatId, upTo: last);
      if (last != null && (_readUpTo == null || last.isAfter(_readUpTo!))) _readUpTo = last;
    } catch (_) {
      // Retried by the next poll (`readIsDue`)
    } finally {
      if (_readingUpTo == last) _readingUpTo = null;
    }
  }

  void _markReadIfDue() {
    if (!mounted) return;
    DateTime? newestPartnerAt;
    for (final m in _messages.reversed) {
      if (m.state == SendState.sent && !m.mine) {
        newestPartnerAt = m.createdAt;
        break;
      }
    }
    if (readIsDue(onTop: _onTop, foreground: !_background, newestPartnerAt: newestPartnerAt, readUpTo: _readUpTo)) {
      _markRead();
    }
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
        _emojiOpen = false;
      }
      // I answered: what was new has been read
      _unreadFromId = null;
    });
    if (retry == null) _saveDraft();
    // The next keystroke tells the other person again at once
    _typingThrottle.reset();
    _toNewest();
    // Taken before the request: `ref` can't be used once the chat was left meanwhile
    final container = ProviderScope.containerOf(context, listen: false);
    final cache = _cache;
    final member = _memberId;
    final chat = _chat;
    final chatId = widget.chatId;
    try {
      final sent = await _repo.send(widget.chatId, text, nonce: nonce, replyToId: reply?.id);
      _confirmedIds.add(sent.id);
      if (first) container.read(analyticsProvider).chatStarted();
      if (!mounted) return;
      setState(() {
        _messages.removeWhere((m) => m.nonce == nonce || m.id == sent.id);
        _insertSorted([sent]);
      });
      _saveCache();
      // «المحادثات» shows the last message and orders by it: my own message changes no unread count, so reload it here
      ref.invalidate(chatListProvider);
    } on ApiException catch (e) {
      if (!mounted) {
        // Left meanwhile (audit B2): kept on the phone as failed, so the next visit shows it with «إعادة الإرسال».
        // Never after a sign-out, nor for another member signed in since
        if (member == null || _signedOut || container.read(authControllerProvider).me?.id != member) return;
        final failed = local.copyWith(
            state: SendState.failed, error: e.message, filtered: e.code == 'FILTERED', maybeSent: e.isNetwork);
        unawaited(cache.addFailed(member, chatId, failed, conversation: chat));
        return;
      }
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

  /// The paperclip (Pro): its sheet «المعرض» / «الكاميرا», then the photo from that source. The emoji panel closes.
  Future<void> _attach() async {
    if (_picking) return;
    if (_emojiOpen) setState(() => _emojiOpen = false);
    _inputFocus.unfocus();
    final source = await showAttachSheet(context);
    if (source == null || !mounted) return;
    // The chat closed or Pro went away while the sheet was up
    final chat = _chat;
    if (!_canWrite || chat == null || _mediaModeNow(chat) != MediaButtons.enabled) return;
    await _pickPhoto(camera: source == AttachSource.camera);
  }

  /// A photo (Pro) from the gallery or the camera: refuse over 10 MB, show the preview, then send.
  Future<void> _pickPhoto({bool camera = false}) async {
    if (_picking) return;
    _picking = true;
    // The keyboard closes before the system picker opens: an open text field under the picker and the preview could
    // get the iPhone keyboard back afterwards with nothing focused, so nothing could close it (TestFlight report)
    _inputFocus.unfocus();
    try {
      await _pickPhotoAndSend(camera: camera);
    } finally {
      _hideOrphanKeyboard();
    }
  }

  /// After the photo flow: the keyboard stays hidden unless the member tapped back into the text box
  void _hideOrphanKeyboard() {
    if (!mounted || _inputFocus.hasFocus) return;
    SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
  }

  Future<void> _pickPhotoAndSend({required bool camera}) async {
    PickedPhoto? photo;
    try {
      photo = await ref.read(camera ? chatCameraPickerProvider : chatPhotoPickerProvider)();
    } catch (_) {
      if (mounted) showSnack(context, camera ? cameraFailedText : 'تعذّر اختيار الصورة');
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
      if (voice) _waveSeeds[sent.id] = local.id;
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
    setState(() {
      _voice = _Voice.starting;
      // The recording bar takes the composer's place: no emoji panel under it
      _emojiOpen = false;
    });
    var allowed = false;
    _askingMic = rec;
    try {
      allowed = await rec.hasPermission();
    } catch (_) {}
    if (_askingMic == rec) _askingMic = null;
    final heldThroughPrompt = _releasedAsking == rec;
    if (heldThroughPrompt) _releasedAsking = null;
    // A refusal is said even when the hold already ended (the finger lifted to answer the prompt): the first
    // «لا» used to vanish with the dropped recorder (QA A2-L5)
    if (!allowed) {
      // The hold is over: the finger lifting afterwards must not say «الرسالة قصيرة جداً» over the refusal and its
      // «الإعدادات» action (a blocked microphone answers at once, while the mic is still held)
      _holding = false;
      _drop(rec);
      if (mounted) _micRefused();
      return;
    }
    // The finger lifted to answer the prompt (U3): nothing records, but the member learns the mic works now
    if (heldThroughPrompt) {
      _drop(rec);
      if (mounted && _recorder == null) {
        showSnack(context, micAllowedHint(ref.read(authControllerProvider).me?.isFemale ?? false));
      }
      return;
    }
    if (_recorder != rec || !mounted || !_voiceAllowed) return _drop(rec);
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
      // Let go before the recorder started: nothing is recorded. A short hold says so, like any hold under 1 s;
      // a release while the microphone prompt was up (the member was answering it) says nothing.
      final asking = _askingMic != null && _askingMic == rec;
      if (asking) _releasedAsking = rec;
      _releaseVoice();
      setState(() => _voice = _Voice.idle);
      if (!asking) showSnack(context, holdTooShortText);
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
      // A system permission dialog mid-hold usually cancels the touch: the same U3 hint as a lift while asking
      if (_askingMic != null && _askingMic == rec) _releasedAsking = rec;
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
      bottom: !_keyboardOpen,
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
                        style: AppText.body.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink),
                      ),
                    ],
                  ),
                  if (stopped || busy)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        _voiceAtLimit ? 'بلغ التسجيل الحد الأقصى' : 'توقف التسجيل',
                        textAlign: TextAlign.center,
                        style: AppText.caption.copyWith(color: AppColors.muted),
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
    var end = true;
    // An open chat can end; a closed one (ended, expired, blocked) can only be reported, or reported with a block.
    // «Open» as the server judges it (ACTIVE, not expired, no block), not whether I can write: a chat paused for
    // review, or with the chat switch off, still ends on «إبلاغ وإنهاء» (review A2 minor 2)
    final open = chatOpenForReport(_chat);
    if (report) {
      final copy = reportSheetCopy(open: open);
      final res = await showModalBottomSheet<ReportAnswer>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        barrierLabel: 'إغلاق',
        builder: (_) => ReportSheet(
          title: message == null ? 'إبلاغ' : 'إبلاغ عن الرسالة',
          description: copy.description,
          // «إبلاغ فقط» first (owner ruling): the report is filed and the chat goes on
          reportOnlyLabel: 'إبلاغ فقط',
          reportOnlyConsequence: copy.onlyConsequence,
          submitLabel: copy.submitLabel,
          submitConsequence: copy.submitConsequence,
          // The message reported is shown as a quote and goes as `messageId` (the team sees it marked in the chat)
          reportedMessage: message == null ? null : replySnippetOf(message),
        ),
      );
      if (res == null) return;
      reason = res.reason;
      details = res.details;
      end = res.end;
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
      await _repo.end(
        widget.chatId,
        reportReason: reason,
        details: details,
        messageId: report ? message?.id : null,
        end: end,
      );
      if (end) _reportedOrEnded = true;
      if (mounted) showSnack(context, reportDoneText(report: report, end: end, open: open));
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

  /// Long-press on a sent message (or, while selecting, a tap on another one): it becomes the selection. Nothing is
  /// selected when nothing can be done with it.
  void _select(ChatMessage m) {
    if (selectedMessageOf([m], m.id, canInteract: _open, deleteMode: _deleteModeNow(), open: _open) == null) return;
    FocusManager.instance.primaryFocus?.unfocus();
    unawaited(HapticFeedback.selectionClick());
    setState(() {
      _selectedId = m.id;
      _pickerBelow = false;
    });
    // Too near the top of the list for the picker above it: below the row instead
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _selectedId != m.id) return;
      final row = _rowsById[m.id]?.findRenderObject();
      final list = _listKey.currentContext?.findRenderObject();
      if (row is! RenderBox || list is! RenderBox || !row.attached || !list.attached) return;
      final top = row.localToGlobal(Offset.zero, ancestor: list).dy;
      final below = top < _pickerRoom;
      if (below != _pickerBelow) setState(() => _pickerBelow = below);
    });
  }

  /// The picker's height and its gap above the row
  static const _pickerRoom = 60.0;

  /// While selecting: a tap on the selected bubble clears it, on another one moves it there
  void _tapWhileSelecting(ChatMessage m) => m.id == _selectedId ? _clearSelection() : _select(m);

  void _clearSelection() {
    if (_selectedId != null) setState(() => _selectedId = null);
  }

  /// The bar's «حذف»: the Pro screen when not Pro; else «حذف لدى الجميع» (my own message in an open chat) or «حذف لديّ»
  Future<void> _deleteChosen(ChatMessage m) async {
    final mode = _deleteModeNow();
    if (mode == DeleteMode.hidden) return;
    if (mode == DeleteMode.upsell) return _openPro();
    final e = messageMenuEntries(m, canInteract: _open, deleteMode: mode, open: _open);
    final everyone = await showDeleteChoice(context, canEveryone: e.deleteForEveryone);
    if (everyone == null || !mounted) return;
    // The copy held now (a poll may have changed or removed it while the dialog was up)
    final i = _messages.indexWhere((x) => x.id == m.id);
    if (i < 0) return;
    await _deleteMessage(_messages[i], forEveryone: everyone);
  }

  /// Pro chat delete: [DeleteMode.use] for Pro, the upsell for a member who could buy it, else nothing. Like the media
  /// buttons, only where the app shows payments (never a test or review account). Watched (build).
  DeleteMode _deleteMode() {
    final pro = ref.watch(proStateProvider).valueOrNull;
    final countsPro = ref.watch(countsProvider.select((c) => c.valueOrNull?.isPro));
    return deleteModeOf(
      deleteEnabled: _deleteEnabled,
      appPayments: ref.watch(appPaymentsProvider),
      isPro: pro?.isPro ?? countsPro ?? false,
      canBuy: pro?.canBuy ?? false,
    );
  }

  /// The same, read (handlers, after an await)
  DeleteMode _deleteModeNow() {
    final pro = ref.read(proStateProvider).valueOrNull;
    return deleteModeOf(
      deleteEnabled: _deleteEnabled,
      appPayments: ref.read(appPaymentsProvider),
      isPro: pro?.isPro ?? ref.read(countsProvider).valueOrNull?.isPro ?? false,
      canBuy: pro?.canBuy ?? false,
    );
  }

  /// «حذف لديّ» / «حذف لدى الجميع», chosen in the bar's one dialog: sent at once (no second confirm, as on the
  /// website). Not Pro: the Pro screen, nothing sent. Shown at once; a refusal puts it back and says why.
  Future<void> _deleteMessage(ChatMessage m, {required bool forEveryone}) async {
    final mode = _deleteModeNow();
    if (mode == DeleteMode.hidden || m.state != SendState.sent) return;
    if (mode == DeleteMode.upsell) return _openPro();
    // «لدى الجميع» only for my own message in an open chat (it may have closed while the dialog was up)
    if (forEveryone && (!m.mine || m.deleted || !_open)) return;
    // The copy held now (a poll may have changed it since the long-press)
    // Everything as it is now: a refusal puts back the message and the quotes of it that read as the trace
    final snapshot = List.of(_messages);
    // Taken before the request: `ref` can't be used once the chat was left meanwhile
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() {
      forEveryone ? _goneForAll.add(m.id) : _hiddenHere.add(m.id);
      _applyDeletes();
    });
    // Known narrow race: a poll during the request can save this optimistic state to the device copy, and a refusal
    // that arrives after the chat was left can't be reverted there (the page and the deletions poll on the next open
    // only correct what the server changed)
    try {
      await _repo.deleteMessage(widget.chatId, m.id, forEveryone: forEveryone);
      if (!mounted) return;
      _saveCache();
    } catch (e) {
      if (e is ApiException && e.code == 'PRO_REQUIRED') {
        container.invalidate(proStateProvider);
        container.invalidate(countsProvider);
      }
      if (!mounted) return;
      setState(() {
        forEveryone ? _goneForAll.remove(m.id) : _hiddenHere.remove(m.id);
        _restoreFrom(snapshot);
      });
      _saveCache();
      _deleteRefused(e);
    }
  }

  /// «مسح المحادثة»: «مسح لديّ» or (open chat) «مسح لدى الجميع», confirmed, then an empty list at once. Not Pro: the
  /// Pro screen, nothing sent.
  Future<void> _clearChat() async {
    final mode = _deleteModeNow();
    if (mode == DeleteMode.hidden) return;
    if (mode == DeleteMode.upsell) return _openPro();
    final everyone = await showClearChatSheet(context, canEveryone: _open);
    if (everyone == null || !mounted) return;
    final ok = await confirmDeleteSheet(
      context,
      title: everyone ? 'مسح المحادثة لدى الجميع؟' : 'مسح المحادثة لديك؟',
      body: everyone ? clearForEveryoneConfirm : clearForMeConfirm,
      confirmLabel: everyone ? 'مسح لدى الجميع' : 'مسح لديّ',
    );
    if (!ok || !mounted || (everyone && !_open)) return;
    final container = ProviderScope.containerOf(context, listen: false);
    // Everything as it is now (a refusal restores it; same narrow cache race as `_deleteMessage`)
    final snapshot = List.of(_messages);
    final clearedBefore = _clearedBefore;
    final hadMore = _hasMore;
    // Shown at once up to the newest message held (server time, never the phone's clock); the server's point follows
    final upTo = _lastServerTime;
    if (upTo != null) setState(() => _applyDeletes(clearedBefore: upTo));
    try {
      final at = await _repo.clearChat(widget.chatId, forEveryone: everyone);
      if (!mounted) return;
      setState(() {
        _applyDeletes(clearedBefore: at);
        // Older pages are cleared on the server too
        _hasMore = false;
      });
      _saveCache();
    } catch (e) {
      if (e is ApiException && e.code == 'PRO_REQUIRED') {
        container.invalidate(proStateProvider);
        container.invalidate(countsProvider);
      }
      if (!mounted) return;
      setState(() {
        _clearedBefore = clearedBefore;
        _hasMore = hadMore;
        _restoreFrom(snapshot);
      });
      _saveCache();
      _deleteRefused(e);
    }
  }

  /// A delete or clear refused: the server's words. `PRO_REQUIRED` (Pro ended) adds «عضوية Pro» where it can be
  /// bought; a closed chat or the switch going off re-reads the chat.
  void _deleteRefused(Object e) {
    final api = e is ApiException ? e : null;
    final purchasable = ref.read(appPaymentsProvider) && (ref.read(proStateProvider).valueOrNull?.canBuy ?? false);
    showSnack(
      context,
      ApiException.messageOf(e),
      action: api?.code == 'PRO_REQUIRED' && purchasable ? SnackBarAction(label: 'عضوية Pro', onPressed: _openPro) : null,
    );
    if (api?.code == 'EXPIRED' || api?.code == 'NOT_ALLOWED' || api?.code == 'DISABLED') _poll();
  }

  void _startReply(ChatMessage m) {
    if (!_open || m.state != SendState.sent || m.deleted) return;
    unawaited(HapticFeedback.selectionClick());
    setState(() => _replyTo = quoteOf(m));
    _inputFocus.requestFocus();
  }

  /// My reaction on a message: shown at once, then the server's list (reverted with its message on failure).
  /// [emoji] null removes mine.
  Future<void> _react(String messageId, String? emoji) async {
    if (!_open) return;
    final i = _messages.indexWhere((m) => m.id == messageId && m.state == SendState.sent && !m.deleted);
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

  /// The pill under a bubble: who reacted; «إزالة تفاعلي» removes mine
  Future<void> _showWhoReacted(ChatMessage m) async {
    final remove = await showWhoReacted(
      context,
      reactions: m.reactions,
      partnerName: _chat?.partnerName ?? '',
      canRemove: _open && m.myReaction != null && !m.deleted,
    );
    if (!mounted) return;
    if (remove) _react(m.id, null);
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
      // Not laid out yet (a chat opening on unread messages): wait a frame instead of reading the null extent
      if (!_scrollReady) {
        await WidgetsBinding.instance.endOfFrame;
        continue;
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
  Widget build(BuildContext context) {
    final selected = selectedMessageOf(_messages, _selectedId, canInteract: _open, deleteMode: _deleteMode(), open: _open);
    // Gone, no longer sent, or nothing left to do with it (deleted, the chat closed): the selection ends. Derived state,
    // set here so this very build (the bar, the back button) already follows it.
    if (selected == null) _selectedId = null;
    // No composer (the chat closed, chats off): no emoji panel either
    if (!_canWrite) {
      _emojiOpen = false;
      _emojiHandover = false;
    }
    return ProviderScope(
      overrides: [voicePlaybackProvider.overrideWithValue(_playback)],
      child: PopScope(
        canPop: !_voiceUnsent && _selectedId == null && !_emojiOpen,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          // Back clears the selection first, then closes the emoji panel, and stays in the chat
          if (_selectedId != null) return _clearSelection();
          if (_emojiOpen) return setState(() => _emojiOpen = false);
          _backWhileRecording();
        },
        child: _screen(context, selected),
      ),
    );
  }

  Widget _screen(BuildContext context, ChatMessage? selected) {
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
    final deleteMode = _deleteMode();
    final tools = selected == null
        ? null
        : selectionToolsFor(selected, canInteract: _open, deleteMode: deleteMode, open: _open);
    return Scaffold(
      appBar: selected != null
          ? ChatSelectionBar(
              tools: tools!,
              deleteLocked: deleteMode == DeleteMode.upsell,
              textScale: textScale,
              onClose: _clearSelection,
              onReply: () {
                _clearSelection();
                _startReply(selected);
              },
              onCopy: () async {
                _clearSelection();
                await Clipboard.setData(ClipboardData(text: selected.body));
                if (mounted) showSnack(this.context, 'تم نسخ الرسالة');
              },
              onDelete: () {
                _clearSelection();
                _deleteChosen(selected);
              },
              onReport: () {
                _clearSelection();
                _end(report: true, message: selected);
              },
            )
          : WaChatHeader(
        chat: chat,
        status: status,
        left: left,
        deleteMode: deleteMode,
        textScale: textScale,
        // The match page: the family introduction, the photos, ending the match
        onOpenMatch: canOpenMatch ? _openMatch : null,
        onMenu: (a) {
          switch (a) {
            case ChatMenuAction.match:
              _openMatch();
            case ChatMenuAction.extend:
              _extend();
            case ChatMenuAction.clear:
              _clearChat();
            case ChatMenuAction.report:
              _end(report: true);
            case ChatMenuAction.end:
              _end();
          }
        },
      ),
      // The chat: no screenshots (Android), hidden during screen recording (iOS)
      body: SecureArea(
        screenshotNote: 'المحادثة خاصة بينكما، ومشاركتها خارج نصيبك مخالفة للشروط.',
        child: Builder(builder: (context) {
          if (_loading && chat == null) return const Center(child: CircularProgressIndicator());
          if (_error != null && chat == null) {
            // Gone for good (a link to a chat that isn't there or isn't mine): a retry can't help (QA A-L12)
            final gone = _error is ApiException &&
                ((_error as ApiException).kind == ApiErrorKind.notFound ||
                    (_error as ApiException).kind == ApiErrorKind.forbidden);
            if (gone) {
              return MessageView(
                key: const Key('chat-gone'),
                icon: Icons.forum_outlined,
                title: 'المحادثة غير متاحة',
                body: 'ربما انتهت أو لم تعد متاحة لك.',
                actionLabel: 'المحادثات',
                onAction: () => context.go('/chats'),
              );
            }
            return ErrorView(error: _error!, onRetry: _load);
          }
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
                                  ? const MessageView(art: LineArtKind.cupsTray, icon: Icons.forum_outlined, title: 'لا توجد رسائل في هذه المحادثة')
                                  : MessageView(
                                      art: LineArtKind.cupsTray,
                                      icon: Icons.waving_hand_outlined,
                                      title: forViewer(female, 'ابدأ المحادثة بالسلام', 'ابدئي المحادثة بالسلام'),
                                      body: 'تعرّفا على بعض باحترام: القيم، والطموحات، وتصوّر الحياة الأسرية.',
                                    ),
                            ),
                          ],
                        )
                      : _messageList(items, safety, proPurchasable, selected, tools),
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
        style: AppText.caption.copyWith(fontWeight: FontWeight.w600, color: AppColors.success),
      );
    }
    final activity = chat.partnerActivity;
    if (activity != null && activity.isNotEmpty && _open) {
      return Text(
        activity,
        key: const Key('chat-status-line'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppText.caption.copyWith(fontWeight: FontWeight.w600, color: AppColors.success),
      );
    }
    // An urgent time left is always in the status bar (the expiry bar, or inline in the family bar)
    if (left == null || left.urgent) return null;
    return Text(
      left.text,
      key: const Key('chat-time-left'),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: AppText.caption.copyWith(fontWeight: FontWeight.w600, color: AppColors.muted),
    );
  }

  /// One slim bar under the header, by priority: ending soon, the family step, the push chip
  Widget _statusBar(ChatSummary? chat, ({String text, bool urgent})? left, bool female) {
    if (chat == null) return const SizedBox.shrink();
    final pushOff = !chat.blocked && ref.watch(pushAllowedProvider).valueOrNull == false;
    final bar = chatStatusBar(
      open: _open && !chat.blocked,
      left: left,
      canExtend: chat.canExtend,
      family: chat.matchHidden ? null : _family,
      pushOff: pushOff,
      pushDismissed: _pushChipDismissed,
      // The family offer waits for both to have written (X3 minor 3): the server counts the whole chat, the loaded
      // messages cover my first message sent since its last answer (and servers before the field)
      bothWrote: _serverBothWrote ||
          (_messages.any((m) => m.mine && m.state == SendState.sent) && _messages.any((m) => !m.mine)),
    );
    String g(String m, String f) => forViewer(female, m, f);
    // In the last days the family bar also says how long is left («تبقّى يومان»). Only the offer and a received
    // request need it: in the last days a request I sent or an accepted one ranks below the expiry info bar.
    final soon = left != null && left.urgent ? ' · ${left.text}' : '';
    return switch (bar) {
      ChatBar.none => const SizedBox.shrink(),
      ChatBar.expiry => ChatStatusStrip(
          key: const Key('chat-bar-expiry'),
          icon: Icons.schedule_rounded,
          tone: AppColors.warning,
          text: 'تنتهي المحادثة قريباً · ${left!.text}',
          actionLabel: 'تمديد 7 أيام',
          onAction: _extend,
        ),
      ChatBar.expiryInfo => ChatStatusStrip(
          key: const Key('chat-bar-expiry-info'),
          icon: Icons.schedule_rounded,
          tone: AppColors.warning,
          text: 'تنتهي المحادثة قريباً · ${left!.text}',
        ),
      ChatBar.family => switch (_family!) {
          FamilyStep.offer => ChatStatusStrip(
              key: const Key('chat-bar-family'),
              icon: Icons.family_restroom_rounded,
              text: 'جاهزان للخطوة التالية؟$soon',
              actionLabel: 'تعارف عائلي',
              onAction: _openMatch,
            ),
          FamilyStep.pendingSent => ChatStatusStrip(
              key: const Key('chat-bar-family'),
              icon: Icons.hourglass_top_rounded,
              tone: AppColors.warning,
              text: 'طلب التعارف العائلي بانتظار الرد',
            ),
          FamilyStep.pendingReceived => ChatStatusStrip(
              key: const Key('chat-bar-family'),
              icon: Icons.family_restroom_rounded,
              text: '${g('وصلك طلب تعارف عائلي', 'وصلكِ طلب تعارف عائلي')}$soon',
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
            color: AppColors.safetyChip,
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: InkWell(
              key: const Key('chat-safety'),
              borderRadius: BorderRadius.circular(AppRadius.md),
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
                          forViewer(
                            female,
                            'محادثة خاصة · لا تشارك الأرقام أو الحسابات',
                            'محادثة خاصة · لا تشاركي الأرقام أو الحسابات',
                          ),
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.caption.copyWith(color: AppColors.goldText),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );

  Widget _messageList(
    List<ChatMessage> items,
    Widget? safety,
    bool proPurchasable,
    ChatMessage? selected,
    SelectionTools? tools,
  ) {
    final selecting = selected != null;
    // The safety chip sits above the oldest message once the whole history is loaded
    final showSafety = safety != null && !_hasMore;
    final extra = (_loadingOlder ? 1 : 0) + (showSafety ? 1 : 0);
    return Stack(
      children: [
        // A tapped photo opens full screen with every photo of the chat (oldest first) to swipe through
        ChatPhotoGallery(
          photos: () => _messages,
          partnerName: _chat?.partnerName ?? '',
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              _onScrollNotification(n);
              return false;
            },
            // While selecting, a tap on the list's background ends the selection (a bubble's own tap wins over it)
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: selecting ? _clearSelection : null,
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
                    waveSeed: _waveSeeds[m.id],
                    onReactionsTap: () => _showWhoReacted(m),
                    onFamily: _open && _family == FamilyStep.offer && !(_chat?.matchHidden ?? true) ? _openMatch : null,
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
                  // Long-press selects; while selecting, a tap selects instead of the bubble's own action (the photo
                  // viewer, a quote's jump, play), so the bubble takes no pointer then. Swipe inward: reply. The
                  // selected row is washed full width; a tapped quote's original is tinted briefly.
                  final isSelected = selected?.id == m.id;
                  final canSelect = selecting && sent;
                  Widget row = AnimatedContainer(
                    duration: AppMotion.of(context, const Duration(milliseconds: 250)),
                    color: isSelected
                        ? AppColors.chatSelect
                        : _highlightId == m.id
                        ? AppColors.gold.withValues(alpha: 0.22)
                        : Colors.transparent,
                    child: SwipeToReply(
                      mine: m.mine,
                      // A trace can't be answered
                      enabled: _open && sent && !m.deleted,
                      onReply: () {
                        _clearSelection();
                        _startReply(m);
                      },
                      child: GestureDetector(
                        onLongPress: sent ? () => _select(m) : null,
                        onTap: canSelect ? () => _tapWhileSelecting(m) : null,
                        child: AbsorbPointer(absorbing: canSelect, child: bubble),
                      ),
                    ),
                  );
                  if (isSelected) row = CompositedTransformTarget(link: _pickerLink, child: row);
                  return _RowProbe(
                    key: ValueKey('row-${m.id}'),
                    id: m.id,
                    rowsById: _rowsById,
                    child: !layout.daySeparator && !layout.unreadDivider
                        // A message that arrives or is sent while the chat is open rises 6 px into place (P2-1); none
                        // with reduced motion, and never the ones already there when it opened
                        // (my own message confirmed by the server is a new row under its server id: it rose already, as
                        // it was sent)
                        ? RiseIn(
                            enabled: _loadedOnce && !_shownAtOpen.contains(m.id) && !(m.mine && m.state == SendState.sent),
                            child: row,
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (layout.daySeparator) _DayChip(label: chatDayLabel(m.createdAt)),
                              if (layout.unreadDivider) _UnreadDivider(count: _unreadAtOpen),
                              row,
                            ],
                          ),
                  );
                },
              ),
            ),
          ),
        ),
        // The day of what's at the top, kept in view while scrolling
        PositionedDirectional(
          top: 4,
          start: 0,
          end: 0,
          child: IgnorePointer(
            // Faded through its own colours, not an opacity layer over a bordered box (QA A-L10: Impeller's
            // «SetInheritedOpacity» warnings)
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: _scrolling && _stickyDay != null ? 1 : 0),
              duration: AppMotion.of(context, AppMotion.appear),
              builder: (_, fade, _) => _stickyDay == null || fade == 0
                  ? const SizedBox.shrink()
                  : _DayChip(key: const Key('chat-sticky-day'), label: _stickyDay!, floating: true, fade: fade),
            ),
          ),
        ),
        if (_away)
          PositionedDirectional(
            bottom: 12,
            end: 12,
            child: NewestButton(unseen: _unseen, onPressed: _toNewest),
          ),
        // The four reactions float above the selected row (below it near the top), on its own side
        if (selected != null && tools!.react) _picker(selected),
      ],
    );
  }

  Widget _picker(ChatMessage m) {
    final dir = Directionality.of(context);
    final side = m.mine ? AlignmentDirectional.topEnd : AlignmentDirectional.topStart;
    final bottomSide = m.mine ? AlignmentDirectional.bottomEnd : AlignmentDirectional.bottomStart;
    return Positioned(
      top: 0,
      left: 0,
      child: CompositedTransformFollower(
        link: _pickerLink,
        // Scrolled out of view: hidden with its row
        showWhenUnlinked: false,
        targetAnchor: (_pickerBelow ? bottomSide : side).resolve(dir),
        followerAnchor: (_pickerBelow ? side : bottomSide).resolve(dir),
        offset: Offset(0, _pickerBelow ? 4 : -4),
        child: ReactionPicker(
          mine: m.myReaction,
          onPick: (emoji) {
            _clearSelection();
            _react(m.id, emoji);
          },
        ),
      ),
    );
  }

  /// The composer can be written in (an open chat, chats on)
  bool get _canWrite {
    final chat = _chat;
    return chat != null && chat.canSend && _chatEnabled;
  }

  /// The emoji button: the panel in the keyboard's place (the field unfocused, the keyboard hidden), or back to the
  /// keyboard (the field focused)
  void _toggleEmoji() {
    if (_emojiOpen) {
      _emojiToKeyboard();
      _inputFocus.requestFocus();
      return;
    }
    _inputFocus.unfocus();
    SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
    // Shown at once, in the room the keyboard leaves as it closes (sized in `_footer` from the inset)
    _endHandover();
    setState(() => _emojiOpen = true);
  }

  /// A pick from the panel: at the cursor (the field keeps no focus, so the keyboard stays away), then like a keystroke
  void _insertEmoji(String emoji) {
    final next = insertAtCursor(_input.value, emoji);
    if (identical(next, _input.value)) return;
    _input.value = next;
    _onTyped(next.text);
  }

  Widget _footer(ChatSummary? chat) {
    if (chat == null) return const SizedBox.shrink();
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    // Photo and voice follow Pro: usable, greyed with a «Pro» tag for a member who could buy it, or hidden
    final media = _mediaMode(chat);
    if (!_canWrite) {
      final text = !_chatEnabled
          ? 'المحادثات متوقفة حالياً.'
          : chat.blocked
              ? 'هذه المحادثة للقراءة فقط.'
              : chat.status == 'ENDED'
                  ? (chat.endedByMe ? 'أنهيت هذه المحادثة.' : 'انتهت هذه المحادثة.')
                  : 'انتهت مدة المحادثة.';
      return WaReadOnlyFooter(text: text);
    }
    final holdUi = _holding && (_voice == _Voice.starting || _voice == _Voice.recording);
    if (!holdUi && (_voice == _Voice.recording || _voice == _Voice.stopping || _voice == _Voice.stopped)) {
      return _recordingBar();
    }
    final locked = media == MediaButtons.locked;
    final panel = _emojiOpen && !holdUi;
    // The panel's room: its full height less what the keyboard still takes, so the composer stays put while one
    // replaces the other (both ways)
    final panelRoom = (panel || (_emojiHandover && !holdUi)) ? _panelFull() : 0.0;
    final room = panelRoom - _keyboardInset;
    // Starters while I haven't written anything (the server stops sending them after my first message)
    final starters =
        !holdUi && !panel && _replyTo == null && !_messages.any((m) => m.mine) ? _starters : const <String>[];
    return SafeArea(
      top: false,
      // The keyboard's place (keyboard or panel) already covers the home indicator
      bottom: !_keyboardOpen && panelRoom == 0,
      child: ColoredBox(
        color: AppColors.chatBackdrop,
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
                                female: female,
                              )
                            : WaComposerPill(
                                controller: _input,
                                focusNode: _inputFocus,
                                female: female,
                                media: media,
                                emojiOpen: _emojiOpen,
                                onToggleEmoji: _toggleEmoji,
                                onAttach: _attach,
                                onOpenPro: _openPro,
                                onChanged: _onTyped,
                              ),
                      ),
                      const SizedBox(width: 6),
                      // Part of the input's tap region: sending keeps the keyboard open for the next message
                      TextFieldTapRegion(child: _roundButton(hasText, media, locked, holdUi)),
                    ],
                  ),
                ),
                if (panelRoom > 0 && room > 0)
                  SizedBox(
                    key: const Key('emoji-room'),
                    height: room,
                    child: ClipRect(
                      child: OverflowBox(
                        alignment: Alignment.topCenter,
                        minHeight: panelRoom,
                        maxHeight: panelRoom,
                        // Giving way to the keyboard: shown, not used
                        child: IgnorePointer(
                          ignoring: !panel,
                          child: ExcludeSemantics(
                            excluding: !panel,
                            child: EmojiPanel(onPick: _insertEmoji, height: panelRoom),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
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
      return ComposerMediaButton(
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

/// «اليوم» / «أمس» / a date between the messages of two days; [floating] is the copy kept at the top while scrolling
class _DayChip extends StatelessWidget {
  const _DayChip({super.key, required this.label, this.floating = false, this.fade = 1});
  final String label;
  final bool floating;

  /// 0–1: how far faded in (applied to its colours)
  final double fade;

  @override
  Widget build(BuildContext context) {
    // One pill style for days and «رسائل جديدة» (design review P2-1)
    return Padding(
      padding: floating ? EdgeInsets.zero : const EdgeInsets.only(top: 12, bottom: 4),
      child: Center(
        child: ChatPill(label: label, fade: fade),
      ),
    );
  }
}

/// The chat's one pill: a day, the floating day while scrolling
class ChatPill extends StatelessWidget {
  const ChatPill({super.key, required this.label, this.fade = 1});
  final String label;
  final double fade;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.chatChip.withValues(alpha: AppColors.chatChip.a * fade),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: AppColors.line.withValues(alpha: fade)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
        child: Text(label, style: AppText.caption.copyWith(color: AppColors.muted.withValues(alpha: fade), fontWeight: FontWeight.w700)),
      ),
    );
  }
}

/// The full-width strip «N رسائل غير مقروءة» above the first message that was unread when the chat opened. It reaches
/// the list's edges (the list's own side padding is 8).
class _UnreadDivider extends StatelessWidget {
  const _UnreadDivider({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 4),
      child: SizedBox(
        height: 32,
        child: LayoutBuilder(
          builder: (context, c) => OverflowBox(
            minWidth: c.maxWidth + 16,
            maxWidth: c.maxWidth + 16,
            child: Container(
              key: const Key('chat-unread-divider'),
              alignment: Alignment.center,
              color: AppColors.chatChip,
              child: Text(
                unreadStripLabel(count),
                style: AppText.label.copyWith(color: AppColors.navy),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Registers a message row by its message id while it is built, so the sticky date chip can find the topmost one on
/// screen and a quote can scroll to its original
class _RowProbe extends StatefulWidget {
  const _RowProbe({
    super.key,
    required this.id,
    required this.rowsById,
    required this.child,
  });
  final String id;
  final Map<String, BuildContext> rowsById;
  final Widget child;

  @override
  State<_RowProbe> createState() => _RowProbeState();
}

class _RowProbeState extends State<_RowProbe> {
  @override
  Widget build(BuildContext context) {
    widget.rowsById[widget.id] = context;
    return widget.child;
  }

  @override
  void dispose() {
    if (identical(widget.rowsById[widget.id], context)) widget.rowsById.remove(widget.id);
    super.dispose();
  }
}
