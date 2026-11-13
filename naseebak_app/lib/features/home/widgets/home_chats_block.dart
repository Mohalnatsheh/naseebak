import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/localization/digits.dart';
import '../../../core/privacy/screen_privacy.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_kit.dart';
import '../../../shared/widgets/common.dart';
import '../../chat/chat_format.dart';
import '../../chat/chat_models.dart';
import '../../notifications/notifications_screen.dart' show openAppRoute;
import '../../pro/pro_badge.dart';
import '../counts.dart';
import '../gendered_copy.dart';
import 'home_block_header.dart';
import 'home_load_error_row.dart';

/// How many conversations «المحادثات» shows on home
const homeChatsShown = 2;

/// «المحادثات» on home (spec 2026-11-14 item 6): the latest [homeChatsShown] conversations of `chatListProvider` (the
/// server sends them most recent first), each like a row of the chats list: the same avatar (initial and the time
/// arc, never a photo), name, last line or status, time and unread count. Only while chat is on or the member has
/// chats ([show]); nothing while loading or with no chats; a failed load says so with a retry. Private like the chats
/// list (`SecureArea` while home is the tab on screen), since it shows the last messages.
class HomeChatsBlock extends ConsumerWidget {
  const HomeChatsBlock({super.key, required this.show, required this.female});

  /// `counts.flags.chat || counts.hasChats`
  final bool show;
  final bool female;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!show) return const SizedBox.shrink();
    final async = ref.watch(chatListProvider);
    if (async.hasError && !async.isLoading) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.xl),
        child: HomeLoadErrorRow(
          key: const Key('home-chats-error'),
          text: 'تعذّر تحميل المحادثات.',
          onRetry: () => ref.invalidate(chatListProvider),
        ),
      );
    }
    final chats = (async.valueOrNull ?? const <ChatSummary>[]).take(homeChatsShown).toList();
    if (chats.isEmpty) return const SizedBox.shrink();
    return Padding(
      key: const Key('home-chats'),
      padding: const EdgeInsets.only(bottom: AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          HomeBlockHeader(
            title: 'المحادثات',
            allLabel: 'الكل',
            onAll: () => openAppRoute(GoRouter.of(context), '/chats'),
          ),
          SecureArea(
            onlyWhileShown: true,
            child: Material(
              color: AppColors.surface,
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.md),
                side: const BorderSide(color: AppColors.line, width: 0.5),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < chats.length; i++) ...[
                    if (i > 0)
                      const Divider(
                        height: 0.5,
                        thickness: 0.5,
                        indent: AppSpace.lg,
                        endIndent: AppSpace.lg,
                        color: AppColors.line,
                      ),
                    HomeChatRow(chat: chats[i], female: female),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One conversation: opens the chat, then re-reads the list and the counts
class HomeChatRow extends ConsumerWidget {
  const HomeChatRow({super.key, required this.chat, required this.female});
  final ChatSummary chat;
  final bool female;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = chat;
    // The chats list's labels
    final status = switch (c.status) {
      'ENDED' => 'منتهية',
      'EXPIRED' => 'انتهت المدة',
      _ => c.blocked ? 'للقراءة فقط' : null,
    };
    final ended = status != null;
    final line = c.lastMessage != null
        ? '${c.lastMine ? '${forViewer(female, 'أنت', 'أنتِ')}: ' : ''}${c.lastMessage}'
        : status ?? forViewer(female, 'ابدأ المحادثة بالسلام', 'ابدئي المحادثة بالسلام');
    final unread = c.unread > 0;
    final name = Text(
      c.partnerName,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: AppText.label.copyWith(color: AppColors.ink, fontWeight: unread ? FontWeight.w800 : null),
    );
    return InkWell(
      key: Key('home-chat-${c.id}'),
      onTap: () async {
        final container = ProviderScope.containerOf(context, listen: false);
        await context.push('/chats/${c.id}');
        container.invalidate(chatListProvider);
        container.invalidate(countsProvider);
      },
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 64),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
          child: Row(
            children: [
              // The chats list's avatar: the initial under the veil, the days left as a gold arc, grey once over
              MemberAvatar(
                name: c.partnerName,
                size: 44,
                dimmed: ended,
                pro: c.partnerIsPro,
                timeLeft: ended || c.status != 'ACTIVE' ? null : chatTimeFraction(c.expiresAt),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    c.partnerIsPro
                        ? Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: NameWithBadge(isPro: true, child: name),
                          )
                        : name,
                    Text(
                      line,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.caption.copyWith(
                        color: unread ? AppColors.ink : AppColors.muted,
                        fontWeight: unread ? FontWeight.w600 : null,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (c.lastMessageAt != null)
                    Text(
                      formatRelative(c.lastMessageAt!),
                      style: AppText.caption.copyWith(
                        color: unread ? AppColors.navy : AppColors.muted,
                        fontWeight: unread ? FontWeight.w700 : null,
                      ),
                    ),
                  if (unread) ...[const SizedBox(height: 2), CountBadge(count: c.unread, color: AppColors.navy)],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
