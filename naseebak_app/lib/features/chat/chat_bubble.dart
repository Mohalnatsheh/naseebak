import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import 'chat_format.dart';
import 'chat_models.dart';
import 'media_bubbles.dart';
import 'reply_strip.dart';

/// One message, WhatsApp-style: mine at the start side (right in Arabic) in navy, the other person's at the end side
/// in white. The first bubble of a run from one sender has a tail at its top outer corner ([tail]); the next ones in
/// the run sit 2 px apart ([tightTop]), runs 8 px apart. Every bubble carries its own time (and my ticks) inside, at
/// the end corner; a photo carries them over the picture.
///
/// Painted by one [CustomPainter] (shape + tail + border): no per-bubble clip or shadow, so long chats scroll without
/// raster jank. Photos and voice notes paint in their own [RepaintBoundary].
class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.message,
    this.onRetry,
    this.onOpenPro,
    this.onDelete,
    this.tail = true,
    this.tightTop = false,
    this.partnerName = '',
    this.onQuoteTap,
    this.onReactionTap,
    this.waveSeed,
  });
  final ChatMessage message;

  /// A voice note's waveform seed when not its id (my note keeps the look it had while sending)
  final String? waveSeed;

  /// For the quote's author line («أنت» or this name)
  final String partnerName;

  /// A tap on the quote of a reply: scrolls to the original (its id)
  final ValueChanged<String>? onQuoteTap;

  /// A tap on the reactions chip while one of them is mine: removes it (null when it can't change)
  final VoidCallback? onReactionTap;
  final VoidCallback? onRetry;

  /// Under a `PRO_REQUIRED` failure: opens «عضوية Pro» (null where the member can't buy: the message alone)
  final VoidCallback? onOpenPro;

  /// «حذف» under a failed or refused message (it was never sent: it only leaves this phone)
  final VoidCallback? onDelete;

  /// First of a run from one sender: the tail, and the larger gap above
  final bool tail;
  final bool tightTop;

  /// Room kept on the outer side of every bubble for the tail, so a run lines up
  static const tailWidth = 7.0;

  @override
  Widget build(BuildContext context) {
    final mine = message.mine;
    final failed = message.state == SendState.failed;
    final bg = mine ? (failed ? AppColors.dangerBg : AppColors.chatMine) : AppColors.chatTheirs;
    final fg = mine && !failed ? Colors.white : AppColors.ink;
    final border = failed ? AppColors.danger : (mine ? null : AppColors.line);
    final ambient = Directionality.of(context);
    // The outer side: start for mine, end for theirs, as a physical side for the painter
    final tailRight = (mine && ambient == TextDirection.rtl) || (!mine && ambient == TextDirection.ltr);
    final kind = message.kind;
    return Align(
      alignment: mine ? AlignmentDirectional.centerStart : AlignmentDirectional.centerEnd,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.80),
        child: Column(
          crossAxisAlignment: mine ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            Padding(
              padding: EdgeInsets.only(
                top: tightTop ? 2 : 8,
                left: tailRight ? 0 : tailWidth,
                right: tailRight ? tailWidth : 0,
              ),
              child: CustomPaint(
                painter: BubblePainter(color: bg, border: border, tail: tail, tailRight: tailRight),
                child: Padding(
                  padding: kind == MessageKind.image
                      ? const EdgeInsets.all(3)
                      : kind == MessageKind.voice
                          ? const EdgeInsets.fromLTRB(8, 4, 10, 5)
                          : const EdgeInsets.fromLTRB(10, 6, 10, 6),
                  child: _withQuote(
                    mine && !failed,
                    switch (kind) {
                      MessageKind.image => _photo(),
                      MessageKind.voice => _voice(fg),
                      MessageKind.text => _text(context, fg),
                    },
                  ),
                ),
              ),
            ),
            if (message.reactions.isNotEmpty) _reactions(tailRight),
            if (failed) _failedActions(),
          ],
        ),
      ),
    );
  }

  /// A reply: the quote above the content (a photo's quote keeps a little room from the picture)
  Widget _withQuote(bool onMine, Widget content) {
    final q = message.replyTo;
    if (q == null) return content;
    final quote = QuoteInBubble(
      quote: q,
      partnerName: partnerName,
      onMine: onMine,
      onTap: onQuoteTap == null ? null : () => onQuoteTap!(q.id),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        message.kind == MessageKind.image ? Padding(padding: const EdgeInsets.all(3), child: quote) : quote,
        content,
      ],
    );
  }

  /// The reactions under the bubble's inner corner: each emoji once (with 2 when both chose it); a tap removes mine
  Widget _reactions(bool tailRight) {
    final counts = <String, int>{};
    for (final r in message.reactions) {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    }
    final mine = message.myReaction;
    final label = [for (final e in counts.entries) e.value > 1 ? '${e.key} ${e.value}' : e.key].join(' ');
    return Transform.translate(
      offset: const Offset(0, -6),
      child: Padding(
        padding: EdgeInsets.only(left: tailRight ? 10 : ChatBubble.tailWidth + 10, right: tailRight ? ChatBubble.tailWidth + 10 : 10),
        child: Semantics(
          button: mine != null && onReactionTap != null,
          label: mine != null ? 'التفاعلات $label، اضغط لإزالة تفاعلك' : 'التفاعلات $label',
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: mine != null ? onReactionTap : null,
            child: ConstrainedBox(
              // The chip is small and tucked under the bubble's corner; its tap area reaches 44 × 44 below it
              constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
              child: Align(
                alignment: Alignment.topCenter,
                widthFactor: 1,
                child: DecoratedBox(
                  key: Key('chat-reactions-${message.id}'),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: mine != null ? AppColors.gold : AppColors.line),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    child: Text(label, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 14, height: 1.3)),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  TextStyle _timeStyle(Color fg) => TextStyle(color: fg.withValues(alpha: 0.72), fontSize: 11, height: 1.2);

  /// Time and (mine) the tick, always read left to right («14:05 ✓»)
  Widget _meta(Color fg, {Color? tickColor}) {
    final failed = message.state == SendState.failed;
    return Row(
      mainAxisSize: MainAxisSize.min,
      textDirection: TextDirection.ltr,
      children: [
        Text(formatTime(message.createdAt), style: _timeStyle(fg)),
        if (message.mine) ...[
          const SizedBox(width: 3),
          Icon(
            switch (message.state) {
              SendState.sending => Icons.schedule_rounded,
              SendState.failed => Icons.error_outline_rounded,
              SendState.sent => message.readAt != null ? Icons.done_all_rounded : Icons.done_rounded,
            },
            size: 14,
            // Read: gold ticks, like the chats list
            color: failed
                ? AppColors.danger
                : message.state == SendState.sent && message.readAt != null
                    ? AppColors.goldLight
                    : (tickColor ?? fg.withValues(alpha: 0.8)),
            semanticLabel: switch (message.state) {
              SendState.sending => 'جارٍ الإرسال',
              SendState.failed => 'لم تُرسل',
              SendState.sent => message.readAt != null ? 'مقروءة' : 'أُرسلت',
            },
          ),
        ],
      ],
    );
  }

  /// The text with the time at its end: beside the last line when it fits there, else under it, like the chat apps
  /// members know
  Widget _text(BuildContext context, Color fg) {
    final scaler = MediaQuery.textScalerOf(context);
    final style = DefaultTextStyle.of(context).style.merge(TextStyle(color: fg, fontSize: 16, height: 1.45));
    // Each message in its own direction (an English line, a number) within the Arabic chat; the time follows it
    final dir = messageDirection(message.body);
    final time = TextPainter(
      text: TextSpan(text: formatTime(message.createdAt), style: DefaultTextStyle.of(context).style.merge(_timeStyle(fg))),
      textDirection: TextDirection.ltr,
      textScaler: scaler,
    )..layout();
    final metaWidth = time.width + (message.mine ? 3 + 14 : 0) + 8;
    time.dispose();
    return LayoutBuilder(builder: (context, c) {
      final body = TextPainter(
        text: TextSpan(text: message.body, style: style),
        textDirection: dir,
        textScaler: scaler,
      )..layout(maxWidth: c.maxWidth);
      final lines = body.computeLineMetrics();
      final last = lines.isEmpty ? 0.0 : lines.last.width;
      final inline = last + metaWidth <= c.maxWidth;
      final width = (inline ? math.max(body.width, last + metaWidth) : math.max(body.width, metaWidth))
          .clamp(0.0, c.maxWidth)
          .toDouble();
      body.dispose();
      final text = Text(message.body, textDirection: dir, style: style);
      return Directionality(
        textDirection: dir,
        child: SizedBox(
          width: width,
          child: inline
              ? Stack(
                  children: [
                    text,
                    PositionedDirectional(bottom: 2, end: 0, child: _meta(fg)),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    text,
                    Align(alignment: AlignmentDirectional.centerEnd, child: _meta(fg)),
                  ],
                ),
        ),
      );
    });
  }

  /// The photo in its own layer, the time over its corner on a dark pill
  Widget _photo() => Stack(
        children: [
          RepaintBoundary(child: PhotoBubble(message: message)),
          PositionedDirectional(
            bottom: 6,
            end: 6,
            child: IgnorePointer(
              child: DecoratedBox(
                key: const Key('chat-photo-time'),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(10)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  child: _meta(Colors.white, tickColor: Colors.white),
                ),
              ),
            ),
          ),
        ],
      );

  Widget _voice(Color fg) => Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          RepaintBoundary(child: VoiceBubble(message: message, color: fg, waveSeed: waveSeed)),
          _meta(fg),
        ],
      );

  Widget _failedActions() => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.error != null)
              Text(message.error!, style: const TextStyle(color: AppColors.danger, fontSize: 12.5)),
            Wrap(
              spacing: 4,
              children: [
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
                if (onDelete != null)
                  TextButton.icon(
                    key: const Key('chat-failed-delete'),
                    onPressed: onDelete,
                    style: TextButton.styleFrom(foregroundColor: AppColors.muted),
                    icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    label: const Text('حذف'),
                  ),
              ],
            ),
          ],
        ),
      );
}

/// A bubble's shape in one path: rounded corners and, on the first of a run, a small tail at the top outer corner.
class BubblePainter extends CustomPainter {
  const BubblePainter({required this.color, this.border, required this.tail, required this.tailRight});
  final Color color;
  final Color? border;
  final bool tail;
  final bool tailRight;

  static const radius = 12.0;

  Path shape(Size size) {
    final w = size.width, h = size.height;
    if (!tail) {
      return Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(radius)));
    }
    // Drawn with the tail on the right, mirrored (x → w − x, arcs turning the other way) for the left
    const t = ChatBubble.tailWidth;
    final r = radius.clamp(0.0, h / 2).toDouble();
    double x(double v) => tailRight ? v : w - v;
    final cw = tailRight;
    return Path()
      ..moveTo(x(r), 0)
      ..lineTo(x(w + t - 1.5), 0)
      ..quadraticBezierTo(x(w + t), 0, x(w + t - 1), 1.5)
      ..lineTo(x(w), 11.0.clamp(0.0, h - r))
      ..lineTo(x(w), h - r)
      ..arcToPoint(Offset(x(w - r), h), radius: Radius.circular(r), clockwise: cw)
      ..lineTo(x(r), h)
      ..arcToPoint(Offset(x(0), h - r), radius: Radius.circular(r), clockwise: cw)
      ..lineTo(x(0), r)
      ..arcToPoint(Offset(x(r), 0), radius: Radius.circular(r), clockwise: cw)
      ..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final path = shape(size);
    canvas.drawPath(path, Paint()..color = color);
    final b = border;
    if (b != null) {
      canvas.drawPath(
        path,
        Paint()
          ..color = b
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8,
      );
    }
  }

  @override
  bool shouldRepaint(BubblePainter old) =>
      old.color != color || old.border != border || old.tail != tail || old.tailRight != tailRight;
}
