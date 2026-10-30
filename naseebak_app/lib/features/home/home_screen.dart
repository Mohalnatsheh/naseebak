import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import 'counts.dart';
import 'poll_card.dart';
import 'profile_strength_card.dart';

/// One suggested next step, from the counts.
class NextStep {
  const NextStep(this.title, this.body, this.action, this.route, this.icon);
  final String title;
  final String body;
  final String action;
  final String route;
  final IconData icon;
}

NextStep nextStepFor(Counts? c) {
  if (c != null && c.pendingIntros > 0) {
    return NextStep(
      'طلب تعارف بانتظار ردك',
      'لديك ${c.pendingIntros == 1 ? 'طلب' : '${c.pendingIntros} طلبات'} على توافقاتك.',
      'عرض الطلب',
      c.pendingIntroMatchId != null ? '/matches/${c.pendingIntroMatchId}' : '/matches',
      Icons.family_restroom_rounded,
    );
  }
  if (c != null && (c.likedYou ?? 0) > 0) {
    return const NextStep('أبدى أحدهم اهتمامه بك', 'إذا أبديت اهتمامك أيضاً يتم التوافق فوراً.', 'عرض الاهتمامات',
        '/suggestions?tab=interested', Icons.favorite_rounded);
  }
  if (c != null && c.unreadChats > 0) {
    return NextStep('رسائل جديدة', 'لديك ${c.unreadChats} رسائل غير مقروءة.', 'فتح المحادثات', '/chats',
        Icons.chat_bubble_rounded);
  }
  if (c != null && c.actionableMatches > 0) {
    return const NextStep('خطوتك التالية مع توافقك', 'اختر طريقة التعارف: عائلياً أو بمحادثة قصيرة.', 'عرض التوافقات',
        '/matches', Icons.handshake_rounded);
  }
  return const NextStep('اقتراحاتك بانتظارك', 'اقتراحات مختارة بعناية تناسب ما تبحث عنه. القرار لك، بستر واحترام.',
      'تصفح الاقتراحات', '/suggestions', Icons.auto_awesome_rounded);
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(countsProvider);
    ref.invalidate(unreadNotificationsProvider);
    ref.invalidate(currentPollProvider);
    await ref.read(authControllerProvider.notifier).refreshMe();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    final counts = ref.watch(countsProvider);
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final c = counts.valueOrNull;
    final step = nextStepFor(c);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              color: AppColors.navy,
              padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 12, 12, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const BrandLogo(height: 30, onDark: true),
                      const Spacer(),
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          IconButton(
                            key: const Key('open-notifications'),
                            tooltip: 'الإشعارات',
                            onPressed: () async {
                              await context.push('/notifications');
                              ref.invalidate(unreadNotificationsProvider);
                            },
                            icon: const Icon(Icons.notifications_none_rounded, color: Colors.white),
                          ),
                          if (unread > 0) PositionedDirectional(top: 4, end: 2, child: CountBadge(count: unread)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'أهلاً ${me?.firstName ?? ''}',
                    style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(step.icon, color: AppColors.goldLight),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(step.title,
                                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(step.body, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), height: 1.6)),
                        const SizedBox(height: 12),
                        FilledButton(
                          key: const Key('next-step'),
                          style: FilledButton.styleFrom(backgroundColor: AppColors.gold, minimumSize: const Size(160, 48)),
                          onPressed: () => context.go(step.route),
                          child: Text(step.action),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (counts.hasError && c == null) ...[
                    InfoBanner(
                      text: 'تعذّر تحميل آخر المستجدات.',
                      tone: BannerTone.danger,
                      action: TextButton(onPressed: () => ref.invalidate(countsProvider), child: const Text('إعادة المحاولة')),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Row(
                    children: [
                      Expanded(
                        child: _StatTile(
                          key: const Key('credits-tile'),
                          icon: Icons.account_balance_wallet_outlined,
                          label: 'رصيدك',
                          value: '${c?.credits ?? me?.credits ?? 0}',
                          onTap: () => context.push('/credits'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _StatTile(
                          icon: Icons.chat_bubble_outline_rounded,
                          label: 'رسائل غير مقروءة',
                          value: counts.isLoading && c == null ? '…' : '${c?.unreadChats ?? 0}',
                          onTap: () => context.go('/chats'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const SectionTitle('الاقتراحات'),
                  _EntryTile(
                    icon: Icons.auto_awesome_outlined,
                    title: 'اقتراحات جديدة',
                    count: c?.newSuggestions ?? 0,
                    onTap: () => context.go('/suggestions?tab=new'),
                  ),
                  _EntryTile(
                    icon: Icons.favorite_border_rounded,
                    title: 'مهتمون بك',
                    count: c?.likedYou ?? 0,
                    onTap: () => context.go('/suggestions?tab=interested'),
                  ),
                  _EntryTile(
                    icon: Icons.hourglass_top_rounded,
                    title: 'بانتظار الطرف الآخر',
                    onTap: () => context.go('/suggestions?tab=waiting'),
                  ),
                  const SizedBox(height: 12),
                  const SectionTitle('التعارف'),
                  _EntryTile(
                    icon: Icons.handshake_outlined,
                    title: 'التوافقات',
                    count: (c?.pendingIntros ?? 0) + (c?.actionableMatches ?? 0),
                    onTap: () => context.go('/matches'),
                  ),
                  _EntryTile(
                    icon: Icons.forum_outlined,
                    title: 'المحادثات',
                    count: c?.unreadChats ?? 0,
                    onTap: () => context.go('/chats'),
                  ),
                  _EntryTile(
                    icon: Icons.notifications_none_rounded,
                    title: 'الإشعارات',
                    count: unread,
                    onTap: () => context.push('/notifications'),
                  ),
                  const SizedBox(height: 16),
                  const ProfileStrengthCard(),
                  if (me?.country.pollsEnabled ?? true) ...[
                    const SizedBox(height: 16),
                    const PollCard(),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({super.key, required this.icon, required this.label, required this.value, required this.onTap});
  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: AppColors.gold),
              const SizedBox(height: 8),
              Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.navy)),
              Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({required this.icon, required this.title, required this.onTap, this.count = 0});
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: ListTile(
          minVerticalPadding: 12,
          leading: Icon(icon, color: AppColors.navy),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [CountBadge(count: count), const SizedBox(width: 6), const Icon(Icons.chevron_right, color: AppColors.muted)],
          ),
          onTap: onTap,
        ),
      ),
    );
  }
}
