import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/discovery/suggestions_screen.dart';

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

Map<String, dynamic> counts({bool creditOnInterest = true, int credits = 5, int likedYou = 0, bool freeReply = false}) => {
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
  }) : items = items ?? [card('s1')];

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
          FakeResponse(200, counts(creditOnInterest: creditOnInterest, credits: credits, likedYou: likedYou, freeReply: freeReply)))
      ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {'dealbreakers': []}}))
      ..on('POST', '/api/reports', const FakeResponse(201, {'ok': true}));
    // Like the server: a blocked or answered card is no longer in the feed
    adapter.handlers['POST /api/blocks'] = (_) {
      items.clear();
      return const FakeResponse(201, {'id': 'b1'});
    };
    adapter.handlers['GET /api/suggestions'] =
        (_) => FakeResponse(200, {'mutualView': true, 'emptyReason': emptyReason});
    adapter.handlers['GET /api/suggestions/feed'] = (r) => FakeResponse(200, {
          'items': r.queryParameters['tab'] == itemsTab ? items : <Map<String, dynamic>>[],
          'page': 1,
          'total': 1,
          'totalPages': 1,
        });
    container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await show(tester, tab);
  }

  Future<void> show(WidgetTester tester, FeedTab tab) async {
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
      expect(find.textContaining('واشحني رصيدكِ لتختاري'), findsOneWidget);
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
    testWidgets('pending: open cards wait for the other side', (tester) async {
      final h = Harness(items: [], emptyReason: 'pending');
      await h.pump(tester);
      expect(find.text('اقتراحاتك المفتوحة بانتظار الطرف الآخر'), findsOneWidget);
      expect(find.text('عرض ما ينتظر الرد'), findsOneWidget);
    });

    testWidgets('pending with interest waiting for me', (tester) async {
      final h = Harness(items: [], emptyReason: 'pending', likedYou: 2);
      await h.pump(tester);
      expect(find.text('لديك اقتراحات بانتظار قرارك'), findsOneWidget);
    });

    testWidgets('credit on interest never promises «كل أسبوع»', (tester) async {
      final h = Harness(items: []);
      await h.pump(tester);
      expect(find.textContaining('كلما توفّر من يناسبك'), findsOneWidget);
      expect(find.textContaining('كل أسبوع'), findsNothing);
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
}
