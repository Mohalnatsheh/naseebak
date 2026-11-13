import 'package:flutter/material.dart';

import '../../core/localization/arabic_count.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

/// «الأحدث»: the round white button at the bottom end of the messages while scrolled up, with a navy badge for what
/// arrived meanwhile
class NewestButton extends StatelessWidget {
  const NewestButton({super.key, required this.unseen, required this.onPressed});
  final int unseen;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = unseen > 0
        ? 'الأحدث، ${arabicCount(unseen, one: 'رسالة جديدة', two: 'رسالتان جديدتان', few: 'رسائل جديدة', many: 'رسالة جديدة')}'
        : 'الأحدث';
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onPressed,
      child: SizedBox(
        width: 48,
        height: 52,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            PositionedDirectional(
              bottom: 0,
              start: 0,
              child: Material(
                key: const Key('chat-newest'),
                color: Colors.white,
                elevation: 2,
                shadowColor: AppColors.navyDeep.withValues(alpha: 0.4),
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: onPressed,
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(Icons.keyboard_arrow_down_rounded, size: 28, color: AppColors.navy),
                  ),
                ),
              ),
            ),
            if (unseen > 0)
              PositionedDirectional(
                top: 0,
                start: 0,
                end: 0,
                child: Center(child: KeyedSubtree(key: const Key('chat-newest-count'), child: CountBadge(count: unseen))),
              ),
          ],
        ),
      ),
    );
  }
}
