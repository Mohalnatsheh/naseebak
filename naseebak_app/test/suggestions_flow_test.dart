import 'package:flutter/material.dart';
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

Map<String, dynamic> counts({bool creditOnInterest = true, int credits = 5, int likedYou = 0}) => {
      'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': creditOnInterest},
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
  }) : items = items ?? [card('s1')];

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
          FakeResponse(200, counts(creditOnInterest: creditOnInterest, credits: credits, likedYou: likedYou)))
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
          'items': r.queryParameters['tab'] == 'new' ? items : <Map<String, dynamic>>[],
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
    });
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
