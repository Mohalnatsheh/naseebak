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
  const matches = Counts(flags: CycleFlags(), actionableMatches: 1);

  test('the next step speaks to a woman in the feminine', () {
    expect(nextStepFor(matches, viewerFemale: true).body, startsWith('اختاري طريقة التعارف'));
    expect(nextStepFor(matches).body, startsWith('اختر طريقة التعارف'));
    expect(nextStepFor(null, viewerFemale: true).body, contains('ما تبحثين عنه'));
    expect(nextStepFor(null, viewerFemale: true).action, 'تصفحي الاقتراحات');
    expect(nextStepFor(null).action, 'تصفح الاقتراحات');
  });

  test('viewer vs partner forms', () {
    expect(forViewer(true, 'اشحن', 'اشحني'), 'اشحني');
    expect(forPartner(true, 'يطلب', 'تطلب'), 'يطلب');
    expect(forPartner(false, 'يطلب', 'تطلب'), 'تطلب');
    expect(rechargeToContinue(true), 'اشحني رصيدك للمتابعة');
  });

  homeLayoutTests();
}

void homeLayoutTests() {
  test('the greeting follows the time of day', () {
    expect(greetingFor(DateTime(2026, 10, 31, 9), 'سارة'), 'صباح الخير، سارة');
    expect(greetingFor(DateTime(2026, 10, 31, 19), 'سارة'), 'مساء الخير، سارة');
    expect(greetingFor(DateTime(2026, 10, 31, 2), null), 'مساء الخير');
  });

  testWidgets('home: three status chips from the counts and «اقتراحات اليوم» from the new feed', (tester) async {
    Map<String, dynamic> item(String id, String name, {bool likedYou = false}) => {
          'kind': 'mutual',
          'id': id,
          'compatibilityScore': 87,
          'reason': '',
          'likedYou': likedYou,
          'candidate': {'id': 'u$id', 'firstName': name, 'age': 30, 'city': 'عمّان'},
        };
    final adapter = FakeAdapter()
      ..on('GET', '/api/me/counts', const FakeResponse(200, {
        'flags': {'mutualSuggestions': true},
        'newSuggestions': 4,
        'likedYou': 2,
        'actionableMatches': 1,
        'pendingIntros': 1,
        'credits': 7,
      }))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}));
    adapter.handlers['GET /api/suggestions/feed'] = (r) => FakeResponse(200, {
          'items': r.queryParameters['tab'] == 'new' ? [item('1', 'عمر', likedYou: true), item('2', 'خالد')] : [],
          'page': 1,
          'totalPages': 1,
        });
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const HomeScreen()),
    ));
    await tester.pumpAndSettle();

    String chip(String key) => (tester.widget<Text>(
          find.descendant(of: find.byKey(Key(key)), matching: find.byType(Text)).first,
        )).data!;
    expect(chip('status-new'), '4');
    expect(chip('status-liked'), '2');
    expect(chip('status-matches'), '2');
    expect(find.descendant(of: find.byKey(const Key('credits-pill')), matching: find.text('7')), findsOneWidget);
    expect(find.text('عمر، 30'), findsOneWidget);
    expect(find.text('خالد، 30'), findsOneWidget);
    expect(find.text('مهتم بك'), findsOneWidget);
  });

  testWidgets('home «اقتراحات اليوم»: no verified mark while intro requests are on; shown when off', (tester) async {
    Future<void> pump(bool introRequests) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/me/counts', FakeResponse(200, {
          'flags': {'mutualSuggestions': true, 'introRequests': introRequests},
          'newSuggestions': 1,
        }))
        ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}));
      adapter.handlers['GET /api/suggestions/feed'] = (r) => FakeResponse(200, {
            'items': r.queryParameters['tab'] == 'new'
                ? [
                    {
                      'kind': 'mutual',
                      'id': '1',
                      'compatibilityScore': 80,
                      'reason': '',
                      'candidate': {'id': 'u1', 'firstName': 'عمر', 'age': 31, 'isVerified': true},
                    },
                  ]
                : [],
            'page': 1,
            'totalPages': 1,
          });
      final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
      await tester.pumpWidget(ProviderScope(
        key: UniqueKey(),
        overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
        child: rtlApp(const HomeScreen()),
      ));
      await tester.pumpAndSettle();
    }

    await pump(true);
    expect(find.text('عمر، 31'), findsOneWidget);
    expect(find.byKey(const Key('home-verified')), findsNothing);
    await pump(false);
    expect(find.byKey(const Key('home-verified')), findsOneWidget);
  });

  testWidgets('home «اقتراحات اليوم» failing to load shows a line with a retry, not an empty space', (tester) async {
    var fail = true;
    final adapter = FakeAdapter()
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {'mutualSuggestions': true}, 'newSuggestions': 1}))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}));
    adapter.handlers['GET /api/suggestions/feed'] = (_) => fail
        ? const FakeResponse(500, {'error': 'خطأ'})
        : const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1});
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const HomeScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home-suggestions-error')), findsOneWidget);
    fail = false;
    await tester.tap(find.descendant(of: find.byKey(const Key('home-suggestions-error')), matching: find.text('إعادة المحاولة')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('no-home-suggestions')), findsOneWidget);
  });

  testWidgets('home: no new suggestions → a card that leads to the preferences', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}))
      ..on('GET', '/api/suggestions/feed', const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1}));
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const HomeScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('no-home-suggestions')), findsOneWidget);
  });
}
