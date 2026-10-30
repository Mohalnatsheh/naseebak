import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

/// Endless background motion only in the real app: never under `flutter test` (pumpAndSettle would wait forever)
/// nor when the phone asks for reduced motion.
bool get loopingMotion =>
    !Platform.environment.containsKey('FLUTTER_TEST') &&
    !WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;

/// Faint eight-point star tile (the website's `.landing-khatam` on the navy hero).
class KhatamPainter extends CustomPainter {
  const KhatamPainter({this.color = AppColors.gold, this.opacity = 0.09, this.cell = 64, this.shift = 0});

  final Color color;
  final double opacity;
  final double cell;

  /// 0..1 slow drift of the whole pattern (animated backgrounds)
  final double shift;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    final r = cell * 0.36;
    final dx = shift * cell;
    for (var y = -cell; y < size.height + cell; y += cell) {
      for (var x = -cell; x < size.width + cell; x += cell) {
        final c = Offset(x + dx, y + dx * 0.5);
        canvas.drawPath(_star(c, r), paint);
        canvas.drawCircle(c, r * 0.32, paint);
      }
    }
  }

  /// Two overlapping squares = the eight-point khatam
  Path _star(Offset c, double r) {
    final p = Path();
    for (final turn in [0.0, math.pi / 4]) {
      for (var i = 0; i < 4; i++) {
        final a = turn + i * math.pi / 2;
        final pt = c + Offset(math.cos(a), math.sin(a)) * r;
        i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
      }
      p.close();
    }
    return p;
  }

  @override
  bool shouldRepaint(KhatamPainter old) => old.shift != shift || old.opacity != opacity;
}

/// The navy night background: gradient + khatam tile, drifting slowly when [animate] is on.
class NightBackdrop extends StatefulWidget {
  const NightBackdrop({super.key, this.child, this.animate = true});
  final Widget? child;
  final bool animate;

  @override
  State<NightBackdrop> createState() => _NightBackdropState();
}

class _NightBackdropState extends State<NightBackdrop> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(seconds: 30));

  @override
  void initState() {
    super.initState();
    if (widget.animate && loopingMotion) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: [AppColors.navyDeep, AppColors.navy, Color(0xFF2B5A84)],
        ),
      ),
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) => CustomPaint(painter: KhatamPainter(shift: _c.value), child: child),
        child: widget.child,
      ),
    );
  }
}

/// Fades and slides a child in after [delay] (staggered entrances).
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({super.key, required this.child, this.delay = Duration.zero, this.offset = 24});
  final Widget child;
  final Duration delay;
  final double offset;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 650));
  late final _curve = CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);
  Timer? _start;

  @override
  void initState() {
    super.initState();
    if (widget.delay == Duration.zero) {
      _c.forward();
    } else {
      _start = Timer(widget.delay, _c.forward);
    }
  }

  @override
  void dispose() {
    _start?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _curve,
      builder: (_, child) => Opacity(
        opacity: _curve.value,
        child: Transform.translate(offset: Offset(0, (1 - _curve.value) * widget.offset), child: child),
      ),
      child: widget.child,
    );
  }
}

/// Navy header of the sign-in screens: back button, logo, title and subtitle, with a curved edge.
class AuthHero extends StatelessWidget {
  const AuthHero({super.key, required this.title, this.subtitle, this.showBack = false, this.trailing});
  final String title;
  final String? subtitle;
  final bool showBack;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return ClipPath(
      clipper: _CurveClipper(),
      child: NightBackdrop(
        child: Padding(
          padding: EdgeInsets.fromLTRB(24, MediaQuery.paddingOf(context).top + 12, 24, 52),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                if (showBack)
                  IconButton(
                    tooltip: 'رجوع',
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                  ),
                const Spacer(),
                ?trailing,
              ]),
              const FadeSlideIn(child: BrandLogo(height: 46, onDark: true)),
              const SizedBox(height: 22),
              FadeSlideIn(
                delay: const Duration(milliseconds: 120),
                child: Text(title, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, height: 1.3)),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 8),
                FadeSlideIn(
                  delay: const Duration(milliseconds: 220),
                  child: Text(subtitle!, style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 15, height: 1.65)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CurveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) => Path()
    ..lineTo(0, size.height - 36)
    ..quadraticBezierTo(size.width / 2, size.height + 12, size.width, size.height - 36)
    ..lineTo(size.width, 0)
    ..close();

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}
