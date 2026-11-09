import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import 'chat_models.dart';
import 'media_bubbles.dart';

/// One message. Mine sit at the start side (right in Arabic) in navy, the other person's at the end side,
/// the same as the website. Messages in a row from one person sit closer ([tightTop]) and only the last shows its time
/// ([showTime]).
class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.message,
    this.onRetry,
    this.onOpenPro,
    this.showTime = true,
    this.tightTop = false,
  });
  final ChatMessage message;
  final VoidCallback? onRetry;

  /// Under a `PRO_REQUIRED` failure: opens «عضوية Pro» (null where the member can't buy: the message alone)
  final VoidCallback? onOpenPro;
  final bool showTime;
  final bool tightTop;

  @override
  Widget build(BuildContext context) {
    final mine = message.mine;
    final failed = message.state == SendState.failed;
    final bg = mine ? (failed ? AppColors.dangerBg : AppColors.navy) : const Color(0xFFE9EEF4);
    final fg = mine && !failed ? Colors.white : AppColors.ink;
    return Align(
      alignment: mine ? AlignmentDirectional.centerStart : AlignmentDirectional.centerEnd,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Column(
          crossAxisAlignment: mine ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            Container(
              margin: EdgeInsets.only(top: tightTop ? 2 : 6),
              padding: message.kind == MessageKind.image
                  ? const EdgeInsets.fromLTRB(4, 4, 4, 5)
                  : const EdgeInsets.fromLTRB(14, 9, 14, 7),
              decoration: BoxDecoration(
                color: bg,
                border: failed ? Border.all(color: AppColors.danger) : null,
                borderRadius: BorderRadiusDirectional.only(
                  topStart: const Radius.circular(18),
                  topEnd: const Radius.circular(18),
                  // The tail only under the last of a group
                  bottomStart: Radius.circular(mine && showTime ? 4 : 18),
                  bottomEnd: Radius.circular(!mine && showTime ? 4 : 18),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Media never shows `body` (the fallback text for apps before 1.1.0)
                  switch (message.kind) {
                    MessageKind.image => PhotoBubble(message: message),
                    MessageKind.voice => VoiceBubble(message: message, color: fg),
                    MessageKind.text => Text(message.body, style: TextStyle(color: fg, fontSize: 16, height: 1.5)),
                  },
                  if (showTime) ...[
                    const SizedBox(height: 2),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: message.kind == MessageKind.image ? 6 : 0),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            formatTime(message.createdAt),
                            style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 11),
                          ),
                          if (mine) ...[
                            const SizedBox(width: 4),
                            Icon(
                              switch (message.state) {
                                SendState.sending => Icons.schedule_rounded,
                                SendState.failed => Icons.error_outline_rounded,
                                SendState.sent => message.readAt != null ? Icons.done_all_rounded : Icons.done_rounded,
                              },
                              size: 14,
                              color: failed ? AppColors.danger : fg.withValues(alpha: 0.8),
                              semanticLabel: switch (message.state) {
                                SendState.sending => 'جارٍ الإرسال',
                                SendState.failed => 'لم تُرسل',
                                SendState.sent => message.readAt != null ? 'مقروءة' : 'أُرسلت',
                              },
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (failed)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (message.error != null)
                      Text(message.error!, style: const TextStyle(color: AppColors.danger, fontSize: 12.5)),
                    if (message.proRequired) ...[
                      if (onOpenPro != null)
                        TextButton.icon(
                          key: const Key('chat-failed-pro'),
                          onPressed: onOpenPro,
                          icon: const Icon(Icons.workspace_premium_rounded, size: 18),
                          label: const Text('عضوية Pro'),
                        ),
                    ] else if (onRetry != null)
                      TextButton.icon(
                        onPressed: onRetry,
                        icon: Icon(message.filtered ? Icons.edit_outlined : Icons.refresh_rounded, size: 18),
                        label: Text(message.filtered ? 'تعديل الرسالة' : 'إعادة الإرسال'),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
