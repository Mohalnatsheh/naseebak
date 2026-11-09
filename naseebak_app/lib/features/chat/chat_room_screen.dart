import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../matches/match_detail_screen.dart' show ReportSheet;
import '../pro/pro_badge.dart';
import '../pro/pro_repository.dart';
import 'chat_bubble.dart';
import 'chat_cache.dart';
import 'chat_format.dart';
import 'chat_live.dart';
import 'chat_media_picker.dart';
import 'chat_models.dart';
import 'media_bubbles.dart' show formatVoiceDuration;
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

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen> with WidgetsBindingObserver {
  final _input = TextEditingController();
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

  ChatRepository get _repo => ref.read(chatRepositoryProvider);
  ChatCache get _cache => ref.read(chatCacheProvider);
  String? get _memberId => ref.read(authControllerProvider).me?.id;

  /// The chat's voice notes (players outlive their bubbles; all closed when the chat is left)
  late final VoicePlayback _playback;
  ProviderSubscription<bool?>? _countsPro;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _playback = ref.read(voicePlaybackProvider)..canPlay = () => _voice == _Voice.idle || _voice == _Voice.stopped;
    // Pro bought or lapsed elsewhere: the counts poll sees it first, then the buttons follow `/api/pro`
    _countsPro = ref.listenManual(countsProvider.select((c) => c.valueOrNull?.isPro), (prev, next) {
      if (next == null || prev == next) return;
      if (ref.read(proStateProvider).valueOrNull?.isPro != next) ref.invalidate(proStateProvider);
    });
    _scroll.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopPolling();
    _live?.cancel();
    // Leaving mid-recording (or during the microphone prompt): release the microphone, send nothing
    _releaseVoice();
    // A failed voice note is not kept after leaving (never cached): its temporary file goes with it
    for (final m in _messages) {
      if (m.state == SendState.failed && m.kind == MessageKind.voice && m.localPath != null) _deleteQuietly(m.localPath!);
    }
    _countsPro?.close();
    _playback
      ..canPlay = null
      ..closeAll();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // A private note never plays on outside the app (Android keeps playing in the background otherwise)
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) _playback.pauseCurrent();
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
    }).listen((_) => _poll(), onDone: () => _live = null);
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
        _mergeLatest(page);
      });
      _saveCache();
      _markRead();
      _watch();
      _fillScreen();
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
    _messages
      ..clear()
      ..addAll(older.where((m) => !pageIds.contains(m.id)))
      ..addAll(page.messages)
      ..addAll(pending.where((m) => !pageIds.contains(m.id)));
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

  void _insertSorted(List<ChatMessage> fresh) {
    if (fresh.isEmpty) return;
    final pending = _messages.where((m) => m.state != SendState.sent).toList();
    _messages.removeWhere((m) => m.state != SendState.sent);
    _messages.addAll(fresh);
    // Same order as the server: time, then id (two messages can share a millisecond)
    _messages.sort((a, b) {
      final t = a.createdAt.compareTo(b.createdAt);
      return t != 0 ? t : a.id.compareTo(b.id);
    });
    _messages.addAll(pending);
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
    final local = ChatMessage(
      id: 'local-$nonce',
      body: text,
      createdAt: DateTime.now(),
      mine: true,
      state: SendState.sending,
      nonce: nonce,
    );
    // What a poll during the send can bring (the copy of this message, if the answer gets lost)
    final before = _messages.map((m) => m.id).toSet();
    // My first message in this chat (the whole history is loaded and none of it is mine)
    final first = retry == null && !_hasMore && !_messages.any((m) => m.mine);
    setState(() {
      if (retry != null) _messages.removeWhere((m) => m.nonce == nonce);
      _messages.add(local);
      if (retry == null) _input.clear();
    });
    _toNewest();
    try {
      final sent = await _repo.send(widget.chatId, text, nonce: nonce);
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
      showSnack(context, 'الصورة كبيرة جداً');
      return;
    }
    await _sendMedia(kind: MessageKind.image, path: photo.path);
  }

  /// A greyed media button (and the link under a PRO_REQUIRED failure): the Pro screen
  void _openPro() => context.push('/pro');

  /// A photo or voice note: a bubble from the local file at once, replaced by the server copy. A retry passes the
  /// failed bubble and resends its file with the same nonce. `PRO_REQUIRED` (Pro lapsed while the chat was open)
  /// fails the bubble with the server's text and reloads the Pro state, so the buttons follow.
  Future<void> _sendMedia({MessageKind? kind, String? path, int? durationSec, ChatMessage? retry}) async {
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
    final mime = voice ? 'audio/mp4' : 'image/jpeg';
    final nonce = retry?.nonce ?? _newNonce();
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
      );
      _confirmedIds.add(sent.id);
      if (first) container.read(analyticsProvider).chatStarted();
      container.invalidate(chatListProvider);
      // The voice note's temporary file is no longer needed (the server copy plays from now on)
      if (voice) _deleteQuietly(file);
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

  /// Voice notes are still allowed right now (Pro, chat open). Read, not watched: used after an await.
  bool get _voiceAllowed {
    final chat = _chat;
    if (chat == null || !chat.canSend || !_chatEnabled) return false;
    final pro = ref.read(proStateProvider).valueOrNull;
    final countsPro = ref.read(countsProvider).valueOrNull?.isPro;
    final mode = mediaButtonsMode(
      isPro: pro?.isPro ?? countsPro ?? false,
      appPayments: ref.read(appPaymentsProvider),
      canBuy: pro?.canBuy ?? false,
      chatActive: chat.status == 'ACTIVE',
    );
    return mode == MediaButtons.enabled;
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
      showSnack(context, 'يمكنك السماح باستخدام الميكروفون من إعدادات الهاتف لإرسال رسالة صوتية');
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
    await _sendMedia(kind: MessageKind.voice, path: path, durationSec: voiceDurationSec(elapsed));
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
    });
  }

  Future<void> _end({bool report = false}) async {
    String? reason;
    String? details;
    if (report) {
      final res = await showModalBottomSheet<(String, String)>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => const ReportSheet(
          description: 'يصل البلاغ إلى فريق نصيبك، وتنتهي المحادثة للطرفين ولا يمكن فتحها مرة أخرى.',
          submitLabel: 'إبلاغ وإنهاء المحادثة',
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

  @override
  Widget build(BuildContext context) {
    final chat = _chat;
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    final left = chat != null && chat.status == 'ACTIVE' ? chatTimeLeft(chat.expiresAt) : null;
    final canOpenMatch = chat != null && !chat.matchHidden;
    // Under a PRO_REQUIRED failure, a link to «عضوية Pro» only where the member could buy it (never a test account)
    final proPurchasable =
        ref.watch(appPaymentsProvider) && (ref.watch(proStateProvider).valueOrNull?.canBuy ?? false);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: InkWell(
          key: const Key('chat-header'),
          borderRadius: BorderRadius.circular(12),
          // The match page: the family introduction, the photos, ending the match
          onTap: canOpenMatch ? () => context.push('/matches/${chat.matchId}') : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppColors.gold.withValues(alpha: 0.15),
                  child: Text(
                    (chat?.partnerName ?? '').isEmpty ? '؟' : chat!.partnerName.characters.first,
                    style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w700, fontSize: 17),
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
                      if (left != null)
                        Text(
                          left.text,
                          key: const Key('chat-time-left'),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: left.urgent ? AppColors.warning : AppColors.muted,
                          ),
                        ),
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
                    context.push('/matches/${chat.matchId}');
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
          return Column(
            children: [
              // One line; the full advice behind ⓘ
              InkWell(
                key: const Key('chat-safety'),
                onTap: () => _safetyInfo(female),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.shield_outlined, size: 15, color: AppColors.muted),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          forViewer(female, 'لحمايتك: لا تُشارك أرقاماً أو روابط', 'لحمايتكِ: لا تُشاركي أرقاماً أو روابط'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.muted, fontSize: 12),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.info_outline_rounded, size: 15, color: AppColors.muted),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: items.isEmpty && !_open
                    ? const MessageView(icon: Icons.forum_outlined, title: 'لا توجد رسائل في هذه المحادثة')
                    : items.isEmpty
                    ? MessageView(
                        icon: Icons.waving_hand_outlined,
                        title: forViewer(female, 'ابدأ المحادثة بالسلام', 'ابدئي المحادثة بالسلام'),
                        body: 'تعرّفا على بعض باحترام: القيم، والطموحات، وتصوّر الحياة الأسرية.',
                      )
                    : Stack(
                        children: [
                          ListView.builder(
                            controller: _scroll,
                            reverse: true,
                            // Scrolling the messages closes the keyboard
                            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                            itemCount: items.length + (_loadingOlder ? 1 : 0),
                            itemBuilder: (context, i) {
                              if (i == items.length) {
                                return const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                                );
                              }
                              final m = items[i];
                              final layout = chatRowLayout(items, i);
                              final bubble = ChatBubble(
                                key: ValueKey(m.id),
                                message: m,
                                showTime: layout.showTime,
                                tightTop: layout.tightTop,
                                onOpenPro: m.proRequired && proPurchasable ? _openPro : null,
                                onRetry: m.state == SendState.failed && !m.proRequired
                                    ? () => m.kind != MessageKind.text
                                        ? _sendMedia(retry: m)
                                        : m.filtered
                                        ? _editFailed(m)
                                        : _send(m)
                                    : null,
                              );
                              if (!layout.daySeparator) return bubble;
                              return Column(
                                key: ValueKey('day-${m.id}'),
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [_DaySeparator(label: chatDayLabel(m.createdAt)), bubble],
                              );
                            },
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
                      ),
              ),
              _footer(chat),
            ],
          );
        }),
      ),
    );
  }

  Widget _footer(ChatSummary? chat) {
    if (chat == null) return const SizedBox.shrink();
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    // Photo and voice follow Pro: usable, greyed with a «Pro» tag for a member who could buy it, or hidden
    final media = _mediaMode(chat);
    final canSend = chat.canSend && _chatEnabled;
    // The chat closed or Pro went away mid-recording: release the microphone, the bar goes back to idle
    if (_voice != _Voice.idle && (!canSend || media != MediaButtons.enabled)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _voice == _Voice.idle || _voiceAllowed) return;
        _releaseVoice();
        setState(() => _voice = _Voice.idle);
      });
    }
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
    if (_voice == _Voice.recording || _voice == _Voice.stopping || _voice == _Voice.stopped) return _recordingBar();
    final locked = media == MediaButtons.locked;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.line))),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (media != MediaButtons.hidden) ...[
              TextFieldTapRegion(
                child: _MediaButton(
                  key: const Key('chat-photo'),
                  tagKey: const Key('chat-media-pro-tag'),
                  icon: Icons.photo_outlined,
                  tooltip: locked ? 'إرسال الصور مع Pro' : 'إرسال صورة',
                  locked: locked,
                  onPressed: locked ? _openPro : _pickPhoto,
                ),
              ),
              TextFieldTapRegion(
                child: _MediaButton(
                  key: const Key('chat-mic'),
                  tagKey: const Key('chat-mic-pro-tag'),
                  icon: Icons.mic_none_rounded,
                  tooltip: locked ? 'الرسائل الصوتية مع Pro' : 'رسالة صوتية',
                  locked: locked,
                  onPressed: locked ? _openPro : _startVoice,
                ),
              ),
              const SizedBox(width: 2),
            ],
            Expanded(
              child: TextField(
                key: const Key('chat-input'),
                controller: _input,
                minLines: 1,
                maxLines: 5,
                maxLength: 2000,
                textInputAction: TextInputAction.newline,
                // A tap anywhere else (the messages, the header) closes the keyboard
                onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                style: const TextStyle(fontSize: 16),
                decoration: InputDecoration(hintText: forViewer(female, 'اكتب رسالتك…', 'اكتبي رسالتكِ…'), counterText: ''),
              ),
            ),
            const SizedBox(width: 6),
            // Part of the input's tap region: sending keeps the keyboard open for the next message
            TextFieldTapRegion(
              child: IconButton.filled(
                key: const Key('chat-send'),
                tooltip: 'إرسال',
                style: IconButton.styleFrom(backgroundColor: AppColors.navy, minimumSize: const Size(52, 52)),
                onPressed: () => _send(),
                icon: const Icon(Icons.send_rounded, color: Colors.white),
              ),
            ),
          ],
        ),
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

/// «اليوم» / «أمس» / a date between the messages of two days
class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 6),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(color: AppColors.line.withValues(alpha: 0.8), borderRadius: BorderRadius.circular(12)),
          child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
