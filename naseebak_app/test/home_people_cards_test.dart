import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/discovery/candidate_profile_screen.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/discovery/suggestions_screen.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/home/home_screen.dart';
import 'package:naseebak_app/features/home/widgets/home_interested_card.dart';
import 'package:naseebak_app/features/home/widgets/home_suggestion_card.dart';
import 'package:naseebak_app/shared/widgets/brand_kit.dart';

import 'helpers/fake_api.dart';

/// Home's people cards (spec 2026-11-14 items 4 and 5): «اقتراحات اليوم» and «مهتمون بك», and a tap opening that
/// person on the suggestions tab.
void main() {
  Map<String, dynamic> person(String id, String name, {bool likedYou = false, String reason = 'نفس المدينة', String? religion}) => {
        'kind': 'mutual',
        'id': id,
        'compatibilityScore': 86,
        'reason': reason,
        'likedYou': likedYou,
        'activity': 'نشط اليوم',
        'candidate': {
          'id': 'u$id',
          'firstName': name,
          'age': 30,
          'city': 'عمّان',
          'job': 'مهندس',
          'education': 'بكالوريوس',
          'religiosity': 'ملتزم',
          'beard': true,
          'height': 178,
          'religion': ?religion,
        },
      };

  Map<String, dynamic> page(List<Map<String, dynamic>> items) => {'items': items, 'page': 1, 'totalPages': 1};

  /// The two blocks on a stand-in home, under a router whose `/suggestions` is the real suggestions screen
  Future<FakeAdapter> pumpCards(
    WidgetTester tester, {
    List<Map<String, dynamic>> fresh = const [],
    List<Map<String, dynamic>> interested = const [],
    FakeResponse? freshResponse,
    FakeResponse? interestedResponse,
    bool freeReply = false,
    String? myReligion,
  }) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/me/counts', FakeResponse(200, {
        'flags': {
          'mutualSuggestions': true,
          'chat': true,
          'introRequests': true,
          'creditOnInterest': true,
          'freeInterestReply': freeReply,
        },
        'credits': 5,
        'guardian': {'exists': true, 'consented': true},
      }))
      ..on('GET', '/api/suggestions', const FakeResponse(200, {'mutualView': true}))
      ..on('GET', '/api/profile', FakeResponse(200, {
        'user': {
          'id': 'u1',
          'firstName': 'سارة',
          'lastName': 'أحمد',
          'gender': 'FEMALE',
          'profile': {'religion': myReligion},
        },
        'completeness': {'total': 60, 'sections': []},
      }))
      ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {'dealbreakers': []}}));
    adapter.handlers['GET /api/suggestions/feed'] = (r) => switch (r.queryParameters['tab']) {
          'new' => freshResponse ?? FakeResponse(200, page(fresh)),
          'interested' => interestedResponse ?? FakeResponse(200, page(interested)),
          _ => FakeResponse(200, page(const [])),
        };
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(
        path: '/home',
        builder: (_, _) => Scaffold(
          body: Consumer(builder: (context, ref, _) {
            final counts = ref.watch(countsProvider).valueOrNull;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                HomeSuggestionsCarousel(
                  items: ref.watch(homeSuggestionsProvider),
                  onRetry: () => ref.invalidate(homeSuggestionsProvider),
                ),
                HomeInterestedCards(
                  items: ref.watch(homeInterestedProvider),
                  onRetry: () => ref.invalidate(homeInterestedProvider),
                  female: true,
                  freeReply: counts?.flags.freeInterestReply ?? false,
                ),
              ],
            );
          }),
        ),
      ),
      GoRoute(
        path: '/suggestions',
        builder: (_, s) => SuggestionsScreen(initialTab: FeedTabX.parse(s.uri.queryParameters['tab'])),
      ),
    ]);
    addTearDown(router.dispose);
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlRouterApp(router),
    ));
    // The sign-in, the counts and the feeds answer between frames: pump through them
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
    return adapter;
  }

  setUp(() {
    feedOpenRequest.clear();
    feedTabRequest.tab = null;
  });

  group('«اقتراحات اليوم»', () {
    testWidgets('up to 5 cards: locked avatar, name and age, score, at most 3 facts, the reason, «الملف كاملاً»',
        (tester) async {
      await pumpCards(tester, fresh: [for (var i = 1; i <= 7; i++) person('s$i', 'أحمد$i')]);
      expect(find.text('اقتراحات اليوم'), findsOneWidget);
      final cards = find.byType(HomeSuggestionCard, skipOffstage: false);
      expect(cards, findsNWidgets(5));
      final first = find.byKey(const Key('home-suggestion-s1'));
      expect(find.descendant(of: first, matching: find.text('أحمد1، 30')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.text('توافق 86%')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.text('نفس المدينة')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.text('الملف كاملاً')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.text('نشط اليوم')), findsOneWidget);
      // Five facts on the payload, three chips: the first three of the card's order
      expect(find.descendant(of: first, matching: find.text('بكالوريوس')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.textContaining('178')), findsNothing);
      final avatars = tester.widgetList<MemberAvatar>(find.descendant(of: cards, matching: find.byType(MemberAvatar)));
      expect(avatars.length, 5);
      expect(avatars.every((a) => a.locked && a.photo == null), isTrue);
      expect(find.descendant(of: cards, matching: find.byType(Image)), findsNothing);
    });

    testWidgets('a different religion shows on the card once my own is loaded; none, no profile request',
        (tester) async {
      final adapter = await pumpCards(tester,
          fresh: [person('s1', 'أحمد', religion: 'مسيحي')], myReligion: 'مسلم');
      final first = find.byKey(const Key('home-suggestion-s1'));
      expect(find.descendant(of: first, matching: find.text('مسيحي')), findsOneWidget);
      expect(adapter.to('GET', '/api/profile'), isNotEmpty);
    });

    testWidgets('the same religion shows no line (positive control above)', (tester) async {
      await pumpCards(tester, fresh: [person('s1', 'أحمد', religion: 'مسلم')], myReligion: 'مسلم');
      final first = find.byKey(const Key('home-suggestion-s1'));
      await tester.ensureVisible(first);
      await tester.pumpAndSettle();
      expect(find.descendant(of: first, matching: find.text('بكالوريوس')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.text('مسلم')), findsNothing);
    });

    testWidgets('cards with no religion: my profile is never requested', (tester) async {
      final adapter = await pumpCards(tester, fresh: [person('s1', 'أحمد')], myReligion: 'مسلم');
      final first = find.byKey(const Key('home-suggestion-s1'));
      await tester.ensureVisible(first);
      await tester.pumpAndSettle();
      expect(find.descendant(of: first, matching: find.text('بكالوريوس')), findsOneWidget);
      expect(adapter.to('GET', '/api/profile'), isEmpty);
    });

    testWidgets('no reason: no reason line', (tester) async {
      await pumpCards(tester, fresh: [person('s1', 'أحمد', reason: '')]);
      expect(find.byKey(const Key('home-suggestion-reason-s1')), findsNothing);
      expect(find.byKey(const Key('home-suggestion-s1')), findsOneWidget);
    });

    testWidgets('a tap opens the suggestions tab «جديدة» with that person\'s full profile', (tester) async {
      await pumpCards(tester, fresh: [person('s1', 'أحمد'), person('s2', 'خالد')]);
      await tester.tap(find.byKey(const Key('home-suggestion-s2')));
      await tester.pumpAndSettle();
      expect(find.byType(SuggestionsScreen, skipOffstage: false), findsOneWidget);
      final profile = tester.widget<CandidateProfileScreen>(find.byType(CandidateProfileScreen));
      expect(profile.item.id, 's2');
      expect(profile.tab, FeedTab.newTab);
      // The answers are the suggestions screen's own
      expect(find.byKey(const Key('profile-interested-s2')), findsOneWidget);
      expect(feedOpenRequest.pendingFor(FeedTab.newTab), isNull);
    });

    testWidgets('«عرض الكل» opens «جديدة» without a profile', (tester) async {
      await pumpCards(tester, fresh: [person('s1', 'أحمد')]);
      await tester.tap(find.descendant(of: find.byKey(const Key('home-suggestions')), matching: find.text('عرض الكل')));
      await tester.pumpAndSettle();
      expect(find.byType(SuggestionsScreen), findsOneWidget);
      expect(find.byType(CandidateProfileScreen), findsNothing);
    });

    testWidgets('empty: nothing at all', (tester) async {
      await pumpCards(tester);
      expect(find.text('اقتراحات اليوم'), findsNothing);
      expect(find.byKey(const Key('home-suggestions')), findsNothing);
      expect(find.byKey(const Key('home-suggestions-error')), findsNothing);
    });

    testWidgets('a failed load: the retry row, never an empty state; the retry loads it', (tester) async {
      final adapter = await pumpCards(tester, freshResponse: const FakeResponse(500, {'error': 'خطأ'}));
      expect(find.byKey(const Key('home-suggestions-error')), findsOneWidget);
      expect(find.byKey(const Key('home-suggestions')), findsNothing);
      adapter.handlers['GET /api/suggestions/feed'] = (r) =>
          FakeResponse(200, page(r.queryParameters['tab'] == 'new' ? [person('s1', 'أحمد')] : const []));
      await tester.tap(find.descendant(
          of: find.byKey(const Key('home-suggestions-error')), matching: find.text('إعادة المحاولة')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('home-suggestion-s1')), findsOneWidget);
    });
  });

  group('«مهتمون بك»', () {
    testWidgets('up to 3 cards with a hidden tile «مخفية», never an image; no free tag while the switch is off',
        (tester) async {
      await pumpCards(tester, interested: [
        for (var i = 1; i <= 4; i++) person('i$i', 'اسم$i', likedYou: true),
      ]);
      expect(find.text('مهتمون بكِ'), findsOneWidget);
      final block = find.byKey(const Key('home-interested-cards'));
      expect(find.descendant(of: block, matching: find.byType(HomeInterestedCard)), findsNWidgets(3));
      expect(find.descendant(of: block, matching: find.text('مخفية')), findsNWidgets(3));
      expect(find.text('اسم1، 30'), findsOneWidget);
      expect(find.text('اسم4، 30'), findsNothing);
      expect(find.descendant(of: block, matching: find.byType(Image)), findsNothing);
      expect(find.descendant(of: block, matching: find.byType(MemberAvatar)), findsNothing);
      expect(find.textContaining('مجاني'), findsNothing);
    });

    testWidgets('«ردّكِ مجاني» on each card while the free reply is on', (tester) async {
      await pumpCards(tester, freeReply: true, interested: [person('i1', 'جنى', likedYou: true), person('i2', 'لينا', likedYou: true)]);
      expect(find.text('ردّكِ مجاني'), findsNWidgets(2));
    });

    testWidgets('a tap opens «مهتمون بك» with that card\'s full profile', (tester) async {
      await pumpCards(tester, interested: [person('i1', 'جنى', likedYou: true), person('i2', 'لينا', likedYou: true)]);
      await tester.tap(find.byKey(const Key('home-interested-card-i2')));
      await tester.pumpAndSettle();
      final profile = tester.widget<CandidateProfileScreen>(find.byType(CandidateProfileScreen));
      expect(profile.item.id, 'i2');
      expect(profile.tab, FeedTab.interested);
    });

    testWidgets('a card answered meanwhile: the tab opens, no profile', (tester) async {
      final adapter = await pumpCards(tester, interested: [person('i1', 'جنى', likedYou: true)]);
      adapter.handlers['GET /api/suggestions/feed'] = (r) => FakeResponse(200, page(const []));
      await tester.tap(find.byKey(const Key('home-interested-card-i1')));
      await tester.pumpAndSettle();
      expect(find.byType(SuggestionsScreen), findsOneWidget);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      expect(find.byType(SuggestionCard), findsNothing);
    });

    testWidgets('empty: nothing at all', (tester) async {
      await pumpCards(tester);
      expect(find.byKey(const Key('home-interested-cards')), findsNothing);
      expect(find.byKey(const Key('home-interested-error')), findsNothing);
    });

    testWidgets('a failed load: the retry row', (tester) async {
      await pumpCards(tester, interestedResponse: const FakeResponse(500, {'error': 'خطأ'}));
      expect(find.byKey(const Key('home-interested-error')), findsOneWidget);
      expect(find.byKey(const Key('home-interested-cards')), findsNothing);
      // The harness views as a woman
      expect(find.text('تعذّر تحميل من اهتم بكِ.'), findsOneWidget);
    });
  });

  testWidgets('360 dp wide at 1.3× text: no overflow in the carousel or the interested cards', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpCards(
      tester,
      freeReply: true,
      fresh: [
        person('s1', 'عبدالرحمن', reason: 'نفس المدينة، والتعليم الذي تفضّله، وتتوافقان في الالتزام وفي أمور أخرى كثيرة'),
        person('s2', 'خالد'),
      ],
      interested: [
        person('i1', 'عبدالرحمن', likedYou: true),
        person('i2', 'لينا', likedYou: true),
        person('i3', 'دانة', likedYou: true),
      ],
    );
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('home-suggestion-s1')), findsOneWidget);
    expect(find.byKey(const Key('home-interested-card-i3')), findsOneWidget);
    // The carousel scrolls sideways to the last card without an error
    await tester.drag(find.byKey(const Key('home-suggestions-carousel')), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
