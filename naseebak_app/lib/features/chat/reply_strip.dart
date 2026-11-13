import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import 'chat_format.dart';
import 'chat_models.dart';

/// Same labels and length as the server's quote (src/lib/chat/reply.ts)
const replySnippetMax = 80;
const replyImageLabel = '📷 صورة';
const replyVoiceLabel = '🎤 رسالة صوتية';

/// The quote of [m] while my reply is still on its way (the server builds the real one): one line of at most 80
/// characters (an emoji is never cut), or the label of a photo / voice note
String replySnippetOf(ChatMessage m) {
  if (m.kind == MessageKind.image) return replyImageLabel;
  if (m.kind == MessageKind.voice) return replyVoiceLabel;
  final line = m.body.replaceAll(RegExp(r'\s+'), ' ').trim();
  final chars = line.runes.toList();
  if (chars.length <= replySnippetMax) return line;
  return '${String.fromCharCodes(chars.take(replySnippetMax - 1)).trimRight()}…';
}

/// The quote my reply carries until the server's copy replaces it
ReplyQuote quoteOf(ChatMessage m) => ReplyQuote(id: m.id, mine: m.mine, kind: m.kind, snippet: replySnippetOf(m));

/// «أنت» for my own message, else the other person's first name
String quoteAuthor(bool mine, String partnerName) => mine ? 'أنت' : (partnerName.isEmpty ? 'الطرف الآخر' : partnerName);

/// Above the composer while replying: who wrote the original, one line of it, and ✕ to drop the reply
class ReplyStrip extends StatelessWidget {
  const ReplyStrip({super.key, required this.quote, required this.partnerName, required this.onClose});
  final ReplyQuote quote;
  final String partnerName;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('chat-reply-strip'),
      margin: const EdgeInsets.fromLTRB(8, 6, 8, 0),
      padding: const EdgeInsetsDirectional.only(start: 10),
      decoration: BoxDecoration(
        color: AppColors.navy.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: const BorderDirectional(start: BorderSide(color: AppColors.gold, width: 3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.reply_rounded, size: 18, color: AppColors.navy),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  quoteAuthor(quote.mine, partnerName),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.label.copyWith(fontWeight: FontWeight.w700, color: AppColors.navy),
                ),
                Text(
                  quote.snippet,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textDirection: messageDirection(quote.snippet),
                  style: AppText.labelRegular.copyWith(color: AppColors.muted),
                ),
              ],
            ),
          ),
          IconButton(
            key: const Key('chat-reply-close'),
            tooltip: 'إلغاء الرد',
            onPressed: onClose,
            style: IconButton.styleFrom(minimumSize: const Size(44, 44)),
            icon: const Icon(Icons.close_rounded, size: 20, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

/// The quote at the top of a reply bubble; a tap scrolls to the original
class QuoteInBubble extends StatelessWidget {
  const QuoteInBubble({super.key, required this.quote, required this.partnerName, required this.onMine, this.onTap});
  final ReplyQuote quote;
  final String partnerName;

  /// Drawn on my pale-navy bubble or on theirs (white)
  final bool onMine;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bar = AppColors.navy;
    final name = AppColors.navy;
    final text = AppColors.muted;
    return Semantics(
      button: onTap != null,
      label: 'رد على ${quoteAuthor(quote.mine, partnerName)}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          key: Key('chat-quote-${quote.id}'),
          margin: const EdgeInsets.only(bottom: 4),
          // A tap target (it scrolls to the original): at least 44 px tall
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsetsDirectional.fromSTEB(8, 4, 8, 4),
          decoration: BoxDecoration(
            color: onMine ? AppColors.bubbleMineQuote : AppColors.navy.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(8),
            border: BorderDirectional(start: BorderSide(color: bar, width: 3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                quoteAuthor(quote.mine, partnerName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.caption.copyWith(fontWeight: FontWeight.w700, color: name),
              ),
              Text(
                quote.snippet,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textDirection: messageDirection(quote.snippet),
                style: AppText.labelRegular.copyWith(color: text),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The screen-x sign of an inward drag (towards the middle of the screen): my bubbles sit on the end side, so in
/// Arabic mine go right (+1) and theirs left (-1); mirrored in a left-to-right layout
double swipeInwardSign({required bool mine, required TextDirection direction}) {
  final rtl = direction == TextDirection.rtl;
  return mine == rtl ? 1 : -1;
}

/// Swipe a bubble inward (towards the middle of the screen, like WhatsApp) to reply: mine from the end side, theirs
/// from the start side. The bubble follows the finger up to [maxShift]; past [trigger] a tick of haptics, and letting
/// go replies. A drag the other way, or one the list takes as a scroll, does nothing.
class SwipeToReply extends StatefulWidget {
  const SwipeToReply({super.key, required this.child, required this.onReply, required this.mine, this.enabled = true});
  final Widget child;
  final VoidCallback onReply;

  /// My message (end side) or theirs (start side): which way is inward
  final bool mine;
  final bool enabled;

  static const trigger = 56.0;
  static const maxShift = 80.0;

  @override
  State<SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<SwipeToReply> {
  double _shift = 0;
  bool _armed = false;

  void _update(DragUpdateDetails d) {
    final inward = d.delta.dx * swipeInwardSign(mine: widget.mine, direction: Directionality.of(context));
    final next = (_shift + inward).clamp(0.0, SwipeToReply.maxShift);
    final armed = next >= SwipeToReply.trigger;
    if (armed && !_armed) HapticFeedback.selectionClick();
    setState(() {
      _shift = next;
      _armed = armed;
    });
  }

  /// The finger let go: past the trigger, reply
  void _end() {
    final reply = _armed;
    _reset();
    if (reply) widget.onReply();
  }

  /// The swipe was interrupted (the system cancelled the pointer): back in place, no reply
  void _reset() {
    if (_shift == 0 && !_armed) return;
    setState(() {
      _shift = 0;
      _armed = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return widget.child;
    final sign = swipeInwardSign(mine: widget.mine, direction: Directionality.of(context));
    final fade = (_shift / SwipeToReply.trigger).clamp(0.0, 1.0);
    final icon = CircleAvatar(
      radius: 15,
      backgroundColor: Colors.white.withValues(alpha: fade),
      child: Icon(Icons.reply_rounded, size: 18, color: AppColors.navy.withValues(alpha: fade)),
    );
    // A cancelled pointer ends an accepted drag like a release would (onEnd): the listener, which sees the cancel
    // first, disarms it so only a real release replies
    return Listener(
      onPointerCancel: (_) => _reset(),
      child: GestureDetector(
        onHorizontalDragUpdate: _update,
        onHorizontalDragEnd: (_) => _end(),
        onHorizontalDragCancel: _reset,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Uncovered where the bubble left from: its own edge (fades in through its colours, no opacity layer,
            // QA A-L10)
            if (_shift > 0)
              widget.mine ? PositionedDirectional(end: 4, child: icon) : PositionedDirectional(start: 4, child: icon),
            Transform.translate(offset: Offset(sign * _shift, 0), child: widget.child),
          ],
        ),
      ),
    );
  }
}
