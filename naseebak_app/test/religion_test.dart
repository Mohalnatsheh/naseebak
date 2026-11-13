import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/profile/profile_edit_plan.dart';
import 'package:naseebak_app/features/profile/profile_edit_screen.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart' show MyProfile, PartnerPrefs;
import 'package:naseebak_app/features/profile/profile_screen.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/religion.dart';

import 'helpers/fake_api.dart';
import 'account_parity_test.dart' show lists, profileWith, storedProfile;
import 'lebanon_test.dart' show bodyOf, lbBasics, lbDetails, lbSetupWith, prefSectOptions, sectOptions;
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

  group('preferences', () {
    const religionOptions = ['نفس ديانتي', 'لا مانع'];

    Future<FakeAdapter> openPrefs(
      WidgetTester tester,
      PartnerPrefs initial, {
      String? religion,
      List<String> options = religionOptions,
      List<String> sect = const [],
      String? stored,
    }) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(const SizedBox()); // a fresh State when a test opens the screen twice
      final adapter = FakeAdapter()
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': false}))
        ..on('PUT', '/api/profile/dealbreakers', const FakeResponse(200, {'keys': []}))
        ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {}}));
      await tester.pumpWidget(ProviderScope(
        overrides: await testOverrides(adapter),
        child: rtlApp(Scaffold(
          body: PreferencesForm(
            initial: initial,
            cities: const ['عمّان'],
            female: false,
            withDealbreakers: true,
            sectOptions: sect,
            religionOptions: options,
            religion: religion,
            initialPrefReligion: stored,
          ),
        )),
      ));
      await tester.pumpAndSettle();
      return adapter;
    }

    Future<void> savePrefs(WidgetTester tester) async {
      await tester.scrollUntilVisible(find.byKey(const Key('save-prefs')), 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('save-prefs')));
      await tester.pumpAndSettle();
    }

    testWidgets('«لا مانع» shows the hint; the hijab note only with a hijab «شرط أساسي»', (tester) async {
      final adapter = await openPrefs(
        tester,
        const PartnerPrefs(ageMin: 24, ageMax: 34, hijab: 'نعم', dealbreakers: {'hijab'}),
      );
      ChoiceChip chip(String v) => tester.widget<ChoiceChip>(find.byKey(Key('pref-religion-$v')));
      expect(chip('نفس ديانتي').selected, isTrue);
      expect(find.text(prefReligionAnyHint), findsNothing);
      await tester.tap(find.byKey(const Key('pref-religion-لا مانع')));
      await tester.pump();
      expect(chip('لا مانع').selected, isTrue);
      expect(find.text(prefReligionAnyHint), findsOneWidget);
      expect(find.text(dealbreakersStillApplyHint), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('db-hijab')), 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('db-hijab')));
      await tester.pump();
      await tester.scrollUntilVisible(find.text(prefReligionAnyHint), -300, scrollable: find.byType(Scrollable).first);
      expect(find.text(prefReligionAnyHint), findsOneWidget);
      expect(find.text(dealbreakersStillApplyHint), findsNothing);
      await savePrefs(tester);
      final changes = bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'] as Map;
      expect(changes['prefReligion'], 'لا مانع');
    });

    testWidgets('a Christian: no hijab or sect question, nothing Muslim-only sent', (tester) async {
      // Positive control: the same screen for a Muslim does show both rows
      await openPrefs(tester, const PartnerPrefs(ageMin: 24, ageMax: 34), religion: 'مسلم', sect: prefSectOptions);
      final scroll = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text('هل تفضل محجبة؟'), 300, scrollable: scroll);
      expect(find.text('هل تفضل محجبة؟'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('المذهب'), 300, scrollable: scroll);
      expect(find.text('المذهب'), findsOneWidget);

      final adapter = await openPrefs(
        tester,
        const PartnerPrefs(ageMin: 24, ageMax: 34, dealbreakers: {'age'}),
        religion: 'مسيحي',
        sect: prefSectOptions,
      );
      // Scroll to the neighbouring rows so the absence is real, not just off-screen
      final s2 = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text('مستوى التدين'), 300, scrollable: s2);
      await tester.scrollUntilVisible(find.text('التدخين'), 300, scrollable: s2);
      expect(find.text('هل تفضل محجبة؟'), findsNothing);
      expect(find.text('المذهب'), findsNothing);
      expect(find.byKey(const Key('db-hijab')), findsNothing);
      await savePrefs(tester);
      final changes = bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'] as Map;
      for (final k in ['prefHijab', 'prefBeard', 'prefSect']) {
        expect(changes.containsKey(k), isFalse, reason: k);
      }
      expect(bodyOf(adapter.to('PUT', '/api/profile/dealbreakers').single)['keys'], ['age']);
    });

    testWidgets('a pending change to مسيحي keeps the hijab question (stored religion is مسلم)', (tester) async {
      await openPrefs(tester, const PartnerPrefs(ageMin: 24, ageMax: 34), religion: 'مسلم');
      await tester.scrollUntilVisible(find.text('هل تفضل محجبة؟'), 300, scrollable: find.byType(Scrollable).first);
      expect(find.text('هل تفضل محجبة؟'), findsOneWidget);
    });

    testWidgets('no prefReligion list (switch off, older server): not shown, not sent', (tester) async {
      final adapter = await openPrefs(tester, const PartnerPrefs(ageMin: 24, ageMax: 34), options: const []);
      expect(find.text('الديانة لدى الشريك'), findsNothing);
      await savePrefs(tester);
      final changes = bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'] as Map;
      expect(changes.containsKey('prefReligion'), isFalse);
    });

    group('the screen', () {
      // PreferencesScreen with the real providers: a woman in Lebanon, stored religion «مسلم»
      Future<FakeAdapter> openScreen(
        WidgetTester tester, {
        bool lists = true,
        int profileStatus = 200,
        bool pendingChristian = false,
      }) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        final (adapter, overrides) = await religionSetupWith({'religion': 'مسلم', ...lbBasics});
        if (!lists) {
          final d = lbDetails();
          adapter.on('GET', '/api/countries/LB', FakeResponse(200, d));
        }
        adapter
          ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {
            'profile': {'prefAgeMin': 24, 'prefAgeMax': 34, 'prefBeard': 'نعم', 'dealbreakers': ['beard', 'age']},
          }))
          ..on('PUT', '/api/profile/dealbreakers', const FakeResponse(200, {'keys': []}))
          ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': false}))
          ..on('GET', '/api/profile/update-request', FakeResponse(200, {
            'requests': [
              if (pendingChristian)
                {'id': 'r1', 'status': 'PENDING', 'changes': {'religion': 'مسيحي'}},
            ],
          }));
        if (profileStatus != 200) adapter.on('GET', '/api/profile', FakeResponse(profileStatus, {'error': 'x'}));
        await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const PreferencesScreen())));
        await tester.pumpAndSettle();
        return adapter;
      }

      testWidgets('stored مسلم with a pending change to مسيحي keeps the beard row and its «شرط أساسي»', (tester) async {
        final adapter = await openScreen(tester, pendingChristian: true);
        final scroll = find.byType(Scrollable).first;
        await tester.scrollUntilVisible(find.text('هل تفضلين ملتحياً؟'), 300, scrollable: scroll);
        expect(find.text('هل تفضلين ملتحياً؟'), findsOneWidget);
        await tester.scrollUntilVisible(find.byKey(const Key('save-prefs')), 300, scrollable: scroll);
        await tester.tap(find.byKey(const Key('save-prefs')));
        await tester.pumpAndSettle();
        expect(bodyOf(adapter.to('PUT', '/api/profile/dealbreakers').single)['keys'], contains('beard'));
      });

      testWidgets('no religion lists + /api/profile failing: the form still shows, never waits for it', (tester) async {
        await openScreen(tester, lists: false, profileStatus: 500);
        expect(find.byKey(const Key('save-prefs')), findsNothing); // below the fold, lazy list
        expect(find.text('العمر المفضل'), findsOneWidget);
        expect(find.text('الديانة لدى الشريك'), findsNothing);
      });

      testWidgets('religion lists + /api/profile failing: ErrorView with retry, and retry recovers', (tester) async {
        final adapter = await openScreen(tester, profileStatus: 500);
        expect(find.text('العمر المفضل'), findsNothing);
        expect(find.text('إعادة المحاولة'), findsOneWidget);
        adapter.on('GET', '/api/profile', FakeResponse(200, {
          'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': {'religion': 'مسلم'}},
          'completeness': {'total': 0},
        }));
        await tester.tap(find.text('إعادة المحاولة'));
        await tester.pumpAndSettle();
        expect(find.text('الديانة لدى الشريك'), findsOneWidget);
      });
    });

    test('PartnerPrefs: prefReligion read; a Christian keeps no Muslim-only lock', () {
      expect(PartnerPrefs.fromJson({'prefReligion': 'لا مانع'}).prefReligion, 'لا مانع');
      expect(
        const PartnerPrefs(hijab: 'نعم', dealbreakers: {'hijab', 'age'}, ageMin: 20)
            .activeDealbreakers(female: false, christian: true),
        ['age'],
      );
    });
  });

  group('profile edit', () {
    final relLists = CountryLists(
      cities: lists.cities,
      nationalitiesFemale: lists.nationalitiesFemale,
      options: {...lists.options, 'sect': sectOptions, 'religion': ['مسلم', 'مسيحي']},
    );

    Future<FakeAdapter> openEditor(WidgetTester tester, CountryLists l, Map<String, Object?> stored) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final adapter = FakeAdapter()
        ..on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}))
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': true}))
        ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}}))
        ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));
      await tester.pumpWidget(ProviderScope(
        overrides: await testOverrides(adapter),
        child: rtlApp(Scaffold(body: ProfileEditForm(profile: profileWith(stored), lists: l, pending: null))),
      ));
      await tester.pumpAndSettle();
      return adapter;
    }

    Future<void> scrollDownTo(WidgetTester tester, Key k) =>
        tester.scrollUntilVisible(find.byKey(k), 300, scrollable: find.byType(Scrollable).first);

    MyProfile maleWith(Map<String, Object?> p) => MyProfile.fromJson({
          'user': {'id': 'u2', 'firstName': 'أحمد', 'lastName': 'علي', 'gender': 'MALE', 'profile': p},
          'completeness': {'total': 60, 'sections': []},
        });

    Future<FakeAdapter> openMale(WidgetTester tester, Map<String, Object?> stored) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final adapter = FakeAdapter()
        ..on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}))
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': true}))
        ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}}))
        ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));
      await tester.pumpWidget(ProviderScope(
        overrides: await testOverrides(adapter),
        child: rtlApp(Scaffold(body: ProfileEditForm(profile: maleWith(stored), lists: relLists, pending: null))),
      ));
      await tester.pumpAndSettle();
      return adapter;
    }

    Future<void> save(WidgetTester tester) async {
      await tester.scrollUntilVisible(find.byKey(const Key('save-profile')), 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('save-profile')));
      await tester.pumpAndSettle();
    }

    Future<void> tapUp(WidgetTester tester, Key k) async {
      final sc = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.byKey(k), -300, scrollable: sc);
      await tester.drag(sc, const Offset(0, 200));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(k));
      await tester.pumpAndSettle();
    }

    testWidgets('a null religion shows «مسلمة» picked and saving another field sends no religion', (tester) async {
      final adapter = await openEditor(tester, relLists, {...storedProfile, 'sect': 'سني'});
      final chip = tester.widget<ChoiceChip>(find.byKey(const Key('religion-مسلم')));
      expect(chip.selected, isTrue);
      expect(find.text('مسلمة'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('field-height')), 300, scrollable: find.byType(Scrollable).first);
      await tester.enterText(find.byKey(const Key('field-height')), '165');
      await save(tester);
      expect(bodyOf(adapter.to('PUT', '/api/profile').single).containsKey('religion'), isFalse);
      expect(adapter.to('POST', '/api/profile/update-request'), isEmpty);
    });

    testWidgets('choosing «مسيحية» goes to review and drops the Muslim-only answers; «المذهب» is not required',
        (tester) async {
      final adapter = await openEditor(tester, relLists, {...storedProfile, 'sect': null});
      await tapUp(tester, const Key('religion-مسيحي'));
      await scrollDownTo(tester, const Key('religiosity-ملتزم'));
      expect(find.text('المذهب'), findsNothing);
      await scrollDownTo(tester, const Key('smokingStatus-لا أدخن'));
      expect(find.byKey(const Key('hijab-hijab')), findsNothing);
      await save(tester);
      expect(find.text('يرجى اختيار المذهب'), findsNothing);
      expect(adapter.to('PUT', '/api/profile'), isEmpty);
      expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'religion': 'مسيحي'});
      expect(find.textContaining('بعد اعتماده'), findsOneWidget);
    });

    testWidgets('back to «مسلمة» before saving brings the rows back with their stored answers', (tester) async {
      await openEditor(tester, relLists, {...storedProfile, 'sect': 'سني'});
      await tapUp(tester, const Key('religion-مسيحي'));
      await tapUp(tester, const Key('religion-مسلم'));
      final none = find.byKey(const Key('hijab-none'));
      await tester.scrollUntilVisible(none, 300, scrollable: find.byType(Scrollable).first);
      expect(tester.widget<ChoiceChip>(none).selected, isTrue);
    });

    testWidgets('positive control: a Muslim in Lebanon gets «المذهب» and the hijab row', (tester) async {
      await openEditor(tester, relLists, {...storedProfile, 'sect': 'سني'});
      await scrollDownTo(tester, const Key('religiosity-ملتزم'));
      expect(find.text('المذهب'), findsOneWidget);
      await scrollDownTo(tester, const Key('smokingStatus-لا أدخن'));
      expect(find.byKey(const Key('hijab-hijab')), findsOneWidget);
    });

    testWidgets('a stored Christian with the switch off keeps the rows hidden', (tester) async {
      final noReligion = CountryLists(
        cities: lists.cities,
        nationalitiesFemale: lists.nationalitiesFemale,
        options: {...lists.options, 'sect': sectOptions},
      );
      await openEditor(tester, noReligion, {...storedProfile, 'religion': 'مسيحي', 'hijab': null, 'sect': null});
      expect(find.text('الديانة'), findsNothing);
      await scrollDownTo(tester, const Key('religiosity-ملتزم'));
      expect(find.text('المذهب'), findsNothing);
      await scrollDownTo(tester, const Key('smokingStatus-لا أدخن'));
      expect(find.byKey(const Key('hijab-hijab')), findsNothing);
    });

    testWidgets('the same stored Muslim with the switch off still gets the rows (control)', (tester) async {
      final noReligion = CountryLists(
        cities: lists.cities,
        nationalitiesFemale: lists.nationalitiesFemale,
        options: {...lists.options, 'sect': sectOptions},
      );
      await openEditor(tester, noReligion, {...storedProfile, 'sect': 'سني'});
      await scrollDownTo(tester, const Key('smokingStatus-لا أدخن'));
      expect(find.byKey(const Key('hijab-hijab')), findsOneWidget);
    });

    testWidgets('a Christian pick plus a fill: the PUT carries no Muslim-only keys, the request only the religion',
        (tester) async {
      final adapter = await openEditor(tester, relLists, {...storedProfile, 'sect': 'سني', 'niqab': false});
      await tapUp(tester, const Key('religion-مسيحي'));
      await scrollDownTo(tester, const Key('field-height'));
      await tester.enterText(find.byKey(const Key('field-height')), '165');
      await save(tester);
      final put = bodyOf(adapter.to('PUT', '/api/profile').single);
      expect(put['height'], 165);
      for (final k in ['sect', 'hijab', 'niqab', 'beard', 'religion']) {
        expect(put.containsKey(k), isFalse, reason: k);
      }
      expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'religion': 'مسيحي'});
    });

    testWidgets('a man: «مسيحي» hides the beard row, «مسلم» brings it back', (tester) async {
      await openMale(tester, {...storedProfile, 'sect': 'سني', 'beard': false});
      await scrollDownTo(tester, const Key('smokingStatus-لا أدخن'));
      expect(find.byKey(const Key('beard-true')), findsOneWidget);
      await tapUp(tester, const Key('religion-مسيحي'));
      await scrollDownTo(tester, const Key('smokingStatus-لا أدخن'));
      expect(find.byKey(const Key('beard-true')), findsNothing);
    });

    test('planProfileEdit sends a religion change to review even from an empty stored value', () {
      for (final before in [null, '']) {
        final plan = planProfileEdit({'religion': before}, {'religion': 'مسيحي'});
        expect(plan.fills, isEmpty, reason: '$before');
        expect(plan.reviewed, {'religion': 'مسيحي'}, reason: '$before');
      }
    });
  });

  group('my profile', () {
    Future<void> pumpProfile(WidgetTester tester, Map<String, dynamic> counts, Map<String, dynamic> profile,
        {String gender = 'FEMALE'}) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final adapter = FakeAdapter()
        ..on('GET', '/api/profile', FakeResponse(200, {
          'user': {'id': 'u1', 'firstName': 'سارة', 'lastName': 'أحمد', 'gender': gender, 'profile': profile},
          'completeness': {'total': 60, 'sections': []},
        }))
        ..on('GET', '/api/me/counts', FakeResponse(200, counts))
        ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));
      await tester.pumpWidget(ProviderScope(
        overrides: await testOverrides(adapter),
        child: rtlApp(const ProfileScreen()),
      ));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();
    }

    const on = {'religionEnabled': true};

    testWidgets('shows «الديانة» and the preference while the switch is on', (tester) async {
      await pumpProfile(tester, on, {...storedProfile, 'religion': null});
      expect(find.text('الديانة'), findsOneWidget);
      expect(find.text('مسلمة'), findsOneWidget);
      expect(find.text('الديانة لدى الشريك'), findsOneWidget);
      expect(find.text('نفس ديانتي'), findsOneWidget);
    });

    testWidgets('a Christian has no sect or hijab row', (tester) async {
      await pumpProfile(tester, on, {...storedProfile, 'religion': 'مسيحي', 'sect': 'سني', 'hijab': true});
      expect(find.text('مسيحية'), findsOneWidget);
      expect(find.text('المذهب'), findsNothing);
      expect(find.text('الحجاب'), findsNothing);
    });

    testWidgets('a Muslim still has the sect and hijab rows (control)', (tester) async {
      await pumpProfile(tester, on, {...storedProfile, 'religion': 'مسلم', 'sect': 'سني', 'hijab': true});
      expect(find.text('المذهب'), findsOneWidget);
      expect(find.text('الحجاب'), findsOneWidget);
    });

    testWidgets('switch off: no religion rows', (tester) async {
      await pumpProfile(tester, const {}, {...storedProfile, 'religion': 'مسيحي', 'prefReligion': 'لا مانع'});
      expect(find.text('الديانة'), findsNothing);
      expect(find.text('الديانة لدى الشريك'), findsNothing);
      expect(find.text('الحجاب'), findsOneWidget);
    });
  });
}
