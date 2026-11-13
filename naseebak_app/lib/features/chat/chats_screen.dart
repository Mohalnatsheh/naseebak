import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/alpha_fade.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../../core/auth/auth_controller.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../pro/pro_badge.dart';
import 'chat_format.dart';
import 'chat_models.dart';

/// A chat she can still write in: «النشطة». Ended, expired and read-only (blocked) chats are «المنتهية».
bool isActiveChat(ChatSummary c) => c.status == 'ACTIVE' && !c.blocked;

/// The list's filter chips (the website's «الكل» / «غير مقروءة» / «المنتهية»)
enum ChatsChip { all, unread, ended }

/// The chats a chip shows, in the list's order: «الكل» = active, «غير مقروءة» = active with unread, «المنتهية» = the rest.
List<ChatSummary> chatsForChip(List<ChatSummary> chats, ChatsChip chip) => [
  for (final c in chats)
    if (switch (chip) {
      ChatsChip.all => isActiveChat(c),
      ChatsChip.unread => isActiveChat(c) && c.unread > 0,
      ChatsChip.ended => !isActiveChat(c),
    })
      c,
];

/// «غير مقروءة» or «غير مقروءة 3»: counts chats, not messages
String unreadChipLabel(int chats) => chats > 0 ? 'غير مقروءة $chats' : 'غير مقروءة';

class ChatsScreen extends ConsumerStatefulWidget {
  const ChatsScreen({super.key});

  /// While the list is on screen it reloads itself, so a message that arrives meanwhile shows up
  /// (last message, unread badge) without a pull to refresh.
  static const refreshEvery = Duration(seconds: 15);

  @override
  ConsumerState<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends ConsumerState<ChatsScreen> with WidgetsBindingObserver {
  Timer? _timer;

  /// «الكل» (the default), «غير مقروءة» and «المنتهية»
  ChatsChip _chip = ChatsChip.all;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(ChatsScreen.refreshEvery, (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// The shell keeps this tab alive with its tickers off while another tab is shown: coming back
  /// to it reloads the list at once instead of showing what it had when the member left.
  bool? _shown;

  /// The shell's tab while this list was shown, and whether it was left for another tab (not covered by a chat)
  int? _shownTab;
  bool _leftForTab = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final shown = TickerMode.valuesOf(context).enabled;
    final tab = StatefulNavigationShell.maybeOf(context)?.currentIndex;
    if (_shown != false && !shown) {
      // Hidden: by another bottom tab (the shell's tab changed), or by a chat opened on top (it didn't)
      _leftForTab = tab == null || tab != _shownTab;
    }
    if (_shown == false && shown) {
      // Back on Chats from another tab: it opens on «الكل» again. Back from a chat keeps the chip.
      if (_leftForTab) setState(() => _chip = ChatsChip.all);
      WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    }
    if (shown) _shownTab = tab;
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
    final unreadChats = chatsForChip(list, ChatsChip.unread).length;
    Widget chip(ChatsChip c, String key, String label) {
      final on = _chip == c;
      return Semantics(
        button: true,
        selected: on,
        label: label,
        excludeSemantics: true,
        onTap: () => setState(() => _chip = c),
        child: Material(
          color: on ? AppColors.navy : AppColors.chatChip,
          shape: StadiumBorder(side: BorderSide(color: on ? AppColors.navy : AppColors.line)),
          child: InkWell(
            key: Key(key),
            customBorder: const StadiumBorder(),
            onTap: () => setState(() => _chip = c),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Center(
                  widthFactor: 1,
                  child: Text(label, style: AppText.label.copyWith(color: on ? Colors.white : AppColors.ink)),
                ),
              ),
            ),
          ),
        ),
      );
    }

    final (title, body) = switch (_chip) {
      ChatsChip.all => (
        'لا توجد محادثات نشطة',
        'تُفتح المحادثة بعد التوافق المتبادل وقبول طلب المحادثة. مراقبة ولمدة محدودة.',
      ),
      ChatsChip.unread => ('لا توجد رسائل غير مقروءة', null),
      ChatsChip.ended => ('لا توجد محادثات منتهية', 'تظهر هنا المحادثات التي انتهت مدتها أو أُنهيت، للقراءة فقط.'),
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('المحادثات'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
      ),
      // The last messages show here: private like the chat itself, but only while this tab is the one on screen (the
      // tab bar keeps it alive behind the others, with its tickers off)
      body: SecureArea(
        onlyWhileShown: true,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 8),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    chip(ChatsChip.all, 'chats-chip-all', 'الكل'),
                    chip(ChatsChip.unread, 'chats-chip-unread', unreadChipLabel(unreadChats)),
                    chip(ChatsChip.ended, 'chats-chip-ended', 'المنتهية'),
                  ],
                ),
              ),
            ),
            Expanded(
              // A failed background reload keeps the list she already has (audit B21)
              child: chats.hasValue
                  ? _list(items: chatsForChip(list, _chip), female: female, emptyTitle: title, emptyBody: body)
                  : chats.when(
                      loading: () => const SkeletonList(count: 4, itemHeight: 72),
                      error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(chatListProvider)),
                      data: (_) => const SizedBox.shrink(),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list({
    required List<ChatSummary> items,
    required bool female,
    required String emptyTitle,
    required String? emptyBody,
  }) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(countsProvider);
        ref.invalidate(chatListProvider);
        try {
          await ref.read(chatListProvider.future);
        } catch (e) {
          // The list she has stays (B21); say the refresh failed instead of doing nothing
          if (mounted) showSnack(context, ApiException.messageOf(e));
        }
      },
      child: items.isEmpty
          ? ListView(
              children: [
                SizedBox(
                  height: 440,
                  child: MessageView(art: LineArtKind.cupsTray, icon: Icons.forum_outlined, title: emptyTitle, body: emptyBody),
                ),
              ],
            )
          : ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 6),
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1, thickness: 0.6, indent: 84, endIndent: 16),
              itemBuilder: (context, i) => _tile(context, items[i], female),
            ),
    );
  }

  Widget _name(ChatSummary c) => Text(c.partnerName,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(fontWeight: c.unread > 0 ? FontWeight.w800 : FontWeight.w600));

  Widget _tile(BuildContext context, ChatSummary c, bool female) {
    final status = switch (c.status) {
      'ENDED' => 'منتهية',
      'EXPIRED' => 'انتهت المدة',
      _ => c.blocked ? 'للقراءة فقط' : null,
    };
    final timeLeft = status == null && c.status == 'ACTIVE' ? chatTimeLeft(c.expiresAt) : null;
    final left = timeLeft != null && timeLeft.urgent ? timeLeft : null;
    final ended = status != null;
    final tile = ListTile(
      minVerticalPadding: 12,
      contentPadding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 0),
      // The same avatar as the chat header (P2-5): the days left as a gold arc, grey once the chat is over
      leading: MemberAvatar(
        name: c.partnerName,
        size: 52,
        dimmed: ended,
        pro: c.partnerIsPro,
        timeLeft: ended || c.status != 'ACTIVE' ? null : chatTimeFraction(c.expiresAt),
      ),
      title: Row(
        children: [
          Expanded(
            // Aligned only around the badge row; a non-Pro name keeps the plain layout
            child: c.partnerIsPro
                ? Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: NameWithBadge(isPro: true, child: _name(c)),
                  )
                : _name(c),
          ),
          if (c.lastMessageAt != null)
            Text(
              formatRelative(c.lastMessageAt!),
              style: AppText.caption.copyWith(
                color: c.unread > 0 ? AppColors.navy : AppColors.muted,
                fontWeight: c.unread > 0 ? FontWeight.w700 : null),
            ),
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
                      ? (status != null
                            ? 'لا توجد رسائل'
                            : forViewer(female, 'ابدأ المحادثة بالسلام', 'ابدئي المحادثة بالسلام'))
                      : '${c.lastMine ? '${forViewer(female, 'أنت', 'أنتِ')}: ' : ''}${c.lastMessage}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.unread > 0 ? AppColors.ink : null,
                    fontWeight: c.unread > 0 ? FontWeight.w600 : null,
                  ),
                ),
              ),
              // Every ended chat carries its status label, with or without messages
              if (status != null) Pill(text: status, color: AppColors.muted),
              // The same navy as my bubbles
              if (!ended && c.unread > 0) ...[const SizedBox(width: 6), CountBadge(count: c.unread, color: AppColors.navy)],
            ],
          ),
          if (left != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                left.text,
                style: AppText.caption.copyWith(
                  color: left.urgent ? AppColors.warning : AppColors.muted,
                  fontWeight: left.urgent ? FontWeight.w700 : null),
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
    return ended ? AlphaFade(opacity: 0.7, child: tile) : tile;
  }
}
