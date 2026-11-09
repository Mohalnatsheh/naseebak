import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/routing/router.dart';
import 'package:naseebak_app/features/welcome/intro_screen.dart';
import 'package:naseebak_app/features/welcome/splash_screen.dart';
import 'package:naseebak_app/features/welcome/welcome_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

void main() {
  group('start-up order', () {
    const out = AuthState.signedOut();

    test('the splash plays first, whatever the session', () {
      expect(guardRedirect(location: '/splash', countryCode: null, auth: out, splashDone: false), isNull);
      expect(guardRedirect(location: '/home', countryCode: 'JO', auth: out, splashDone: false), '/splash');
    });

    test('first launch: intro pages before the country picker', () {
      expect(guardRedirect(location: '/splash', countryCode: null, auth: out, introSeen: false), '/intro');
      expect(guardRedirect(location: '/intro', countryCode: null, auth: out, introSeen: false), isNull);
      expect(guardRedirect(location: '/splash', countryCode: null, auth: out, introSeen: true), '/country');
    });

    test('a member who already picked a country never sees the intro again', () {
      expect(guardRedirect(location: '/splash', countryCode: 'JO', auth: out, introSeen: false), '/auth/phone');
    });
  });

  testWidgets('intro: three pages, then «ابدأ الآن» remembers it and opens the country picker', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final overrides = await testOverrides(FakeAdapter());
    final router = GoRouter(initialLocation: '/intro', routes: [
      GoRoute(path: '/intro', builder: (_, _) => const IntroScreen()),
      GoRoute(path: '/country', builder: (_, _) => const Text('COUNTRY')),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(
        routerConfig: router,
        locale: const Locale('ar'),
        builder: (_, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text(introPages[0].title), findsOneWidget);
    await tester.tap(find.byKey(const Key('intro-next')));
    await tester.pumpAndSettle();
    expect(find.text(introPages[1].title), findsOneWidget);
    await tester.tap(find.byKey(const Key('intro-next')));
    await tester.pumpAndSettle();
    expect(find.text('لنبدأ'), findsOneWidget);
    await tester.tap(find.byKey(const Key('intro-next')));
    await tester.pumpAndSettle();

    expect(find.text('COUNTRY'), findsOneWidget);
    expect((await SharedPreferences.getInstance()).getBool(IntroSeenNotifier.key), isTrue);
  });

  testWidgets('splash marks itself done when its animation ends', (tester) async {
    final container = ProviderContainer(overrides: await testOverrides(FakeAdapter()));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(const SplashScreen(duration: Duration(milliseconds: 300))),
    ));
    expect(container.read(splashDoneProvider), isFalse);
    await tester.pump(const Duration(milliseconds: 400));
    expect(container.read(splashDoneProvider), isTrue);
    expect(find.text('زواج تقليدي بروح عصرية'), findsOneWidget);
  });

  testWidgets('the full splash plays on the first launch only; later launches take 0.6 s', (tester) async {
    final container = ProviderContainer(overrides: await testOverrides(FakeAdapter()));
    addTearDown(container.dispose);
    Widget app() => UncontrolledProviderScope(container: container, child: rtlApp(const SplashScreen()));
    await tester.pumpWidget(app());
    await tester.pump(const Duration(milliseconds: 700));
    expect(container.read(splashDoneProvider), isFalse);
    await tester.pump(const Duration(milliseconds: 2000));
    expect(container.read(splashDoneProvider), isTrue);
    expect(container.read(sharedPreferencesProvider).getBool(SplashScreen.playedKey), isTrue);

    // The next launch
    await tester.pumpWidget(const SizedBox());
    container.invalidate(splashDoneProvider);
    await tester.pumpWidget(app());
    expect(container.read(splashDoneProvider), isFalse);
    await tester.pump(const Duration(milliseconds: 650));
    expect(container.read(splashDoneProvider), isTrue);
  });

  testWidgets('back on the second intro page goes to the first, not out of the app', (tester) async {
    final container = ProviderContainer(overrides: await testOverrides(FakeAdapter()));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const IntroScreen())));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('intro-next')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('intro-page-1')), findsOneWidget);
    final handled = await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(handled, isTrue);
    expect(find.byKey(const Key('intro-page-0')), findsOneWidget);
  });
}
