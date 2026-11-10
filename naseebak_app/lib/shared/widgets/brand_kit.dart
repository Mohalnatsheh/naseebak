import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

// The app's signature pieces (design review round 2): one avatar (P2-5) with the veil for hidden photos (S2) and the
// chat's time arc (S4), the match seal (S1), the line-art empty states (P2-2, S5), the press shrink and the rise-in
// of the motion system (P2-8), and card-shaped skeletons (P3). Drawn in code: no images, never a face.

/// One avatar everywhere: an initial on navy (photos hidden, with a faint star veil and a small lock), a photo once
/// shown (fading in from a blur), a gold ring when matched, a small gold dot for Pro, and optionally the chat's
/// remaining days as a thin gold arc around it.
class MemberAvatar extends StatelessWidget {
  const MemberAvatar({
    super.key,
    required this.name,
    this.size = 48,
    this.photo,
    this.locked = false,
    this.matched = false,
    this.pro = false,
    this.timeLeft,
    this.dimmed = false,
  });

  /// Over (an ended chat, a closed match): the veil in muted grey
  final bool dimmed;

  final String name;
  final double size;

  /// The photo, when it may be shown
  final ImageProvider? photo;

  /// Photos are hidden until a mutual match: the veil carries a small lock
  final bool locked;
  final bool matched;
  final bool pro;

  /// 0–1: what is left of the chat's time (the S4 arc); null = no arc
  final double? timeLeft;

  String get initial => name.trim().isEmpty ? '؟' : name.trim().characters.first;

  @override
  Widget build(BuildContext context) {
    final ring = timeLeft != null || matched;
    final inner = ring ? size - 8 : size;
    Widget face = photo == null
        ? _Veil(initial: initial, size: inner, locked: locked, dimmed: dimmed)
        : _PhotoFadeIn(image: photo!, size: inner);
    face = ClipOval(child: SizedBox(width: inner, height: inner, child: face));
    return ExcludeSemantics(
      child: SizedBox(
        key: const Key('member-avatar'),
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (ring)
              CustomPaint(
                size: Size.square(size),
                painter: _RingPainter(fraction: timeLeft ?? 1),
              ),
            face,
            if (pro)
              PositionedDirectional(
                bottom: ring ? 2 : 0,
                end: ring ? 2 : 0,
                child: Container(
                  key: const Key('avatar-pro-dot'),
                  width: size * 0.24,
                  height: size * 0.24,
                  decoration: BoxDecoration(
                    color: AppColors.gold,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Veil extends StatelessWidget {
  const _Veil({required this.initial, required this.size, required this.locked, this.dimmed = false});
  final String initial;
  final double size;
  final bool locked;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dimmed ? const [AppColors.line, AppColors.line] : const [AppColors.navy, AppColors.navy2],
        ),
      ),
      child: CustomPaint(
        painter: const _StarVeilPainter(),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Padding(
              padding: EdgeInsets.only(bottom: locked ? size * 0.12 : 0),
              child: SizedBox.square(
              dimension: size * 0.46,
              child: FittedBox(
                child: Text(initial, style: AppText.title.copyWith(color: dimmed ? AppColors.muted : Colors.white, height: 1.1)),
              ),
            ),
            ),
            if (locked && size >= 36)
              // Below the initial, never over it
              Positioned(
                bottom: size * 0.04,
                child: Icon(Icons.lock_rounded, size: size * 0.17, color: AppColors.goldLight),
              ),
          ],
        ),
      ),
    );
  }
}

/// A faint eight-point star pattern for the veil
class _StarVeilPainter extends CustomPainter {
  const _StarVeilPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final r = size.width * 0.18;
    for (final c in [Offset(size.width * 0.2, size.height * 0.22), Offset(size.width * 0.82, size.height * 0.8)]) {
      canvas.drawPath(eightPointStar(c, r), p);
    }
  }

  @override
  bool shouldRepaint(_StarVeilPainter old) => false;
}

/// A shown photo fades from blurred to sharp once (S2: after a match), 300 ms; at once with reduced motion
class _PhotoFadeIn extends StatelessWidget {
  const _PhotoFadeIn({required this.image, required this.size});
  final ImageProvider image;
  final double size;

  @override
  Widget build(BuildContext context) {
    final d = AppMotion.of(context, const Duration(milliseconds: 300));
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: d,
      curve: AppMotion.curve,
      builder: (context, t, child) => t >= 1
          ? child!
          : ImageFiltered(imageFilter: ImageFilter.blur(sigmaX: (1 - t) * 8, sigmaY: (1 - t) * 8), child: child),
      child: Image(image: image, width: size, height: size, fit: BoxFit.cover),
    );
  }
}

/// The gold ring: the whole circle when matched, or the part of the chat's time that is left
class _RingPainter extends CustomPainter {
  _RingPainter({required this.fraction});
  final double fraction;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = (Offset.zero & size).deflate(1.5);
    final track = Paint()
      ..color = AppColors.gold.withValues(alpha: 0.2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    final arc = Paint()
      ..color = AppColors.gold
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.5;
    canvas.drawOval(rect, track);
    final f = fraction.clamp(0.0, 1.0);
    if (f > 0) canvas.drawArc(rect, -math.pi / 2, 2 * math.pi * f, false, arc);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction;
}

/// An eight-point star (two squares turned 45° apart) around [c]
Path eightPointStar(Offset c, double r) {
  final p = Path();
  for (final turn in [0.0, math.pi / 4]) {
    for (var k = 0; k < 4; k++) {
      final a = turn + math.pi / 4 + k * math.pi / 2;
      final o = c + Offset(r * math.cos(a), r * math.sin(a));
      k == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
    }
    p.close();
  }
  return p;
}

/// S1, the match seal: a gold eight-point star draws itself (600 ms) around a navy centre with both initials, then
/// stays. Static (fully drawn) with reduced motion.
class MatchSeal extends StatelessWidget {
  const MatchSeal({super.key, required this.initials, this.size = 96, this.animate = true});

  /// One or two initials («س · ر»)
  final String initials;
  final double size;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final d = animate ? AppMotion.of(context, AppMotion.seal) : Duration.zero;
    return Semantics(
      label: 'توافق متبادل',
      image: true,
      child: TweenAnimationBuilder<double>(
        key: const Key('match-seal'),
        tween: Tween(begin: d == Duration.zero ? 1 : 0, end: 1),
        duration: d,
        curve: AppMotion.curve,
        // Its own size wherever it sits (a dialog's icon slot stretches its child to the dialog's width)
        builder: (context, t, _) => Align(
          widthFactor: 1,
          heightFactor: 1,
          child: SizedBox.square(
          dimension: size,
          child: CustomPaint(
            painter: _SealPainter(progress: t),
            child: Center(
              child: Container(
                width: size * 0.42,
                height: size * 0.42,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: AppColors.navy, shape: BoxShape.circle),
                child: FittedBox(
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Text(initials, style: AppText.label.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            ),
          ),
        ),
        ),
      ),
    );
  }
}

class _SealPainter extends CustomPainter {
  _SealPainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final star = eightPointStar(c, size.width * 0.42);
    final paint = Paint()
      ..color = AppColors.gold
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width / 48
      ..strokeJoin = StrokeJoin.round;
    if (progress >= 1) {
      canvas.drawPath(star, paint);
      return;
    }
    // Draw each contour up to the same share of its length
    for (final m in star.computeMetrics()) {
      canvas.drawPath(m.extractPath(0, m.length * progress), paint);
    }
  }

  @override
  bool shouldRepaint(_SealPainter old) => old.progress != progress;
}

/// A small «توافق متبادل» seal for a match card or the chat header (S1, once drawn)
class SealMark extends StatelessWidget {
  const SealMark({super.key, this.size = 18, this.icon = Icons.check_rounded, this.label = 'توافق متبادل'});
  final double size;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        child: CustomPaint(
          key: const Key('seal-mark'),
          size: Size.square(size),
          painter: _SealPainter(progress: 1),
          child: SizedBox.square(
            dimension: size,
            child: Center(child: Icon(icon, size: size * 0.5, color: AppColors.navy)),
          ),
        ),
      );
}

/// The line-art empty states (P2-2, S5): navy lines with one gold touch, 120 px, no faces
enum LineArtKind { dallah, envelope, cupsTray, door, window, lantern }

class LineArt extends StatelessWidget {
  const LineArt(this.kind, {super.key, this.size = 120});
  final LineArtKind kind;
  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: CustomPaint(key: Key('line-art-${kind.name}'), size: Size.square(size), painter: _LineArtPainter(kind)),
      );
}

class _LineArtPainter extends CustomPainter {
  _LineArtPainter(this.kind);
  final LineArtKind kind;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 120;
    canvas.scale(s);
    final navy = Paint()
      ..color = AppColors.navy
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final gold = Paint()
      ..color = AppColors.gold
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round;
    final goldFill = Paint()..color = AppColors.gold.withValues(alpha: 0.9);
    switch (kind) {
      case LineArtKind.dallah:
        // A dallah (coffee pot) and two small cups
        final pot = Path()
          ..moveTo(38, 92)
          ..lineTo(66, 92)
          ..quadraticBezierTo(70, 70, 60, 58)
          ..lineTo(60, 48)
          ..quadraticBezierTo(52, 40, 44, 48)
          ..lineTo(44, 58)
          ..quadraticBezierTo(34, 70, 38, 92);
        canvas.drawPath(pot, navy);
        canvas.drawPath(
            Path()
              ..moveTo(60, 60)
              ..quadraticBezierTo(76, 54, 84, 42),
            navy);
        canvas.drawLine(const Offset(52, 40), const Offset(52, 34), navy);
        canvas.drawCircle(const Offset(52, 32), 2.5, goldFill);
        for (final x in [82.0, 98.0]) {
          canvas.drawPath(
              Path()
                ..moveTo(x - 6, 82)
                ..lineTo(x - 4, 92)
                ..lineTo(x + 4, 92)
                ..lineTo(x + 6, 82),
              navy);
        }
        canvas.drawLine(const Offset(28, 96), const Offset(106, 96), gold);
      case LineArtKind.envelope:
        // A sealed envelope
        canvas.drawRRect(RRect.fromLTRBR(22, 38, 98, 88, const Radius.circular(6)), navy);
        canvas.drawPath(
            Path()
              ..moveTo(24, 40)
              ..lineTo(60, 66)
              ..lineTo(96, 40),
            navy);
        canvas.drawCircle(const Offset(60, 66), 7, goldFill);
      case LineArtKind.cupsTray:
        // Two cups on a tray
        for (final x in [46.0, 74.0]) {
          canvas.drawPath(
              Path()
                ..moveTo(x - 11, 58)
                ..lineTo(x - 8, 80)
                ..lineTo(x + 8, 80)
                ..lineTo(x + 11, 58),
              navy);
          canvas.drawPath(
              Path()
                ..moveTo(x - 2, 52)
                ..quadraticBezierTo(x + 3, 46, x - 1, 40),
              gold);
        }
        canvas.drawPath(
            Path()
              ..moveTo(22, 84)
              ..lineTo(98, 84)
              ..quadraticBezierTo(94, 92, 86, 92)
              ..lineTo(34, 92)
              ..quadraticBezierTo(26, 92, 22, 84),
            navy);
      case LineArtKind.door:
        // A carved, arched door
        final door = Path()
          ..moveTo(36, 98)
          ..lineTo(36, 50)
          ..arcToPoint(const Offset(84, 50), radius: const Radius.circular(24))
          ..lineTo(84, 98)
          ..close();
        canvas.drawPath(door, navy);
        canvas.drawLine(const Offset(60, 30), const Offset(60, 98), navy);
        canvas.drawPath(eightPointStar(const Offset(60, 52), 7), gold);
        canvas.drawCircle(const Offset(54, 76), 2, goldFill);
        canvas.drawCircle(const Offset(66, 76), 2, goldFill);
      case LineArtKind.window:
        // An arched Amman window
        final arch = Path()
          ..moveTo(38, 96)
          ..lineTo(38, 54)
          ..arcToPoint(const Offset(82, 54), radius: const Radius.circular(22))
          ..lineTo(82, 96)
          ..close();
        canvas.drawPath(arch, navy);
        canvas.drawLine(const Offset(60, 32), const Offset(60, 96), navy);
        canvas.drawLine(const Offset(38, 68), const Offset(82, 68), navy);
        canvas.drawLine(const Offset(30, 98), const Offset(90, 98), gold);
      case LineArtKind.lantern:
        // A hanging lantern
        canvas.drawLine(const Offset(60, 18), const Offset(60, 30), navy);
        canvas.drawPath(
            Path()
              ..moveTo(48, 36)
              ..lineTo(72, 36)
              ..lineTo(66, 30)
              ..lineTo(54, 30)
              ..close(),
            navy);
        canvas.drawPath(
            Path()
              ..moveTo(46, 38)
              ..lineTo(74, 38)
              ..lineTo(78, 80)
              ..lineTo(42, 80)
              ..close(),
            navy);
        canvas.drawLine(const Offset(60, 38), const Offset(60, 80), navy);
        canvas.drawPath(
            Path()
              ..moveTo(60, 70)
              ..quadraticBezierTo(52, 60, 60, 50)
              ..quadraticBezierTo(68, 60, 60, 70),
            gold);
        canvas.drawLine(const Offset(44, 86), const Offset(76, 86), navy);
    }
  }

  @override
  bool shouldRepaint(_LineArtPainter old) => old.kind != kind;
}

/// A slight press shrink on a card or a button (P2-8); none with reduced motion
class PressScale extends StatefulWidget {
  const PressScale({super.key, required this.child});
  final Widget child;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    if (AppMotion.reduced(context)) return widget.child;
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: _down ? 0.98 : 1,
        duration: AppMotion.press,
        curve: AppMotion.curve,
        child: widget.child,
      ),
    );
  }
}

/// Rises 6 px into place in 180 ms the first time it shows (a new bubble, a card); still with reduced motion
class RiseIn extends StatelessWidget {
  const RiseIn({super.key, required this.child, this.enabled = true});
  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final d = enabled ? AppMotion.of(context, AppMotion.appear) : Duration.zero;
    if (d == Duration.zero) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 6, end: 0),
      duration: d,
      curve: AppMotion.curve,
      builder: (_, dy, c) => Transform.translate(offset: Offset(0, dy), child: c),
      child: child,
    );
  }
}

/// A loading placeholder shaped like the suggestion card (P3): avatar, name lines, ring, chips, buttons. The
/// shimmer moves through its colour, not an opacity layer.
class CardSkeleton extends StatefulWidget {
  const CardSkeleton({super.key});

  @override
  State<CardSkeleton> createState() => _CardSkeletonState();
}

class _CardSkeletonState extends State<CardSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    AppMotion.reduced(context) ? _c.stop() : _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final tone = Color.lerp(AppColors.line, AppColors.offWhite, _c.value)!;
        Widget bar(double w, double h, {double r = 8}) =>
            Container(width: w, height: h, decoration: BoxDecoration(color: tone, borderRadius: BorderRadius.circular(r)));
        return Container(
          key: const Key('card-skeleton'),
          padding: const EdgeInsets.all(AppSpace.lg),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  bar(48, 48, r: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [bar(120, 20), const SizedBox(height: 8), bar(90, 12)],
                    ),
                  ),
                  bar(56, 56, r: 28),
                ],
              ),
              const SizedBox(height: 16),
              Row(children: [bar(80, 28, r: 14), const SizedBox(width: 8), bar(60, 28, r: 14), const SizedBox(width: 8), bar(64, 28, r: 14)]),
              const SizedBox(height: 12),
              bar(double.infinity, 40, r: 12),
              const SizedBox(height: 16),
              Row(children: [Expanded(flex: 2, child: bar(double.infinity, 48, r: 12)), const SizedBox(width: 8), Expanded(child: bar(double.infinity, 48, r: 12))]),
            ],
          ),
        );
      },
    );
  }
}
