import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import 'chat_format.dart';
import 'chat_models.dart';
import 'media_bubbles.dart';
import 'reply_strip.dart';

/// One message, WhatsApp-style: mine at the end side (left in Arabic) in pale navy with ink text, the other person's at the start
/// side in white. The first bubble of a run from one sender has a tail at its top outer corner ([tail]); the next ones in
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
    this.onReactionsTap,
    this.onFamily,
    this.waveSeed,
  });
  final ChatMessage message;

  /// A voice note's waveform seed when not its id (my note keeps the look it had while sending)
  final String? waveSeed;

  /// For the quote's author line («أنت» or this name)
  final String partnerName;

  /// A tap on the quote of a reply: scrolls to the original (its id)
  final ValueChanged<String>? onQuoteTap;

  /// A tap on the reactions pill: who reacted (the room's sheet, with «إزالة تفاعلي» when one is mine)
  final VoidCallback? onReactionsTap;

  /// «تعارف عائلي» under the refusal note of a filtered message (null: the note alone)
  final VoidCallback? onFamily;
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
    final fg = AppColors.ink;
    final border = failed ? AppColors.danger : (mine ? null : AppColors.line);
    final ambient = Directionality.of(context);
    // The outer side: end for mine, start for theirs, as a physical side for the painter
    final tailRight = (!mine && ambient == TextDirection.rtl) || (mine && ambient == TextDirection.ltr);
    final kind = message.kind;
    return Align(
      alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.80),
        child: Column(
          crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.only(
                top: tightTop ? 2 : 8,
                left: tailRight ? 0 : tailWidth,
                right: tailRight ? tailWidth : 0,
              ),
              child: _withFailedInfo(
                context,
                CustomPaint(
                painter: BubblePainter(color: bg, border: border, tail: tail, tailRight: tailRight),
                child: Padding(
                  padding: kind == MessageKind.image && !message.deleted
                      ? const EdgeInsets.all(3)
                      : kind == MessageKind.voice && !message.deleted
                          ? const EdgeInsets.fromLTRB(8, 4, 10, 5)
                          : const EdgeInsets.fromLTRB(10, 6, 10, 6),
                  // A trace shows no quote and no media, even from a stale copy
                  child: message.deleted
                      ? _trace(fg)
                      : _withQuote(
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
            ),
            // A trace never shows reactions
            if (message.reactions.isNotEmpty && !message.deleted) _reactions(tailRight),
            if (failed) _failedActions(),
          ],
        ),
      ),
    );
  }

  /// Deleted for everyone: «تم حذف الرسالة» in muted italics with a small «no» sign, and the time
  Widget _trace(Color fg) {
    final ink = fg.withValues(alpha: 0.75);
    return Row(
      key: const Key('chat-deleted-trace'),
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.block_rounded, size: 16, color: ink),
        const SizedBox(width: 6),
        Flexible(
          child: Text(deletedTrace, style: AppText.body.copyWith(color: ink, fontStyle: FontStyle.italic, height: 1.45)),
        ),
        const SizedBox(width: 8),
        Padding(padding: const EdgeInsets.only(top: 4), child: _meta(fg)),
      ],
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
          button: onReactionsTap != null,
          label: 'التفاعلات $label، لمعرفة من تفاعل',
          onTap: onReactionsTap,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onReactionsTap,
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
                    child: Text(label, textDirection: TextDirection.ltr, style: AppText.labelRegular.copyWith(height: 1.3)),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  TextStyle _timeStyle(Color fg) => AppText.caption.copyWith(color: fg.withValues(alpha: 0.72), height: 1.2);

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
            // Read: navy ✓✓; sent or unread: muted ✓ (white over a photo)
            color: failed
                ? AppColors.danger
                : tickColor ??
                    (message.state == SendState.sent && message.readAt != null ? AppColors.navy : AppColors.muted),
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
    final style = DefaultTextStyle.of(context).style.merge(AppText.body.copyWith(color: fg, height: 1.45));
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

  /// The red ⓘ beside a failed bubble, on its inward side (before it in reading order for mine): «إعادة المحاولة» (or
  /// «تعديل الرسالة» for a refused text) and «حذف» are in its sheet
  Widget _withFailedInfo(BuildContext context, Widget bubble) {
    if (message.state != SendState.failed || (onRetry == null && onDelete == null)) return bubble;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        IconButton(
          key: const Key('chat-failed-info'),
          tooltip: 'لم تُرسل',
          onPressed: () => _openFailedSheet(context),
          icon: const Icon(Icons.info_outline_rounded, color: AppColors.danger),
        ),
        Flexible(child: bubble),
      ],
    );
  }

  void _openFailedSheet(BuildContext context) {
    final retry = message.proRequired ? null : onRetry;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (retry != null)
              ListTile(
                key: const Key('failed-retry'),
                leading: Icon(message.filtered ? Icons.edit_outlined : Icons.refresh_rounded),
                title: Text(message.filtered ? 'تعديل الرسالة' : 'إعادة المحاولة'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  retry();
                },
              ),
            if (onDelete != null)
              ListTile(
                key: const Key('chat-failed-delete'),
                leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                title: Text('حذف', style: AppText.body.copyWith(color: AppColors.danger)),
                onTap: () {
                  Navigator.of(sheet).pop();
                  onDelete!();
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _failedActions() {
    final error = message.error;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (error != null && message.filtered && !message.proRequired && !message.tooLong)
            _refusalNote(error)
          else if (error != null)
            Text(error, style: AppText.caption.copyWith(color: AppColors.danger)),
          if (message.proRequired && onOpenPro != null)
            TextButton.icon(
              key: const Key('chat-failed-pro'),
              onPressed: onOpenPro,
              icon: const Icon(Icons.workspace_premium_rounded, size: 18),
              label: const Text('عضوية Pro'),
            ),
        ],
      ),
    );
  }

  /// The filter's refusal: a gold note with the server's words and, while the family offer is open, the way round it
  Widget _refusalNote(String text) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: DecoratedBox(
          key: const Key('chat-refusal'),
          decoration: BoxDecoration(color: AppColors.safetyChip, borderRadius: BorderRadius.circular(AppRadius.md)),
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(10, 8, 10, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(Icons.shield_outlined, size: 16, color: AppColors.goldText),
                    ),
                    const SizedBox(width: 6),
                    Flexible(child: Text(text, style: AppText.caption.copyWith(color: AppColors.goldText, height: 1.4))),
                  ],
                ),
                if (onFamily != null)
                  TextButton(
                    key: const Key('chat-refusal-family'),
                    onPressed: onFamily,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.goldText,
                      minimumSize: const Size(44, 44),
                      padding: EdgeInsets.zero,
                    ),
                    child: const Text('تعارف عائلي'),
                  ),
              ],
            ),
          ),
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
