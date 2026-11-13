import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'chat_models.dart';

/// Who reacted to a message: my reaction first as «أنت», then the partner's under their name. With [canRemove] a
/// «إزالة تفاعلي» row closes the sheet with `true`; every other way out returns false.
Future<bool> showWhoReacted(
  BuildContext context, {
  required List<ChatReaction> reactions,
  required String partnerName,
  required bool canRemove,
}) async {
  final ordered = [...reactions.where((r) => r.mine), ...reactions.where((r) => !r.mine)];
  final removed = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: Column(
        key: const Key('who-reacted'),
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final r in ordered)
            ListTile(
              leading: Text(r.emoji, style: AppText.title),
              title: Text(r.mine ? 'أنت' : (partnerName.isEmpty ? 'الطرف الآخر' : partnerName), style: AppText.body),
            ),
          if (canRemove)
            ListTile(
              key: const Key('who-remove'),
              leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
              title: Text('إزالة تفاعلي', style: AppText.body.copyWith(color: AppColors.danger)),
              onTap: () => Navigator.of(sheet).pop(true),
            ),
        ],
      ),
    ),
  );
  return removed ?? false;
}
