import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/routing/router.dart' show creditsRedirect;
import 'package:naseebak_app/features/notifications/notifications_screen.dart';

void main() {
  group('notification links → app screens', () {
    // Every link shape the server sends (notify() urls, src/lib/notification-links.ts)
    const cases = {
      '/dashboard/chats/c1': '/chats/c1',
      '/dashboard/chats': '/chats',
      '/dashboard/matches?match=m1': '/matches/m1',
      '/dashboard/matches': '/matches',
      '/dashboard/suggestions': '/suggestions',
      '/dashboard/suggestions?tab=interested': '/suggestions?tab=interested',
      '/dashboard/suggestions?tab=matches&match=m1': '/matches/m1',
      '/dashboard/suggestions?tab=matches': '/matches',
      '/dashboard/payments': '/credits',
      // Pro has its own page (website /dashboard/pro, Pro notices since 2026-11-10)
      '/dashboard/pro': '/pro',
      '/dashboard/pro?pro=success': '/pro',
      '/dashboard/payments?section=pro': '/pro',
      '/dashboard/support': '/support',
      '/dashboard/profile': '/profile',
      '/dashboard/profile/edit': '/profile/edit',
      '/dashboard/referral': '/referral',
      '/dashboard/notifications': '/notifications',
    };
    for (final e in cases.entries) {
      test(e.key, () => expect(appRouteForLink(url: e.key), e.value));
    }

    test('no link: the type decides; unknown → home', () {
      expect(appRouteForLink(type: 'CHAT'), '/chats');
      expect(appRouteForLink(type: 'PAYMENT'), '/credits');
      expect(appRouteForLink(url: '/dashboard', type: 'SYSTEM'), '/home');
      expect(appRouteForLink(url: '/blog/x'), '/home');
    });
  });

  test('/credits?section=pro (old links) opens the Pro screen; /credits stays', () {
    expect(creditsRedirect(Uri.parse('/credits?section=pro')), '/pro');
    expect(creditsRedirect(Uri.parse('/credits')), isNull);
  });

  group('openAppRoute', () {
    late GoRouter router;
    Widget page(String name) => Scaffold(body: Text(name));

    setUp(() {
      router = GoRouter(initialLocation: '/home', routes: [
        ShellRoute(
          builder: (_, _, child) => child,
          routes: [
            GoRoute(path: '/home', builder: (_, _) => page('home')),
            GoRoute(path: '/matches', builder: (_, _) => page('matches')),
          ],
        ),
        GoRoute(path: '/chats/:id', builder: (_, s) => page('chat ${s.pathParameters['id']}')),
      ]);
      addTearDown(router.dispose);
    });

    testWidgets('a tab is switched to, a detail screen is pushed, the open one is not stacked again', (tester) async {
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));

      openAppRoute(router, '/chats/c1');
      await tester.pumpAndSettle();
      expect(find.text('chat c1'), findsOneWidget);
      expect(router.state.uri.toString(), '/chats/c1');

      // A second push for the chat being read: nothing new on the stack
      openAppRoute(router, '/chats/c1');
      await tester.pumpAndSettle();
      router.pop();
      await tester.pumpAndSettle();
      expect(find.text('home'), findsOneWidget);

      // A tab: switched to (go), not pushed over the shell
      openAppRoute(router, '/chats/c2');
      await tester.pumpAndSettle();
      openAppRoute(router, '/matches');
      await tester.pumpAndSettle();
      expect(find.text('matches'), findsOneWidget);
      expect(router.canPop(), isFalse);
    });
  });
}
