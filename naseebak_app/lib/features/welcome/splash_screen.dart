import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import 'brand_visuals.dart';
import 'welcome_state.dart';

/// Animated launch: the khatam night sky, a gold ring drawing itself around the logo, the logo rising in, then
/// the tagline. The router waits for [splashDoneProvider]; if the saved session could not be checked (no network)
/// the screen stays with a retry.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key, this.duration});

  /// Fixed length (tests); otherwise [firstLaunchDuration] once per install, [quickDuration] after that
  final Duration? duration;

  /// The full animation, on the first launch only
  static const firstLaunchDuration = Duration(milliseconds: 2600);

  /// Every later launch (also from a push or a link): a short brand moment while the session is restored
  static const quickDuration = Duration(milliseconds: 600);

  /// Shared preferences: the full animation has played on this install
  static const playedKey = 'splash_played';

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: _duration());

  Duration _duration() {
    final fixed = widget.duration;
    if (fixed != null) return fixed;
    final prefs = ref.read(sharedPreferencesProvider);
    if (prefs.getBool(SplashScreen.playedKey) ?? false) return SplashScreen.quickDuration;
    prefs.setBool(SplashScreen.playedKey, true);
    return SplashScreen.firstLaunchDuration;
  }

  // Phases of the one timeline
  late final _ring = CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.55, curve: Curves.easeInOutCubic));
  late final _logo = CurvedAnimation(parent: _c, curve: const Interval(0.25, 0.6, curve: Curves.easeOutBack));
  late final _glow = CurvedAnimation(parent: _c, curve: const Interval(0.45, 0.8, curve: Curves.easeOut));
  late final _tagline = CurvedAnimation(parent: _c, curve: const Interval(0.6, 0.95, curve: Curves.easeOutCubic));

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(() {
      if (mounted) ref.read(splashDoneProvider.notifier).done();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final failed = auth.status == AuthStatus.restoreFailed;
    final done = ref.watch(splashDoneProvider);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
      backgroundColor: AppColors.navyDeep,
      body: NightBackdrop(
        child: SafeArea(
          child: Center(
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, _) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 200,
                    height: 200,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Soft gold glow behind the logo
                        Opacity(
                          opacity: _glow.value * 0.9,
                          child: Container(
                            width: 150,
                            height: 150,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: [BoxShadow(color: AppColors.gold.withValues(alpha: 0.35), blurRadius: 60, spreadRadius: 6)],
                            ),
                          ),
                        ),
                        CustomPaint(size: const Size(190, 190), painter: _RingPainter(_ring.value)),
                        Transform.translate(
                          offset: Offset(0, (1 - _logo.value) * 18),
                          child: Opacity(
                            opacity: _logo.value.clamp(0, 1),
                            child: Transform.scale(scale: 0.85 + 0.15 * _logo.value, child: const BrandLogo(height: 70, onDark: true)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Opacity(
                    opacity: _tagline.value,
                    child: Transform.translate(
                      offset: Offset(0, (1 - _tagline.value) * 14),
                      child: Column(children: [
                        Text(
                          'زواج تقليدي بروح عصرية',
                          style: AppText.body.copyWith(color: AppColors.goldLight.withValues(alpha: 0.95), letterSpacing: 0.3),
                        ),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 36),
                  if (failed && done) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Text(
                        auth.error ?? ApiException.networkMessage,
                        textAlign: TextAlign.center,
                        style: AppText.body.copyWith(color: Colors.white, height: 1.6),
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.gold),
                      onPressed: () => ref.read(authControllerProvider.notifier).restore(),
                      child: const Text('إعادة المحاولة'),
                    ),
                    TextButton(
                      onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                      child: const Text('تسجيل الخروج', style: TextStyle(color: Colors.white70)),
                    ),
                  ] else
                    // Still checking the saved session after the animation: three gold dots
                    SizedBox(height: 24, child: done ? const _Dots() : null),
                ],
              ),
            ),
          ),
        ),
      ),
    ));
  }
}

/// A gold ring drawn from the top, with a small star riding its tip.
class _RingPainter extends CustomPainter {
  _RingPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    if (t <= 0) return;
    final rect = Offset.zero & size;
    final arc = Paint()
      ..shader = const SweepGradient(colors: [AppColors.goldLight, AppColors.gold, AppColors.goldLight]).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final sweep = 2 * math.pi * t;
    canvas.drawArc(rect.deflate(4), -math.pi / 2, sweep, false, arc);
    if (t < 1) {
      final r = size.width / 2 - 4;
      final a = -math.pi / 2 + sweep;
      final tip = size.center(Offset.zero) + Offset(math.cos(a), math.sin(a)) * r;
      canvas.drawCircle(tip, 4.5, Paint()..color = AppColors.goldLight);
      canvas.drawCircle(tip, 10, Paint()..color = AppColors.gold.withValues(alpha: 0.25));
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.t != t;
}

class _Dots extends StatefulWidget {
  const _Dots();

  @override
  State<_Dots> createState() => _DotsState();
}

class _DotsState extends State<_Dots> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void initState() {
    super.initState();
    if (loopingMotion) _c.repeat();
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
      builder: (_, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.goldLight.withValues(alpha: 0.35 + 0.65 * (0.5 + 0.5 * math.sin((_c.value - i / 3) * 2 * math.pi))),
              ),
            ),
        ],
      ),
    );
  }
}
