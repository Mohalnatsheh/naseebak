import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../core/auth/auth_controller.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import 'chat_format.dart';
import 'chat_models.dart';

/// A chat she can still write in: «النشطة». Ended, expired and read-only (blocked) chats are «المنتهية».
bool isActiveChat(ChatSummary c) => c.status == 'ACTIVE' && !c.blocked;

class ChatsScreen extends ConsumerStatefulWidget {
  const ChatsScreen({super.key});

  /// While the list is on screen it reloads itself, so a message that arrives meanwhile shows up
  /// (last message, unread badge) without a pull to refresh.
  static const refreshEvery = Duration(seconds: 15);

  @override
  ConsumerState<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends ConsumerState<ChatsScreen> with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  Timer? _timer;

  /// «النشطة» (0, the default) and «المنتهية» (1)
  late final TabController _tabs = TabController(length: 2, vsync: this);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(ChatsScreen.refreshEvery, (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tabs.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// The shell keeps this tab alive with its tickers off while another tab is shown: coming back
  /// to it reloads the list at once instead of showing what it had when the member left.
  bool? _shown;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final shown = TickerMode.valuesOf(context).enabled;
    if (_shown == false && shown) {
      // Back on Chats: it opens on the active chats again
      _tabs.index = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    }
    _shown = shown;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  /// Only while this tab is the one shown (inactive tabs run with tickers off) and the app is in front
  void _refresh() {
    if (!mounted || !TickerMode.valuesOf(context).enabled) return;
    final life = WidgetsBinding.instance.lifecycleState;
    if (life != null && life != AppLifecycleState.resumed) return;
    ref.invalidate(chatListProvider);
    ref.invalidate(countsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final chats = ref.watch(chatListProvider);
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    final list = chats.valueOrNull ?? const <ChatSummary>[];
    final active = [
      for (final c in list)
        if (isActiveChat(c)) c,
    ];
    final ended = [
      for (final c in list)
        if (!isActiveChat(c)) c,
    ];
    int unread(List<ChatSummary> l) => l.fold(0, (n, c) => n + c.unread);
    Tab tab(String label, int count) => Tab(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          if (count > 0) ...[const SizedBox(width: 6), CountBadge(count: count)],
        ],
      ),
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('المحادثات'),
        bottom: TabBar(controller: _tabs, tabs: [tab('النشطة', unread(active)), tab('المنتهية', unread(ended))]),
      ),
      body: chats.when(
        loading: () => const SkeletonList(count: 4, itemHeight: 72),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(chatListProvider)),
        data: (_) => TabBarView(
          controller: _tabs,
          children: [
            _list(
              key: const PageStorageKey('chats-active'),
              items: active,
              female: female,
              emptyTitle: 'لا توجد محادثات نشطة',
              emptyBody: 'تُفتح المحادثة بعد التوافق المتبادل وقبول طلب المحادثة. نصية فقط، ولمدة محدودة.',
            ),
            _list(
              key: const PageStorageKey('chats-ended'),
              items: ended,
              female: female,
              emptyTitle: 'لا توجد محادثات منتهية',
              emptyBody: 'تظهر هنا المحادثات التي انتهت مدتها أو أُنهيت، للقراءة فقط.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _list({
    required Key key,
    required List<ChatSummary> items,
    required bool female,
    required String emptyTitle,
    required String emptyBody,
  }) {
    return RefreshIndicator(
      key: key,
      onRefresh: () async {
        ref.invalidate(countsProvider);
        ref.invalidate(chatListProvider);
        await ref.read(chatListProvider.future);
      },
      child: items.isEmpty
          ? ListView(
              children: [
                SizedBox(
                  height: 440,
                  child: MessageView(icon: Icons.forum_outlined, title: emptyTitle, body: emptyBody),
                ),
              ],
            )
          : ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(indent: 76),
              itemBuilder: (context, i) => _tile(context, items[i], female),
            ),
    );
  }

  Widget _tile(BuildContext context, ChatSummary c, bool female) {
    final status = switch (c.status) {
      'ENDED' => 'منتهية',
      'EXPIRED' => 'انتهت المدة',
      _ => c.blocked ? 'للقراءة فقط' : null,
    };
    final left = status == null && c.status == 'ACTIVE' ? chatTimeLeft(c.expiresAt) : null;
    return ListTile(
      minVerticalPadding: 12,
      leading: CircleAvatar(
        radius: 24,
        backgroundColor: AppColors.navy.withValues(alpha: 0.08),
        child: Text(
          c.partnerName.isEmpty ? '؟' : c.partnerName.characters.first,
          style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w700, fontSize: 19),
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(c.partnerName, style: TextStyle(fontWeight: c.unread > 0 ? FontWeight.w800 : FontWeight.w600)),
          ),
          if (c.lastMessageAt != null)
            Text(formatRelative(c.lastMessageAt!), style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (c.lastMessage != null && c.lastMine) ...[
                Icon(
                  c.lastRead ? Icons.done_all_rounded : Icons.done_rounded,
                  size: 16,
                  color: c.lastRead ? AppColors.navy : AppColors.muted,
                  semanticLabel: c.lastRead ? 'مقروءة' : 'أُرسلت',
                ),
                const SizedBox(width: 4),
              ],
              Expanded(
                child: Text(
                  c.lastMessage == null
                      ? (status ?? forViewer(female, 'ابدأ المحادثة بالسلام', 'ابدئي المحادثة بالسلام'))
                      : '${c.lastMine ? '${forViewer(female, 'أنت', 'أنتِ')}: ' : ''}${c.lastMessage}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.unread > 0 ? AppColors.ink : null,
                    fontWeight: c.unread > 0 ? FontWeight.w600 : null,
                  ),
                ),
              ),
              if (status != null && c.lastMessage != null) Pill(text: status, color: AppColors.muted),
              if (c.unread > 0) ...[const SizedBox(width: 6), CountBadge(count: c.unread)],
            ],
          ),
          if (left != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                left.text,
                style: TextStyle(
                  fontSize: 12,
                  color: left.urgent ? AppColors.warning : AppColors.muted,
                  fontWeight: left.urgent ? FontWeight.w700 : null,
                ),
              ),
            ),
        ],
      ),
      onTap: () async {
        await context.push('/chats/${c.id}');
        if (!mounted) return;
        ref.invalidate(chatListProvider);
        ref.invalidate(countsProvider);
      },
    );
  }
}
