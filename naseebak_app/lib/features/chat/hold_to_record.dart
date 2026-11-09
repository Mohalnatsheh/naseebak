import 'dart:async';

import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'media_bubbles.dart' show formatVoiceDuration;

/// Hold the mic this long before recording starts (a quick tap is a tap)
const holdDelay = Duration(milliseconds: 250);

/// A held note shorter than this is dropped with «الرسالة قصيرة جداً»
const holdMinDuration = Duration(seconds: 1);
const holdTooShortText = 'الرسالة قصيرة جداً';

/// Slide this far towards the start edge to cancel, or this far up to lock
const holdCancelDistance = 110.0;
const holdLockDistance = 80.0;

/// Let go further than this from where the finger went down (without reaching cancel or lock): the finger left the
/// button, so the recording stops and waits for «إرسال» or «إلغاء» instead of sending
const holdLeaveDistance = 72.0;

enum HoldSlide { none, cancel, lock }

/// What a slide of [delta] from the press point means. The start edge is the right in Arabic, the left in English.
HoldSlide holdSlideFor(Offset delta, TextDirection direction) {
  final towardStart = direction == TextDirection.rtl ? delta.dx : -delta.dx;
  if (towardStart >= holdCancelDistance) return HoldSlide.cancel;
  if (-delta.dy >= holdLockDistance) return HoldSlide.lock;
  return HoldSlide.none;
}

/// Letting go at [delta] sends; further away, it only stops (never a silent send from a finger that wandered off)
bool holdReleaseSends(Offset delta) => delta.distance <= holdLeaveDistance;

/// The mic's touch handling, on raw pointers so every end of a hold is seen: a tap ([onTap]); a hold after
/// [holdDelay] ([onHoldStart]), its slides ([onHoldMove], from the press point) and its release ([onHoldRelease]).
/// A cancelled pointer (a system gesture, a call) or a second finger on the button ends the hold with
/// [onHoldInterrupted]: the chat room then stops and waits, it never sends.
class HoldToRecordDetector extends StatefulWidget {
  const HoldToRecordDetector({
    super.key,
    required this.child,
    required this.label,
    required this.onTap,
    required this.onHoldStart,
    required this.onHoldMove,
    required this.onHoldRelease,
    required this.onHoldInterrupted,
  });

  final Widget child;
  final String label;
  final VoidCallback onTap;
  final VoidCallback onHoldStart;
  final ValueChanged<Offset> onHoldMove;
  final ValueChanged<Offset> onHoldRelease;
  final VoidCallback onHoldInterrupted;

  @override
  State<HoldToRecordDetector> createState() => _HoldToRecordDetectorState();
}

class _HoldToRecordDetectorState extends State<HoldToRecordDetector> {
  int? _pointer;
  Offset _origin = Offset.zero;
  Timer? _timer;
  bool _holding = false;

  /// A second finger spoiled this press: nothing more until every finger is up
  bool _spoiled = false;
  final Set<int> _down = {};

  void _reset() {
    _timer?.cancel();
    _timer = null;
    _pointer = null;
    _holding = false;
  }

  void _down0(PointerDownEvent e) {
    if (!mounted) return;
    _down.add(e.pointer);
    if (_pointer != null || _spoiled) {
      // A second finger: end the hold safely (stop and wait), and ignore the rest of this press
      final holding = _holding;
      _reset();
      _spoiled = true;
      if (holding) widget.onHoldInterrupted();
      return;
    }
    _pointer = e.pointer;
    _origin = e.position;
    _timer = Timer(holdDelay, () {
      if (!mounted || _pointer == null) return;
      _holding = true;
      widget.onHoldStart();
    });
  }

  void _move(PointerMoveEvent e) {
    if (!mounted || e.pointer != _pointer) return;
    final delta = e.position - _origin;
    if (!_holding) {
      // Moved before the hold began: neither a tap nor a hold
      if (delta.distance > kTouchSlop) _reset();
      return;
    }
    widget.onHoldMove(delta);
  }

  void _up(PointerUpEvent e) {
    _down.remove(e.pointer);
    if (_down.isEmpty) _spoiled = false;
    if (!mounted || e.pointer != _pointer) return;
    final holding = _holding;
    final delta = e.position - _origin;
    _reset();
    holding ? widget.onHoldRelease(delta) : widget.onTap();
  }

  void _cancel(PointerCancelEvent e) {
    _down.remove(e.pointer);
    if (_down.isEmpty) _spoiled = false;
    if (!mounted || e.pointer != _pointer) return;
    final holding = _holding;
    _reset();
    if (holding) widget.onHoldInterrupted();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.label,
      hint: 'اضغط مطولاً للتسجيل',
      onTap: widget.onTap,
      child: ExcludeSemantics(
        child: Listener(
          behavior: HitTestBehavior.opaque,
          onPointerDown: _down0,
          onPointerMove: _move,
          onPointerUp: _up,
          onPointerCancel: _cancel,
          child: widget.child,
        ),
      ),
    );
  }
}

/// In place of the text box while the mic is held: the red dot and the clock, the live level, and «اسحب للإلغاء»
/// moving with the finger. A lock hint floats above the mic (see [HoldLockHint]).
class HoldRecordBar extends StatelessWidget {
  const HoldRecordBar({super.key, required this.elapsed, required this.levels, required this.slide});
  final Duration elapsed;

  /// The latest levels, 0..1, oldest first
  final List<double> levels;

  /// How far the finger moved towards the start edge (0..holdCancelDistance)
  final double slide;

  @override
  Widget build(BuildContext context) {
    final progress = (slide / holdCancelDistance).clamp(0.0, 1.0);
    return Container(
      key: const Key('voice-hold-bar'),
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Icon(Icons.fiber_manual_record_rounded, size: 14, color: Theme.of(context).colorScheme.error),
          const SizedBox(width: 6),
          Text(
            formatVoiceDuration(elapsed),
            key: const Key('voice-clock'),
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.ink),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Opacity(
              opacity: 1 - progress * 0.7,
              child: Row(
                children: [
                  Expanded(child: LevelBars(key: const Key('voice-level'), levels: levels)),
                  const SizedBox(width: 6),
                  Transform.translate(
                    // Follows the finger towards the start edge
                    offset: Offset((Directionality.of(context) == TextDirection.rtl ? 1 : -1) * slide * 0.4, 0),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.chevron_left_rounded, size: 18, color: AppColors.muted),
                        Text('اسحب للإلغاء', style: TextStyle(fontSize: 13, color: AppColors.muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Above the held mic: a lock that fills as the finger slides up
class HoldLockHint extends StatelessWidget {
  const HoldLockHint({super.key, required this.rise});

  /// How far the finger moved up (0..holdLockDistance)
  final double rise;

  @override
  Widget build(BuildContext context) {
    final p = (rise / holdLockDistance).clamp(0.0, 1.0);
    return Container(
      key: const Key('voice-lock-hint'),
      width: 40,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(p >= 1 ? Icons.lock_rounded : Icons.lock_open_rounded, size: 18, color: AppColors.navy),
          const SizedBox(height: 2),
          const Icon(Icons.keyboard_arrow_up_rounded, size: 18, color: AppColors.muted),
        ],
      ),
    );
  }
}

/// The microphone's level as a row of bars (newest at the end side)
class LevelBars extends StatelessWidget {
  const LevelBars({super.key, required this.levels, this.color = AppColors.navy});
  final List<double> levels;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 24,
        child: CustomPaint(painter: _LevelPainter(levels, color, Directionality.of(context))),
      );
}

class _LevelPainter extends CustomPainter {
  _LevelPainter(this.levels, this.color, this.direction);
  final List<double> levels;
  final Color color;
  final TextDirection direction;

  static const _bar = 3.0;
  static const _gap = 2.0;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = _bar
      ..strokeCap = StrokeCap.round;
    final fit = (size.width / (_bar + _gap)).floor();
    final shown = levels.length > fit ? levels.sublist(levels.length - fit) : levels;
    for (var i = 0; i < shown.length; i++) {
      // Newest at the end side: from the end edge backwards
      final fromEnd = (shown.length - 1 - i) * (_bar + _gap) + _bar / 2;
      final x = direction == TextDirection.rtl ? fromEnd : size.width - fromEnd;
      final h = 3 + (size.height - 3) * shown[i].clamp(0.0, 1.0);
      canvas.drawLine(Offset(x, (size.height - h) / 2), Offset(x, (size.height + h) / 2), paint);
    }
  }

  @override
  bool shouldRepaint(_LevelPainter old) => !identical(old.levels, levels) || old.color != color || old.direction != direction;
}
