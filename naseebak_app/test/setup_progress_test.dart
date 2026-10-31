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

void main() {
  testWidgets('reopened mid-setup: back at the step she stopped, the back key goes one step back', (tester) async {
    final (_, overrides) = await setupWith(
      {...basics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم'},
      savedStep: 2,
    );
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 3 من 3'), findsOneWidget);
    expect(find.text('من تبحثين عنه'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 2 من 3'), findsOneWidget);
  });

  testWidgets('a saved step whose earlier answers are gone: the first unfinished step', (tester) async {
    final (_, overrides) = await setupWith(null, savedStep: 2);
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 1 من 3'), findsOneWidget);
  });

  testWidgets('«التالي» saves the step\'s answers as a draft', (tester) async {
    final (adapter, overrides) = await setupWith(basics);
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('setup-next')), 300);
    await tester.tap(find.byKey(const Key('setup-next')));
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 2 من 3'), findsOneWidget);
    expect(adapter.to('PATCH', '/api/profile/draft').single.data, {
      'dateOfBirth': '1997-03-15',
      'nationality': 'سعودية',
      'city': 'الرياض',
      'education': 'بكالوريوس',
    });
  });
}
