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

/// «حذف لديّ» (Pro; in upsell mode it opens `/pro` instead)
class MenuDeleteForMe extends MessageMenuChoice {
  const MenuDeleteForMe();
}

/// «حذف لدى الجميع» (Pro, my own message, open chat; in upsell mode it opens `/pro` instead)
class MenuDeleteForEveryone extends MessageMenuChoice {
  const MenuDeleteForEveryone();
}

/// What the long-press menu offers on [message]
({bool canInteract, bool canCopy, bool canReport, bool deleteForMe, bool deleteForEveryone}) messageMenuEntries(
  ChatMessage message, {
  required bool canInteract,
  required DeleteMode deleteMode,
  required bool open,
}) {
  final trace = message.deleted;
  final deletes = deleteMode != DeleteMode.hidden;
  return (
    // A trace: no reply, reactions or copy (it can still be reported and hidden for me)
    canInteract: canInteract && !trace,
    canCopy: !trace && message.kind == MessageKind.text && message.body.trim().isNotEmpty,
    canReport: !message.mine,
    deleteForMe: deletes,
    // My own messages only, and only while the chat can send
    deleteForEveryone: deletes && message.mine && !trace && open,
  );
}

/// Long-press on a message: «رد», the four reactions, «نسخ» (text only), «إبلاغ عن الرسالة» (the other person's), and
/// with Pro chat delete «حذف لديّ» / «حذف لدى الجميع» (my own). A message deleted for everyone stays reportable on the
/// server. Reply and reactions only in an open chat. Returns null without a sheet when there is nothing to offer.
Future<MessageMenuChoice?> showMessageMenu(
  BuildContext context, {
  required ChatMessage message,
  required bool canInteract,
  DeleteMode deleteMode = DeleteMode.hidden,
  bool open = false,
}) async {
  final e = messageMenuEntries(message, canInteract: canInteract, deleteMode: deleteMode, open: open);
  if (!e.canInteract && !e.canCopy && !e.canReport && !e.deleteForMe) return null;
  return showModalBottomSheet<MessageMenuChoice>(
    context: context,
    useSafeArea: true,
    showDragHandle: true,
    // Up to six rows with Pro's delete entries: as tall as it needs, and scrolls on a small screen
    isScrollControlled: true,
    builder: (ctx) => MessageMenuSheet(
      myReaction: message.myReaction,
      canInteract: e.canInteract,
      canCopy: e.canCopy,
      canReport: e.canReport,
      deleteForMe: e.deleteForMe,
      deleteForEveryone: e.deleteForEveryone,
      locked: deleteMode == DeleteMode.upsell,
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
    this.deleteForMe = false,
    this.deleteForEveryone = false,
    this.locked = false,
  });

  final String? myReaction;
  final bool canInteract;
  final bool canCopy;
  final bool canReport;
  final bool deleteForMe;
  final bool deleteForEveryone;

  /// Not Pro (upsell): the delete entries carry a small gold lock and open «عضوية Pro»
  final bool locked;

  @override
  Widget build(BuildContext context) {
    void pick(MessageMenuChoice c) => Navigator.of(context).pop(c);
    return SingleChildScrollView(
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
          if (deleteForMe)
            ListTile(
              key: const Key('menu-delete-me'),
              leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
              title: const Text('حذف لديّ', style: TextStyle(color: AppColors.danger)),
              trailing: locked ? const _ProLock() : null,
              onTap: () => pick(const MenuDeleteForMe()),
            ),
          if (deleteForEveryone)
            ListTile(
              key: const Key('menu-delete-everyone'),
              leading: const Icon(Icons.delete_forever_outlined, color: AppColors.danger),
              title: const Text('حذف لدى الجميع', style: TextStyle(color: AppColors.danger)),
              trailing: locked ? const _ProLock() : null,
              onTap: () => pick(const MenuDeleteForEveryone()),
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
            child: Center(child: Text(emoji, style: AppText.title)),
          ),
        ),
      ),
    );
  }
}

/// The small gold lock on a Pro entry for a member who isn't Pro (the same mark as the greyed media buttons)
class _ProLock extends StatelessWidget {
  const _ProLock();

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'مع Pro',
        child: Container(
          key: const Key('menu-delete-locked'),
          width: 20,
          height: 20,
          decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle),
          child: const Icon(Icons.lock_rounded, size: 12, color: Colors.white),
        ),
      );
}

/// «مسح المحادثة»: which one. «مسح لدى الجميع» only while the chat can send. Null when dismissed.
Future<bool?> showClearChatSheet(BuildContext context, {required bool canEveryone}) {
  return showModalBottomSheet<bool>(
    context: context,
    useRootNavigator: true,
    useSafeArea: true,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('مسح المحادثة', style: AppText.headline),
          const SizedBox(height: 6),
          Text(
            canEveryone ? 'يمكنك مسح الرسائل من عندك فقط، أو لديك ولدى الطرف الآخر.' : 'يمكنك مسح الرسائل من عندك فقط.',
            style: AppText.body.copyWith(color: AppColors.muted),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            key: const Key('clear-me'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('مسح لديّ'),
          ),
          if (canEveryone) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              key: const Key('clear-everyone'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('مسح لدى الجميع'),
            ),
          ],
          const SizedBox(height: 4),
          TextButton(
            style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: AppColors.muted),
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('تراجع'),
          ),
        ],
      ),
    ),
  );
}

/// The confirm texts (exact copy, same as the website)
const deleteForEveryoneConfirm = 'ستُحذف الرسالة لديك ولدى الطرف الآخر، ويظهر مكانها «تم حذف الرسالة».';
const clearForMeConfirm = 'ستُمسح الرسائل من عندك فقط، ويبقى كل شيء لدى الطرف الآخر.';
const clearForEveryoneConfirm =
    'ستُمسح كل رسائل هذه المحادثة لديك ولدى الطرف الآخر. تبقى المحادثة مفتوحة ويمكنكما متابعة الكتابة.';

/// A destructive step said before anything is sent: true on [confirmLabel]
Future<bool> confirmDeleteSheet(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    useRootNavigator: true,
    useSafeArea: true,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: AppText.headline),
          const SizedBox(height: 8),
          Text(body, style: AppText.body.copyWith(color: AppColors.ink, height: 1.6)),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('delete-confirm'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger, minimumSize: const Size.fromHeight(48)),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(confirmLabel),
          ),
          const SizedBox(height: 4),
          TextButton(
            style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: AppColors.muted),
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('تراجع'),
          ),
        ],
      ),
    ),
  );
  return ok ?? false;
}
