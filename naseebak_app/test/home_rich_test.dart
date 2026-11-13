import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
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
    'candidate': {'id': 'u$id', 'firstName': name, 'age': 30, 'city': 'عمّان'},
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
  }) async {
    if (tall) {
      tester.view.physicalSize = const Size(400, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }
    final me = {
      ...meJson(),
      'appPayments': appPayments,
      'country': {
        ...joJson,
        'features': {'polls': pollsOn},
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
  Future<FakeAdapter> pumpBusy(WidgetTester tester, {bool tall = true}) => pumpHome(
    tester,
    tall: tall,
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
}
