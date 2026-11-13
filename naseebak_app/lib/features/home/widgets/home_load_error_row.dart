import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// A failed block: one line with a retry (never a fake empty state)
class HomeLoadErrorRow extends StatelessWidget {
  const HomeLoadErrorRow({super.key, required this.text, required this.onRetry});
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.line),
      ),
      // Wraps at large text: the retry drops under the line instead of squeezing it (QA A-M05)
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          alignment: WrapAlignment.spaceBetween,
          spacing: AppSpace.sm,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.wifi_off_rounded, color: AppColors.muted),
                const SizedBox(width: AppSpace.md),
                Flexible(
                  child: Text(text, style: AppText.labelRegular.copyWith(color: AppColors.ink)),
                ),
              ],
            ),
            TextButton(onPressed: onRetry, child: const Text('إعادة المحاولة')),
          ],
        ),
      ),
    );
  }
}
