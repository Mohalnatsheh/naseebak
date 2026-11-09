import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'chat_models.dart';

/// What was picked in a message's long-press menu
sealed class MessageMenuChoice {
  const MessageMenuChoice();
}

class MenuReply extends MessageMenuChoice {
  const MenuReply();
}

/// [emoji] null: my reaction removed
class MenuReact extends MessageMenuChoice {
  const MenuReact(this.emoji);
  final String? emoji;
}

class MenuCopy extends MessageMenuChoice {
  const MenuCopy();
}

class MenuReport extends MessageMenuChoice {
  const MenuReport();
}

/// Long-press on a message: «رد», the four reactions, «نسخ» (text only), «إبلاغ عن الرسالة» (the other person's).
/// No delete for everyone: what was sent stays as evidence for a report. Reply and reactions only in an open chat.
Future<MessageMenuChoice?> showMessageMenu(
  BuildContext context, {
  required ChatMessage message,
  required bool canInteract,
}) {
  final canCopy = message.kind == MessageKind.text && message.body.trim().isNotEmpty;
  final canReport = !message.mine;
  return showModalBottomSheet<MessageMenuChoice>(
    context: context,
    useSafeArea: true,
    showDragHandle: true,
    builder: (ctx) => MessageMenuSheet(
      myReaction: message.myReaction,
      canInteract: canInteract,
      canCopy: canCopy,
      canReport: canReport,
    ),
  );
}

class MessageMenuSheet extends StatelessWidget {
  const MessageMenuSheet({
    super.key,
    required this.myReaction,
    required this.canInteract,
    required this.canCopy,
    required this.canReport,
  });

  final String? myReaction;
  final bool canInteract;
  final bool canCopy;
  final bool canReport;

  @override
  Widget build(BuildContext context) {
    void pick(MessageMenuChoice c) => Navigator.of(context).pop(c);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (canInteract)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final e in chatReactionEmoji)
                    _ReactionButton(
                      emoji: e,
                      selected: e == myReaction,
                      // The same one again removes it
                      onTap: () => pick(MenuReact(e == myReaction ? null : e)),
                    ),
                ],
              ),
            ),
          if (canInteract)
            ListTile(
              key: const Key('menu-reply'),
              leading: const Icon(Icons.reply_rounded, color: AppColors.navy),
              title: const Text('رد'),
              onTap: () => pick(const MenuReply()),
            ),
          if (canCopy)
            ListTile(
              key: const Key('menu-copy'),
              leading: const Icon(Icons.copy_rounded, color: AppColors.navy),
              title: const Text('نسخ'),
              onTap: () => pick(const MenuCopy()),
            ),
          if (canReport)
            ListTile(
              key: const Key('menu-report'),
              leading: const Icon(Icons.flag_outlined, color: AppColors.danger),
              title: const Text('إبلاغ عن الرسالة', style: TextStyle(color: AppColors.danger)),
              onTap: () => pick(const MenuReport()),
            ),
        ],
      ),
    );
  }
}

class _ReactionButton extends StatelessWidget {
  const _ReactionButton({required this.emoji, required this.selected, required this.onTap});
  final String emoji;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: selected ? 'إزالة التفاعل $emoji' : 'تفاعل $emoji',
      child: Material(
        color: selected ? AppColors.gold.withValues(alpha: 0.22) : AppColors.navy.withValues(alpha: 0.05),
        shape: const CircleBorder(),
        child: InkWell(
          key: Key('menu-react-$emoji'),
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 52,
            height: 52,
            child: Center(child: Text(emoji, style: const TextStyle(fontSize: 26))),
          ),
        ),
      ),
    );
  }
}
