import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Conversation starters above the composer while I haven't written anything (the server sends them, gendered).
/// A tap puts the text in the box to edit or send; they go through the filter like any message.
class StarterChips extends StatelessWidget {
  const StarterChips({super.key, required this.starters, required this.onPick});
  final List<String> starters;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    // One row the finger can slide along: four questions would otherwise push the messages away
    return SizedBox(
      key: const Key('chat-starters'),
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        itemCount: starters.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          final s = starters[i];
          return ActionChip(
            key: Key('chat-starter-$i'),
            label: Text(s, style: AppText.labelRegular.copyWith(color: AppColors.navy)),
            avatar: const Icon(Icons.chat_bubble_outline_rounded, size: 16, color: AppColors.gold),
            backgroundColor: Colors.white,
            side: const BorderSide(color: AppColors.line),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            materialTapTargetSize: MaterialTapTargetSize.padded,
            onPressed: () => onPick(s),
          );
        },
      ),
    );
  }
}
