import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/localization/arabic_count.dart';
import '../../../core/theme/app_theme.dart';
import '../../notifications/notifications_screen.dart' show openAppRoute;
import '../../profile/profile_repository.dart';
import '../counts.dart';
import '../gendered_copy.dart';

/// What «خطوتك التالية» says: one message, one button.
class NextStepMessage {
  const NextStepMessage({
    required this.title,
    this.body,
    this.ctaLabel,
    this.route,
  });
  final String title;
  final String? body;

  /// The button; null (with [route]) for no button: the quiet message while the profile isn't known
  final String? ctaLabel;
  final String? route;
}

/// The one message, by priority (spec 2026-11-14 item 2): a family request waiting › people who showed interest ›
/// new suggestions › unread chats › quiet (finish the profile, else the basic conditions). Counts missing on an older
/// server count as 0. Quiet with no [profile] (still loading, or it failed): the message alone, no button, so it
/// never sends a member with an unfinished profile to the conditions as if it were complete.
NextStepMessage nextStepFor(
  Counts c, {
  MyProfile? profile,
  bool female = false,
}) {
  String g(String m, String f) => forViewer(female, m, f);
  final liked = c.likedYou ?? 0;
  final fresh = c.newSuggestions ?? 0;

  if (c.pendingIntros > 0) {
    return NextStepMessage(
      title: c.pendingIntros == 1
          ? 'طلب تعارف بانتظار ${g('ردّك', 'ردّكِ')}'
          : '${_requests(c.pendingIntros)} بانتظار ${g('ردّك', 'ردّكِ')}',
      ctaLabel: 'افتح الطلب',
      route: c.pendingIntroMatchId != null
          ? '/matches/${c.pendingIntroMatchId}'
          : '/matches',
    );
  }
  if (liked > 0) {
    final who = arabicCount(
      liked,
      one: 'شخص أبدى اهتمامه بك',
      two: 'شخصان أبديا اهتمامهما بك',
      few: 'أشخاص أبدوا اهتمامهم بك',
      many: 'شخصاً أبدوا اهتمامهم بك',
    );
    return NextStepMessage(
      title: who,
      body: c.flags.freeInterestReply
          ? g(
              'ردّك على من أبدى اهتمامه بك مجاني.',
              'ردّكِ على من أبدى اهتمامه بكِ مجاني.',
            )
          : null,
      ctaLabel: 'شاهد من أبدى اهتمامه',
      route: '/suggestions?tab=interested',
    );
  }
  if (fresh > 0) {
    final what = arabicCount(
      fresh,
      one: 'اقتراح جديد',
      two: 'اقتراحان جديدان',
      few: 'اقتراحات جديدة',
      many: 'اقتراحاً جديداً',
    );
    return NextStepMessage(
      title: '$what بانتظار${g('ك', 'كِ')}',
      ctaLabel: 'تصفّح الاقتراحات',
      route: '/suggestions?tab=new',
    );
  }
  if (c.unreadChats > 0) {
    return NextStepMessage(
      title: 'رسائل جديدة في محادثات${g('ك', 'كِ')}',
      ctaLabel: 'افتح المحادثات',
      route: '/chats',
    );
  }
  final open = profile?.sections.where((s) => s.percentage < 100).firstOrNull;
  final unfinished =
      profile != null && (profile.completeness < 100 || open != null);
  if (unfinished) {
    return NextStepMessage(
      title: 'اقتراحات جديدة تصل${g('ك', 'كِ')} كل صباح',
      ctaLabel: g('أكمل ملفك', 'أكملي ملفكِ'),
      route: open?.route ?? '/profile/edit',
    );
  }
  final quiet = 'اقتراحات جديدة تصل${g('ك', 'كِ')} كل صباح';
  if (profile == null) return NextStepMessage(title: quiet);
  return NextStepMessage(
    title: quiet,
    ctaLabel: g('راجع شروطك الأساسية', 'راجعي شروطكِ الأساسية'),
    route: '/profile/preferences',
  );
}

String _requests(int n) => arabicCount(
  n,
  one: 'طلب تعارف',
  two: 'طلبا تعارف',
  few: 'طلبات تعارف',
  many: 'طلباً للتعارف',
);

/// The navy «خطوتك التالية» card with the three numbers under it.
class NextStepCard extends StatelessWidget {
  const NextStepCard({
    super.key,
    required this.counts,
    required this.female,
    this.profile,
  });
  final Counts counts;
  final bool female;
  final MyProfile? profile;

  @override
  Widget build(BuildContext context) {
    final step = nextStepFor(counts, profile: profile, female: female);
    return Container(
      key: const Key('next-step-card'),
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: AppColors.navy,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            forViewer(female, 'خطوتك التالية', 'خطوتكِ التالية'),
            style: AppText.caption.copyWith(color: AppColors.goldLight),
          ),
          const SizedBox(height: AppSpace.xs),
          Text(
            step.title,
            key: const Key('next-step-title'),
            style: AppText.headline.copyWith(color: Colors.white),
          ),
          if (step.body != null) ...[
            const SizedBox(height: AppSpace.xs),
            Text(
              step.body!,
              key: const Key('next-step-body'),
              style: AppText.label.copyWith(color: Colors.white70),
            ),
          ],
          if (step.route != null) ...[
            const SizedBox(height: AppSpace.md),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton(
                key: const Key('next-step-cta'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.gold,
                  foregroundColor: AppColors.navyDeep,
                  minimumSize: const Size(44, 44),
                ),
                onPressed: () =>
                    openAppRoute(GoRouter.of(context), step.route!),
                child: Text(step.ctaLabel ?? ''),
              ),
            ),
          ],
          const SizedBox(height: AppSpace.md),
          Row(
            children: [
              _Stat(
                key: const Key('next-step-stat-new'),
                value: counts.newSuggestions ?? 0,
                label: 'اقتراحات جديدة',
              ),
              _Stat(
                key: const Key('next-step-stat-liked'),
                value: counts.likedYou ?? 0,
                label: 'مهتمون بك',
              ),
              _Stat(
                key: const Key('next-step-stat-chats'),
                value: counts.unreadChats,
                label: 'محادثات',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({super.key, required this.value, required this.label});
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            '$value',
            style: AppText.title.copyWith(
              color: Colors.white,
              fontFeatures: AppText.tabular,
            ),
          ),
          Text(
            label,
            textAlign: TextAlign.center,
            style: AppText.caption.copyWith(color: Colors.white70),
          ),
        ],
      ),
    );
  }
}
