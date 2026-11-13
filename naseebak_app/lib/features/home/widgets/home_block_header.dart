import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// The one heading over a home block, with an optional link at the end («عرض الكل», «الكل»), 44 px
class HomeBlockHeader extends StatelessWidget {
  const HomeBlockHeader({super.key, required this.title, this.onAll, this.allLabel = 'عرض الكل'});
  final String title;

  /// The link at the end; null for none
  final VoidCallback? onAll;
  final String allLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(start: AppSpace.xs, bottom: AppSpace.sm),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(title, style: AppText.headline.copyWith(color: AppColors.ink)),
            ),
          ),
          if (onAll != null)
            TextButton(
              onPressed: onAll,
              style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
              child: Text(allLabel),
            ),
        ],
      ),
    );
  }
}
