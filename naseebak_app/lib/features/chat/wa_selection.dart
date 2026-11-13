import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'chat_models.dart';
import 'message_menu.dart';

/// The top bar while one message is selected (Android WhatsApp): ✕ «إلغاء التحديد», «1», then reply, copy, delete and
/// ⋮ → «إبلاغ عن الرسالة», each only where [tools] allows it. The room ends the selection on every action.
class ChatSelectionBar extends StatelessWidget implements PreferredSizeWidget {
  const ChatSelectionBar({
    super.key,
    required this.tools,
    required this.deleteLocked,
    required this.onClose,
    required this.onReply,
    required this.onCopy,
    required this.onDelete,
    required this.onReport,
    this.textScale = 1,
  });

  final SelectionTools tools;

  /// Not Pro (upsell): «حذف» carries the small gold lock and opens «عضوية Pro»
  final bool deleteLocked;
  final VoidCallback onClose;
  final VoidCallback onReply;
  final VoidCallback onCopy;
  final VoidCallback onDelete;
  final VoidCallback onReport;

  /// The same height as the chat header it replaces (it grows with larger system text)
  final double textScale;

  @override
  Size get preferredSize => Size.fromHeight(kToolbarHeight * (textScale < 1 ? 1 : textScale));

  @override
  Widget build(BuildContext context) {
    const iconStyle = ButtonStyle(minimumSize: WidgetStatePropertyAll(Size(44, 44)));
    return AppBar(
      key: const Key('chat-selection-bar'),
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      iconTheme: const IconThemeData(color: Colors.white),
      actionsIconTheme: const IconThemeData(color: Colors.white),
      toolbarHeight: preferredSize.height,
      automaticallyImplyLeading: false,
      leading: IconButton(
        key: const Key('selection-close'),
        tooltip: 'إلغاء التحديد',
        style: iconStyle,
        onPressed: onClose,
        icon: const Icon(Icons.close_rounded),
      ),
      titleSpacing: 0,
      title: Text(
        '1',
        style: AppText.title.copyWith(color: Colors.white, fontFeatures: AppText.tabular),
      ),
      actions: [
        if (tools.reply)
          IconButton(
            key: const Key('menu-reply'),
            tooltip: 'رد',
            style: iconStyle,
            onPressed: onReply,
            icon: const Icon(Icons.reply_rounded),
          ),
        if (tools.copy)
          IconButton(
            key: const Key('menu-copy'),
            tooltip: 'نسخ',
            style: iconStyle,
            onPressed: onCopy,
            icon: const Icon(Icons.copy_rounded),
          ),
        if (tools.delete)
          IconButton(
            key: const Key('menu-delete'),
            tooltip: deleteLocked ? 'حذف (مع Pro)' : 'حذف',
            style: iconStyle,
            onPressed: onDelete,
            icon: deleteLocked
                ? const Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Icon(Icons.delete_outline_rounded),
                      PositionedDirectional(bottom: -4, end: -6, child: _ProLock()),
                    ],
                  )
                : const Icon(Icons.delete_outline_rounded),
          ),
        if (tools.report)
          PopupMenuButton<int>(
            key: const Key('selection-more'),
            tooltip: 'خيارات أخرى',
            icon: const Icon(Icons.more_vert_rounded),
            style: iconStyle,
            onSelected: (_) => onReport(),
            itemBuilder: (_) => [
              PopupMenuItem<int>(
                key: const Key('menu-report'),
                value: 0,
                height: 48,
                child: Row(
                  children: [
                    const Icon(Icons.flag_outlined, color: AppColors.danger, size: 20),
                    const SizedBox(width: 10),
                    Flexible(child: Text('إبلاغ عن الرسالة', style: AppText.body.copyWith(color: AppColors.danger))),
                  ],
                ),
              ),
            ],
          ),
        const SizedBox(width: 4),
      ],
    );
  }
}

/// The small gold lock on a Pro entry for a member who isn't Pro (the same mark as the greyed media buttons)
class _ProLock extends StatelessWidget {
  const _ProLock();

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('menu-delete-locked'),
    width: 16,
    height: 16,
    decoration: BoxDecoration(
      color: AppColors.gold,
      shape: BoxShape.circle,
      border: Border.all(color: AppColors.navy, width: 1.5),
    ),
    child: const Icon(Icons.lock_rounded, size: 9, color: Colors.white),
  );
}

/// The white pill of the four reactions above the selected bubble; mine is ringed and tapping it again gives null
class ReactionPicker extends StatelessWidget {
  const ReactionPicker({super.key, required this.mine, required this.onPick});
  final String? mine;
  final ValueChanged<String?> onPick;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('reaction-picker'),
      color: Colors.white,
      elevation: 3,
      shadowColor: AppColors.navy.withValues(alpha: 0.35),
      shape: const StadiumBorder(side: BorderSide(color: AppColors.line)),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final e in chatReactionEmoji)
              _PickerEmoji(emoji: e, selected: e == mine, onTap: () => onPick(e == mine ? null : e)),
          ],
        ),
      ),
    );
  }
}

class _PickerEmoji extends StatelessWidget {
  const _PickerEmoji({required this.emoji, required this.selected, required this.onTap});
  final String emoji;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: selected ? 'إزالة التفاعل $emoji' : 'تفاعل $emoji',
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        key: Key('menu-react-$emoji'),
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: selected
              ? BoxDecoration(
                  color: AppColors.navy.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.navy.withValues(alpha: 0.40), width: 2),
                )
              : null,
          child: Text(emoji, style: AppText.headline),
        ),
      ),
    );
  }
}

/// «حذف الرسالة؟»: true for «حذف لدى الجميع» (only with [canEveryone]), false for «حذف لديّ», null for «إلغاء»
Future<bool?> showDeleteChoice(BuildContext context, {required bool canEveryone}) {
  ButtonStyle danger() => TextButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size(44, 44));
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('حذف الرسالة؟'),
      actionsOverflowDirection: VerticalDirection.down,
      actions: [
        if (canEveryone)
          TextButton(
            key: const Key('menu-delete-everyone'),
            style: danger(),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('حذف لدى الجميع'),
          ),
        TextButton(
          key: const Key('menu-delete-me'),
          style: danger(),
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('حذف لديّ'),
        ),
        TextButton(
          style: TextButton.styleFrom(foregroundColor: AppColors.muted, minimumSize: const Size(44, 44)),
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('إلغاء'),
        ),
      ],
    ),
  );
}

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
