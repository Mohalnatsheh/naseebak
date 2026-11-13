import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/home/home_screen.dart';
import 'package:naseebak_app/features/home/poll_card.dart';
import 'package:naseebak_app/shared/widgets/brand_kit.dart';

import 'helpers/fake_api.dart';

/// The app home rework (spec 2026-11-13 "Home (both)"): light header, then what waits on me, who said «مهتم», today,
/// and «المزيد».
void main() {
  Map<String, dynamic> person(String id, String name) => {
        'kind': 'mutual',
        'id': id,
        'compatibilityScore': 80,
        'reason': '',
        'likedYou': true,
        'candidate': {'id': 'u$id', 'firstName': name, 'age': 27, 'city': 'عمّان'},
      };

  /// Home under a router whose other routes are named placeholders, so a tap is seen by where it lands
  Future<FakeAdapter> pumpHome(
    WidgetTester tester, {
    Map<String, dynamic> counts = const {},
    List<Map<String, dynamic>> interested = const [],
    FakeResponse? interestedResponse,
    Map<String, dynamic>? poll,
    Map<String, dynamic>? profile,
    bool signedIn = true,
  }) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/me/counts', FakeResponse(200, {
        'flags': {'mutualSuggestions': true},
        ...counts,
      }))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 3}))
      ..on('GET', '/api/polls/current', FakeResponse(200, {'poll': poll}))
      ..on('GET', '/api/profile', FakeResponse(200, profile ?? {'user': {}, 'completeness': 100}));
    if (signedIn) adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
    adapter.handlers['GET /api/suggestions/feed'] = (r) => r.queryParameters['tab'] == 'interested'
        ? (interestedResponse ?? FakeResponse(200, {'items': interested, 'page': 1, 'totalPages': 1}))
        : const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1});
    Widget placeholder(String name) => Scaffold(body: Text('route:$name'));
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/suggestions', builder: (_, s) => placeholder('suggestions?${s.uri.query}')),
      GoRoute(path: '/matches', builder: (_, _) => placeholder('matches')),
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
    testWidgets('rows from what the status chips used: requests and matches, gendered, to /matches', (tester) async {
      await pumpHome(tester, counts: {'pendingIntros': 1, 'actionableMatches': 2});
      expect(find.text('بانتظار ردّكِ'), findsOneWidget);
      expect(find.text('طلب تعارف بانتظار ردّكِ'), findsOneWidget);
      expect(find.text('توافقان ينتظرانكِ'), findsOneWidget);
      expect(find.text('يمكنكِ طلب تعارف عائلي أو محادثة.'), findsOneWidget);
      await tapAndSettle(tester, find.text('طلب تعارف بانتظار ردّكِ'));
      expect(find.text('route:matches'), findsOneWidget);
    });

    testWidgets('three requests: the counted form', (tester) async {
      await pumpHome(tester, counts: {'pendingIntros': 3});
      expect(find.text('3 طلبات تعارف بانتظار ردّكِ'), findsOneWidget);
      expect(find.byKey(const Key('home-waiting-matches')), findsNothing);
    });

    testWidgets('nothing waiting: no section', (tester) async {
      await pumpHome(tester);
      expect(find.byKey(const Key('home-waiting')), findsNothing);
    });
  });

  group('«مهتمون بك»', () {
    testWidgets('up to 3 people with locked avatars; a tap opens the suggestions tab «مهتمون بك»', (tester) async {
      feedTabRequest.tab = null;
      await pumpHome(tester, counts: {'likedYou': 4}, interested: [
        person('1', 'جنى'),
        person('2', 'لينا'),
        person('3', 'دانة'),
        person('4', 'ريم'),
      ]);
      expect(find.text('مهتمون بكِ'), findsOneWidget);
      expect(find.text('جنى، 27'), findsOneWidget);
      expect(find.text('دانة، 27'), findsOneWidget);
      expect(find.text('ريم، 27'), findsNothing);
      final avatars = tester.widgetList<MemberAvatar>(
          find.descendant(of: find.byKey(const Key('home-interested')), matching: find.byType(MemberAvatar)));
      expect(avatars.length, 3);
      expect(avatars.every((a) => a.locked && a.photo == null), isTrue);
      // No free-reply note while the switch is off
      expect(find.textContaining('مجاني'), findsNothing);
      await tapAndSettle(tester, find.text('لينا، 27'));
      expect(find.text('route:suggestions?tab=interested'), findsOneWidget);
      expect(feedTabRequest.tab, FeedTab.interested);
    });

    testWidgets('free-reply note only while the switch is on', (tester) async {
      await pumpHome(tester,
          counts: {
            'flags': {'mutualSuggestions': true, 'freeInterestReply': true},
          },
          interested: [person('1', 'جنى')]);
      expect(find.text('ردّكِ بـ«مهتم» على من اهتم بكِ مجاني.'), findsOneWidget);
    });

    testWidgets('empty: hidden', (tester) async {
      await pumpHome(tester);
      expect(find.byKey(const Key('home-interested')), findsNothing);
    });

    testWidgets('a failed load shows a retry, never an empty state; the retry loads it', (tester) async {
      final adapter = await pumpHome(tester, interestedResponse: const FakeResponse(500, {'error': 'خطأ'}));
      expect(find.byKey(const Key('home-interested-error')), findsOneWidget);
      expect(find.byKey(const Key('home-interested')), findsNothing);
      adapter.handlers['GET /api/suggestions/feed'] = (r) => r.queryParameters['tab'] == 'interested'
          ? const FakeResponse(200, {
              'items': [
                {
                  'kind': 'mutual',
                  'id': '9',
                  'compatibilityScore': 80,
                  'reason': '',
                  'likedYou': true,
                  'candidate': {'id': 'u9', 'firstName': 'جنى', 'age': 27},
                },
              ],
              'page': 1,
              'totalPages': 1,
            })
          : const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1});
      await tapAndSettle(tester,
          find.descendant(of: find.byKey(const Key('home-interested-error')), matching: find.text('إعادة المحاولة')));
      expect(find.byKey(const Key('home-interested-error')), findsNothing);
      expect(find.text('جنى، 27'), findsOneWidget);
    });
  });

  group('«اليوم»', () {
    testWidgets('«اقتراحات جديدة» with its count to «جديدة»; «المحادثات» with unread when chat is on', (tester) async {
      await pumpHome(tester, counts: {
        'flags': {'mutualSuggestions': true, 'chat': true},
        'newSuggestions': 8,
        'unreadChats': 2,
      });
      final fresh = find.byKey(const Key('home-today-new'));
      expect(find.descendant(of: fresh, matching: find.text('اقتراحات جديدة')), findsOneWidget);
      expect(find.descendant(of: fresh, matching: find.text('8')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('home-today-chats')), matching: find.text('2')), findsOneWidget);
      await tapAndSettle(tester, fresh);
      expect(find.text('route:suggestions?tab=new'), findsOneWidget);
    });

    testWidgets('chat off: no «المحادثات» row', (tester) async {
      await pumpHome(tester, counts: {'newSuggestions': 1});
      expect(find.byKey(const Key('home-today-new')), findsOneWidget);
      expect(find.byKey(const Key('home-today-chats')), findsNothing);
    });

    testWidgets('chats row opens the chats tab', (tester) async {
      await pumpHome(tester, counts: {
        'flags': {'mutualSuggestions': true, 'chat': true},
        'newSuggestions': 0,
      });
      await tapAndSettle(tester, find.byKey(const Key('home-today-chats')));
      expect(find.text('route:chats'), findsOneWidget);
    });
  });

  group('«المزيد»', () {
    const activePoll = {
      'id': 'p1',
      'question': 'ما أهم صفة في شريك الحياة؟',
      'options': [
        {'id': 'a', 'label': 'الصدق'},
        {'id': 'b', 'label': 'الهدوء'},
      ],
      'status': 'ACTIVE',
      'myVote': null,
    };

    testWidgets('poll row with «جديد» while unanswered opens a sheet with the poll card', (tester) async {
      await pumpHome(tester, poll: activePoll);
      final row = find.byKey(const Key('home-more-poll'));
      expect(find.descendant(of: row, matching: find.text('سؤال الأسبوع')), findsOneWidget);
      expect(find.descendant(of: row, matching: find.text('جديد')), findsOneWidget);
      await tapAndSettle(tester, row);
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.descendant(of: find.byType(BottomSheet), matching: find.byType(PollCard)), findsOneWidget);
    });

    testWidgets('answered poll: no «جديد»; no poll: no row', (tester) async {
      await pumpHome(tester, poll: {...activePoll, 'myVote': 'a'});
      expect(find.descendant(of: find.byKey(const Key('home-more-poll')), matching: find.text('جديد')), findsNothing);
      await pumpHome(tester);
      expect(find.byKey(const Key('home-more-poll')), findsNothing);
    });

    testWidgets('profile row only below 100%, to the first unfinished section', (tester) async {
      await pumpHome(tester, profile: {
        'user': {},
        'completeness': {
          'total': 80,
          'sections': [
            {'key': 'basic', 'label': 'المعلومات الأساسية', 'percentage': 100},
            {'key': 'quiz', 'label': 'اختبار الشخصية', 'percentage': 0, 'missingFields': ['اختبار الشخصية']},
          ],
        },
      });
      expect(find.text('ملفكِ مكتمل 80%'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('home-more-profile')));
      expect(find.text('route:quiz'), findsOneWidget);
    });

    testWidgets('a complete profile: no row', (tester) async {
      await pumpHome(tester);
      expect(find.byKey(const Key('home-more-profile')), findsNothing);
    });

    testWidgets('Pro row only when counts say the page shows (and not Pro yet), to /pro', (tester) async {
      await pumpHome(tester, counts: {
        'pro': {'isPro': false, 'showPage': true},
      });
      await tapAndSettle(tester, find.byKey(const Key('home-more-pro')));
      expect(find.text('route:pro'), findsOneWidget);
    });

    testWidgets('no Pro row without showPage', (tester) async {
      await pumpHome(tester, counts: {
        'pro': {'isPro': false, 'showPage': false},
      });
      expect(find.byKey(const Key('home-more-pro')), findsNothing);
    });
  });

  testWidgets('order: waiting, interested, today, more; no «اقتراحات اليوم» strip', (tester) async {
    tester.view.physicalSize = const Size(400, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pumpHome(tester,
        counts: {'pendingIntros': 1, 'newSuggestions': 2, 'pro': {'isPro': false, 'showPage': true}},
        interested: [person('1', 'جنى')]);
    double y(String key) => tester.getTopLeft(find.byKey(Key(key))).dy;
    expect(y('home-waiting'), lessThan(y('home-interested')));
    expect(y('home-interested'), lessThan(y('home-today')));
    expect(y('home-today'), lessThan(y('home-more')));
    expect(find.text('اقتراحات اليوم'), findsNothing);
    expect(find.byKey(const Key('status-new')), findsNothing);
  });
}
