import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';

import 'helpers/fake_api.dart';
import 'setup_lists_test.dart' show saDetails;

/// Signed-in Saudi member (u1) in setup, with what the server already holds of her answers
Future<(FakeAdapter, List<Override>)> setupWith(Map<String, dynamic>? profile, {int? savedStep}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/countries/SA', FakeResponse(200, saDetails()))
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA', complete: false)}))
    ..on('GET', '/api/me/counts', const FakeResponse(200, {
      'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': true},
    }))
    ..on('GET', '/api/profile', FakeResponse(200, {
      'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': profile},
      'completeness': {'total': 0},
    }))
    ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}))
    ..on('PATCH', '/api/profile/draft', const FakeResponse(200, {'ok': true}));
  final overrides = await testOverrides(
    adapter,
    store: MemoryTokenStore('t'),
    prefs: {'setup_step_u1': ?savedStep},
  );
  return (adapter, overrides);
}

const basics = {
  'dateOfBirth': '1997-03-15T00:00:00.000Z',
  'nationality': 'سعودية',
  'city': 'الرياض',
  'education': 'بكالوريوس',
};

/// Step 2's own answers besides religiosity, as a Saudi server sends their choices (no skin colour, cooking, lifestyle,
/// job, housing or money lists in [saDetails]: those questions aren't asked)
const step2Rest = {
  'hijab': true,
  'niqab': false,
  'smokingStatus': 'لا أدخن',
  'drivingLicense': false,
  'willingToRelocate': 'no',
};

/// Every required answer of the 7 steps (with [saDetails]' lists)
const allAnswered = {
  ...basics,
  'maritalStatus': 'أعزب/عزباء',
  'childrenCount': 0,
  'religiosity': 'ملتزم',
  ...step2Rest,
  'prefAgeMin': 25,
  'prefAgeMax': 35,
};

/// Answers [step2Rest] on screen (step 2 open)
Future<void> answerStep2Rest(WidgetTester tester) async {
  for (final key in ['hijab-hijab', 'smokingStatus-لا أدخن', 'drivingLicense-false', 'willingToRelocate-no']) {
    final f = find.byKey(Key(key));
    await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }
}

void main() {
  testWidgets('reopened mid-setup: on the first step with something missing, the back key goes one step back',
      (tester) async {
    final (_, overrides) = await setupWith({...allAnswered}..remove('prefAgeMax'), savedStep: 2);
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 6 من 7'), findsOneWidget);
    expect(find.text('من تبحثين عنه'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 5 من 7'), findsOneWidget);
  });

  testWidgets('a step remembered on the phone whose answers are gone: the first unfinished step', (tester) async {
    final (_, overrides) = await setupWith(null, savedStep: 2);
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 1 من 7'), findsOneWidget);
  });

  testWidgets('«التالي» saves the step\'s answers as a draft', (tester) async {
    final (adapter, overrides) = await setupWith(basics);
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 1 من 7'), findsOneWidget);
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.byKey(const Key('maritalStatus-أعزب/عزباء')), 300, scrollable: scrollable);
    await tester.tap(find.byKey(const Key('maritalStatus-أعزب/عزباء')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('setup-next')), 300, scrollable: scrollable);
    await tester.tap(find.byKey(const Key('setup-next')));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 2 من 7'), findsOneWidget);
    expect(adapter.to('PATCH', '/api/profile/draft').single.data, {
      'dateOfBirth': '1997-03-15',
      'nationality': 'سعودية',
      'city': 'الرياض',
      'maritalStatus': 'أعزب/عزباء',
      'childrenCount': 0,
    });
  });
}
