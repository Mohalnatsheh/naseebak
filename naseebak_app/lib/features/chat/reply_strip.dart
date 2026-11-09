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
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy),
                ),
                Text(
                  quote.snippet,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textDirection: messageDirection(quote.snippet),
                  style: const TextStyle(fontSize: 13.5, color: AppColors.muted),
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

  /// Drawn on my navy bubble (light colours) or on theirs (white)
  final bool onMine;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bar = onMine ? AppColors.goldLight : AppColors.navy;
    final name = onMine ? AppColors.goldLight : AppColors.navy;
    final text = onMine ? Colors.white.withValues(alpha: 0.85) : AppColors.muted;
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
            color: onMine ? Colors.white.withValues(alpha: 0.14) : AppColors.navy.withValues(alpha: 0.06),
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
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: name),
              ),
              Text(
                quote.snippet,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textDirection: messageDirection(quote.snippet),
                style: TextStyle(fontSize: 13, color: text),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Swipe a bubble towards the end side (left in Arabic, right in English, like the chat apps members know) to reply.
/// The bubble follows the finger up to [maxShift]; past [trigger] a tick of haptics, and letting go replies.
class SwipeToReply extends StatefulWidget {
  const SwipeToReply({super.key, required this.child, required this.onReply, this.enabled = true});
  final Widget child;
  final VoidCallback onReply;
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
    final rtl = Directionality.of(context) == TextDirection.rtl;
    // Towards the end side only: left in RTL, right in LTR
    final towardEnd = rtl ? -d.delta.dx : d.delta.dx;
    final next = (_shift + towardEnd).clamp(0.0, SwipeToReply.maxShift);
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
    final rtl = Directionality.of(context) == TextDirection.rtl;
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
            if (_shift > 0)
              // Uncovered where the bubble left from: the start side
              PositionedDirectional(
                start: 4,
                child: Opacity(
                  opacity: (_shift / SwipeToReply.trigger).clamp(0.0, 1.0),
                  child: const CircleAvatar(
                    radius: 15,
                    backgroundColor: Colors.white,
                    child: Icon(Icons.reply_rounded, size: 18, color: AppColors.navy),
                  ),
                ),
              ),
            Transform.translate(offset: Offset(rtl ? -_shift : _shift, 0), child: widget.child),
          ],
        ),
      ),
    );
  }
}
