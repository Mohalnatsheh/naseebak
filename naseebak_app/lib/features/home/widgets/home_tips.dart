import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../profile/profile_repository.dart';
import '../gendered_copy.dart';
import 'home_block_header.dart';

/// One tip: what to do, why, and where it opens
class HomeTip {
  const HomeTip({required this.id, required this.title, required this.body, required this.route});
  final String id;
  final String title;
  final String body;
  final String route;
}

/// The quiet member's tips (spec 2026-11-14, «نصائح لك»), at most 2: add «نبذة» when the loaded profile has none, then
/// review the basic conditions. Without a loaded profile only the conditions tip (never a guess about «نبذة»).
List<HomeTip> homeTipsFor({MyProfile? profile, required bool female}) {
  String g(String m, String f) => forViewer(female, m, f);
  final about = profile?.field('aboutMe');
  final noAbout = profile != null && (about is! String || about.trim().isEmpty);
  return [
    if (noAbout)
      HomeTip(
        id: 'about',
        title: g('أضف نبذة عنك', 'أضيفي نبذة عنكِ'),
        body: 'الملفات التي فيها نبذة تحصل على اهتمام أكثر',
        route: '/profile/edit',
      ),
    HomeTip(
      id: 'conditions',
      title: g('راجع شروطك الأساسية', 'راجعي شروطكِ الأساسية'),
      body: 'شروط أقل تعني اقتراحات أكثر',
      route: '/profile/preferences',
    ),
  ];
}

/// «نصائح لك»: shown only to a quiet member (nothing waiting, no suggestions, nobody interested, no chats)
class HomeTips extends StatelessWidget {
  const HomeTips({super.key, required this.female, this.profile});
  final bool female;
  final MyProfile? profile;

  @override
  Widget build(BuildContext context) {
    final tips = homeTipsFor(profile: profile, female: female);
    return Padding(
      key: const Key('home-tips'),
      padding: const EdgeInsets.only(bottom: AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          HomeBlockHeader(title: forViewer(female, 'نصائح لك', 'نصائح لكِ')),
          for (var i = 0; i < tips.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpace.sm),
            _TipRow(tip: tips[i]),
          ],
        ],
      ),
    );
  }
}

class _TipRow extends StatelessWidget {
  const _TipRow({required this.tip});
  final HomeTip tip;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: Key('home-tip-${tip.id}'),
      color: AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.line, width: 0.5),
      ),
      child: InkWell(
        onTap: () async {
          final container = ProviderScope.containerOf(context, listen: false);
          await context.push(tip.route);
          container.invalidate(myProfileProvider);
        },
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.goldSoft,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: const Icon(Icons.lightbulb_outline_rounded, size: 18, color: AppColors.goldText),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tip.title, style: AppText.label.copyWith(color: AppColors.ink)),
                      Text(tip.body, style: AppText.caption.copyWith(color: AppColors.muted)),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpace.xs),
                const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
