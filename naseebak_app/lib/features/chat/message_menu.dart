import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'chat_models.dart';

/// What can be done with [message] once selected
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

typedef SelectionTools = ({bool react, bool reply, bool copy, bool delete, bool report});

/// What the selection bar offers on [m]: nothing until it is sent; reply and reactions only in an open chat (never on
/// a trace), copy for text, delete with Pro chat delete (or its upsell), report for the other person's message
SelectionTools selectionToolsFor(
  ChatMessage m, {
  required bool canInteract,
  required DeleteMode deleteMode,
  required bool open,
}) {
  if (m.state != SendState.sent) return (react: false, reply: false, copy: false, delete: false, report: false);
  final e = messageMenuEntries(m, canInteract: canInteract, deleteMode: deleteMode, open: open);
  return (react: e.canInteract, reply: e.canInteract, copy: e.canCopy, delete: e.deleteForMe, report: e.canReport);
}

/// The selected message as it is now (the room keeps only its id): null when the id is gone, the message isn't sent,
/// or nothing is left to do with it (e.g. my message deleted for everyone without Pro's delete)
ChatMessage? selectedMessageOf(
  List<ChatMessage> messages,
  String? id, {
  required bool canInteract,
  required DeleteMode deleteMode,
  required bool open,
}) {
  if (id == null) return null;
  final i = messages.indexWhere((m) => m.id == id);
  if (i < 0) return null;
  final m = messages[i];
  if (m.state != SendState.sent) return null;
  final t = selectionToolsFor(m, canInteract: canInteract, deleteMode: deleteMode, open: open);
  return t.react || t.reply || t.copy || t.delete || t.report ? m : null;
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
