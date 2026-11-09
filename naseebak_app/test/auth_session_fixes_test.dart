import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/network/api_exception.dart';
import 'package:naseebak_app/core/routing/router.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/me.dart';
import 'package:naseebak_app/features/auth/otp_screen.dart';
import 'package:naseebak_app/features/auth/paused_screen.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/welcome/brand_visuals.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

Future<AuthState> settled(ProviderContainer c) async {
  c.read(authControllerProvider);
  for (var i = 0; i < 50 && c.read(authControllerProvider).status == AuthStatus.unknown; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  return c.read(authControllerProvider);
}

Future<void> idle() => Future<void>.delayed(const Duration(milliseconds: 20));

const suspended = FakeResponse(403, {'error': 'تم إيقاف حسابك', 'code': 'SUSPENDED'});

void main() {
  group('OTP retry after a failed token step', () {
    testWidgets('a code verified already is not verified again: «تأكيد» retries the token step', (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/auth/verify-otp', const FakeResponse(200, {'verified': true}))
        ..on('POST', '/api/mobile/auth/token', const FakeResponse(500, {'error': 'حدث خطأ في الخادم'}));
      final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore()));
      addTearDown(container.dispose);
      container.read(pendingAuthProvider.notifier).set(
            const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.login, userExists: true),
          );
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const OtpScreen())));
      await tester.pump();

      await tester.enterText(find.byKey(const Key('otp-field')), '123456');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(adapter.to('POST', '/api/auth/verify-otp'), hasLength(1));
      expect(adapter.to('POST', '/api/mobile/auth/token'), hasLength(1));
      expect(find.text('حدث خطأ في الخادم'), findsOneWidget);
      expect(container.read(pendingAuthProvider)?.code, '123456');

      // The server would now refuse verify-otp (it only matches unverified codes): it must not be called again
      adapter
        ..on('POST', '/api/auth/verify-otp', const FakeResponse(400, {'error': 'رمز التحقق غير صحيح'}))
        ..on('POST', '/api/mobile/auth/token',
            FakeResponse(201, {'token': 'nsb_x', 'expiresAt': '2026-12-28T00:00:00Z', 'user': meJson()}));
      await tester.ensureVisible(find.byKey(const Key('verify-otp')));
      await tester.tap(find.byKey(const Key('verify-otp')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(adapter.to('POST', '/api/auth/verify-otp'), hasLength(1));
      expect(adapter.to('POST', '/api/mobile/auth/token'), hasLength(2));
      expect(container.read(authControllerProvider).isSignedIn, isTrue);
      await tester.pumpWidget(const SizedBox());
    });

    test('alreadyVerified matches only the code that was verified', () {
      const p = PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.register);
      expect(p.alreadyVerified('123456'), isFalse);
      expect(p.withCode('123456').alreadyVerified('123456'), isTrue);
      expect(p.withCode('123456').alreadyVerified('654321'), isFalse);
      expect(p.withCode('123456').withCode(null).alreadyVerified('123456'), isFalse);
    });
  });

  group('paused / suspended accounts', () {
    test('any 403 DEACTIVATED re-reads me, and the router then shows the paused page', () async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('GET', '/api/matches', const FakeResponse(403, {'error': 'حسابك غير مفعّل', 'code': 'DEACTIVATED'}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      expect((await settled(c)).isSignedIn, isTrue);

      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(deactivated: true)}));
      // A burst of refusals reads me once
      await Future.wait([
        for (var i = 0; i < 3; i++)
          c.read(apiClientProvider).get('/api/matches').then((_) {}, onError: (Object e) {
            expect((e as ApiException).kind, ApiErrorKind.deactivated);
          }),
      ]);
      await idle();
      expect(adapter.to('GET', '/api/mobile/me'), hasLength(2));
      final auth = c.read(authControllerProvider);
      expect(auth.me!.deactivated, isTrue);
      expect(guardRedirect(location: '/home', countryCode: 'JO', auth: auth), '/paused');
    });

    test('a suspended account at launch gets its own page, not an endless retry; the token is kept', () async {
      final store = MemoryTokenStore('t1');
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', suspended);
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: store));
      addTearDown(c.dispose);
      final s = await settled(c);
      expect(s.status, AuthStatus.suspended);
      expect(await store.read(), 't1');
      expect(guardRedirect(location: '/splash', countryCode: 'JO', auth: s), '/suspended');
      expect(guardRedirect(location: '/suspended', countryCode: 'JO', auth: s), isNull);
      expect(guardRedirect(location: '/home', countryCode: null, auth: s), '/suspended');
    });

    test('an older server (403 without a code on me) also counts as suspended', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse(403, {'error': 'تم إيقاف حسابك'}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.suspended);
    });

    test('suspended while signed in: a refused call moves the member to the suspended page', () async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('GET', '/api/chats', const FakeResponse(403, {'error': 'تم إيقاف حسابك'}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      await settled(c);
      adapter.on('GET', '/api/mobile/me', suspended);
      await expectLater(c.read(apiClientProvider).get('/api/chats'), throwsA(isA<ApiException>()));
      await idle();
      expect(c.read(authControllerProvider).status, AuthStatus.suspended);
    });

    test('back in the foreground: me is re-read at most once a minute', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      await settled(c);
      final auth = c.read(authControllerProvider.notifier);
      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(deactivated: true)}));
      await auth.refreshOnResume();
      expect(adapter.to('GET', '/api/mobile/me'), hasLength(1));
      await auth.refreshOnResume(now: DateTime.now().add(const Duration(seconds: 61)));
      expect(adapter.to('GET', '/api/mobile/me'), hasLength(2));
      expect(c.read(authControllerProvider).me!.deactivated, isTrue);
    });
  });

  group('reinstall (iOS keychain outlives the app)', () {
    test('the first launch of an install forgets a token left by an earlier install, once', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final store = MemoryTokenStore('previous-member');
      await forgetTokenAfterReinstall(prefs, store);
      expect(await store.read(), isNull);
      expect(prefs.getBool(installMarkerKey), isTrue);

      // Later launches keep the session
      await store.write('mine');
      await forgetTokenAfterReinstall(prefs, store);
      expect(await store.read(), 'mine');
    });
  });

  group('pending deletion', () {
    test('me carries the deletion date', () {
      final me = Me.fromJson({...meJson(deactivated: true), 'deletion': {'scheduledFor': '2026-11-30T10:00:00.000Z'}});
      expect(me.deletionScheduledFor, DateTime.utc(2026, 11, 30, 10));
      expect(Me.fromJson({...meJson(), 'deletion': null}).deletionScheduledFor, isNull);
      expect(me.copyWith(credits: 1).deletionScheduledFor, me.deletionScheduledFor);
    });

    test('days left and their wording follow the website', () {
      final now = DateTime(2026, 10, 31, 12);
      expect(daysUntil(now.add(const Duration(days: 30)), now: now), 30);
      expect(daysUntil(now.add(const Duration(hours: 5)), now: now), 1);
      expect(daysUntil(now.subtract(const Duration(hours: 5)), now: now), 0);
      expect(daysLeftLabel(1), 'بعد يوم واحد');
      expect(daysLeftLabel(2), 'بعد يومين');
      expect(daysLeftLabel(7), 'بعد 7 أيام');
      expect(daysLeftLabel(29), 'بعد 29 يوماً');
    });

    testWidgets('the paused page shows the deletion date and days left', (tester) async {
      final scheduled = DateTime.now().add(const Duration(days: 20, hours: 1));
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {
          'user': {...meJson(deactivated: true), 'deletion': {'scheduledFor': scheduled.toUtc().toIso8601String()}},
        }))
        ..on('GET', '/api/pro', const FakeResponse(200, {'enabled': true, 'isPro': false, 'canBuy': true, 'offers': []}));
      final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(container.dispose);
      await tester.runAsync(() => settled(container));
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const PausedScreen())));
      await tester.pump();
      expect(find.text('طلبتِ حذف حسابكِ'), findsOneWidget);
      expect(find.textContaining('بعد 21 يوماً'), findsOneWidget);
      expect(find.text('إلغاء الحذف وإعادة التفعيل'), findsOneWidget);
      // Not Pro: no Pro line (the page reads `/api/pro` where payments show)
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('paused-pro')), findsNothing);
    });
  });

  testWidgets('small phone, large text, keyboard open: the header folds so the field and button stay visible',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final container = ProviderContainer(overrides: await testOverrides(FakeAdapter()));
    addTearDown(container.dispose);
    container.read(pendingAuthProvider.notifier).set(
          const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.login, userExists: true),
        );
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const OtpScreen())));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 300));
    }
    expect(find.byKey(const Key('auth-hero-compact')), findsOneWidget);
    // The number the code went to stays in view
    expect(find.text('إلى \u20660796922292\u2069'), findsOneWidget);
    expect(tester.takeException(), isNull);
    final field = tester.getRect(find.byKey(const Key('otp-field')));
    expect(field.bottom, lessThanOrEqualTo(340));
    final hero = tester.getRect(find.byType(AuthHero));
    expect(hero.height, lessThan(160));
    await tester.pumpWidget(const SizedBox());
  });
}
