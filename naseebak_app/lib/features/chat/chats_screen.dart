import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import 'chat_models.dart';

class ChatsScreen extends ConsumerWidget {
  const ChatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(chatListProvider);
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
                      subtitle: Row(
                        children: [
                          Expanded(
                            child: Text(
                              c.lastMessage == null
                                  ? (status ?? 'ابدأ المحادثة بالسلام')
                                  : '${c.lastMine ? 'أنت: ' : ''}${c.lastMessage}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (status != null && c.lastMessage != null) Pill(text: status, color: AppColors.muted),
                          if (c.unread > 0) ...[const SizedBox(width: 6), CountBadge(count: c.unread)],
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
