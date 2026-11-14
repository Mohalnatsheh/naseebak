import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/discovery/candidate_profile_screen.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/discovery/suggestions_screen.dart';
import 'package:naseebak_app/shared/widgets/common.dart';

import 'helpers/fake_api.dart';

/// Pumps in small steps (a spinner never lets pumpAndSettle finish).
Future<void> pumpFor(WidgetTester tester, [int steps = 20]) async {
  for (var i = 0; i < steps; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Map<String, dynamic> card(String id, {bool likedYou = false}) => {
      'kind': 'mutual',
      'id': id,
      'compatibilityScore': 70,
      'reason': 'يوافق ما تبحث عنه',
      'likedYou': likedYou,
      'candidate': {'id': 'c-$id', 'firstName': 'أحمد', 'age': 30, 'city': 'عمّان'},
    };

Map<String, dynamic> counts(
        {bool creditOnInterest = true, int credits = 5, int likedYou = 0, bool freeReply = false, bool interestPaywall = false}) =>
    {
      'flags': {
        'introRequests': true,
        'chat': true,
        'mutualSuggestions': true,
        'creditOnInterest': creditOnInterest,
        'freeInterestReply': creditOnInterest && freeReply,
      },
      'credits': credits,
      'newSuggestions': 1,
      'likedYou': likedYou,
      'guardian': {'exists': true, 'consented': true},
      'interestPaywall': interestPaywall,
    };

/// A signed-in member (a woman unless `gender` says otherwise) on the suggestions screen.
class Harness {
  Harness({
    this.creditOnInterest = true,
    this.credits = 5,
    this.appPayments = true,
    this.gender = 'FEMALE',
    List<Map<String, dynamic>>? items,
    this.emptyReason,
    this.likedYou = 0,
    this.freeReply = false,
    this.itemsTab = 'new',
    this.pushAllowed,
    this.interestPaywall = false,
    this.withRouter = false,
  }) : items = items ?? [card('s1')];

  /// `interestPaywall` of the counts (switch interest_paywall, a member who can buy)
  final bool interestPaywall;

  /// Inside a router with a `/credits` page (tests that follow the recharge)
  final bool withRouter;

  /// Notifications allowed on the phone (null: unknown, as the tests' default)
  final bool? pushAllowed;

  /// Switch free_interest_reply
  final bool freeReply;

  /// The feed tab that holds [items]
  final String itemsTab;

  final bool creditOnInterest;
  final int credits;
  final bool appPayments;
  final String gender;
  final List<Map<String, dynamic>> items;
  final String? emptyReason;
  final int likedYou;
  final adapter = FakeAdapter();
  late ProviderContainer container;

  int get topUps => adapter.to('GET', '/api/suggestions').length;

  Future<void> pump(WidgetTester tester, {FeedTab tab = FeedTab.newTab}) async {
    adapter
      ..on('GET', '/api/mobile/me',
          FakeResponse(200, {'user': {...meJson(credits: credits), 'gender': gender, 'appPayments': appPayments}}))
      ..on('GET', '/api/me/counts',
          FakeResponse(200, counts(
              creditOnInterest: creditOnInterest,
              credits: credits,
              likedYou: likedYou,
              freeReply: freeReply,
              interestPaywall: interestPaywall)))
      ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {'dealbreakers': []}}))
      ..on('POST', '/api/reports', const FakeResponse(201, {'ok': true}));
    // Like the server: a blocked or answered card is no longer in the feed
    adapter.handlers['POST /api/blocks'] = (_) {
      items.clear();
      return const FakeResponse(201, {'id': 'b1'});
    };
    adapter.handlers['GET /api/suggestions'] =
        (_) => FakeResponse(200, {'mutualView': true, 'emptyReason': emptyReason});
    adapter.handlers['GET /api/suggestions/feed'] = (r) {
      final list = r.queryParameters['tab'] == itemsTab ? items : <Map<String, dynamic>>[];
      return FakeResponse(200, {'items': list, 'page': 1, 'total': list.length, 'totalPages': 1});
    };
    container = ProviderContainer(overrides: [
      ...await testOverrides(adapter, store: MemoryTokenStore('t1')),
      pushAllowedProvider.overrideWith((ref) async => pushAllowed),
    ]);
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await show(tester, tab);
  }

  Future<void> show(WidgetTester tester, FeedTab tab) async {
    if (withRouter) {
      final router = GoRouter(initialLocation: '/s', routes: [
        GoRoute(path: '/s', builder: (_, _) => SuggestionsScreen(initialTab: tab)),
        GoRoute(path: '/credits', builder: (_, _) => const Scaffold(body: Text('credits-page'))),
        GoRoute(path: '/matches/:id', builder: (_, s) => Scaffold(body: Text('match-page-${s.pathParameters['id']}'))),
      ]);
      addTearDown(router.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
      await pumpFor(tester);
      return;
    }
    await tester.pumpWidget(
        UncontrolledProviderScope(container: container, child: rtlApp(SuggestionsScreen(initialTab: tab))));
    await pumpFor(tester);
  }
}

void main() {
  group('top-up (GET /api/suggestions) runs again', () {
    testWidgets('on pull-to-refresh, then the feed reloads', (tester) async {
      final h = Harness();
      await h.pump(tester);
      expect(h.topUps, 1);
      final feeds = h.adapter.to('GET', '/api/suggestions/feed').length;

      // Not awaited: the indicator only completes while the test pumps
      final refreshed = tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show();
      await pumpFor(tester, 30);
      await refreshed;
      expect(h.topUps, 2);
      expect(h.adapter.to('GET', '/api/suggestions/feed').length, greaterThan(feeds));
    });

    testWidgets('after a decision («لا»)', (tester) async {
      final h = Harness();
      h.adapter.on('POST', '/api/suggestions/s1/decide', const FakeResponse(200, {'match': false}));
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('decline-s1')));
      await pumpFor(tester);
      await tester.tap(find.text('نعم، لا يناسبني'));
      await pumpFor(tester, 30);
      expect(h.adapter.to('POST', '/api/suggestions/s1/decide'), hasLength(1));
      expect(h.topUps, 2);
    });

    testWidgets('when a notification/link opens another tab', (tester) async {
      final h = Harness();
      await h.pump(tester);
      await h.show(tester, FeedTab.interested);
      await pumpFor(tester, 30);
      expect(h.topUps, 2);
    });
  });

  testWidgets('a link to a tab switches to it even when the address already names it (the member had swiped away)',
      (tester) async {
    final h = Harness();
    await h.pump(tester);
    TabController tabs() => tester.widget<TabBar>(find.byType(TabBar)).controller!;
    // Swiped to «بانتظار ردّهم»: the screen's address still says «جديدة»
    await tester.tap(find.byKey(const Key('feed-tab-waiting')));
    await pumpFor(tester);
    expect(tabs().index, FeedTab.waiting.index);
    // Home's «اقتراحات جديدة», a notice or a push asks for «جديدة» again (`openAppRoute`)
    feedTabRequest.ask(FeedTab.newTab);
    await pumpFor(tester);
    expect(tabs().index, FeedTab.newTab.index);
  });

  testWidgets('after a decision the pages already loaded are read again: the member keeps their place', (tester) async {
    final h = Harness();
    await h.pump(tester);
    // Two pages of «جديدة»: 10 cards, then 2
    final gone = <String>{};
    List<Map<String, dynamic>> all() => [for (var i = 1; i <= 12; i++) if (!gone.contains('n$i')) card('n$i')];
    h.adapter.handlers['GET /api/suggestions/feed'] = (r) {
      final page = int.parse('${r.queryParameters['page'] ?? 1}');
      final list = r.queryParameters['tab'] == 'new' ? all() : <Map<String, dynamic>>[];
      return FakeResponse(200, {
        'items': list.skip((page - 1) * 10).take(10).toList(),
        'page': page,
        'total': list.length,
        'totalPages': (list.length / 10).ceil(),
      });
    };
    h.adapter.handlers['POST /api/suggestions/n12/decide'] = (_) {
      gone.add('n12');
      return const FakeResponse(200, {'match': false});
    };
    int page2() => h.adapter
        .to('GET', '/api/suggestions/feed')
        .where((r) => r.queryParameters['tab'] == 'new' && '${r.queryParameters['page']}' == '2')
        .length;
    // Pull-to-refresh starts from the first page only
    final refreshed = tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show();
    await pumpFor(tester, 30);
    await refreshed;
    expect(page2(), 0);
    // Down to the end: the second page loads
    for (var i = 0; i < 12 && find.byKey(const Key('decline-n12')).evaluate().isEmpty; i++) {
      await tester.drag(find.byType(ListView).first, const Offset(0, -900));
      await pumpFor(tester, 10);
    }
    expect(page2(), 1);
    await tester.ensureVisible(find.byKey(const Key('decline-n12')));
    await pumpFor(tester, 5);
    await tester.tap(find.byKey(const Key('decline-n12')));
    await pumpFor(tester);
    await tester.tap(find.text('نعم، لا يناسبني'));
    await pumpFor(tester, 30);
    // The reload after the decision read page 2 again, and the card before it is still there
    expect(page2(), 2);
    expect(find.byKey(const Key('decline-n12')), findsNothing);
    expect(find.byKey(const Key('decline-n11')), findsOneWidget);
  });

  group('«مهتم» sheet errors', () {
    testWidgets('404: the sheet closes, the card leaves and the server message shows', (tester) async {
      final h = Harness();
      h.adapter.handlers['POST /api/suggestions/s1/decide'] = (_) {
        h.items.clear();
        return const FakeResponse(404, {'error': 'لم يعد هذا الاقتراح متاحاً'});
      };
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      await tester.tap(find.byKey(const Key('pref-chat')));
      await tester.tap(find.byKey(const Key('send-interest')));
      await pumpFor(tester, 30);

      expect(find.byKey(const Key('send-interest')), findsNothing);
      expect(find.byKey(const Key('interested-s1')), findsNothing);
      expect(find.text('لم يعد هذا الاقتراح متاحاً'), findsOneWidget);
    });

    testWidgets('the «choose a way» hint goes away once a way is chosen', (tester) async {
      final h = Harness();
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      await tester.tap(find.byKey(const Key('send-interest')));
      await pumpFor(tester);
      expect(find.textContaining('طريقة التعارف: محادثة أو تعارف عائلي'), findsOneWidget);

      await tester.tap(find.byKey(const Key('pref-chat')));
      await pumpFor(tester);
      expect(find.textContaining('طريقة التعارف: محادثة أو تعارف عائلي'), findsNothing);
    });

    testWidgets('NO_CREDITS: the stored balance becomes 0', (tester) async {
      final h = Harness();
      h.adapter.on('POST', '/api/suggestions/s1/decide',
          const FakeResponse(402, {'error': 'رصيدك لا يكفي', 'code': 'NO_CREDITS'}));
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      await tester.tap(find.byKey(const Key('pref-chat')));
      await tester.tap(find.byKey(const Key('send-interest')));
      await pumpFor(tester);

      expect(find.text('رصيدك لا يكفي'), findsOneWidget);
      expect(h.container.read(authControllerProvider).me!.credits, 0);
      // The sheet's balance line follows (never «17» next to «رصيد غير كافٍ»)
      expect(find.textContaining('رصيدكِ\u00A0الحالي:\u00A00'), findsOneWidget);
    });

    testWidgets('the balance changed elsewhere: a refresh brings it, and 0 locks «مهتم»', (tester) async {
      final h = Harness(credits: 17);
      await h.pump(tester);
      expect(h.container.read(authControllerProvider).me!.credits, 17);
      // Set to 0 outside the app; pull to refresh: `/api/suggestions` carries the balance
      h.adapter.handlers['GET /api/suggestions'] =
          (_) => const FakeResponse(200, {'mutualView': true, 'credits': 0});
      await tester.fling(find.byType(Scrollable).first, const Offset(0, 400), 1000);
      await pumpFor(tester, 40);
      expect(h.container.read(authControllerProvider).me!.credits, 0);
    });

    testWidgets('a reply to someone who already said «مهتم» says the match is immediate', (tester) async {
      final h = Harness(items: [card('s1', likedYou: true)]);
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      expect(find.textContaining('فور الإرسال'), findsOneWidget);
      expect(find.textContaining('إذا أبدى اهتمامه'), findsNothing);
    });
  });

  testWidgets('on a 375 pt phone «مهتمون بك» shows in full next to its count', (tester) async {
    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = Harness(likedYou: 3);
    await h.pump(tester);
    final tab = find.byKey(const Key('feed-tab-interested'));
    expect(find.descendant(of: tab, matching: find.text('مهتمون بك')), findsOneWidget);
    expect(find.descendant(of: tab, matching: find.text('3')), findsOneWidget);
    // Laid out whole: the text's own size isn't squeezed below its natural width
    final text = tester.renderObject<RenderParagraph>(find.descendant(of: tab, matching: find.text('مهتمون بك')));
    expect(text.didExceedMaxLines, isFalse);
  });

  testWidgets('360x640: the first card\'s «مهتم» / «لا» and the sheet\'s buttons are on screen without scrolling',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final long = {
      ...card('s1'),
      'expiresAt': '2026-11-20T10:00:00.000Z',
      'reason': 'يوافق ما تبحث عنه في التعليم والمدينة والتدين والعمر',
      'candidate': {
        'id': 'c-s1', 'firstName': 'أحمد', 'age': 30, 'city': 'عمّان', 'education': 'بكالوريوس',
        'job': 'مهندس', 'maritalStatus': 'أعزب', 'religiosity': 'ملتزم', 'height': 178, 'aboutMe': 'نبذة طويلة ' * 20,
      },
    };
    final h = Harness(items: [long]);
    await h.pump(tester);
    bool onScreen(Finder f) => tester.getRect(f).bottom <= 640;
    // A short phone: the first four facts only (job, education, religiosity, height), never the fifth
    for (final k in ['job', 'education', 'religiosity', 'height']) {
      expect(find.byKey(Key('card-fact-s1-$k')), findsOneWidget);
    }
    expect(find.byKey(const Key('card-fact-s1-maritalStatus')), findsNothing);
    expect(find.byKey(const Key('card-details-open')), findsNothing);
    expect(onScreen(find.byKey(const Key('interested-s1'))), isTrue);
    expect(onScreen(find.byKey(const Key('decline-s1'))), isTrue);
    await tester.tap(find.byKey(const Key('interested-s1')));
    await pumpFor(tester);
    expect(onScreen(find.byKey(const Key('send-interest'))), isTrue);
    expect(onScreen(find.byKey(const Key('interest-cancel'))), isTrue);
    await tester.tap(find.byKey(const Key('interest-cancel')));
    await pumpFor(tester);
    // Everything else is one tap away, in the full profile
    await tester.tap(find.byKey(const Key('card-full-s1')));
    await pumpFor(tester);
    expect(find.byType(CandidateProfileScreen), findsOneWidget);
    expect(find.text('الصور تظهر بعد التوافق المتبادل فقط'), findsOneWidget);
  });

  testWidgets('credit on interest off: «مهتم» decides directly, no chat/family sheet', (tester) async {
    final h = Harness(creditOnInterest: false);
    h.adapter.on('POST', '/api/suggestions/s1/decide', const FakeResponse(200, {'match': false}));
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('interested-s1')));
    await pumpFor(tester);

    expect(find.byKey(const Key('send-interest')), findsNothing);
    final sent = h.adapter.to('POST', '/api/suggestions/s1/decide');
    expect(sent, hasLength(1));
    expect(sent.single.data, {'interested': true});
  });

  group('0 credits under credit on interest', () {
    testWidgets('«مهتم» disabled, «لا» free, banner with a recharge link', (tester) async {
      final h = Harness(credits: 0);
      await h.pump(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('decline-s1'))).onPressed, isNotNull);
      expect(find.byKey(const Key('zero-balance')), findsOneWidget);
      expect(find.byKey(const Key('recharge')), findsOneWidget);
      // One compact banner line (design P1-5)
      expect(find.text('اشحني'), findsOneWidget);
      expect(find.textContaining('«مهتم» يحتاج شحن الرصيد'), findsOneWidget);
    });

    testWidgets('one banner slot: the credit line wins over the notifications nudge (design P1-5)', (tester) async {
      final broke = Harness(credits: 0, pushAllowed: false);
      await broke.pump(tester);
      expect(find.byKey(const Key('zero-balance')), findsOneWidget);
      expect(find.byKey(const Key('push-off-card')), findsNothing);

      final fine = Harness(pushAllowed: false);
      await fine.pump(tester);
      expect(find.byKey(const Key('zero-balance')), findsNothing);
      expect(find.byKey(const Key('push-off-card')), findsOneWidget);
    });

    testWidgets('payments hidden in the app: no recharge link', (tester) async {
      final h = Harness(credits: 0, appPayments: false);
      await h.pump(tester);
      expect(find.byKey(const Key('zero-balance')), findsOneWidget);
      expect(find.byKey(const Key('recharge')), findsNothing);
      expect(find.textContaining('اشحن'), findsNothing);
    });

    testWidgets('with credits: enabled and no banner', (tester) async {
      final h = Harness();
      await h.pump(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNotNull);
      expect(find.byKey(const Key('zero-balance')), findsNothing);
    });
  });

  group('0 credits with the «مهتم» paywall (interestPaywall)', () {
    testWidgets('«مهتم» enabled; the tap opens «انتهى رصيدكِ», nothing sent, and «اشحني» opens the credits page',
        (tester) async {
      final h = Harness(credits: 0, interestPaywall: true, withRouter: true);
      await h.pump(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNotNull);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      expect(find.byKey(const Key('recharge-sheet')), findsOneWidget);
      expect(find.text('انتهى رصيدكِ'), findsOneWidget);
      expect(find.byKey(const Key('send-interest')), findsNothing);
      expect(h.adapter.to('POST', '/api/suggestions/s1/decide'), isEmpty);
      await tester.tap(find.byKey(const Key('recharge-sheet-buy')));
      await pumpFor(tester);
      expect(find.text('credits-page'), findsOneWidget);
    });

    testWidgets('«إلغاء» closes the step and stays on the card', (tester) async {
      final h = Harness(credits: 0, interestPaywall: true, gender: 'MALE');
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      expect(find.text('انتهى رصيدك'), findsOneWidget);
      expect(find.text('اشحن رصيدك'), findsOneWidget);
      await tester.tap(find.byKey(const Key('recharge-sheet-cancel')));
      await pumpFor(tester);
      expect(find.byKey(const Key('recharge-sheet')), findsNothing);
      expect(find.byKey(const Key('interested-s1')), findsOneWidget);
    });

    testWidgets('NO_CREDITS while sending (balance spent elsewhere): the sheet becomes «انتهى رصيدكِ»', (tester) async {
      final h = Harness(credits: 1, interestPaywall: true);
      h.adapter.on('POST', '/api/suggestions/s1/decide',
          const FakeResponse(402, {'error': 'رصيدك لا يكفي', 'code': 'NO_CREDITS'}));
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      await tester.tap(find.byKey(const Key('pref-chat')));
      await tester.tap(find.byKey(const Key('send-interest')));
      await pumpFor(tester, 30);
      expect(find.byKey(const Key('send-interest')), findsNothing);
      expect(find.byKey(const Key('recharge-sheet')), findsOneWidget);
      expect(find.text('انتهى رصيدكِ'), findsOneWidget);
      expect(find.text('رصيدك لا يكفي'), findsNothing);
      expect(h.container.read(authControllerProvider).me!.credits, 0);
    });

    testWidgets('payments hidden in the app: still greyed even if the server says paywall', (tester) async {
      final h = Harness(credits: 0, interestPaywall: true, appPayments: false);
      await h.pump(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNull);
    });

    testWidgets('a free reply goes to the «مهتم» sheet, never the paywall', (tester) async {
      final h = Harness(
          credits: 0,
          interestPaywall: true,
          freeReply: true,
          itemsTab: 'interested',
          items: [card('s1', likedYou: true)],
          likedYou: 1);
      await h.pump(tester, tab: FeedTab.interested);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      expect(find.byKey(const Key('recharge-sheet')), findsNothing);
      expect(find.byKey(const Key('send-interest')), findsOneWidget);
    });
  });

  group('free «مهتم» reply (free_interest_reply) at 0 credits', () {
    Harness liked() => Harness(credits: 0, freeReply: true, itemsTab: 'interested', items: [card('s1', likedYou: true)], likedYou: 1);

    testWidgets('a card that liked you: «مهتمة» enabled, says the reply is free, no recharge banner', (tester) async {
      final h = liked();
      await h.pump(tester, tab: FeedTab.interested);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNotNull);
      expect(find.textContaining('الرد بـ«مهتم» مجاني'), findsWidgets);
      expect(find.byKey(const Key('zero-balance')), findsNothing);
      expect(find.byKey(const Key('recharge')), findsNothing);
      expect(find.text('«مهتم» يستخدم رصيداً واحداً'), findsNothing);
    });

    testWidgets('the sheet says the reply is free, not that a credit is taken', (tester) async {
      final h = liked();
      await h.pump(tester, tab: FeedTab.interested);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      expect(find.textContaining('يُخصم رصيد واحد'), findsNothing);
      expect(find.textContaining('الرد بـ«مهتم» مجاني'), findsWidgets);
    });

    testWidgets('a card that did not like you stays locked at 0 credits', (tester) async {
      final h = Harness(credits: 0, freeReply: true);
      await h.pump(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNull);
      expect(find.byKey(const Key('zero-balance')), findsOneWidget);
    });

    testWidgets('switch off: the liked card stays locked at 0 credits', (tester) async {
      final h = Harness(credits: 0, itemsTab: 'interested', items: [card('s1', likedYou: true)], likedYou: 1);
      await h.pump(tester, tab: FeedTab.interested);
      expect(tester.widget<FilledButton>(find.byKey(const Key('interested-s1'))).onPressed, isNull);
    });
  });

  testWidgets('«إبلاغ وحظر» from the card menu reports, blocks and removes the card', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('card-menu-s1')));
    await pumpFor(tester);
    await tester.tap(find.text('إبلاغ وحظر'));
    await pumpFor(tester);
    await tester.tap(find.text('حساب غير حقيقي'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('report-submit')));
    await pumpFor(tester, 30);

    expect(h.adapter.to('POST', '/api/reports').single.data['reportedId'], 'c-s1');
    expect(h.adapter.to('POST', '/api/blocks').single.data, {'blockedId': 'c-s1'});
    expect(find.byKey(const Key('interested-s1')), findsNothing);
  });

  testWidgets('«حظر» from the card menu confirms, then removes the card', (tester) async {
    final h = Harness(gender: 'MALE');
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('card-menu-s1')));
    await pumpFor(tester);
    await tester.tap(find.text('حظر'));
    await pumpFor(tester);
    expect(find.text('لن تظهر لك ولن تظهر لها مرة أخرى.'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'حظر'));
    await pumpFor(tester, 30);
    expect(h.adapter.to('POST', '/api/blocks'), hasLength(1));
    expect(find.byKey(const Key('interested-s1')), findsNothing);
  });

  group('empty «جديدة»', () {
    // Like the website: the title and button follow how many of my «مهتم» wait («بانتظار ردّهم» total)
    testWidgets('pending with my «مهتم» waiting: open cards wait for the other side, with the count', (tester) async {
      final h = Harness(items: [card('w1'), card('w2')], itemsTab: 'waiting', emptyReason: 'pending', likedYou: 2);
      await h.pump(tester);
      expect(find.text('اقتراحاتك المفتوحة بانتظار الطرف الآخر'), findsOneWidget);
      expect(find.text('عرض ما ينتظر الرد (2)'), findsOneWidget);
      await tester.tap(find.text('عرض ما ينتظر الرد (2)'));
      await pumpFor(tester);
      expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, FeedTab.waiting.index);
    });

    testWidgets('pending with nothing of mine waiting: cards wait for my decision, no button', (tester) async {
      final h = Harness(items: [], emptyReason: 'pending');
      await h.pump(tester);
      expect(find.text('لديك اقتراحات بانتظار قرارك'), findsOneWidget);
      expect(find.textContaining('عرض ما ينتظر الرد'), findsNothing);
      expect(find.text('عرض المهتمين بك'), findsNothing);
    });

    testWidgets('no one fits: the filter tip sits above «تعديل تفضيلاتي»', (tester) async {
      const tip = 'لو خففت شرط «العمر» يظهر لك 43 شخصاً مناسباً.';
      final h = Harness(items: [], emptyReason: 'no_candidates');
      h.adapter.on('GET', '/api/suggestions/filter-tip', const FakeResponse(200, {'text': tip}));
      await h.pump(tester);
      expect(find.text('لا يوجد حالياً من يطابق شروطك'), findsOneWidget);
      expect(find.text(tip), findsOneWidget);
      expect(tester.getCenter(find.text(tip)).dy, lessThan(tester.getCenter(find.text('تعديل تفضيلاتي')).dy));
    });

    testWidgets('no one fits: no tip (null, a failed read or an older server) shows the page without it',
        (tester) async {
      for (final res in [
        const FakeResponse(200, {'text': null}),
        const FakeResponse(500, {'error': 'خطأ'}),
      ]) {
        final h = Harness(items: [], emptyReason: 'no_candidates');
        h.adapter.on('GET', '/api/suggestions/filter-tip', res);
        await h.pump(tester);
        expect(find.text('لا يوجد حالياً من يطابق شروطك'), findsOneWidget);
        expect(find.text('تعديل تفضيلاتي'), findsOneWidget);
        expect(find.byKey(const Key('filter-tip')), findsNothing);
      }
    });

    testWidgets('the tip is read only when no one fits', (tester) async {
      final h = Harness(items: [], emptyReason: 'pending');
      await h.pump(tester);
      expect(h.adapter.to('GET', '/api/suggestions/filter-tip'), isEmpty);
    });

    testWidgets('credit on interest never promises «كل أسبوع»', (tester) async {
      final h = Harness(items: []);
      await h.pump(tester);
      expect(find.textContaining('كلما توفّر من يناسبك'), findsOneWidget);
      expect(find.textContaining('كل أسبوع'), findsNothing);
    });
  });

  group('short card and the full profile', () {
    Map<String, dynamic> full(String id, {bool likedYou = false}) => {
          ...card(id, likedYou: likedYou),
          'candidate': {
            'id': 'c-$id', 'firstName': 'أحمد', 'age': 30, 'city': 'عمّان', 'job': 'مهندس', 'education': 'بكالوريوس',
            'religiosity': 'ملتزم', 'beard': true, 'height': 178, 'maritalStatus': 'أعزب', 'smokingStatus': 'لا يدخن',
            'tribe': 'العتوم', 'aboutMe': 'أحب القراءة',
          },
        };

    Future<void> open(WidgetTester tester, String id) async {
      await tester.tap(find.byKey(Key('card-full-$id')));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsOneWidget);
    }

    testWidgets('the card shows eight facts, «عنه» and «الملف كاملاً», and no details button', (tester) async {
      tester.view.physicalSize = const Size(400, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final h = Harness(items: [full('s1')]);
      await h.pump(tester);
      for (final label in ['العمل', 'التعليم', 'الالتزام', 'اللحية', 'الطول', 'الحالة الاجتماعية', 'التدخين', 'العشيرة']) {
        expect(find.text(label), findsOneWidget, reason: label);
      }
      expect(find.text('عنه'), findsOneWidget);
      expect(find.text('أحب القراءة'), findsOneWidget);
      expect(find.text('الملف كاملاً'), findsOneWidget);
      expect(find.text('توافق 70%'), findsOneWidget);
      expect(find.byKey(const Key('card-details-open')), findsNothing);
      // The why line lives in the profile now
      expect(find.text('يوافق ما تبحث عنه'), findsNothing);
    });

    testWidgets('a tap on the card opens the profile; its «مهتم» runs the card\'s sheet and the card leaves',
        (tester) async {
      final h = Harness();
      h.adapter.handlers['POST /api/suggestions/s1/decide'] = (_) {
        h.items.clear();
        return const FakeResponse(200, {'match': false});
      };
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('card-open-s1')));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsOneWidget);
      // Same credit line as the card
      expect(find.descendant(of: find.byKey(const Key('profile-answer-note-s1')), matching: find.text('«مهتم» يستخدم رصيداً واحداً')),
          findsOneWidget);
      await tester.tap(find.byKey(const Key('profile-interested-s1')));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      expect(find.byKey(const Key('send-interest')), findsOneWidget);
      await tester.tap(find.byKey(const Key('pref-chat')));
      await tester.tap(find.byKey(const Key('send-interest')));
      await pumpFor(tester, 30);
      expect(h.adapter.to('POST', '/api/suggestions/s1/decide').single.data['interested'], true);
      expect(find.byKey(const Key('interested-s1')), findsNothing);
      expect(find.text('تم إرسال اهتمامك. نُعلمك عند التوافق.'), findsOneWidget);
    });

    testWidgets('«لا» from the profile: the card\'s confirmation, then the same snack', (tester) async {
      final h = Harness();
      h.adapter.handlers['POST /api/suggestions/s1/decide'] = (_) {
        h.items.clear();
        return const FakeResponse(200, {'match': false});
      };
      await h.pump(tester);
      await open(tester, 's1');
      await tester.tap(find.byKey(const Key('profile-decline-s1')));
      await pumpFor(tester);
      await tester.tap(find.text('نعم، لا يناسبني'));
      await pumpFor(tester, 30);
      expect(h.adapter.to('POST', '/api/suggestions/s1/decide').single.data, {'interested': false});
      expect(find.text('تم. لن يظهر لكِ هذا الاقتراح مجدداً، ولن يعرف الطرف الآخر بقراركِ.'), findsOneWidget);
      expect(find.byKey(const Key('interested-s1')), findsNothing);
    });

    testWidgets('back from the profile changes nothing', (tester) async {
      final h = Harness();
      await h.pump(tester);
      await open(tester, 's1');
      await tester.tap(find.byKey(const Key('profile-back')));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      expect(find.byKey(const Key('interested-s1')), findsOneWidget);
      expect(h.adapter.to('POST', '/api/suggestions/s1/decide'), isEmpty);
    });

    testWidgets('0 credits, no paywall: the profile\'s «مهتم» is disabled and says why; «لا» stays free',
        (tester) async {
      final h = Harness(credits: 0);
      await h.pump(tester);
      await open(tester, 's1');
      expect(tester.widget<FilledButton>(find.byKey(const Key('profile-interested-s1'))).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('profile-decline-s1'))).onPressed, isNotNull);
      expect(find.byKey(const Key('profile-zero-balance')), findsOneWidget);
    });

    testWidgets('the balance drops to 0 while the profile is open: its «مهتم» locks at once', (tester) async {
      final h = Harness(credits: 1);
      await h.pump(tester);
      await open(tester, 's1');
      expect(tester.widget<FilledButton>(find.byKey(const Key('profile-interested-s1'))).onPressed, isNotNull);
      h.container.read(authControllerProvider.notifier).updateCredits(0);
      await pumpFor(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('profile-interested-s1'))).onPressed, isNull);
      expect(find.byKey(const Key('profile-zero-balance')), findsOneWidget);
    });

    testWidgets('a double tap on the card opens one profile', (tester) async {
      final h = Harness();
      await h.pump(tester);
      // Two opens before the first route is built (a fast double tap)
      final card = tester.widget<SuggestionCard>(find.byType(SuggestionCard));
      card.onOpen();
      card.onOpen();
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsOneWidget);
      await tester.tap(find.byKey(const Key('profile-back')));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      // Closed: the card opens it again
      await open(tester, 's1');
    });

    testWidgets('0 credits with the paywall: the profile\'s «مهتم» opens «انتهى رصيدكِ», nothing sent',
        (tester) async {
      final h = Harness(credits: 0, interestPaywall: true);
      await h.pump(tester);
      await open(tester, 's1');
      expect(tester.widget<FilledButton>(find.byKey(const Key('profile-interested-s1'))).onPressed, isNotNull);
      await tester.tap(find.byKey(const Key('profile-interested-s1')));
      await pumpFor(tester);
      expect(find.byKey(const Key('recharge-sheet')), findsOneWidget);
      expect(find.byKey(const Key('send-interest')), findsNothing);
      expect(h.adapter.to('POST', '/api/suggestions/s1/decide'), isEmpty);
    });

    testWidgets('0 credits, a card that liked you with the free reply: enabled, the free line and the status',
        (tester) async {
      final h = Harness(
          credits: 0, freeReply: true, itemsTab: 'interested', items: [card('s1', likedYou: true)], likedYou: 1);
      await h.pump(tester, tab: FeedTab.interested);
      await open(tester, 's1');
      expect(tester.widget<FilledButton>(find.byKey(const Key('profile-interested-s1'))).onPressed, isNotNull);
      final note = find.byKey(const Key('profile-answer-note-s1'));
      expect(find.descendant(of: note, matching: find.text('الرد بـ«مهتم» مجاني')), findsOneWidget);
      expect(find.descendant(of: note, matching: find.text('أبدى اهتمامه بك')), findsOneWidget);
      expect(find.byKey(const Key('profile-zero-balance')), findsNothing);
    });

    testWidgets('«بانتظار ردّهم»: the profile has no answers, only the waiting line', (tester) async {
      final h = Harness(itemsTab: 'waiting');
      await h.pump(tester, tab: FeedTab.waiting);
      await open(tester, 's1');
      expect(find.byKey(const Key('profile-interested-s1')), findsNothing);
      expect(find.byKey(const Key('profile-decline-s1')), findsNothing);
      expect(
          find.descendant(of: find.byKey(const Key('profile-answer-note-s1')), matching: find.textContaining('بانتظار الطرف الآخر')),
          findsOneWidget);
    });

    testWidgets('«حظر» from the profile closes it, confirms, then removes the card', (tester) async {
      final h = Harness(gender: 'MALE');
      await h.pump(tester);
      await open(tester, 's1');
      await tester.tap(find.byKey(const Key('profile-menu-s1')));
      await pumpFor(tester);
      await tester.tap(find.text('حظر'));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      await tester.tap(find.widgetWithText(FilledButton, 'حظر'));
      await pumpFor(tester, 30);
      expect(h.adapter.to('POST', '/api/blocks'), hasLength(1));
      expect(find.byKey(const Key('interested-s1')), findsNothing);
    });
  });

  group('gendered copy on the card', () {
    final item = FeedItem.fromJson(card('s1', likedYou: true));
    Widget cardFor({required bool candidateFemale}) => rtlApp(Scaffold(
          body: SingleChildScrollView(
            child: SuggestionCard(
              item: item,
              tab: FeedTab.interested,
              candidateFemale: candidateFemale,
              onInterested: () {},
              onDecline: () {},
              onOpen: () {},
            ),
          ),
        ));

    testWidgets('a woman «أبدت اهتمامها بك», a man «أبدى اهتمامه بك»', (tester) async {
      await tester.pumpWidget(cardFor(candidateFemale: true));
      expect(find.text('أبدت اهتمامها بك'), findsOneWidget);
      await tester.pumpWidget(cardFor(candidateFemale: false));
      expect(find.text('أبدى اهتمامه بك'), findsOneWidget);
    });
  });

  group('home asks to open one card (FeedOpenRequest)', () {
    setUp(feedOpenRequest.clear);
    tearDown(feedOpenRequest.clear);

    CandidateProfileScreen profile(WidgetTester tester) => tester.widget(find.byType(CandidateProfileScreen));

    testWidgets('asked before the screen opens: the tab loads, then that card\'s full profile opens once',
        (tester) async {
      final h = Harness(items: [card('s0'), card('s1')]);
      feedOpenRequest.ask(FeedTab.newTab, 's1');
      await h.pump(tester);
      expect(find.byType(CandidateProfileScreen), findsOneWidget);
      expect(profile(tester).item.id, 's1');
      expect(feedOpenRequest.pendingFor(FeedTab.newTab), isNull);
      // Back: the list, and nothing opens again on the next reload
      await tester.tap(find.byKey(const Key('profile-back')));
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      await h.show(tester, FeedTab.newTab);
      await pumpFor(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
    });

    testWidgets('the screen is alive on another tab: it switches to «مهتمون بك», opens the card, and «لا» runs as from the list',
        (tester) async {
      final h = Harness(items: [card('i1', likedYou: true)], itemsTab: 'interested');
      h.adapter.handlers['POST /api/suggestions/i1/decide'] = (_) {
        h.items.clear();
        return const FakeResponse(200, {'match': false});
      };
      await h.pump(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      // What home's card does (`openOnSuggestions`): the tab through the link, then the card
      feedTabRequest.ask(FeedTab.interested);
      feedOpenRequest.ask(FeedTab.interested, 'i1');
      await pumpFor(tester, 30);
      // Under the profile, the tab already switched
      expect(tester.widget<TabBar>(find.byType(TabBar, skipOffstage: false)).controller!.index, FeedTab.interested.index);
      expect(profile(tester).item.id, 'i1');
      expect(profile(tester).tab, FeedTab.interested);
      await tester.tap(find.byKey(const Key('profile-decline-i1')));
      await pumpFor(tester);
      await tester.tap(find.text('نعم، لا يناسبني'));
      await pumpFor(tester, 30);
      expect(h.adapter.to('POST', '/api/suggestions/i1/decide').single.data, {'interested': false});
      expect(find.text('تم. سيظهر للطرف الآخر أنه لم يحصل توافق.'), findsOneWidget);
    });

    testWidgets('a card no longer in the tab: the tab shows, no profile, the request is dropped', (tester) async {
      final h = Harness(items: [card('s1')]);
      feedOpenRequest.ask(FeedTab.newTab, 'gone');
      await h.pump(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      expect(find.byKey(const Key('card-open-s1')), findsOneWidget);
      expect(feedOpenRequest.pendingFor(FeedTab.newTab), isNull);
    });

    testWidgets('a request for another tab is left for that tab', (tester) async {
      final h = Harness(items: [card('s1')]);
      feedOpenRequest.ask(FeedTab.interested, 's1');
      await h.pump(tester);
      expect(find.byType(CandidateProfileScreen), findsNothing);
      expect(feedOpenRequest.pendingFor(FeedTab.interested), 's1');
    });

    test('a request older than a minute is dropped', () {
      var now = DateTime(2026, 11, 14, 9);
      final r = FeedOpenRequest(clock: () => now);
      r.ask(FeedTab.newTab, 's1');
      expect(r.pendingFor(FeedTab.waiting), isNull);
      expect(r.pendingFor(FeedTab.newTab), 's1');
      now = now.add(const Duration(minutes: 2));
      expect(r.pendingFor(FeedTab.newTab), isNull);
    });
  });

  group('audit 2026-11-14 (discovery)', () {
    testWidgets('I1: a failed top-up keeps the tabs and cards, and says so in a snack', (tester) async {
      final h = Harness();
      await h.pump(tester);
      expect(find.byKey(const Key('decline-s1')), findsOneWidget);
      h.adapter.on('GET', '/api/suggestions', const FakeResponse.network());
      final refreshed = tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show();
      await pumpFor(tester, 30);
      await refreshed;
      expect(find.byType(ErrorView), findsNothing);
      expect(find.byKey(const Key('decline-s1')), findsOneWidget);
      expect(find.byType(SnackBar), findsOneWidget);
    });

    testWidgets('I1: the match dialog still opens the match when the top-up after it fails', (tester) async {
      final h = Harness(withRouter: true);
      h.adapter.handlers['POST /api/suggestions/s1/decide'] = (_) {
        h.items.clear();
        h.adapter.on('GET', '/api/suggestions', const FakeResponse.network());
        return const FakeResponse(200, {'match': true, 'matchId': 'm1', 'intro': 'FAMILY', 'myPreference': 'FAMILY'});
      };
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('interested-s1')));
      await pumpFor(tester);
      await tester.tap(find.byKey(const Key('pref-family')));
      await tester.tap(find.byKey(const Key('send-interest')));
      await pumpFor(tester, 40);
      expect(find.byType(ErrorView), findsNothing);
      await tester.tap(find.byKey(const Key('match-dialog-open')));
      await pumpFor(tester, 20);
      expect(tester.takeException(), isNull);
      expect(find.text('match-page-m1'), findsOneWidget);
    });

    testWidgets('I2: «لا» on a card that liked me says the other side will see it was no match', (tester) async {
      final h = Harness(items: [card('s1', likedYou: true)], itemsTab: 'interested', likedYou: 1);
      h.adapter.handlers['POST /api/suggestions/s1/decide'] = (_) {
        h.items.clear();
        return const FakeResponse(200, {'match': false});
      };
      await h.pump(tester, tab: FeedTab.interested);
      await tester.tap(find.byKey(const Key('decline-s1')));
      await pumpFor(tester);
      expect(find.textContaining('سيظهر للطرف الآخر أنه لم يحصل توافق.'), findsOneWidget);
      expect(find.textContaining('لن يعرف الطرف الآخر'), findsNothing);
      await tester.tap(find.text('نعم، لا يناسبني'));
      await pumpFor(tester, 30);
      expect(find.text('تم. سيظهر للطرف الآخر أنه لم يحصل توافق.'), findsOneWidget);
    });

    testWidgets('I2: «لا» on a new card says the other side won\'t know (website wording)', (tester) async {
      final h = Harness();
      h.adapter.handlers['POST /api/suggestions/s1/decide'] = (_) {
        h.items.clear();
        return const FakeResponse(200, {'match': false});
      };
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('decline-s1')));
      await pumpFor(tester);
      expect(find.textContaining('ولن يعرف الطرف الآخر بقراركِ.'), findsOneWidget);
      await tester.tap(find.text('نعم، لا يناسبني'));
      await pumpFor(tester, 30);
      expect(find.text('تم. لن يظهر لكِ هذا الاقتراح مجدداً، ولن يعرف الطرف الآخر بقراركِ.'), findsOneWidget);
    });

    testWidgets('M1: a failed «عرض المزيد» is not retried on every scroll, only on the button', (tester) async {
      final h = Harness();
      await h.pump(tester);
      h.adapter.handlers['GET /api/suggestions/feed'] = (r) {
        final page = int.parse('${r.queryParameters['page'] ?? 1}');
        if (page == 2) return const FakeResponse.network();
        final list = r.queryParameters['tab'] == 'new'
            ? [for (var i = 1; i <= 10; i++) card('n$i')]
            : <Map<String, dynamic>>[];
        return FakeResponse(200, {'items': list, 'page': 1, 'total': 12, 'totalPages': 2});
      };
      final refreshed = tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show();
      await pumpFor(tester, 30);
      await refreshed;
      int page2() =>
          h.adapter.to('GET', '/api/suggestions/feed').where((r) => '${r.queryParameters['page']}' == '2').length;
      for (var i = 0; i < 12; i++) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -900));
        await pumpFor(tester, 5);
      }
      expect(page2(), 1);
      // The button (a snack may sit over it): it retries
      tester.widget<TextButton>(find.widgetWithText(TextButton, 'عرض المزيد')).onPressed!();
      await pumpFor(tester, 10);
      expect(page2(), 2);
    });

    testWidgets('M2: empty «مهتمون بك» and «بانتظار ردّهم» speak of «الاقتراحات», not «التوافقات»', (tester) async {
      final h = Harness(items: []);
      await h.pump(tester, tab: FeedTab.interested);
      expect(find.textContaining('استكشاف الاقتراحات'), findsOneWidget);
      await h.show(tester, FeedTab.waiting);
      await tester.tap(find.byKey(const Key('feed-tab-waiting')));
      await pumpFor(tester);
      expect(find.textContaining('باكتشاف الاقتراحات الجديدة'), findsOneWidget);
      expect(find.textContaining('التوافقات'), findsNothing);
    });

    testWidgets('M8: «حظر» shows it is running until the answer, then the snack', (tester) async {
      final h = Harness(gender: 'MALE');
      final gate = Completer<void>();
      h.adapter.hold('POST', '/api/blocks', gate.future);
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('card-menu-s1')));
      await pumpFor(tester);
      await tester.tap(find.text('حظر'));
      await pumpFor(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'حظر'));
      await pumpFor(tester, 5);
      expect(find.byKey(const Key('safety-progress')), findsOneWidget);
      gate.complete();
      await pumpFor(tester, 30);
      expect(find.byKey(const Key('safety-progress')), findsNothing);
      expect(find.text('تم الحظر'), findsOneWidget);
      expect(h.adapter.to('POST', '/api/blocks'), hasLength(1));
    });

    testWidgets('M8: «إبلاغ وحظر» shows it is running until the answer', (tester) async {
      final h = Harness();
      final gate = Completer<void>();
      h.adapter.hold('POST', '/api/reports', gate.future);
      await h.pump(tester);
      await tester.tap(find.byKey(const Key('card-menu-s1')));
      await pumpFor(tester);
      await tester.tap(find.text('إبلاغ وحظر'));
      await pumpFor(tester);
      await tester.tap(find.text('حساب غير حقيقي'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-submit')));
      await pumpFor(tester, 5);
      expect(find.byKey(const Key('safety-progress')), findsOneWidget);
      gate.complete();
      await pumpFor(tester, 30);
      expect(find.byKey(const Key('safety-progress')), findsNothing);
      expect(h.adapter.to('POST', '/api/blocks'), hasLength(1));
    });
  });
}
