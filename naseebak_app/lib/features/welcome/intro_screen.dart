import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import 'brand_visuals.dart';
import 'welcome_state.dart';

class IntroPage {
  const IntroPage({required this.image, required this.kicker, required this.title, required this.body, required this.points});
  final String image;
  final String kicker;
  final String title;
  final String body;
  final List<(IconData, String)> points;
}

/// What Naseebak is and how it works (wording from the website's landing page).
const introPages = [
  IntroPage(
    image: 'assets/images/intro/home.webp',
    kicker: 'ما هو نصيبك؟',
    title: 'نصيبك ليس تطبيق تعارف',
    body: 'منصة للزواج التقليدي بروح عصرية: جدّية من البداية، والعائلة جزء من الطريق.',
    points: [
      (Icons.verified_user_outlined, 'كل حساب برقم هاتف مؤكَّد'),
      (Icons.family_restroom_rounded, 'التعارف بموافقة العائلتين'),
    ],
  ),
  IntroPage(
    image: 'assets/images/intro/privacy.webp',
    kicker: 'كيف يعمل؟',
    title: 'اقتراحات مدروسة، وسترك محفوظ',
    body: 'تصلك اقتراحات تناسب ما تبحث عنه مع نسبة التوافق، بدون صور. تقرّر بهدوء: «مهتم» أو «لا».',
    points: [
      (Icons.visibility_off_outlined, 'الصور مخفية حتى التوافق المتبادل'),
      (Icons.lock_outline_rounded, 'قرار «لا» لا يعرفه إلا من أبدى اهتمامه'),
    ],
  ),
  IntroPage(
    image: 'assets/images/intro/match.webp',
    kicker: 'بعد التوافق',
    title: 'توافق متبادل، والخطوة التالية واضحة',
    body: 'عندما يبدي الطرفان اهتمامهما تختاران طريق التعارف، والعائلتان ترتّبان الزيارة.',
    points: [
      (Icons.groups_2_outlined, 'تعارف عائلي يجمع وليّي الأمر مباشرة'),
      (Icons.forum_outlined, 'أو محادثة محمية تُحجب فيها الأرقام والروابط'),
    ],
  ),
];

class IntroScreen extends ConsumerStatefulWidget {
  const IntroScreen({super.key});

  @override
  ConsumerState<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends ConsumerState<IntroScreen> {
  final _pages = PageController();
  double _page = 0;

  @override
  void initState() {
    super.initState();
    _pages.addListener(() => setState(() => _page = _pages.page ?? 0));
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    final router = GoRouter.of(context);
    await ref.read(introSeenProvider.notifier).markSeen();
    router.go('/country');
  }

  void _next() {
    final i = _page.round();
    if (i >= introPages.length - 1) {
      _finish();
    } else {
      _pages.nextPage(duration: const Duration(milliseconds: 520), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final index = _page.round().clamp(0, introPages.length - 1);
    final last = index == introPages.length - 1;
    // Back on a later page goes to the page before (Android); on the first it leaves as usual
    return PopScope(
      canPop: index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _pages.previousPage(duration: const Duration(milliseconds: 420), curve: Curves.easeOutCubic);
      },
      // Light status-bar icons over the navy pages (QA A-L02: they were dark on navy)
      child: AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
      backgroundColor: AppColors.navyDeep,
      body: NightBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
                child: Row(children: [
                  Text('${index + 1} من ${introPages.length}',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontWeight: FontWeight.w600)),
                  const Spacer(),
                  AnimatedOpacity(
                    opacity: last ? 0 : 1,
                    duration: const Duration(milliseconds: 250),
                    child: TextButton(
                      key: const Key('intro-skip'),
                      onPressed: last ? null : _finish,
                      child: const Text('تخطّي', style: TextStyle(color: Colors.white, fontSize: 15)),
                    ),
                  ),
                ]),
              ),
              Expanded(
                child: PageView.builder(
                  key: const Key('intro-pages'),
                  controller: _pages,
                  itemCount: introPages.length,
                  itemBuilder: (_, i) => _IntroSlide(key: Key('intro-page-$i'), page: introPages[i], delta: _page - i),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
                child: Row(
                  children: [
                    Row(children: [
                      for (var i = 0; i < introPages.length; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOut,
                          margin: const EdgeInsetsDirectional.only(end: 6),
                          width: i == index ? 26 : 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: i == index ? AppColors.gold : Colors.white.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                    ]),
                    const Spacer(),
                    _NextButton(
                      progress: (_page + 1) / introPages.length,
                      last: last,
                      onTap: _next,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      ),
      ),
    );
  }
}

/// One page: the photo in a gold-edged frame (parallax while swiping), then the words and two points.
class _IntroSlide extends StatelessWidget {
  const _IntroSlide({super.key, required this.page, required this.delta});
  final IntroPage page;

  /// How far the pager is from this page (-1..1 while swiping)
  final double delta;

  @override
  Widget build(BuildContext context) {
    final d = delta.clamp(-1.0, 1.0);
    final visible = 1 - d.abs();
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return LayoutBuilder(builder: (context, box) {
      final imageHeight = math.min(box.maxHeight * 0.52, 420.0);
      return SingleChildScrollView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            Transform.scale(
              scale: 0.9 + 0.1 * visible,
              child: Container(
                height: imageHeight,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: AppColors.goldLight.withValues(alpha: 0.55), width: 1.5),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 30, offset: const Offset(0, 16))],
                ),
                clipBehavior: Clip.antiAlias,
                child: Stack(fit: StackFit.expand, children: [
                  // Parallax: the photo moves slower than the page
                  Transform.translate(
                    offset: Offset((rtl ? -d : d) * 60, 0),
                    child: Transform.scale(scale: 1.18, child: Image.asset(page.image, fit: BoxFit.cover)),
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xAA15304A)],
                        stops: [0.55, 1],
                      ),
                    ),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 26),
            Opacity(
              opacity: visible,
              child: Transform.translate(
                offset: Offset(0, d.abs() * 30),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(page.kicker, style: const TextStyle(color: AppColors.goldLight, fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 6),
                    Text(page.title,
                        style: const TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w800, height: 1.35)),
                    const SizedBox(height: 10),
                    Text(page.body, style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 15.5, height: 1.7)),
                    const SizedBox(height: 14),
                    for (final (icon, text) in page.points)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(color: AppColors.gold.withValues(alpha: 0.18), shape: BoxShape.circle),
                            child: Icon(icon, size: 16, color: AppColors.goldLight),
                          ),
                          const SizedBox(width: 10),
                          Expanded(child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 14.5))),
                        ]),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    });
  }
}

/// Round gold button with a ring that fills as the pages go by; on the last page it widens to «لنبدأ».
class _NextButton extends StatelessWidget {
  const _NextButton({required this.progress, required this.last, required this.onTap});
  final double progress;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutCubic,
      width: last ? 150 : 66,
      height: 66,
      child: Stack(alignment: Alignment.center, children: [
        if (!last)
          SizedBox(
            width: 66,
            height: 66,
            child: CircularProgressIndicator(
              value: progress.clamp(0, 1),
              strokeWidth: 2.5,
              color: AppColors.goldLight,
              backgroundColor: Colors.white.withValues(alpha: 0.15),
            ),
          ),
        Material(
          color: AppColors.gold,
          shape: const StadiumBorder(),
          elevation: 6,
          shadowColor: AppColors.gold.withValues(alpha: 0.5),
          child: InkWell(
            key: const Key('intro-next'),
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 350),
              width: last ? 150 : 52,
              height: 52,
              alignment: Alignment.center,
              child: last
                  ? const Text('لنبدأ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16))
                  : const Icon(Icons.arrow_forward_rounded, color: Colors.white),
            ),
          ),
        ),
      ]),
    );
  }
}
