import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../profile/profile_repository.dart';
import '../counts.dart';
import '../gendered_copy.dart';
import '../profile_strength_card.dart' show strengthSubtitle;
import 'home_block_header.dart';

/// «حسابي» on home (spec 2026-11-14 item 7): the balance (with «اشحن» only where the app shows payments), «عضوية Pro»
/// (only where the Pro row showed before; «فعّالة» once Pro) and the profile below 100%. Nothing when none applies.
class HomeTiles extends ConsumerWidget {
  const HomeTiles({super.key, required this.counts, required this.female, this.profile});
  final Counts counts;
  final bool female;

  /// `myProfileProvider` once loaded; null hides the profile tile
  final MyProfile? profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    String g(String m, String f) => forViewer(female, m, f);
    // Test and review accounts (app payments off) never see a purchase surface, whatever the server's flags say
    final payments = ref.watch(appPaymentsProvider);
    final credits = counts.credits ?? ref.watch(authControllerProvider.select((s) => s.me?.credits));
    final showPro = payments && (counts.isPro || counts.proShowPage);
    final p = profile;
    final showProfile = p != null && p.completeness < 100;

    final top = <Widget>[
      if (credits != null)
        _Tile(
          key: const Key('home-tile-credits'),
          label: g('رصيدك', 'رصيدكِ'),
          value: '$credits',
          tabular: true,
          action: payments ? g('اشحن', 'اشحني') : null,
          onTap: () => context.push('/credits'),
        ),
      if (showPro)
        _Tile(
          key: const Key('home-tile-pro'),
          label: 'عضوية Pro',
          value: counts.isPro ? 'فعّالة' : (counts.flags.chat ? 'صور وصوت في المحادثة' : 'شارة Pro على بطاقتك'),
          gold: true,
          action: counts.isPro ? null : g('اكتشف', 'اكتشفي'),
          onTap: () => context.push('/pro'),
        ),
    ];
    if (top.isEmpty && !showProfile) return const SizedBox.shrink();

    return Padding(
      key: const Key('home-tiles'),
      padding: const EdgeInsets.only(bottom: AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const HomeBlockHeader(title: 'حسابي'),
          if (top.isNotEmpty)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < top.length; i++) ...[
                    if (i > 0) const SizedBox(width: AppSpace.md),
                    Expanded(child: top[i]),
                  ],
                ],
              ),
            ),
          if (showProfile) ...[
            if (top.isNotEmpty) const SizedBox(height: AppSpace.md),
            _ProfileTile(profile: p, female: female),
          ],
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
    this.action,
    this.gold = false,
    this.tabular = false,
  });
  final String label;
  final String value;
  final String? action;
  final VoidCallback onTap;

  /// Pro: a soft gold surface
  final bool gold;
  final bool tabular;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: gold ? AppColors.goldSoft : AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: BorderSide(color: gold ? AppColors.goldSoft : AppColors.line, width: 0.5),
      ),
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 88),
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppText.caption.copyWith(color: gold ? AppColors.goldText : AppColors.muted)),
                const SizedBox(height: AppSpace.xs),
                Text(
                  value,
                  style: (tabular ? AppText.title : AppText.label).copyWith(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w800,
                    fontFeatures: tabular ? AppText.tabular : null,
                  ),
                ),
                if (action != null) ...[
                  const Spacer(),
                  const SizedBox(height: AppSpace.xs),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          action!,
                          style: AppText.label.copyWith(color: AppColors.goldText, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.goldText),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// «ملفك مكتمل N%» with a bar and the next step; opens the first unfinished section
class _ProfileTile extends StatelessWidget {
  const _ProfileTile({required this.profile, required this.female});
  final MyProfile profile;
  final bool female;

  @override
  Widget build(BuildContext context) {
    final open = profile.sections.where((s) => s.percentage < 100).firstOrNull;
    final next = open == null ? null : strengthSubtitle(open) ?? open.label;
    return Material(
      key: const Key('home-tile-profile'),
      color: AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.line, width: 0.5),
      ),
      child: InkWell(
        onTap: () async {
          final container = ProviderScope.containerOf(context, listen: false);
          await context.push(open?.route ?? '/profile/edit');
          container.invalidate(myProfileProvider);
        },
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${forViewer(female, 'ملفك', 'ملفكِ')} مكتمل ${profile.completeness}%',
                  style: AppText.label.copyWith(color: AppColors.ink),
                ),
                const SizedBox(height: AppSpace.sm),
                LinearProgressIndicator(
                  value: profile.completeness / 100,
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  color: AppColors.gold,
                  backgroundColor: AppColors.line,
                ),
                if (next != null) ...[
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: Text(next, style: AppText.caption.copyWith(color: AppColors.muted)),
                      ),
                      const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.muted),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
