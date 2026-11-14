// Audit 2026-11-14 I3: «التوافقات» stays alive in the shell's IndexedStack, so it must reload when shown again and
// when the app comes back, not only after an action on a match page.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/matches/matches_screen.dart';

import 'helpers/fake_api.dart';

void main() {
  late FakeAdapter adapter;
  late GoRouter router;

  Future<void> pumpFor(WidgetTester tester, [int steps = 20]) async {
    for (var i = 0; i < steps; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  int lists() => adapter.to('GET', '/api/matches').length;

  Future<void> start(WidgetTester tester) async {
    adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(), 'gender': 'MALE'}}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {'introRequests': true}}))
      ..on('GET', '/api/matches', const FakeResponse(200, {'matches': [], 'page': 1, 'total': 0, 'totalPages': 1}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    await tester.runAsync(() => settled(container));
    // The screen stays built while another page shows, like the shell's IndexedStack
    router = GoRouter(initialLocation: '/matches', routes: [
      ShellRoute(
        builder: (_, _, child) => Stack(children: [const MatchesScreen(), Offstage(child: child)]),
        routes: [
          GoRoute(path: '/matches', builder: (_, _) => const SizedBox()),
          GoRoute(path: '/suggestions', builder: (_, _) => const SizedBox()),
        ],
      ),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
    await pumpFor(tester);
  }

  testWidgets('back on «التوافقات» from another tab: the list reloads', (tester) async {
    await start(tester);
    expect(lists(), 1);
    router.go('/suggestions');
    await pumpFor(tester);
    expect(lists(), 1);
    router.go('/matches');
    await pumpFor(tester);
    expect(lists(), 2);
  });

  testWidgets('the app comes back while «التوافقات» shows: the list reloads', (tester) async {
    await start(tester);
    expect(lists(), 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await pumpFor(tester, 2);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await pumpFor(tester);
    expect(lists(), 2);
  });

  testWidgets('the app comes back while another tab shows: no reload until «التوافقات» shows', (tester) async {
    await start(tester);
    router.go('/suggestions');
    await pumpFor(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await pumpFor(tester, 2);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await pumpFor(tester);
    expect(lists(), 1);
  });
}
