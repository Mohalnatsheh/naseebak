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

class ChatsScreen extends ConsumerWidget {
  const ChatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(chatListProvider);
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('المحادثات')),
      body: chats.when(
        loading: () => const SkeletonList(count: 4, itemHeight: 72),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(chatListProvider)),
        data: (list) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(countsProvider);
            ref.invalidate(chatListProvider);
            await ref.read(chatListProvider.future);
          },
          child: list.isEmpty
              ? ListView(children: const [
                  SizedBox(
                    height: 440,
                    child: MessageView(
                      icon: Icons.forum_outlined,
                      title: 'لا توجد محادثات',
                      body: 'تُفتح المحادثة بعد التوافق المتبادل وقبول طلب المحادثة. نصية فقط، ولمدة محدودة.',
                    ),
                  ),
                ])
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const Divider(indent: 76),
                  itemBuilder: (context, i) {
                    final c = list[i];
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
                            child: Text(c.partnerName,
                                style: TextStyle(fontWeight: c.unread > 0 ? FontWeight.w800 : FontWeight.w600)),
                          ),
                          if (c.lastMessageAt != null)
                            Text(formatRelative(c.lastMessageAt!),
                                style: const TextStyle(color: AppColors.muted, fontSize: 12)),
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
                                      ? (status ?? 'ابدأ المحادثة بالسلام')
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
                        ref.invalidate(chatListProvider);
                        ref.invalidate(countsProvider);
                      },
                    );
                  },
                ),
        ),
      ),
    );
  }
}
