import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/home/home_screen.dart';
import 'package:naseebak_app/features/home/widgets/home_chats_block.dart';
import 'package:naseebak_app/features/home/poll_card.dart';
import 'package:naseebak_app/features/home/widgets/home_tips.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';
import 'package:naseebak_app/shared/widgets/brand_kit.dart';

import 'helpers/fake_api.dart';

/// The richer home (spec 2026-11-14): order, the chats block, «حسابي» tiles, the inline poll and the quiet member's
/// tips, on the real HomeScreen.
void main() {
  Map<String, dynamic> person(String id, String name, {bool likedYou = false}) => {
    'kind': 'mutual',
    'id': id,
    'compatibilityScore': 82,
    'reason': 'نفس المدينة',
    'likedYou': likedYou,
    'activity': 'نشط اليوم',
    'candidate': {'id': 'u$id', 'firstName': name, 'age': 30, 'city': 'إربد'},
  };

  Map<String, dynamic> chat(
    String id,
    String name, {
    String? last,
    bool mine = false,
    int unread = 0,
    String status = 'ACTIVE',
  }) => {
    'id': id,
    'matchId': 'm$id',
    'partner': {'id': 'p$id', 'firstName': name},
    'status': status,
    'expiresAt': DateTime.now().add(const Duration(days: 5)).toUtc().toIso8601String(),
    'lastMessage': last == null
        ? null
        : {'body': last, 'createdAt': DateTime.now().toUtc().toIso8601String(), 'mine': mine, 'read': false},
    'unread': unread,
  };

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

  Map<String, dynamic> profile(int pct, {String? about, List<Map<String, dynamic>> sections = const []}) => {
    'user': {
      'profile': {'aboutMe': about},
    },
    'completeness': {'total': pct, 'sections': sections},
  };

  const quizMissing = [
    {'key': 'basic', 'label': 'المعلومات الأساسية', 'percentage': 100},
    {
      'key': 'quiz',
      'label': 'اختبار الشخصية',
      'percentage': 0,
      'missingFields': ['اختبار الشخصية'],
    },
  ];

  Map<String, dynamic> page(List<Map<String, dynamic>> items) => {'items': items, 'page': 1, 'totalPages': 1};

  // The privacy channel: record whether home asks for protection (and keep the test output free of MissingPluginException)
  final secureCalls = <bool>[];
  setUp(() {
    secureCalls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('naseebak/system'),
      (call) async {
        if (call.method == 'setSecure') secureCalls.add(call.arguments == true);
        return false;
      },
    );
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('naseebak/system'),
      null,
    );
  });

  /// The real home under a router whose other routes are named placeholders
  Future<FakeAdapter> pumpHome(
    WidgetTester tester, {
    Map<String, dynamic> counts = const {},
    Map<String, dynamic> flags = const {},
    List<Map<String, dynamic>> fresh = const [],
    List<Map<String, dynamic>> interested = const [],
    List<Map<String, dynamic>> chats = const [],
    FakeResponse? chatsResponse,
    Map<String, dynamic>? poll,
    FakeResponse? pollResponse,
    FakeResponse? profileResponse,
    bool appPayments = true,
    bool pollsOn = true,
    bool tall = true,
    double width = 400,
    bool selling = true,
  }) async {
    if (tall) {
      tester.view.physicalSize = Size(width, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }
    final me = {
      ...meJson(),
      'appPayments': appPayments,
      'country': {
        ...joJson,
        'features': {'polls': pollsOn},
        'purchasesEnabled': selling,
      },
    };
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': me}))
      ..on(
        'GET',
        '/api/me/counts',
        FakeResponse(200, {
          'flags': {'mutualSuggestions': true, ...flags},
          ...counts,
        }),
      )
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}))
      ..on('GET', '/api/polls/current', pollResponse ?? FakeResponse(200, {'poll': poll}))
      ..on('GET', '/api/chats', chatsResponse ?? FakeResponse(200, {'conversations': chats}))
      ..on('GET', '/api/profile', profileResponse ?? FakeResponse(200, profile(100, about: 'نبذة')));
    adapter.handlers['GET /api/suggestions/feed'] = (r) => switch (r.queryParameters['tab']) {
      'new' => FakeResponse(200, page(fresh)),
      'interested' => FakeResponse(200, page(interested)),
      _ => FakeResponse(200, page(const [])),
    };
    Widget placeholder(String name) => Scaffold(body: Text('route:$name'));
    final router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
        GoRoute(path: '/suggestions', builder: (_, s) => placeholder('suggestions?${s.uri.query}')),
        GoRoute(path: '/matches', builder: (_, _) => placeholder('matches')),
        GoRoute(path: '/matches/:id', builder: (_, s) => placeholder('match ${s.pathParameters['id']}')),
        GoRoute(path: '/chats', builder: (_, _) => placeholder('chats')),
        GoRoute(path: '/chats/:id', builder: (_, s) => placeholder('chat ${s.pathParameters['id']}')),
        GoRoute(path: '/credits', builder: (_, _) => placeholder('credits')),
        GoRoute(path: '/pro', builder: (_, _) => placeholder('pro')),
        GoRoute(path: '/notifications', builder: (_, _) => placeholder('notifications')),
        GoRoute(path: '/profile/quiz', builder: (_, _) => placeholder('quiz')),
        GoRoute(path: '/profile/edit', builder: (_, _) => placeholder('edit')),
        GoRoute(path: '/profile/preferences', builder: (_, _) => placeholder('preferences')),
      ],
    );
    addTearDown(router.dispose);
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
        child: rtlRouterApp(router),
      ),
    );
    await tester.pumpAndSettle();
    return adapter;
  }

  Future<void> tapAndSettle(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Finder inKey(String key, Finder f) => find.descendant(of: find.byKey(Key(key)), matching: f);

  /// A member with something in every block
  Future<FakeAdapter> pumpBusy(WidgetTester tester, {bool tall = true, double width = 400}) => pumpHome(
    tester,
    tall: tall,
    width: width,
    flags: {'chat': true, 'freeInterestReply': true},
    counts: {
      'pendingIntros': 1,
      'newSuggestions': 2,
      'likedYou': 1,
      'unreadChats': 1,
      'credits': 7,
      'pro': {'isPro': false, 'showPage': true},
    },
    fresh: [person('1', 'عمر'), person('2', 'خالد')],
    interested: [person('3', 'سامر', likedYou: true)],
    chats: [
      chat('c1', 'يوسف', last: 'أهلاً وسهلاً', unread: 2),
      chat('c2', 'زياد', last: 'شكراً', mine: true),
      chat('c3', 'فادي', last: 'مرحباً'),
    ],
    poll: activePoll,
    profileResponse: FakeResponse(200, profile(80, sections: quizMissing)),
  );

  group('order', () {
    testWidgets('busy member: next step, waiting, suggestions, interested, chats, tiles, poll; no tips', (
      tester,
    ) async {
      await pumpBusy(tester);
      double y(String key) => tester.getTopLeft(find.byKey(Key(key))).dy;
      final order = [
        'next-step-card',
        'home-waiting',
        'home-suggestions',
        'home-interested-cards',
        'home-chats',
        'home-tiles',
        'home-poll',
      ];
      for (var i = 1; i < order.length; i++) {
        expect(y(order[i - 1]), lessThan(y(order[i])), reason: '${order[i - 1]} above ${order[i]}');
      }
      expect(find.byKey(const Key('home-tips')), findsNothing);
      // The old blocks are gone
      expect(find.byKey(const Key('home-today')), findsNothing);
      expect(find.byKey(const Key('home-more')), findsNothing);
      expect(find.byKey(const Key('home-interested')), findsNothing);
    });

    testWidgets('quiet member: next step, tips, tiles, poll; no empty people or chat blocks', (tester) async {
      await pumpHome(
        tester,
        flags: {'chat': true},
        counts: {'credits': 3},
        poll: activePoll,
        profileResponse: FakeResponse(200, profile(100)),
      );
      for (final k in ['home-waiting', 'home-suggestions', 'home-interested-cards', 'home-chats']) {
        expect(find.byKey(Key(k)), findsNothing, reason: k);
      }
      double y(String key) => tester.getTopLeft(find.byKey(Key(key))).dy;
      expect(y('next-step-card'), lessThan(y('home-tips')));
      expect(y('home-tips'), lessThan(y('home-tiles')));
      expect(y('home-tiles'), lessThan(y('home-poll')));
      // Gendered tips: no «نبذة» yet, then the conditions
      expect(find.text('نصائح لكِ'), findsOneWidget);
      expect(inKey('home-tip-about', find.text('أضيفي نبذة عنكِ')), findsOneWidget);
      expect(inKey('home-tip-conditions', find.text('راجعي شروطكِ الأساسية')), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('home-tip-conditions')));
      expect(find.text('route:preferences'), findsOneWidget);
    });

    testWidgets('quiet member\'s «نبذة» tip opens the profile edit; gone once there is one', (tester) async {
      await pumpHome(tester, profileResponse: FakeResponse(200, profile(100)));
      await tapAndSettle(tester, find.byKey(const Key('home-tip-about')));
      expect(find.text('route:edit'), findsOneWidget);
      await pumpHome(tester, profileResponse: FakeResponse(200, profile(100, about: 'أحب القراءة')));
      expect(find.byKey(const Key('home-tip-about')), findsNothing);
      expect(find.byKey(const Key('home-tip-conditions')), findsOneWidget);
    });

    testWidgets('a failed people load is not "quiet": the retry row, no tips', (tester) async {
      await pumpHome(tester, flags: {'chat': true}, chatsResponse: const FakeResponse(500, {'error': 'خطأ'}));
      expect(find.byKey(const Key('home-chats-error')), findsOneWidget);
      expect(find.byKey(const Key('home-tips')), findsNothing);
    });

    testWidgets('profile failed to load: the quiet card has no button and claims nothing', (tester) async {
      await pumpHome(tester, profileResponse: const FakeResponse(500, {'error': 'خطأ'}));
      expect(find.byKey(const Key('next-step-title')), findsOneWidget);
      expect(find.byKey(const Key('next-step-cta')), findsNothing);
      // No profile tile and no «نبذة» guess
      expect(find.byKey(const Key('home-tile-profile')), findsNothing);
      expect(find.byKey(const Key('home-tip-about')), findsNothing);
    });

    testWidgets('quiet with a loaded complete profile: the conditions button', (tester) async {
      await pumpHome(tester, profileResponse: FakeResponse(200, profile(100, about: 'نبذة')));
      expect(inKey('next-step-cta', find.text('راجعي شروطكِ الأساسية')), findsOneWidget);
    });
  });

  group('a failed counts refresh (sweep I1)', () {
    // A provider re-read outside a frame: let the fake requests answer
    Future<void> settle(WidgetTester tester) async {
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();
    }

    ProviderContainer containerOf(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(HomeScreen)));

    testWidgets('known counts keep the people blocks; a counts refresh that fails doesn\'t fail them', (tester) async {
      final adapter = await pumpBusy(tester);
      expect(find.byKey(const Key('home-suggestions')), findsOneWidget);
      expect(find.byKey(const Key('home-interested-cards')), findsOneWidget);
      adapter.on('GET', '/api/me/counts', const FakeResponse(500, {'error': 'خطأ'}));
      containerOf(tester).invalidate(countsProvider);
      await settle(tester);
      expect(find.byKey(const Key('home-suggestions-error')), findsNothing);
      expect(find.byKey(const Key('home-interested-error')), findsNothing);
      expect(find.byKey(const Key('home-suggestions')), findsOneWidget);
      expect(find.byKey(const Key('home-interested-cards')), findsOneWidget);
    });

    testWidgets('«إعادة المحاولة» works once the network is back, with the counts still failed before', (tester) async {
      final adapter = await pumpBusy(tester);
      final feed = adapter.handlers['GET /api/suggestions/feed']!;
      adapter.handlers['GET /api/suggestions/feed'] = (_) => const FakeResponse(500, {'error': 'خطأ'});
      adapter.on('GET', '/api/me/counts', const FakeResponse(500, {'error': 'خطأ'}));
      containerOf(tester).invalidate(countsProvider);
      await settle(tester);
      expect(find.byKey(const Key('home-suggestions-error')), findsOneWidget);
      // Back online
      adapter.handlers['GET /api/suggestions/feed'] = feed;
      adapter.on('GET', '/api/me/counts', const FakeResponse(200, {
        'flags': {'mutualSuggestions': true, 'chat': true},
        'newSuggestions': 2,
        'likedYou': 1,
      }));
      final retry = find.descendant(of: find.byKey(const Key('home-suggestions-error')), matching: find.text('إعادة المحاولة'));
      await tapAndSettle(tester, retry);
      await settle(tester);
      expect(find.byKey(const Key('home-suggestions-error')), findsNothing);
      expect(find.byKey(const Key('home-suggestions')), findsOneWidget);
    });
  });

  group('«المحادثات»', () {
    testWidgets('the latest 2 chats: initial avatar (no photo), a status line, never a message; «الكل» to the tab', (
      tester,
    ) async {
      await pumpBusy(tester);
      final block = find.byKey(const Key('home-chats'));
      expect(find.descendant(of: block, matching: find.text('يوسف')), findsOneWidget);
      expect(find.descendant(of: block, matching: find.text('زياد')), findsOneWidget);
      expect(find.descendant(of: block, matching: find.text('فادي')), findsNothing);
      // Unread: «رسائل جديدة» with the count; read: the time left (the chat runs 5 more days)
      expect(inKey('home-chat-c1', find.text('رسائل جديدة')), findsOneWidget);
      expect(inKey('home-chat-c1', find.text('2')), findsOneWidget);
      expect(inKey('home-chat-c2', find.text('تبقّى 5 أيام')), findsOneWidget);
      // No message text anywhere on home, mine or theirs
      for (final text in ['أهلاً وسهلاً', 'شكراً', 'مرحباً']) {
        expect(find.textContaining(text), findsNothing, reason: text);
      }
      final avatars = tester.widgetList<MemberAvatar>(find.descendant(of: block, matching: find.byType(MemberAvatar)));
      expect(avatars.length, 2);
      expect(avatars.every((a) => a.photo == null), isTrue);
      // No previews, so home is not a protected screen (the chats tab keeps its protection)
      expect(secureCalls, isEmpty);
      await tapAndSettle(tester, find.descendant(of: block, matching: find.text('الكل')));
      expect(find.text('route:chats'), findsOneWidget);
    });

    testWidgets('a row opens that chat', (tester) async {
      await pumpBusy(tester);
      await tapAndSettle(tester, find.byKey(const Key('home-chat-c2')));
      expect(find.text('route:chat c2'), findsOneWidget);
    });

    testWidgets('chat off and no chats: no block and the list is never read', (tester) async {
      final adapter = await pumpHome(tester, chats: [chat('c1', 'يوسف', last: 'مرحباً')]);
      expect(find.byKey(const Key('home-chats')), findsNothing);
      expect(adapter.requests.where((r) => r.path.endsWith('/api/chats')), isEmpty);
      expect(secureCalls, isEmpty);
    });

    testWidgets('chat off but the member has chats: shown', (tester) async {
      await pumpHome(
        tester,
        counts: {'hasChats': true},
        chats: [chat('c1', 'يوسف', status: 'ENDED')],
      );
      expect(inKey('home-chats', find.text('يوسف')), findsOneWidget);
      expect(inKey('home-chats', find.text('منتهية')), findsOneWidget);
    });

    testWidgets('a failed load: a retry that loads it', (tester) async {
      final adapter = await pumpHome(tester, flags: {'chat': true}, chatsResponse: const FakeResponse(500, {}));
      adapter.on(
        'GET',
        '/api/chats',
        FakeResponse(200, {
          'conversations': [chat('c1', 'يوسف', last: 'مرحباً')],
        }),
      );
      await tapAndSettle(tester, inKey('home-chats-error', find.text('إعادة المحاولة')));
      expect(inKey('home-chats', find.text('يوسف')), findsOneWidget);
    });
  });

  testWidgets('pull to refresh re-reads «المحادثات» too (an ended or extended chat shows its new line, sweep M3)',
      (tester) async {
    final adapter = await pumpBusy(tester);
    final before = adapter.to('GET', '/api/chats').length;
    expect(before, greaterThan(0));
    // Not awaited: the refresh ends only as the test pumps
    tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator)).show();
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
    expect(adapter.to('GET', '/api/chats').length, greaterThan(before));
  });

  group('«حسابي»', () {
    testWidgets('payments on: balance with «اشحني» to /credits, Pro tile to /pro, profile tile below 100%', (
      tester,
    ) async {
      await pumpBusy(tester);
      expect(inKey('home-tile-credits', find.text('7')), findsOneWidget);
      expect(inKey('home-tile-credits', find.text('اشحني')), findsOneWidget);
      expect(inKey('home-tile-pro', find.text('صور وصوت في المحادثة')), findsOneWidget);
      expect(inKey('home-tile-profile', find.text('ملفكِ مكتمل 80%')), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('home-tile-pro')));
      expect(find.text('route:pro'), findsOneWidget);
    });

    testWidgets('the balance tile opens /credits; the profile tile the first unfinished section', (tester) async {
      await pumpBusy(tester);
      await tapAndSettle(tester, find.byKey(const Key('home-tile-credits')));
      expect(find.text('route:credits'), findsOneWidget);
      await pumpBusy(tester);
      await tapAndSettle(tester, find.byKey(const Key('home-tile-profile')));
      expect(find.text('route:quiz'), findsOneWidget);
    });

    testWidgets('Pro member: «فعّالة»', (tester) async {
      await pumpHome(
        tester,
        counts: {
          'credits': 4,
          'pro': {'isPro': true, 'showPage': true},
        },
      );
      expect(inKey('home-tile-pro', find.text('فعّالة')), findsOneWidget);
    });

    testWidgets('no showPage and not Pro: no Pro tile', (tester) async {
      await pumpHome(
        tester,
        counts: {
          'credits': 4,
          'pro': {'isPro': false, 'showPage': false},
        },
      );
      expect(find.byKey(const Key('home-tile-pro')), findsNothing);
      expect(find.byKey(const Key('home-tile-credits')), findsOneWidget);
    });

    testWidgets('app payments off (test account): the number only, no «اشحن», no Pro tile even when Pro', (
      tester,
    ) async {
      await pumpHome(
        tester,
        appPayments: false,
        counts: {
          'credits': 4,
          'pro': {'isPro': true, 'showPage': true},
        },
      );
      expect(inKey('home-tile-credits', find.text('4')), findsOneWidget);
      expect(find.text('اشحني'), findsNothing);
      expect(find.text('اشحن'), findsNothing);
      expect(find.byKey(const Key('home-tile-pro')), findsNothing);
    });

    testWidgets('a country that doesn\'t sell (Lebanon today): the balance, no «اشحن»', (tester) async {
      await pumpHome(tester, selling: false, counts: {'credits': 4});
      expect(inKey('home-tile-credits', find.text('4')), findsOneWidget);
      expect(find.text('اشحني'), findsNothing);
      expect(find.text('اشحن'), findsNothing);
    });

    testWidgets('a complete profile: no profile tile', (tester) async {
      await pumpHome(tester, counts: {'credits': 4});
      expect(find.byKey(const Key('home-tile-profile')), findsNothing);
    });
  });

  group('«سؤال الأسبوع»', () {
    testWidgets('inline poll card with an active question', (tester) async {
      await pumpHome(tester, poll: activePoll);
      expect(tester.widget(find.byKey(const Key('home-poll'))), isA<PollCard>());
      expect(inKey('home-poll', find.text('ما أهم صفة في شريك الحياة؟')), findsOneWidget);
      // The card's own title, no second heading over it
      expect(find.text('سؤال نصيبك'), findsOneWidget);
      expect(find.text('سؤال الأسبوع'), findsNothing);
    });

    testWidgets('no question or a closed one: nothing', (tester) async {
      await pumpHome(tester);
      expect(find.byKey(const Key('home-poll')), findsNothing);
      await pumpHome(tester, poll: {...activePoll, 'status': 'CLOSED'});
      expect(find.byKey(const Key('home-poll')), findsNothing);
    });

    testWidgets('polls off for the country: nothing, and the poll is not read', (tester) async {
      final adapter = await pumpHome(tester, poll: activePoll, pollsOn: false);
      expect(find.byKey(const Key('home-poll')), findsNothing);
      expect(adapter.requests.where((r) => r.path.endsWith('/api/polls/current')), isEmpty);
    });

    testWidgets('a vote with a reward re-reads the balance on home (sweep M1)', (tester) async {
      final adapter = await pumpHome(tester, poll: activePoll, counts: {'credits': 4});
      adapter.on('POST', '/api/polls/vote', FakeResponse(200, {
        'poll': {...activePoll, 'myVote': 'a', 'rewardCredits': 1, 'results': {'percents': {'a': 60, 'b': 40}}},
      }));
      adapter.on('GET', '/api/me/counts', const FakeResponse(200, {
        'flags': {'mutualSuggestions': true},
        'credits': 5,
      }));
      await tapAndSettle(tester, inKey('home-poll', find.text('الصدق')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();
      expect(inKey('home-tile-credits', find.text('5')), findsOneWidget);
    });

    testWidgets('after voting, a newer question from the server replaces the old results (sweep M2)', (tester) async {
      final adapter = await pumpHome(tester, poll: activePoll);
      adapter.on('POST', '/api/polls/vote', FakeResponse(200, {
        'poll': {...activePoll, 'myVote': 'a', 'results': {'percents': {'a': 60, 'b': 40}}},
      }));
      await tapAndSettle(tester, inKey('home-poll', find.text('الصدق')));
      // Next week's question
      adapter.on('GET', '/api/polls/current', const FakeResponse(200, {
        'poll': {
          'id': 'p2',
          'question': 'ما أهم ما في البيت؟',
          'options': [
            {'id': 'x', 'label': 'الهدوء'},
            {'id': 'y', 'label': 'الدفء'},
          ],
          'status': 'ACTIVE',
          'myVote': null,
        },
      }));
      ProviderScope.containerOf(tester.element(find.byType(HomeScreen))).invalidate(currentPollProvider);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();
      expect(inKey('home-poll', find.text('ما أهم ما في البيت؟')), findsOneWidget);
      expect(inKey('home-poll', find.text('ما أهم صفة في شريك الحياة؟')), findsNothing);
    });

    testWidgets('a failed load: a retry row, never an empty state', (tester) async {
      await pumpHome(tester, pollResponse: const FakeResponse(500, {'error': 'خطأ'}));
      expect(find.byKey(const Key('home-poll-error')), findsOneWidget);
      expect(find.byKey(const Key('home-poll')), findsNothing);
    });
  });

  test('chat status line: unread › ended / read-only › time left › nothing; never the message', () {
    ChatSummary c({int unread = 0, String status = 'ACTIVE', bool blocked = false, DateTime? expiresAt}) => ChatSummary(
      id: 'c',
      matchId: 'm',
      partnerId: 'p',
      partnerName: 'يوسف',
      status: status,
      blocked: blocked,
      expiresAt: expiresAt,
      unread: unread,
      lastMessage: 'نص الرسالة',
    );
    final now = DateTime.utc(2026, 11, 14, 12);
    expect(homeChatStatusLine(c(unread: 3, status: 'ENDED'), now: now), 'رسائل جديدة');
    expect(homeChatStatusLine(c(status: 'EXPIRED'), now: now), 'انتهت المدة');
    expect(homeChatStatusLine(c(blocked: true), now: now), 'للقراءة فقط');
    expect(homeChatStatusLine(c(expiresAt: now.add(const Duration(days: 2))), now: now), 'تبقّى يومان');
    expect(homeChatStatusLine(c(), now: now), isNull);
  });

  test('tips: the conditions tip always, «نبذة» only for a loaded profile without one; masculine forms', () {
    final none = homeTipsFor(female: false);
    expect(none.map((t) => t.id), ['conditions']);
    expect(none.single.title, 'راجع شروطك الأساسية');
    final p = MyProfile.fromJson(profile(100));
    expect(homeTipsFor(profile: p, female: false).map((t) => t.title), ['أضف نبذة عنك', 'راجع شروطك الأساسية']);
  });

  testWidgets('busy home at 1.3× text on a 360 dp phone: no overflow top to bottom', (tester) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpBusy(tester, tall: false);
    expect(tester.takeException(), isNull);
    for (final k in ['home-suggestions', 'home-interested-cards', 'home-chats', 'home-tiles', 'home-poll']) {
      await tester.scrollUntilVisible(find.byKey(Key(k)), 200, scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: k);
    }
  });

  group('iPhone 17 Pro layout (402 pt)', () {
    /// Every activity label on the suggestion cards is laid out whole: never ellipsized
    void expectActivityWhole(WidgetTester tester) {
      final labels = find.descendant(of: find.byKey(const Key('home-suggestions')), matching: find.text('نشط اليوم'));
      expect(labels, findsWidgets);
      for (final e in labels.evaluate()) {
        final p = e.renderObject! as RenderParagraph;
        expect(p.didExceedMaxLines, isFalse);
        final t = e.widget as Text;
        expect(t.overflow, isNot(TextOverflow.ellipsis));
      }
    }

    testWidgets('the suggestion card shows «نشط اليوم» in full at 402 pt', (tester) async {
      await pumpBusy(tester, width: 402);
      expect(inKey('home-suggestions', find.text('إربد')), findsWidgets);
      expectActivityWhole(tester);
    });

    testWidgets('and at 360 pt with 1.3× text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pumpBusy(tester, width: 360);
      expect(tester.takeException(), isNull);
      expectActivityWhole(tester);
    });

    testWidgets('a lone balance tile is one compact row (no «اشحن», no Pro, profile complete)', (tester) async {
      await pumpHome(tester, width: 402, appPayments: false, counts: {'credits': 4});
      expect(find.byKey(const Key('home-tile-pro')), findsNothing);
      expect(find.byKey(const Key('home-tile-profile')), findsNothing);
      final tile = find.byKey(const Key('home-tile-credits'));
      expect(tester.getSize(tile).height, lessThan(100));
      expect(tester.getSize(tile).width, greaterThan(300));
    });

    testWidgets('a lone balance tile with «اشحني» stays compact, the action at the end', (tester) async {
      await pumpHome(tester, width: 402, counts: {'credits': 4});
      final tile = find.byKey(const Key('home-tile-credits'));
      expect(tester.getSize(tile).height, lessThan(100));
      // RTL: the end is the left side, so the action sits left of the number
      expect(
        tester.getCenter(inKey('home-tile-credits', find.text('اشحني'))).dx,
        lessThan(tester.getCenter(inKey('home-tile-credits', find.text('4'))).dx),
      );
    });

    testWidgets('two tiles side by side share one height', (tester) async {
      await pumpHome(
        tester,
        width: 402,
        counts: {
          'credits': 4,
          'pro': {'isPro': false, 'showPage': true},
        },
      );
      final a = tester.getSize(find.byKey(const Key('home-tile-credits')));
      final b = tester.getSize(find.byKey(const Key('home-tile-pro')));
      expect(a.height, b.height);
      expect(tester.takeException(), isNull);
    });
  });
}
