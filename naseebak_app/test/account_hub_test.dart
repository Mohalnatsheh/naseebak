import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/settings/settings_screen.dart';

import 'helpers/fake_api.dart';

Future<ProviderContainer> _signedIn(
  WidgetTester tester, {
  bool pro = false,
  bool payments = true,
  bool withProfile = true,
}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(credits: 7), 'appPayments': payments}}))
    ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}))
    ..on(
        'GET',
        '/api/pro',
        pro
            ? const FakeResponse(200, {'enabled': true, 'isPro': true, 'plan': 'monthly', 'canBuy': true})
            : const FakeResponse(200, {'enabled': true, 'canBuy': true}));
  if (withProfile) {
    final born = DateTime.now().subtract(const Duration(days: 365 * 30 + 30));
    adapter.on(
        'GET',
        '/api/profile',
        FakeResponse(200, {
          'user': {
            'firstName': 'سارة',
            'profile': {'dateOfBirth': born.toIso8601String()},
          },
          'completeness': {'percentage': 80, 'sections': []},
        }));
  }
  final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  await tester.runAsync(() => settled(container));
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  return container;
}

Future<void> _pump(WidgetTester tester, ProviderContainer container) async {
  final router = GoRouter(
    initialLocation: '/account',
    routes: [
      GoRoute(path: '/account', builder: (_, _) => const AccountScreen()),
      for (final p in ['/profile', '/credits', '/pro', '/profile/preferences', '/profile/photos', '/referral', '/settings', '/support'])
        GoRoute(path: p, builder: (_, _) => Scaffold(body: Text('at $p'))),
    ],
  );
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  testWidgets('profile card: name, age, completeness, opens /profile; own initial avatar', (tester) async {
    final c = await _signedIn(tester);
    await _pump(tester, c);
    expect(find.text('سارة أحمد، 30'), findsOneWidget);
    expect(find.text('الملف الشخصي · مكتمل 80%'), findsOneWidget);
    expect(find.text('Pro'), findsNothing);
    expect(find.byType(Image), findsNothing);
    await tester.tap(find.byKey(const Key('account-profile-card')));
    await tester.pumpAndSettle();
    expect(find.text('at /profile'), findsOneWidget);
  });

  testWidgets('unknown profile: name alone, no percentage', (tester) async {
    final c = await _signedIn(tester, withProfile: false);
    await _pump(tester, c);
    expect(find.text('سارة أحمد'), findsOneWidget);
    expect(find.text('الملف الشخصي'), findsOneWidget);
  });

  testWidgets('groups in order with values; Pro badge and plan for a Pro member', (tester) async {
    final c = await _signedIn(tester, pro: true);
    await _pump(tester, c);
    expect(find.text('Pro'), findsOneWidget);
    expect(find.text('شهري'), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
    expect(find.text('مخفية حتى التوافق'), findsOneWidget);
    var last = -1.0;
    for (final t in ['الرصيد', 'عضوية Pro', 'ما أبحث عنه', 'صوري', 'ادعُ صديقاً', 'الإعدادات', 'المساعدة والدعم']) {
      final y = tester.getTopLeft(find.text(t)).dy;
      expect(y, greaterThan(last), reason: t);
      last = y;
    }
  });

  testWidgets('rows open their routes', (tester) async {
    final expected = {
      'الرصيد': '/credits',
      'عضوية Pro': '/pro',
      'ما أبحث عنه': '/profile/preferences',
      'صوري': '/profile/photos',
      'ادعُ صديقاً': '/referral',
      'الإعدادات': '/settings',
      'المساعدة والدعم': '/support',
    };
    for (final e in expected.entries) {
      final c = await _signedIn(tester);
      await _pump(tester, c);
      await tester.tap(find.text(e.key));
      await tester.pumpAndSettle();
      expect(find.text('at ${e.value}'), findsOneWidget, reason: e.key);
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('a member without app payments gets no Pro row', (tester) async {
    final c = await _signedIn(tester, payments: false);
    await _pump(tester, c);
    expect(find.byKey(const Key('menu-pro')), findsNothing);
    expect(find.text('الرصيد'), findsOneWidget);
  });
}
