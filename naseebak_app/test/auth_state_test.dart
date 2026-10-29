import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/network/api_exception.dart';
import 'package:naseebak_app/core/routing/router.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/me.dart';
import 'package:naseebak_app/features/home/counts.dart';

import 'helpers/fake_api.dart';

Future<AuthState> settled(ProviderContainer c) async {
  c.read(authControllerProvider);
  for (var i = 0; i < 50 && c.read(authControllerProvider).status == AuthStatus.unknown; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  return c.read(authControllerProvider);
}

void main() {
  group('AuthController', () {
    test('no saved token → signed out', () async {
      final c = ProviderContainer(overrides: await testOverrides(FakeAdapter()));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.signedOut);
    });

    test('a saved token restores the session from /api/mobile/me', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
      addTearDown(c.dispose);
      final s = await settled(c);
      expect(s.status, AuthStatus.signedIn);
      expect(s.me!.firstName, 'سارة');
      expect(s.me!.country.code, 'JO');
      // The member's country is remembered for the next sign-in
      expect(c.read(selectedCountryCodeProvider), 'JO');
    });

    test('a revoked token (401) signs out and forgets the token', () async {
      final store = MemoryTokenStore('old');
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse(401, {'error': 'غير مصرح'}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: store));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.signedOut);
      expect(await store.read(), isNull);
    });

    test('offline at launch keeps the token and offers a retry', () async {
      final store = MemoryTokenStore('t1');
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse.network());
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: store));
      addTearDown(c.dispose);
      expect((await settled(c)).status, AuthStatus.restoreFailed);
      expect(await store.read(), 't1');
    });

    test('signInWithCode stores the token; logout revokes and clears it even offline', () async {
      final store = MemoryTokenStore();
      final adapter = FakeAdapter()
        ..on('POST', '/api/mobile/auth/token',
            FakeResponse(201, {'token': 'nsb_new', 'expiresAt': '2026-12-28T00:00:00Z', 'user': meJson(country: 'SA')}))
        ..on('POST', '/api/mobile/auth/logout', const FakeResponse.network());
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: store));
      addTearDown(c.dispose);
      await settled(c);
      final me = await c.read(authControllerProvider.notifier).signInWithCode(phone: '0500000772', code: '111111');
      expect(me.country.code, 'SA');
      expect(await store.read(), 'nsb_new');
      expect(c.read(authControllerProvider).isSignedIn, isTrue);
      final body = adapter.to('POST', '/api/mobile/auth/token').single.data as Map;
      expect(body['phone'], '0500000772');
      expect(body['code'], '111111');

      await c.read(authControllerProvider.notifier).logout();
      expect(c.read(authControllerProvider).status, AuthStatus.signedOut);
      expect(await store.read(), isNull);
    });

    test('a 401 from any later call signs the member out', () async {
      final store = MemoryTokenStore('t1');
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('GET', '/api/me/counts', const FakeResponse(401, {'error': 'غير مصرح'}));
      final c = ProviderContainer(overrides: await testOverrides(adapter, store: store));
      addTearDown(c.dispose);
      expect((await settled(c)).isSignedIn, isTrue);
      await expectLater(c.read(apiClientProvider).get('/api/me/counts'), throwsA(isA<ApiException>()));
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(c.read(authControllerProvider).status, AuthStatus.signedOut);
      expect(await store.read(), isNull);
    });
  });

  test('member-scoped caches (counts) reload when another member signs in', () async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}, 'unreadChats': 0}))
      ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}))
      ..on('POST', '/api/mobile/auth/token',
          FakeResponse(201, {'token': 'nsb_2', 'expiresAt': '2026-12-28T00:00:00Z', 'user': {...meJson(country: 'SA'), 'id': 'u2'}}));
    final c = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(c.dispose);
    await settled(c);
    final sub = c.listen(countsProvider, (_, _) {});
    addTearDown(sub.close);
    expect((await c.read(countsProvider.future)).unreadChats, 0);

    adapter.on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}, 'unreadChats': 1}));
    await c.read(authControllerProvider.notifier).logout();
    await c.read(authControllerProvider.notifier).signInWithCode(phone: '0500000772', code: '111111');
    expect((await c.read(countsProvider.future)).unreadChats, 1);
  });

  group('route guard', () {
    final me = Me.fromJson(meJson());
    AuthState signedIn(Me m) => AuthState(AuthStatus.signedIn, me: m);

    test('no country → country picker', () {
      expect(guardRedirect(location: '/splash', countryCode: null, auth: const AuthState.signedOut()), '/country');
      expect(guardRedirect(location: '/country', countryCode: null, auth: const AuthState.signedOut()), isNull);
    });

    test('restoring → splash; signed out → phone (country picker still reachable)', () {
      expect(guardRedirect(location: '/home', countryCode: 'JO', auth: const AuthState.unknown()), '/splash');
      expect(guardRedirect(location: '/home', countryCode: 'JO', auth: const AuthState.signedOut()), '/auth/phone');
      expect(guardRedirect(location: '/auth/otp', countryCode: 'JO', auth: const AuthState.signedOut()), isNull);
      expect(guardRedirect(location: '/country', countryCode: 'JO', auth: const AuthState.signedOut()), isNull);
    });

    test('signed in: paused → paused screen, incomplete → setup, else home', () {
      final paused = Me.fromJson(meJson(deactivated: true));
      final incomplete = Me.fromJson(meJson(complete: false));
      expect(guardRedirect(location: '/home', countryCode: 'JO', auth: signedIn(paused)), '/paused');
      expect(guardRedirect(location: '/home', countryCode: 'JO', auth: signedIn(incomplete)), '/onboarding');
      expect(guardRedirect(location: '/profile/guardian', countryCode: 'JO', auth: signedIn(incomplete)), isNull);
      expect(guardRedirect(location: '/auth/phone', countryCode: 'JO', auth: signedIn(me)), '/home');
      expect(guardRedirect(location: '/country', countryCode: 'JO', auth: signedIn(me)), '/home');
      expect(guardRedirect(location: '/chats/c1', countryCode: 'JO', auth: signedIn(me)), isNull);
    });
  });
}
