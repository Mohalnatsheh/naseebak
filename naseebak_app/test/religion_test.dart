import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/religion.dart';

import 'helpers/fake_api.dart';
import 'lebanon_test.dart' show lbBasics, lbDetails, lbSetupWith;
import 'suggestions_flow_test.dart' show Harness, card;

Future<(FakeAdapter, List<Override>)> religionSetupWith(Map<String, dynamic>? profile, {int? savedStep}) async {
  final details = lbDetails();
  final country = Map<String, dynamic>.from(details['country'] as Map);
  country['options'] = {
    ...(country['options'] as Map),
    'religion': ['مسلم', 'مسيحي'],
    'prefReligion': ['نفس ديانتي', 'لا مانع'],
  };
  final adapter = FakeAdapter()
    ..on('GET', '/api/countries/LB', FakeResponse(200, {'country': country}))
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'LB', complete: false)}))
    ..on(
      'GET',
      '/api/me/counts',
      const FakeResponse(200, {
        'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': true},
      }),
    )
    ..on(
      'GET',
      '/api/profile',
      FakeResponse(200, {
        'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': profile},
        'completeness': {'total': 0},
      }),
    )
    ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}))
    ..on('PATCH', '/api/profile/draft', const FakeResponse(200, {'ok': true}))
    ..on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t'), prefs: {'setup_step_u1': ?savedStep});
  return (adapter, overrides);
}

void main() {
  group('setup', () {
    const step2 = {'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم'};

    testWidgets('step 2: religion is required with no preselected answer', (tester) async {
      final (_, overrides) = await religionSetupWith({...lbBasics, ...step2, 'sect': 'سني'}, savedStep: 2);
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
      expect(find.text('الديانة'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('setup-next')), 300);
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(find.text('الديانة مطلوبة'), findsOneWidget);
      expect(find.text('الخطوة 2 من 3', skipOffstage: false), findsOneWidget);
    });

    testWidgets('a Christian is not asked «المذهب»; the draft carries religion and no sect', (tester) async {
      final (adapter, overrides) = await religionSetupWith({...lbBasics, ...step2}, savedStep: 2);
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('مسيحية'));
      await tester.pumpAndSettle();
      expect(find.text('المذهب'), findsNothing);
      await tester.scrollUntilVisible(find.byKey(const Key('setup-next')), 300);
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 3 من 3'), findsOneWidget);
      expect(adapter.to('PATCH', '/api/profile/draft').single.data, {...step2, 'religion': 'مسيحي'});
    });

    testWidgets('step 3: «لا مانع» shows its hint and is saved', (tester) async {
      final (adapter, overrides) = await religionSetupWith({
        ...lbBasics,
        ...step2,
        'sect': 'سني',
        'religion': 'مسلم',
        'prefAgeMin': 25,
        'prefAgeMax': 35,
      }, savedStep: 3);
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 3 من 3'), findsOneWidget);
      expect(find.text('الديانة لدى الشريك'), findsOneWidget);
      expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'نفس ديانتي')).selected, isTrue);
      await tester.tap(find.text('لا مانع'));
      await tester.pumpAndSettle();
      expect(find.text(prefReligionAnyHint), findsOneWidget);
      expect(find.text(dealbreakersStillApplyHint), findsNothing);
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      final body = Map<String, dynamic>.from(adapter.to('PUT', '/api/profile').single.data as Map);
      expect(body['religion'], 'مسلم');
      expect(body['prefReligion'], 'لا مانع');
    });

    testWidgets('no lists (switch off, older server): not asked, not sent', (tester) async {
      final (adapter, overrides) = await lbSetupWith({...lbBasics, ...step2, 'sect': 'سني'}, savedStep: 1);
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      expect(find.text('الديانة'), findsNothing);
      await tester.scrollUntilVisible(find.byKey(const Key('setup-next')), 300);
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(adapter.to('PATCH', '/api/profile/draft').single.data, isNot(contains('religion')));
    });
  });

  group('religion helpers', () {
    test('religionOf: null and unknown read مسلم', () {
      expect(religionOf(null), 'مسلم');
      expect(religionOf('مسيحي'), 'مسيحي');
      expect(religionOf('x'), 'مسلم');
      expect(isChristian('مسيحي'), isTrue);
      expect(isChristian(null), isFalse);
    });
    test('withoutMuslimOnly drops the Muslim-only answers for a Christian only', () {
      final data = <String, Object?>{'religiosity': 'ملتزم', 'hijab': true, 'niqab': false, 'beard': null, 'sect': 'سني',
          'prefSect': ['سني'], 'prefHijab': 'نعم', 'prefBeard': 'لا', 'dealbreakers': ['age', 'hijab', 'sect']};
      expect(withoutMuslimOnly('مسيحي', data), {'religiosity': 'ملتزم', 'dealbreakers': ['age']});
      expect(withoutMuslimOnly('مسلم', data), data);
      expect(withoutMuslimOnly(null, data), data);
    });
    test('prefReligionHints', () {
      expect(prefReligionHints('مسلم', 'نفس ديانتي', ['hijab']), isEmpty);
      expect(prefReligionHints('مسلم', 'لا مانع', ['age']), [prefReligionAnyHint]);
      expect(prefReligionHints(null, 'لا مانع', ['beard']), [prefReligionAnyHint, dealbreakersStillApplyHint]);
      expect(prefReligionHints('مسيحي', 'لا مانع', ['hijab']), [prefReligionAnyHint]);
    });
    test('religionFact shows only a different, known religion', () {
      expect(religionFact('مسيحي', 'مسلم', female: true), 'مسيحية');
      expect(religionFact('مسلم', 'مسيحي', female: true), 'مسلمة');
      expect(religionFact('مسلم', 'مسيحي', female: false), 'مسلم');
      expect(religionFact('مسلم', 'مسلم', female: true), isNull);
      expect(religionFact(null, 'مسيحي', female: true), isNull);
      expect(religionFact('مسيحي', null, female: true), isNull);
    });
    test('labels, card field and the counts switch', () {
      expect(OptionLabels.describe('religion', 'مسيحي', female: true), 'مسيحية');
      expect(OptionLabels.self('religion', 'مسلم', female: false), 'مسلم');
      expect(PersonDetails.fromJson({'id': 'p', 'firstName': 'هدى', 'religion': 'مسيحي'}).religion, 'مسيحي');
      expect(Counts.fromJson({'flags': {}, 'religionEnabled': true}).religionEnabled, isTrue);
      expect(Counts.fromJson({'flags': {}}).religionEnabled, isFalse);
    });
  });

  group('cards', () {
    Map<String, dynamic> christian() => {
          ...card('s1'),
          'candidate': {'id': 'c-s1', 'firstName': 'أحمد', 'age': 30, 'religion': 'مسيحي'},
        };

    testWidgets('a Muslim viewer sees «الديانة» on a Christian card', (tester) async {
      final h = Harness(items: [christian()], gender: 'FEMALE');
      h.adapter.on('GET', '/api/profile',
          const FakeResponse(200, {'user': {'gender': 'FEMALE', 'profile': {'religion': 'مسلم'}}}));
      await h.pump(tester);
      expect(find.descendant(of: find.byKey(const Key('card-fact-s1-religion')), matching: find.textContaining('الديانة مسيحي')), findsOneWidget);
    });

    testWidgets('my religion null after loading reads مسلم: a Christian card shows «مسيحي»', (tester) async {
      final h = Harness(items: [christian()], gender: 'FEMALE');
      h.adapter.on('GET', '/api/profile',
          const FakeResponse(200, {'user': {'gender': 'FEMALE', 'profile': {'religion': null}}}));
      await h.pump(tester);
      expect(find.descendant(of: find.byKey(const Key('card-fact-s1-religion')), matching: find.textContaining('الديانة مسيحي')), findsOneWidget);
    });

    testWidgets('no religion fact while my profile cannot be read', (tester) async {
      final h = Harness(items: [christian()], gender: 'FEMALE');
      h.adapter.on('GET', '/api/profile', const FakeResponse(500, {'error': 'x'}));
      await h.pump(tester);
      expect(find.byKey(const Key('card-fact-s1-religion')), findsNothing);
    });

    testWidgets('a card without religion never reads my profile', (tester) async {
      final h = Harness(gender: 'FEMALE');
      await h.pump(tester);
      expect(h.adapter.to('GET', '/api/profile'), isEmpty);
    });
  });
}
