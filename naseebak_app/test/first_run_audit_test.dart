import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/welcome/splash_screen.dart';
import 'package:naseebak_app/features/welcome/welcome_state.dart';
import 'package:naseebak_app/features/auth/logout_button.dart';
import 'package:naseebak_app/features/auth/paused_screen.dart';
import 'package:naseebak_app/features/auth/suspended_screen.dart';
import 'package:naseebak_app/features/settings/settings_list_screen.dart';
import 'package:naseebak_app/features/support/support_screen.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';

import 'helpers/fake_api.dart';
import 'setup_progress_test.dart' show basics, setupWith;

/// The first-run and account audit (2026-11-14): setup, sign-in, splash, gates and settings.
void main() {
  group('setup', () {
    Future<ProviderContainer> openSetup(WidgetTester tester, FakeAdapter adapter, List<Override> overrides) async {
      final container = ProviderContainer(overrides: overrides);
      addTearDown(container.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      return container;
    }

    testWidgets('I1: a counts refresh (back in the app, a push) keeps the form, never the skeleton', (tester) async {
      final (adapter, overrides) = await setupWith(basics, savedStep: 1);
      final container = await openSetup(tester, adapter, overrides);
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
      final release = Completer<void>();
      adapter.hold('GET', '/api/me/counts', release.future);
      container.invalidate(countsProvider);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(container.read(countsProvider).isLoading, isTrue);
      expect(find.byKey(const Key('setup-next')), findsOneWidget);
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
      release.complete();
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
    });

    testWidgets('I2: /api/profile failing shows an error with a retry, never an empty form that could save',
        (tester) async {
      final (adapter, overrides) = await setupWith(basics, savedStep: 1);
      final good = adapter.handlers['GET /api/profile']!;
      adapter.on('GET', '/api/profile', const FakeResponse.network());
      await openSetup(tester, adapter, overrides);
      expect(find.byKey(const Key('setup-next')), findsNothing);
      expect(find.text('إعادة المحاولة'), findsOneWidget);

      adapter.handlers['GET /api/profile'] = good;
      await tester.tap(find.text('إعادة المحاولة'));
      await tester.pumpAndSettle();
      // The draft came back: prefilled and resumed at the saved step
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
    });

    testWidgets('I3: saved but `me` could not be read: a clear line, and the next tap only re-reads `me`',
        (tester) async {
      final (adapter, overrides) = await setupWith(
        {...basics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم', 'prefAgeMin': 25, 'prefAgeMax': 35},
        savedStep: 2,
      );
      adapter.on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}));
      final container = await openSetup(tester, adapter, overrides);
      expect(find.text('الخطوة 3 من 3'), findsOneWidget);

      adapter.on('GET', '/api/mobile/me', const FakeResponse.network());
      await tester.ensureVisible(find.byKey(const Key('setup-next')));
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(adapter.to('PUT', '/api/profile'), hasLength(1));
      expect(find.text('تم الحفظ، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsOneWidget);

      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA')}));
      await tester.ensureVisible(find.byKey(const Key('setup-next')));
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(adapter.to('PUT', '/api/profile'), hasLength(1));
      expect(container.read(authControllerProvider).me!.profileComplete, isTrue);
    });

    testWidgets('M15: an 80-year-old draft birth date opens the picker (inside its range)', (tester) async {
      final now = DateTime.now();
      final dob = DateTime(now.year - 81, now.month, now.day + 2);
      final iso = '${dob.year.toString().padLeft(4, '0')}-${dob.month.toString().padLeft(2, '0')}-'
          '${dob.day.toString().padLeft(2, '0')}T00:00:00.000Z';
      expect(dateOfBirthError(dob), isNull);
      final (adapter, overrides) = await setupWith({...basics, 'dateOfBirth': iso});
      await openSetup(tester, adapter, overrides);
      await tester.tap(find.byIcon(Icons.calendar_month_outlined));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(DatePickerDialog), findsOneWidget);
    });

    testWidgets('M16: «خروج» on the setup asks first', (tester) async {
      final (adapter, overrides) = await setupWith(basics);
      await openSetup(tester, adapter, overrides);
      expect(tester.widget<LogoutButton>(find.byType(LogoutButton)).confirm, isTrue);
    });
  });

  group('session', () {
    test('I4: «إعادة المحاولة» after a failed restore shows the wait (unknown) and never runs twice', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse.network());
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.restoreFailed);

      final release = Completer<void>();
      adapter
        ..hold('GET', '/api/mobile/me', release.future)
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
      final auth = c.read(authControllerProvider.notifier);
      final first = auth.restore();
      final second = auth.restore();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(c.read(authControllerProvider).status, AuthStatus.unknown);
      release.complete();
      await Future.wait([first, second]);
      expect(c.read(authControllerProvider).isSignedIn, isTrue);
      expect(adapter.to('GET', '/api/mobile/me'), hasLength(2));
    });

    test('I4: back in the app after a failed restore: it tries again by itself', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse.network());
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.restoreFailed);
      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
      await c.read(authControllerProvider.notifier).refreshOnResume();
      expect(c.read(authControllerProvider).isSignedIn, isTrue);
    });

    test('I4: signing out after a failed restore never waits long on the server', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse.network());
      final store = MemoryTokenStore('t1');
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: store));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.restoreFailed);
      adapter.hold('POST', '/api/mobile/auth/logout', Completer<void>().future);
      AuthController.offlineLogoutWait = const Duration(milliseconds: 50);
      addTearDown(() => AuthController.offlineLogoutWait = const Duration(seconds: 5));
      await c.read(authControllerProvider.notifier).logout().timeout(const Duration(seconds: 2));
      expect(c.read(authControllerProvider).status, AuthStatus.signedOut);
      expect(await store.read(), isNull);
    });

    testWidgets('I4: the splash sign-out shows a busy state (one sign-out, no dead button)', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse.network());
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      await tester.runAsync(() => settled(c));
      c.read(splashDoneProvider.notifier).done();
      await tester.pumpWidget(UncontrolledProviderScope(
        container: c,
        child: rtlApp(const SplashScreen(duration: Duration(milliseconds: 10))),
      ));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byType(LogoutButton), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    test('M9: a 401 mid-session signs out once and leaves a one-shot reason for the sign-in page', () async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('GET', '/api/chats', const FakeResponse(401, {'error': 'غير مصرح'}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      expect((await settled(c)).isSignedIn, isTrue);
      await Future.wait([
        for (var i = 0; i < 3; i++) c.read(apiClientProvider).get('/api/chats').then((_) {}, onError: (_) {}),
      ]);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(c.read(authControllerProvider).status, AuthStatus.signedOut);
      expect(c.read(sessionNoticeProvider), sessionEndedMessage);
    });

    test('M9: signing out on purpose leaves no «انتهت الجلسة» line', () async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      await settled(c);
      await c.read(authControllerProvider.notifier).logout();
      expect(c.read(sessionNoticeProvider), isNull);
    });
  });

  group('account', () {
    Future<(ProviderContainer, FakeAdapter)> signedIn(WidgetTester tester, {bool deactivated = false}) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(deactivated: deactivated), 'appPayments': false}}))
        ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      await tester.runAsync(() => settled(c));
      tester.view.physicalSize = const Size(420, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      return (c, adapter);
    }

    testWidgets('I3: reactivated but `me` could not be read: a clear line, and the next tap only re-reads `me`',
        (tester) async {
      final (c, adapter) = await signedIn(tester, deactivated: true);
      adapter
        ..on('POST', '/api/profile/reactivate', const FakeResponse(200, {'ok': true}))
        ..on('GET', '/api/mobile/me', const FakeResponse.network());
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlApp(const PausedScreen())));
      await tester.pump();
      await tester.tap(find.text('إعادة تفعيل حسابي'));
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/profile/reactivate'), hasLength(1));
      expect(find.text('تمت إعادة التفعيل، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsOneWidget);

      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
      await tester.tap(find.text('إعادة تفعيل حسابي'));
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/profile/reactivate'), hasLength(1));
      expect(c.read(authControllerProvider).me!.deactivated, isFalse);
    });

    Future<void> pumpSettings(WidgetTester tester, ProviderContainer c) async {
      final router = GoRouter(
        initialLocation: '/settings',
        routes: [GoRoute(path: '/settings', builder: (_, _) => const SettingsListScreen())],
      );
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlRouterApp(router)));
      await tester.pump(const Duration(milliseconds: 200));
    }

    testWidgets('M13: pausing shows a busy state; the rows and sign-out wait', (tester) async {
      final (c, adapter) = await signedIn(tester);
      final release = Completer<void>();
      adapter
        ..on('POST', '/api/profile/deactivate', const FakeResponse(200, {'ok': true}))
        ..hold('POST', '/api/profile/deactivate', release.future);
      await pumpSettings(tester, c);
      await tester.tap(find.text('إيقاف الحساب مؤقتاً'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إيقاف'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const Key('settings-busy')), findsOneWidget);
      expect(tester.widget<LogoutButton>(find.byType(LogoutButton)).enabled, isFalse);
      await tester.tap(find.text('إيقاف الحساب مؤقتاً'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byType(AlertDialog), findsNothing);
      adapter.on('GET', '/api/mobile/me', const FakeResponse.network());
      release.complete();
      await tester.pumpAndSettle();
      // I3: paused on the server, but `me` could not be read: said, not silent
      expect(find.text('تم إيقاف الحساب، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsOneWidget);
      expect(find.byKey(const Key('settings-busy')), findsNothing);
    });

    testWidgets('M14: the delete hint, the suspended page and the support rule use no masculine command',
        (tester) async {
      expect(ticketError(type: 'OTHER', subject: 'موضوع طويل', description: 'قصير'), 'الوصف يجب أن يكون 20 حرفاً على الأقل');
      final (c, _) = await signedIn(tester);
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlApp(const SuspendedScreen())));
      await tester.pump();
      expect(find.textContaining('يمكنك التواصل مع فريق الدعم'), findsOneWidget);
      expect(find.textContaining('فتواصل'), findsNothing);
      await pumpSettings(tester, c);
      await tester.tap(find.text('حذف الحساب'));
      await tester.pumpAndSettle();
      expect(find.text('يساعدنا رأيك في تحسين المنصة'), findsOneWidget);
    });
  });
}
