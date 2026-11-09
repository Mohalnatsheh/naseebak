import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';

import 'helpers/fake_api.dart';

const saLists = {
  'cities': ['الرياض', 'جدة', 'مكة المكرمة'],
  'areas': {
    'الرياض': ['العليا', 'الملز'],
    'جدة': ['الروضة'],
  },
  'nationalities': {
    'male': ['سعودي', 'يمني'],
    'female': ['سعودية', 'يمنية'],
  },
};

Map<String, dynamic> saDetails({Object? lists = saLists}) => {
      'country': {
        ...saJson,
        'links': {'terms': 'https://naseebak.com/terms'},
        'lists': ?lists,
      },
    };

void main() {
  test('country details parse the per-country lists', () {
    final d = CountryDetails.fromJson(saDetails());
    expect(d.lists.cities, ['الرياض', 'جدة', 'مكة المكرمة']);
    expect(d.lists.areas['الرياض'], ['العليا', 'الملز']);
    expect(d.lists.nationalities(female: true).first, 'سعودية');
    expect(d.lists.nationalities(female: false).first, 'سعودي');
    // An older server without `lists`
    expect(CountryDetails.fromJson(saDetails(lists: null)).lists.isEmpty, isTrue);
  });

  Future<List<Override>> signedInSa(FakeAdapter adapter) async {
    adapter
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA', complete: false)}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {
        'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': true},
      }))
      ..on('GET', '/api/profile', const FakeResponse(200, {
        'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': null},
        'completeness': {'total': 0},
      }))
      ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}));
    return testOverrides(adapter, store: MemoryTokenStore('t'));
  }

  testWidgets('setup shows the cities and nationalities the API sends', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/countries/SA', FakeResponse(200, saDetails()));
    await tester.pumpWidget(scopedApp(await signedInSa(adapter), const SetupScreen()));
    await tester.pumpAndSettle();
    expect(find.text('مكة المكرمة'), findsOneWidget);
    expect(find.text('الرياض'), findsOneWidget);
    // No guardian step when intro requests are on: 3 steps
    expect(find.text('الخطوة 1 من 3'), findsOneWidget);
    // Default nationality in the member's own gender
    expect(find.text('سعودية'), findsOneWidget);
  });

  testWidgets('setup shows a retry when the lists cannot load, then recovers', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/countries/SA', const FakeResponse.network());
    await tester.pumpWidget(scopedApp(await signedInSa(adapter), const SetupScreen()));
    await tester.pumpAndSettle();
    expect(find.text('إعادة المحاولة'), findsOneWidget);
    expect(find.text('الرياض'), findsNothing);

    adapter.on('GET', '/api/countries/SA', FakeResponse(200, saDetails()));
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.text('الرياض'), findsOneWidget);
  });

  testWidgets('a server without lists is an error, not an empty city picker', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/countries/SA', FakeResponse(200, saDetails(lists: null)));
    await tester.pumpWidget(scopedApp(await signedInSa(adapter), const SetupScreen()));
    await tester.pumpAndSettle();
    expect(find.text('تعذّر تحميل قائمة المدن. حاول مرة أخرى.'), findsOneWidget);
  });

  testWidgets('an answered setup question loses its error at once', (tester) async {
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter()..on('GET', '/api/countries/SA', FakeResponse(200, saDetails()));
    await tester.pumpWidget(scopedApp(await signedInSa(adapter), const SetupScreen()));
    await tester.pumpAndSettle();
    final next = find.byKey(const Key('setup-next'));
    await tester.scrollUntilVisible(next, 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(find.text('المدينة مطلوبة'), findsOneWidget);

    await tester.ensureVisible(find.text('جدة'));
    await tester.tap(find.text('جدة'));
    await tester.pumpAndSettle();
    expect(find.text('المدينة مطلوبة'), findsNothing);
  });
}

Widget scopedApp(List<Override> overrides, Widget child) => ProviderScope(overrides: overrides, child: rtlApp(child));
