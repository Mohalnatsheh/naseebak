import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// The small gold «Pro» pill beside a member's name. Display only: it never depends on the Pro switch.
/// [onDark] is the variant for the navy header (solid gold, dark text).
class ProBadge extends StatelessWidget {
  const ProBadge({super.key, this.onDark = false});

  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'عضوية Pro',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1.5),
        decoration: BoxDecoration(
          color: onDark ? AppColors.gold : AppColors.gold.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(999),
          border: onDark ? null : Border.all(color: AppColors.gold.withValues(alpha: 0.6)),
        ),
        child: Text(
          'Pro',
          style: TextStyle(
            fontSize: 11,
            height: 1.3,
            fontWeight: FontWeight.w800,
            color: onDark ? AppColors.navyDeep : AppColors.goldText,
          ),
        ),
      ),
    );
  }
}

/// A name with the badge after it when [isPro].
class NameWithBadge extends StatelessWidget {
  const NameWithBadge({super.key, required this.child, required this.isPro, this.onDark = false});

  final Widget child;
  final bool isPro;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    if (!isPro) return child;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(child: child),
        const SizedBox(width: 6),
        ProBadge(onDark: onDark),
      ],
    );
  }
}
