import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/home/gendered_copy.dart';
import 'package:naseebak_app/features/home/home_screen.dart';

import 'helpers/fake_api.dart';

void main() {
  test('viewer vs partner forms', () {
    expect(forViewer(true, 'اشحن', 'اشحني'), 'اشحني');
    expect(forPartner(true, 'يطلب', 'تطلب'), 'يطلب');
    expect(forPartner(false, 'يطلب', 'تطلب'), 'تطلب');
    expect(rechargeToContinue(true), 'اشحني رصيدك للمتابعة');
  });

  homeLayoutTests();
}

void homeLayoutTests() {
  testWidgets('right after setup: cards on home but counts said 0 → the counts are read again, once (QA A-L01)',
      (tester) async {
    var countsReads = 0;
    final adapter = FakeAdapter()
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}));
    adapter.handlers['GET /api/me/counts'] = (_) {
      countsReads++;
      // The feed created the card meanwhile
      return FakeResponse(200, {'flags': {'mutualSuggestions': true}, 'newSuggestions': countsReads == 1 ? 0 : 1});
    };
    adapter.handlers['GET /api/suggestions/feed'] = (_) => const FakeResponse(200, {
          'items': [
            {
              'kind': 'mutual',
              'id': '1',
              'compatibilityScore': 80,
              'reason': '',
              'candidate': {'id': 'u2', 'firstName': 'عمر', 'age': 31},
            },
          ],
          'page': 1,
          'totalPages': 1,
        });
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const HomeScreen()),
    ));
    await tester.pumpAndSettle();
    expect(countsReads, 2);
    // The navy card's «اقتراحات جديدة» shows the re-read count
    expect(find.descendant(of: find.byKey(const Key('next-step-stat-new')), matching: find.text('1')), findsOneWidget);
  });

  testWidgets('home at 2× text on a 360 dp phone lays out without overflow (QA A-M05, A-L14)', (tester) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final adapter = FakeAdapter()
      ..on('GET', '/api/me/counts', const FakeResponse(200, {
        'flags': {'mutualSuggestions': true},
        'newSuggestions': 3,
        'likedYou': 2,
        'actionableMatches': 1,
        'pendingIntros': 2,
        'credits': 4,
      }))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 12}))
      ..on('GET', '/api/suggestions/feed', const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1}));
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const HomeScreen()),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.byKey(const Key('home-waiting')), 200);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      find.descendant(of: find.byKey(const Key('home-waiting')), matching: find.text('طلبا تعارف بانتظار ردّك')),
      findsOneWidget,
    );
  });

  test('one banner slot: 0 credits with someone waiting beats the push nudge (design P1-5)', () {
    Counts c(Map<String, dynamic> j) => Counts.fromJson({'flags': {'creditOnInterest': true}, ...j});
    expect(homeBannerFor(c({'credits': 0, 'likedYou': 2})), HomeBanner.noCreditsWithInterest);
    expect(homeBannerFor(c({'credits': 3, 'likedYou': 2})), HomeBanner.pushOff);
    expect(homeBannerFor(c({'credits': 0, 'likedYou': 0})), HomeBanner.pushOff);
    expect(
      homeBannerFor(Counts.fromJson({'flags': {'creditOnInterest': true, 'freeInterestReply': true}, 'credits': 0, 'likedYou': 1})),
      HomeBanner.pushOff,
    );
  });
}
