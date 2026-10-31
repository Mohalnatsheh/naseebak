import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import 'chat_models.dart';

/// One message. Mine sit at the start side (right in Arabic) in navy, the other person's at the end side,
/// the same as the website. Messages in a row from one person sit closer ([tightTop]) and only the last shows its time
/// ([showTime]).
class ChatBubble extends StatelessWidget {
  const ChatBubble({super.key, required this.message, this.onRetry, this.showTime = true, this.tightTop = false});
  final ChatMessage message;
  final VoidCallback? onRetry;
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
              padding: const EdgeInsets.fromLTRB(14, 9, 14, 7),
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
                  Text(message.body, style: TextStyle(color: fg, fontSize: 16, height: 1.5)),
                  if (showTime) ...[
                    const SizedBox(height: 2),
                    Row(
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
                    if (onRetry != null)
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
