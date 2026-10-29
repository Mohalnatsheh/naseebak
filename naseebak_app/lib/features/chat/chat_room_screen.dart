import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../matches/match_detail_screen.dart' show ReportSheet;
import 'chat_bubble.dart';
import 'chat_models.dart';

/// One conversation. The website gets live events from Ably; the app polls `?after=` every 4 s while open.
class ChatRoomScreen extends ConsumerStatefulWidget {
  const ChatRoomScreen({super.key, required this.chatId, this.pollInterval = const Duration(seconds: 4)});
  final String chatId;
  final Duration pollInterval;

  @override
  ConsumerState<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

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
  bool _polling = false;
  int _nonceSeq = 0;

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scroll.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startPolling();
      _poll();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _timer?.cancel();
    }
  }

  void _startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(widget.pollInterval, (_) => _poll());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _repo.load(widget.chatId);
      if (!mounted) return;
      setState(() {
        _chat = page.conversation;
        _chatEnabled = page.chatEnabled;
        _messages
          ..clear()
          ..addAll(page.messages);
        _hasMore = page.hasMore;
      });
      _markRead();
      _startPolling();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  DateTime? get _lastServerTime {
    for (final m in _messages.reversed) {
      if (m.state == SendState.sent) return m.createdAt;
    }
    return null;
  }

  Future<void> _poll() async {
    if (_polling || _loading || !mounted) return;
    _polling = true;
    try {
      final after = _lastServerTime;
      final page = await _repo.load(widget.chatId, after: after);
      if (!mounted) return;
      final known = _messages.map((m) => m.id).toSet();
      final fresh = page.messages.where((m) => !known.contains(m.id)).toList();
      setState(() {
        _chat = page.conversation;
        _chatEnabled = page.chatEnabled;
        if (after == null) {
          // Nothing loaded yet: take the latest page as is
          _messages.removeWhere((m) => m.state == SendState.sent);
          _messages.insertAll(0, page.messages);
        } else {
          _insertSorted(fresh);
        }
      });
      if (fresh.any((m) => !m.mine)) _markRead();
    } catch (_) {
      // Silent: the next tick retries; a 401 signs out through the API client
    } finally {
      _polling = false;
    }
  }

  void _insertSorted(List<ChatMessage> fresh) {
    if (fresh.isEmpty) return;
    final pending = _messages.where((m) => m.state != SendState.sent).toList();
    _messages.removeWhere((m) => m.state != SendState.sent);
    _messages.addAll(fresh);
    _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    _messages.addAll(pending);
  }

  void _onScroll() {
    // reverse: true — older messages are at the far end
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 200) _loadOlder();
  }

  Future<void> _loadOlder() async {
    if (!_hasMore || _loadingOlder || _messages.isEmpty) return;
    setState(() => _loadingOlder = true);
    try {
      final page = await _repo.load(widget.chatId, before: _messages.first.createdAt);
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
    final nonce = retry?.nonce ?? 'app-${DateTime.now().microsecondsSinceEpoch}-${_nonceSeq++}';
    final local = ChatMessage(
      id: 'local-$nonce',
      body: text,
      createdAt: DateTime.now(),
      mine: true,
      state: SendState.sending,
      nonce: nonce,
    );
    setState(() {
      if (retry != null) _messages.removeWhere((m) => m.nonce == nonce);
      _messages.add(local);
      if (retry == null) _input.clear();
    });
    try {
      final sent = await _repo.send(widget.chatId, text, nonce: nonce);
      if (!mounted) return;
      setState(() {
        _messages.removeWhere((m) => m.nonce == nonce || m.id == sent.id);
        _insertSorted([sent]);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        final i = _messages.indexWhere((m) => m.nonce == nonce);
        if (i >= 0) _messages[i] = _messages[i].copyWith(state: SendState.failed, error: e.message, filtered: e.code == 'FILTERED');
      });
      if (e.code == 'EXPIRED' || e.code == 'NOT_ALLOWED' || e.code == 'DISABLED') _poll();
    }
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
        builder: (_) => const ReportSheet(),
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

  @override
  Widget build(BuildContext context) {
    final chat = _chat;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(chat?.partnerName ?? 'المحادثة'),
            if (chat?.expiresAt != null && chat!.status == 'ACTIVE')
              Text('حتى ${formatDate(chat.expiresAt!, withYear: false)}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w500)),
          ],
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
      body: Builder(builder: (context) {
        if (_loading && chat == null) return const Center(child: CircularProgressIndicator());
        if (_error != null && chat == null) return ErrorView(error: _error!, onRetry: _load);
        final items = _messages.reversed.toList();
        return Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Text(
                'لحمايتك: لا تُشارك الأرقام أو الروابط أو حسابات التواصل. التواصل العائلي يتم عبر التعارف العائلي.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted, fontSize: 12),
              ),
            ),
            Expanded(
              child: items.isEmpty
                  ? const MessageView(
                      icon: Icons.waving_hand_outlined,
                      title: 'ابدأ المحادثة بالسلام',
                      body: 'تعرّفا على بعض باحترام: القيم، والطموحات، وتصوّر الحياة الأسرية.',
                    )
                  : ListView.builder(
                      controller: _scroll,
                      reverse: true,
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
                        return ChatBubble(
                          message: m,
                          onRetry: m.state == SendState.failed
                              ? () => m.filtered ? _editFailed(m) : _send(m)
                              : null,
                        );
                      },
                    ),
            ),
            _footer(chat),
          ],
        );
      }),
    );
  }

  Widget _footer(ChatSummary? chat) {
    if (chat == null) return const SizedBox.shrink();
    if (!chat.canSend || !_chatEnabled) {
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
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.line))),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                key: const Key('chat-input'),
                controller: _input,
                minLines: 1,
                maxLines: 5,
                maxLength: 2000,
                textInputAction: TextInputAction.newline,
                style: const TextStyle(fontSize: 16),
                decoration: const InputDecoration(hintText: 'اكتب رسالتك…', counterText: ''),
              ),
            ),
            const SizedBox(width: 6),
            IconButton.filled(
              key: const Key('chat-send'),
              tooltip: 'إرسال',
              style: IconButton.styleFrom(backgroundColor: AppColors.navy, minimumSize: const Size(52, 52)),
              onPressed: () => _send(),
              icon: const Icon(Icons.send_rounded, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}
