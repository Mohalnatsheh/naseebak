import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/app/maintenance_gate.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/core/update/app_update.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/welcome/splash_screen.dart';
import 'package:naseebak_app/features/welcome/welcome_state.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/logout_button.dart';
import 'package:naseebak_app/features/auth/otp_screen.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/auth/phone_screen.dart';
import 'package:naseebak_app/features/auth/register_screen.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
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

    Future<(FakeAdapter, ProviderContainer)> stuckAtSave(WidgetTester tester, {required FakeResponse me}) async {
      final (adapter, overrides) = await setupWith(
        {...basics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم', 'prefAgeMin': 25, 'prefAgeMax': 35},
        savedStep: 2,
      );
      adapter.on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}));
      final container = await openSetup(tester, adapter, overrides);
      adapter.on('GET', '/api/mobile/me', me);
      await tester.ensureVisible(find.byKey(const Key('setup-next')));
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(adapter.to('PUT', '/api/profile'), hasLength(1));
      return (adapter, container);
    }

    Future<void> tapNext(WidgetTester tester) async {
      await tester.ensureVisible(find.byKey(const Key('setup-next')));
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
    }

    testWidgets('review I-3: `me` read but still incomplete: never the «saved but stuck» line; the next tap saves again',
        (tester) async {
      final (adapter, _) =
          await stuckAtSave(tester, me: FakeResponse(200, {'user': meJson(country: 'SA', complete: false)}));
      expect(find.text('تم الحفظ، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsNothing);
      expect(find.text('تم الحفظ، لكن الملف لم يكتمل بعد. يُرجى مراجعة الإجابات ثم المحاولة مرة أخرى.'), findsOneWidget);
      await tapNext(tester);
      expect(adapter.to('PUT', '/api/profile'), hasLength(2));
    });

    testWidgets('review I-3: stuck after a save, then «السابق»: the next save goes out again', (tester) async {
      final (adapter, _) = await stuckAtSave(tester, me: const FakeResponse.network());
      expect(find.text('تم الحفظ، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsOneWidget);
      await tester.tap(find.byTooltip('السابق'));
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
      await tapNext(tester);
      expect(find.text('الخطوة 3 من 3'), findsOneWidget);
      await tapNext(tester);
      expect(adapter.to('PUT', '/api/profile'), hasLength(2));
    });

    testWidgets('review I-3: stuck after a save, then an answer changed: the next tap saves the change', (tester) async {
      final (adapter, _) = await stuckAtSave(tester, me: const FakeResponse.network());
      await tester.enterText(find.byKey(const Key('age-min')), '27');
      await tester.pump();
      await tapNext(tester);
      expect(adapter.to('PUT', '/api/profile'), hasLength(2));
      expect(adapter.to('PUT', '/api/profile').last.data['prefAgeMin'], 27);
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

    testWidgets('review I-3: reactivated and `me` read but still paused: no stuck flag, the next tap reactivates again',
        (tester) async {
      final (c, adapter) = await signedIn(tester, deactivated: true);
      adapter
        ..on('POST', '/api/profile/reactivate', const FakeResponse(200, {'ok': true}))
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(deactivated: true)}));
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlApp(const PausedScreen())));
      await tester.pump();
      await tester.tap(find.text('إعادة تفعيل حسابي'));
      await tester.pumpAndSettle();
      expect(find.text('تمت إعادة التفعيل، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsNothing);
      expect(find.text('تعذّرت إعادة التفعيل. يُرجى المحاولة مرة أخرى.'), findsOneWidget);
      await tester.tap(find.text('إعادة تفعيل حسابي'));
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/profile/reactivate'), hasLength(2));
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

  group('sign-in', () {
    Future<ProviderContainer> openOtp(WidgetTester tester, FakeAdapter adapter,
        {PendingAuth? pending, OtpScreen screen = const OtpScreen()}) async {
      final c = ProviderContainer(overrides: await testOverrides(adapter));
      addTearDown(c.dispose);
      c.read(pendingAuthProvider.notifier).set(pending ??
          const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.login, userExists: true));
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlApp(screen)));
      await tester.pump();
      return c;
    }

    testWidgets('M1: the countdown follows the clock after time away (iPhone pauses timers)', (tester) async {
      var now = DateTime(2026, 11, 14, 10);
      await openOtp(tester, FakeAdapter(), screen: OtpScreen(now: () => now));
      expect(find.text('يمكنك طلب رمز جديد بعد 60 ثانية'), findsOneWidget);
      // 50 s reading WhatsApp, no tick meanwhile
      now = now.add(const Duration(seconds: 50));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(find.text('يمكنك طلب رمز جديد بعد 10 ثانية'), findsOneWidget);
      now = now.add(const Duration(seconds: 11));
      await tester.pump(const Duration(seconds: 1));
      expect(find.byKey(const Key('resend')), findsOneWidget);
    });

    testWidgets('M2: a wrong code empties the boxes (the error stays)', (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/auth/verify-otp', const FakeResponse(400, {'error': 'رمز التحقق غير صحيح'}));
      await openOtp(tester, adapter);
      await tester.enterText(find.byKey(const Key('otp-field')), '123456');
      await tester.pump();
      await tester.pump();
      expect(find.text('رمز التحقق غير صحيح'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const Key('otp-field'))).controller!.text, isEmpty);
    });

    testWidgets('M3: the token step refuses a used code: the code is dropped and a new one is offered', (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/auth/verify-otp', const FakeResponse(200, {'verified': true, 'userExists': true}))
        ..on('POST', '/api/mobile/auth/token',
            const FakeResponse(401, {'error': 'رمز التحقق غير صالح أو انتهت صلاحيته', 'code': 'INVALID_CODE'}));
      final c = await openOtp(tester, adapter);
      await tester.enterText(find.byKey(const Key('otp-field')), '123456');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(c.read(pendingAuthProvider)!.code, isNull);
      expect(find.text(codeExpiredMessage), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const Key('otp-field'))).controller!.text, isEmpty);
    });

    Future<ProviderContainer> openRegister(WidgetTester tester, FakeAdapter adapter, PendingAuth pending) async {
      tester.view.physicalSize = const Size(1179, 2556);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final c = ProviderContainer(overrides: await testOverrides(adapter));
      addTearDown(c.dispose);
      c.read(pendingAuthProvider.notifier).set(pending);
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlApp(const RegisterScreen())));
      await tester.pumpAndSettle();
      return c;
    }

    testWidgets('M3: sign-up with a used code (register 400 without details) drops it and offers a new one',
        (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/auth/register', const FakeResponse(400, {'error': 'رمز التحقق غير صالح أو منتهي الصلاحية'}));
      final c = await openRegister(tester, adapter,
          const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.register, code: '123456'));
      await tester.enterText(find.byKey(const Key('first-name')), 'مريم');
      await tester.enterText(find.byKey(const Key('last-name')), 'أحمد');
      await tester.scrollUntilVisible(find.byKey(const Key('register-submit')), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('امرأة'));
      await tester.tap(find.text('امرأة'));
      await tester.ensureVisible(find.byKey(const Key('terms')));
      await tester.tap(find.byKey(const Key('terms')));
      await tester.ensureVisible(find.byKey(const Key('register-submit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('register-submit')));
      await tester.pumpAndSettle();
      expect(c.read(pendingAuthProvider)!.code, isNull);
      expect(find.text(codeExpiredMessage), findsOneWidget);
      expect(find.byKey(const Key('register-new-code')), findsOneWidget);
    });

    testWidgets('M6: a number with no account on «تسجيل الدخول» is told so on the sign-up form', (tester) async {
      await openRegister(tester, FakeAdapter(),
          const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.login, userExists: false, code: '1'));
      expect(find.byKey(const Key('not-registered')), findsOneWidget);
    });

    test('M7: the name rule refuses Arabic-Indic digits like the server', () {
      expect(validateArabicName('محمد٢', 'الاسم الأول'), 'الاسم الأول يجب أن يكون بالعربية فقط');
      expect(validateArabicName('محمد۲', 'الاسم الأول'), 'الاسم الأول يجب أن يكون بالعربية فقط');
      expect(validateArabicName('عبد الله', 'الاسم الأول'), isNull);
    });

    test('M8: terms and privacy fall back to the country\'s website pages', () {
      expect(legalFallback('JO', 'terms'), 'https://naseebak.com/terms');
      expect(legalFallback('SA', 'privacy'), 'https://naseebak.com/sa/privacy');
      expect(legalFallback('LB', 'terms'), 'https://naseebak.com/lb/terms');
    });

    Future<(ProviderContainer, FakeAdapter)> openPhone(WidgetTester tester, {FakeAdapter? adapter}) async {
      tester.view.physicalSize = const Size(1179, 2556);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final a = adapter ?? FakeAdapter();
      final c = ProviderContainer(overrides: await testOverrides(a));
      addTearDown(c.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(
        container: c,
        child: rtlApp(Scaffold(body: PhoneForm(country: Country.fromJson(lbJson)))),
      ));
      await tester.pump(const Duration(seconds: 1));
      return (c, a);
    }

    testWidgets('M5: a pasted «00 962 …» number with spaces isn\'t cut', (tester) async {
      await openPhone(tester);
      await tester.enterText(find.byKey(const Key('phone-field')), '00 961 3 123 456 7');
      expect(tester.widget<TextField>(find.byKey(const Key('phone-field'))).controller!.text, '00 961 3 123 456 7');
    });

    testWidgets('M6: WhatsApp line icon, and the mode switch taps are 44 px high', (tester) async {
      await openPhone(tester);
      expect(find.byIcon(Icons.chat_outlined), findsOneWidget);
      expect(find.byIcon(Icons.sms_outlined), findsNothing);
      expect(tester.getSize(find.byKey(const Key('mode-login'))).height, greaterThanOrEqualTo(44));
    });

    testWidgets('M9: the sign-in page says once why the session ended', (tester) async {
      final (c, _) = await openPhone(tester);
      expect(find.text(sessionEndedMessage), findsNothing);
      c.read(sessionNoticeProvider.notifier).set(sessionEndedMessage);
      await tester.pump();
      expect(find.text(sessionEndedMessage), findsOneWidget);
    });

    testWidgets('M4: send-otp failing after the form is gone does not crash', (tester) async {
      final release = Completer<void>();
      final adapter = FakeAdapter()
        ..on('POST', '/api/auth/send-otp', const FakeResponse.network())
        ..hold('POST', '/api/auth/send-otp', release.future);
      await openPhone(tester, adapter: adapter);
      await tester.enterText(find.byKey(const Key('phone-field')), '03123456');
      await tester.ensureVisible(find.byKey(const Key('send-otp')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('send-otp')));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      release.complete();
      await tester.pump(const Duration(milliseconds: 50));
      expect(tester.takeException(), isNull);
    });
  });

  group('gates', () {
    Map<String, dynamic> cfg({String iosMin = '', String iosStore = '', bool maintenance = false}) => {
          'android': {'minVersion': '', 'latestVersion': '', 'storeUrl': ''},
          'ios': {'minVersion': iosMin, 'latestVersion': '', 'storeUrl': iosStore},
          'maintenance': {'enabled': maintenance, 'message': ''},
        };

    Future<ProviderContainer> pumpGates(WidgetTester tester, FakeAdapter adapter) async {
      final c = ProviderContainer(overrides: [
        ...await testOverrides(adapter),
        appVersionProvider.overrideWith((ref) async => '1.0.0'),
        appPlatformProvider.overrideWithValue('ios'),
      ]);
      addTearDown(c.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(
        container: c,
        child: rtlApp(const UpdateGate(
          child: MaintenanceGate(child: Scaffold(body: TextField(key: Key('typed')))),
        )),
      ));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      return c;
    }

    testWidgets('M12: one config request on start and one per resume, shared by both gates', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/config', FakeResponse(200, cfg()));
      await pumpGates(tester, adapter);
      expect(adapter.to('GET', '/api/mobile/config'), hasLength(1));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(adapter.to('GET', '/api/mobile/config'), hasLength(2));
    });

    testWidgets('I-1: under maintenance the app is not built at all (no hidden screens, timers or focus)', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/config', FakeResponse(200, cfg()));
      final c = await pumpGates(tester, adapter);
      expect(find.byKey(const Key('typed')), findsOneWidget);
      adapter.on('GET', '/api/mobile/config', FakeResponse(200, cfg(maintenance: true)));
      c.read(maintenanceProvider.notifier).check();
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(find.byKey(const Key('maintenance')), findsOneWidget);
      expect(find.byKey(const Key('typed'), skipOffstage: false), findsNothing);
      expect(find.byType(TextField, skipOffstage: false), findsNothing);
      adapter.on('GET', '/api/mobile/config', FakeResponse(200, cfg()));
      c.read(maintenanceProvider.notifier).check();
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(find.byKey(const Key('maintenance')), findsNothing);
      expect(find.byKey(const Key('typed')), findsOneWidget);
    });

    testWidgets('I-1: under a required update the app is not built at all', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/config', FakeResponse(200, cfg(iosMin: '1.1.0', iosStore: 'https://apps.apple.com/app/id1')));
      await pumpGates(tester, adapter);
      expect(find.byKey(const Key('update-required')), findsOneWidget);
      expect(find.byKey(const Key('typed'), skipOffstage: false), findsNothing);
      expect(find.byType(MaintenanceGate, skipOffstage: false), findsNothing);
    });

    testWidgets('M11: iPhone minimum with no store link: still required, clear words, no dead button', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/config', FakeResponse(200, cfg(iosMin: '1.1.0')));
      await pumpGates(tester, adapter);
      expect(find.byKey(const Key('update-required')), findsOneWidget);
      expect(find.byKey(const Key('typed'), skipOffstage: false), findsNothing);
      expect(find.byKey(const Key('update-now')), findsNothing);
      expect(find.text('إعادة التحقق'), findsOneWidget);
      expect(find.textContaining('App Store'), findsOneWidget);
      // A live button: checks again (the store link may have been set since)
      adapter.on('GET', '/api/mobile/config',
          FakeResponse(200, cfg(iosMin: '1.1.0', iosStore: 'https://apps.apple.com/app/id1')));
      await tester.tap(find.byKey(const Key('update-check-again')));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(find.byKey(const Key('update-now')), findsOneWidget);
    });

    testWidgets('M11: the required page scrolls (large text) and «تحديث الآن» is navy on gold', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/config', FakeResponse(200, cfg(iosMin: '1.1.0', iosStore: 'https://apps.apple.com/app/id1')));
      await pumpGates(tester, adapter);
      expect(
        find.descendant(of: find.byKey(const Key('update-required')), matching: find.byType(SingleChildScrollView)),
        findsOneWidget,
      );
      final button = tester.widget<FilledButton>(find.byKey(const Key('update-now')));
      expect(button.style!.foregroundColor!.resolve({}), AppColors.navyDeep);
    });
  });
}
