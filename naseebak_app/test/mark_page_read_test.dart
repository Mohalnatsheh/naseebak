import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/features/notifications/mark_page_read.dart';

import 'helpers/fake_api.dart';

void main() {
  testWidgets('a tab marks its notices read when shown, and again on every return', (tester) async {
    final adapter = FakeAdapter()..on('POST', '/api/notifications/read-for-page', const FakeResponse(200, {'marked': 1}));
    final router = GoRouter(initialLocation: '/suggestions', routes: [
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => shell,
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/suggestions',
              builder: (_, _) => const MarkPageRead(path: '/dashboard/suggestions', tab: '/suggestions', child: Text('s')),
            ),
          ]),
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const Text('home'))]),
        ],
      ),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: await testOverrides(adapter),
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();
    List<Object?> marks() => adapter.to('POST', '/api/notifications/read-for-page').map((r) => (r.data as Map)['path']).toList();
    expect(marks(), ['/dashboard/suggestions']);

    router.go('/home');
    await tester.pumpAndSettle();
    router.go('/suggestions');
    await tester.pumpAndSettle();
    expect(marks(), ['/dashboard/suggestions', '/dashboard/suggestions']);
  });
}
