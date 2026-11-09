import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/routing/router.dart';
import 'package:naseebak_app/core/routing/website_links.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/paused_screen.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/pro/pro_repository.dart';
import 'package:naseebak_app/features/pro/pro_screen.dart';
import 'package:naseebak_app/features/welcome/welcome_state.dart';

import 'helpers/fake_api.dart';

const _proJson = {
  'enabled': true,
  'isPro': true,
  'cancelAtPeriodEnd': true,
  'pastDue': false,
  'canBuy': true,
  'plan': 'monthly',
  'renewsAt': '2026-12-10T00:00:00.000Z',
  'offers': [],
};

/// The real app router, signed in (past the splash and setup)
Future<(ProviderContainer, GoRouter)> _app(WidgetTester tester, {bool appPayments = true, bool deactivated = false}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/mobile/me', FakeResponse(200, {
      'user': {...meJson(deactivated: deactivated), 'appPayments': appPayments},
    }))
    ..on('GET', '/api/pro', const FakeResponse(200, _proJson));
  final container = ProviderContainer(overrides: [
    ...await testOverrides(adapter, store: MemoryTokenStore('t1'), prefs: {'intro_seen': true}),
    chatCacheProvider.overrideWithValue(MemoryChatCache()),
  ]);
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  container.read(splashDoneProvider.notifier).done();
  final router = container.read(routerProvider);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  return (container, router);
}

Future<void> _link(WidgetTester tester, String url) async {
  await tester.binding.handlePushRoute(url);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('a link while «عضوية Pro» is open (Stripe returning) never opens it twice; back goes to home',
      (tester) async {
    final (_, router) = await _app(tester);
    expect(router.state.uri.path, '/home');
    await _link(tester, 'https://naseebak.com/dashboard/pro?pro=success');
    expect(find.byType(ProScreen), findsOneWidget);
    final first = tester.state(find.byType(ProScreen));
    await _link(tester, 'https://naseebak.com/dashboard/pro?pro=success');
    expect(find.byType(ProScreen, skipOffstage: false), findsOneWidget);
    // The same screen stays (its own return poll runs once), not a fresh copy
    expect(identical(tester.state(find.byType(ProScreen)), first), isTrue);
    router.pop();
    await tester.pump(const Duration(milliseconds: 400));
    expect(router.state.uri.path, '/home');
  });

  testWidgets('the newest link wins and a handled one never opens again', (tester) async {
    final (_, router) = await _app(tester);
    await _link(tester, 'https://naseebak.com/dashboard/pro');
    await _link(tester, 'https://naseebak.com/dashboard/notifications');
    expect(router.state.uri.path, '/notifications');
    router.pop();
    await tester.pump(const Duration(milliseconds: 400));
    router.pop();
    await tester.pump(const Duration(milliseconds: 400));
    expect(router.state.uri.path, '/home');
    // Opening a tab and coming home never replays a link
    router.go('/matches');
    await tester.pump(const Duration(milliseconds: 300));
    router.go('/home');
    await tester.pump(const Duration(milliseconds: 300));
    expect(router.state.uri.path, '/home');
    expect(find.byType(ProScreen, skipOffstage: false), findsNothing);
  });

  testWidgets('old /credits?section=pro links open the Pro screen (route level)', (tester) async {
    final (_, router) = await _app(tester);
    router.push('/credits?section=pro');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(ProScreen), findsOneWidget);
  });

  testWidgets('a test or review account (payments hidden) reaching /pro lands on home: Pro is never named',
      (tester) async {
    final (_, router) = await _app(tester, appPayments: false);
    await _link(tester, 'https://naseebak.com/dashboard/pro');
    expect(find.byType(ProScreen, skipOffstage: false), findsNothing);
    expect(router.state.uri.path, '/home');
  });

  testWidgets('a paused member sees the Pro renewal and can open «عضوية Pro» from the paused page', (tester) async {
    final (_, router) = await _app(tester, deactivated: true);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(PausedScreen), findsOneWidget);
    expect(find.byKey(const Key('paused-pro')), findsOneWidget);
    expect(find.textContaining('لا يتجدد بعد الآن'), findsOneWidget);
    await tester.tap(find.byKey(const Key('paused-pro-open')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(ProScreen), findsOneWidget);
    // Anything else still leads back to the paused page
    router.go('/home');
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(PausedScreen), findsOneWidget);
  });

  testWidgets('back on another tab goes to «الرئيسية» before leaving the app', (tester) async {
    final (_, router) = await _app(tester);
    router.go('/account');
    await tester.pump(const Duration(milliseconds: 400));
    final handled = await tester.binding.handlePopRoute();
    await tester.pump(const Duration(milliseconds: 400));
    expect(handled, isTrue);
    expect(router.state.uri.path, '/home');
  });

  test('pausedProText: renewal stopped, or still renewing, or nothing for a member without Pro', () {
    final end = DateTime.utc(2026, 12, 10);
    expect(pausedProText(MyProState(isPro: true, cancelAtPeriodEnd: true, renewsAt: end), female: true),
        allOf(contains('لا يتجدد بعد الآن'), contains('يمكنكِ')));
    expect(pausedProText(MyProState(isPro: true, renewsAt: end), female: false), contains('إيقاف التجديد'));
    expect(pausedProText(const MyProState(), female: false), isNull);
  });

  testWidgets('a link that arrives while the app is still starting is kept and opens on home', (tester) async {
    EarlyLinks.instance.start();
    final handled = await tester.binding.handlePushRoute('https://naseebak.com/dashboard/notifications');
    expect(handled, isTrue);
    final (_, router) = await _app(tester);
    await tester.pump(const Duration(milliseconds: 400));
    expect(router.state.uri.path, '/notifications');
    // Taken once: nothing caught any more
    expect(EarlyLinks.instance.take(), isNull);
  });

  testWidgets('a link during the splash waits and opens once home shows', (tester) async {
    final (container, router) = await _app(tester);
    container.invalidate(splashDoneProvider);
    router.go('/splash');
    await tester.pump(const Duration(milliseconds: 200));
    await _link(tester, 'https://naseebak.com/dashboard/notifications');
    expect(router.state.uri.path, '/splash');
    container.read(splashDoneProvider.notifier).done();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    expect(router.state.uri.path, '/notifications');
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('a referral link that arrives while the app is starting keeps its invitation code', (tester) async {
    EarlyLinks.instance.start();
    await tester.binding.handlePushRoute('https://naseebak.com/register?invitationCode=AB12CD34');
    final (container, _) = await _app(tester);
    expect(container.read(sharedPreferencesProvider).getString(pendingInvitationKey), 'AB12CD34');
  });
}
