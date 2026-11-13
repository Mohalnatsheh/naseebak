import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/home/home_screen.dart';

import 'helpers/fake_api.dart';

/// The app home rework (spec 2026-11-13 "Home (both)"): the light header and «بانتظار ردّك». The blocks added on
/// 2026-11-14 (next step, people, chats, tiles, poll, tips) are in home_rich_test.dart.
void main() {
  /// Home under a router whose other routes are named placeholders, so a tap is seen by where it lands
  Future<FakeAdapter> pumpHome(
    WidgetTester tester, {
    Map<String, dynamic> counts = const {},
    bool signedIn = true,
  }) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/me/counts', FakeResponse(200, {
        'flags': {'mutualSuggestions': true},
        ...counts,
      }))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 3}))
      ..on('GET', '/api/polls/current', const FakeResponse(200, {'poll': null}))
      ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}, 'completeness': 100}));
    if (signedIn) adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
    adapter.on('GET', '/api/suggestions/feed', const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1}));
    Widget placeholder(String name) => Scaffold(body: Text('route:$name'));
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/suggestions', builder: (_, s) => placeholder('suggestions?${s.uri.query}')),
      GoRoute(path: '/matches', builder: (_, _) => placeholder('matches')),
      GoRoute(path: '/matches/:id', builder: (_, s) => placeholder('match ${s.pathParameters['id']}')),
      GoRoute(path: '/chats', builder: (_, _) => placeholder('chats')),
      GoRoute(path: '/credits', builder: (_, _) => placeholder('credits')),
      GoRoute(path: '/pro', builder: (_, _) => placeholder('pro')),
      GoRoute(path: '/notifications', builder: (_, _) => placeholder('notifications')),
      GoRoute(path: '/profile/quiz', builder: (_, _) => placeholder('quiz')),
      GoRoute(path: '/profile/edit', builder: (_, _) => placeholder('edit')),
    ]);
    addTearDown(router.dispose);
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlRouterApp(router),
    ));
    await tester.pumpAndSettle();
    return adapter;
  }

  Finder inWaiting(String text) => find.descendant(of: find.byKey(const Key('home-waiting')), matching: find.text(text));

  Future<void> tapAndSettle(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  group('header', () {
    testWidgets('light: greeting + first name, credits pill to /credits, bell with its count, dark status icons',
        (tester) async {
      await pumpHome(tester, counts: {'credits': 7});
      expect(find.text('سارة'), findsOneWidget);
      expect(find.textContaining(RegExp('صباح الخير|مساء الخير')), findsOneWidget);
      expect(find.byKey(const Key('home-status-strip')), findsNothing);
      final region = tester.widget<AnnotatedRegion<SystemUiOverlayStyle>>(
          find.byWidgetPredicate((w) => w is AnnotatedRegion<SystemUiOverlayStyle>).first);
      expect(region.value.statusBarIconBrightness, Brightness.dark);
      expect(find.descendant(of: find.byKey(const Key('bell-badge')), matching: find.text('3')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('credits-pill')), matching: find.text('7')), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('credits-pill')));
      expect(find.text('route:credits'), findsOneWidget);
    });

    test('the greeting word follows Amman time, whatever the device clock', () {
      expect(greetingWord(DateTime.utc(2026, 11, 13, 6)), 'صباح الخير'); // 09:00 Amman
      expect(greetingWord(DateTime.utc(2026, 11, 13, 10)), 'مساء الخير'); // 13:00 Amman
      expect(greetingWord(DateTime.utc(2026, 11, 13, 23)), 'مساء الخير'); // 02:00 Amman
      expect(greetingWord(DateTime.utc(2026, 11, 13, 2)), 'صباح الخير'); // 05:00 Amman
    });
  });

  group('«بانتظار ردّك»', () {
    testWidgets('rows from what the status chips used: requests and matches, gendered; matches to /matches', (tester) async {
      await pumpHome(tester, counts: {'pendingIntros': 1, 'actionableMatches': 2});
      expect(find.text('بانتظار ردّكِ'), findsOneWidget);
      expect(inWaiting('طلب تعارف بانتظار ردّكِ'), findsOneWidget);
      expect(find.text('توافقان ينتظرانكِ'), findsOneWidget);
      expect(find.text('يمكنكِ طلب تعارف عائلي أو محادثة.'), findsOneWidget);
      await tapAndSettle(tester, find.text('توافقان ينتظرانكِ'));
      expect(find.text('route:matches'), findsOneWidget);
    });

    testWidgets('the request row opens the waiting request\'s match (the match list when none is named)', (tester) async {
      await pumpHome(tester, counts: {'pendingIntros': 1, 'pendingIntroMatchId': 'm7'});
      await tapAndSettle(tester, inWaiting('طلب تعارف بانتظار ردّكِ'));
      expect(find.text('route:match m7'), findsOneWidget);
      await pumpHome(tester, counts: {'pendingIntros': 1});
      await tapAndSettle(tester, inWaiting('طلب تعارف بانتظار ردّكِ'));
      expect(find.text('route:matches'), findsOneWidget);
    });

    testWidgets('three requests: the counted form', (tester) async {
      await pumpHome(tester, counts: {'pendingIntros': 3});
      expect(inWaiting('3 طلبات تعارف بانتظار ردّكِ'), findsOneWidget);
      expect(find.byKey(const Key('home-waiting-matches')), findsNothing);
    });

    testWidgets('nothing waiting: no section', (tester) async {
      await pumpHome(tester);
      expect(find.byKey(const Key('home-waiting')), findsNothing);
    });
  });
}
