import 'package:dio/dio.dart' show RequestOptions;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/onboarding/profile_options.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';

import 'helpers/fake_api.dart';

/// The full setup (7 steps, 6 without «شروط أساسية»), as the website's `short-setup.tsx`.

const fullLists = {
  'cities': ['الرياض', 'جدة'],
  'areas': {
    'الرياض': ['العليا'],
  },
  'nationalities': {
    'male': ['سعودي', 'يمني'],
    'female': ['سعودية', 'يمنية'],
  },
  'incomeRanges': ['أقل من 5000 ر.س'],
  'expenseRanges': ['أقل من 3000 ر.س'],
};

const fullOptions = <String, Object>{
  'education': ProfileOptions.education,
  'job': ['مهندس', 'أخرى'],
  'maritalStatus': ProfileOptions.maritalStatus,
  'religiosity': ProfileOptions.religiosity,
  'smokingStatus': ProfileOptions.smokingStatus,
  'cookingAbility': ['أطبخ جيداً'],
  'lifestyle': ['هادئ'],
  'skinColor': ['حنطي'],
  'housingType': ['ملك'],
};

const religionOptions = <String, Object>{
  'religion': ['مسلم', 'مسيحي'],
  'prefReligion': ['نفس ديانتي', 'لا مانع'],
  'sect': ['سني', 'شيعي', 'أفضّل عدم الذكر'],
  'prefSect': ['سني', 'شيعي'],
};

/// Her answers, step by step (a Saudi woman)
const fullStep1 = <String, Object>{
  'dateOfBirth': '1997-03-15T00:00:00.000Z',
  'nationality': 'سعودية',
  'city': 'الرياض',
  'maritalStatus': 'أعزب/عزباء',
  'childrenCount': 0,
  'skinColor': 'حنطي',
};
const fullStep2 = <String, Object>{
  'religiosity': 'ملتزم',
  'hijab': true,
  'niqab': false,
  'smokingStatus': 'لا أدخن',
  'cookingAbility': 'أطبخ جيداً',
  'lifestyle': 'هادئ',
  'drivingLicense': false,
  'willingToRelocate': 'no',
};
const fullStep3 = <String, Object>{'education': 'بكالوريوس', 'job': 'مهندس', 'incomeRange': 'أقل من 5000 ر.س'};
const fullStep4 = <String, Object>{'housingType': 'ملك', 'monthlyExpenses': 'أقل من 3000 ر.س'};
const fullStep6 = <String, Object>{'prefAgeMin': 28, 'prefAgeMax': 38};

/// Signed-in Saudi woman (u1) in setup with what the server holds of her answers
Future<(FakeAdapter, ProviderContainer)> openFullSetup(
  WidgetTester tester,
  Map<String, dynamic>? profile, {
  bool mutual = true,
  Map<String, Object> options = fullOptions,
  Size size = const Size(800, 2400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter()
    ..on('GET', '/api/countries/SA', FakeResponse(200, {
      'country': {...saJson, 'lists': fullLists, 'options': options},
    }))
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA', complete: false)}))
    ..on('GET', '/api/me/counts', FakeResponse(200, {
      'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': mutual, 'creditOnInterest': true},
    }))
    ..on('GET', '/api/profile', FakeResponse(200, {
      'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': profile},
      'completeness': {'total': 0},
    }))
    ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}))
    ..on('PATCH', '/api/profile/draft', const FakeResponse(200, {'ok': true}))
    ..on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t'));
  final container = ProviderContainer(overrides: overrides);
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const SetupScreen())));
  await tester.pumpAndSettle();
  return (adapter, container);
}

Future<void> tapIn(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> tapNext(WidgetTester tester) => tapIn(tester, find.byKey(const Key('setup-next')));

Map<String, dynamic> dataOf(Object? d) => Map<String, dynamic>.from(d as Map);

void main() {
  testWidgets('7 steps with shared suggestions, 6 without', (tester) async {
    await openFullSetup(tester, null);
    expect(find.text('الخطوة 1 من 7'), findsOneWidget);
    expect(find.text('عنك'), findsOneWidget);
  });

  testWidgets('6 steps without shared suggestions («شروط أساسية» not asked)', (tester) async {
    await openFullSetup(tester, null, mutual: false);
    expect(find.text('الخطوة 1 من 6'), findsOneWidget);
  });

  testWidgets('«التالي» on an empty step 1: «… مطلوب» under each required field, still on step 1', (tester) async {
    final (adapter, _) = await openFullSetup(tester, null);
    await tapNext(tester);
    expect(find.text('الخطوة 1 من 7'), findsOneWidget);
    expect(find.text('تاريخ الميلاد مطلوب'), findsOneWidget);
    expect(find.text('المدينة مطلوبة'), findsOneWidget);
    expect(find.text('الحالة الاجتماعية مطلوبة'), findsOneWidget);
    expect(find.text('لون البشرة مطلوب'), findsOneWidget);
    // The nationality starts on her country's (as today and on the website): answered
    expect(find.text('الجنسية مطلوبة'), findsNothing);
    // Height and weight are optional
    expect(find.textContaining('الطول'), findsOneWidget);
    expect(find.text('الطول مطلوب'), findsNothing);
    expect(adapter.to('PATCH', '/api/profile/draft'), isEmpty);
  });

  testWidgets('completing step 1 saves one draft with exactly its answers and moves to step 2', (tester) async {
    final (adapter, _) = await openFullSetup(tester, {'dateOfBirth': '1997-03-15T00:00:00.000Z'});
    expect(find.text('الخطوة 1 من 7'), findsOneWidget);
    await tapIn(tester, find.byKey(const Key('city-الرياض')));
    await tapIn(tester, find.byKey(const Key('maritalStatus-أعزب/عزباء')));
    // Single: no children question
    expect(find.text('عدد الأبناء'), findsNothing);
    await tapIn(tester, find.byKey(const Key('skinColor-حنطي')));
    await tapNext(tester);
    expect(find.text('الخطوة 2 من 7'), findsOneWidget);
    expect(find.text('الدين ونمط الحياة'), findsOneWidget);
    expect(dataOf(adapter.to('PATCH', '/api/profile/draft').single.data), {
      'dateOfBirth': '1997-03-15',
      'nationality': 'سعودية',
      'city': 'الرياض',
      'maritalStatus': 'أعزب/عزباء',
      'childrenCount': 0,
      'skinColor': 'حنطي',
    });
  });

  testWidgets('resume: steps 1–2 answered (on the website) opens on step 3 with the earlier answers', (tester) async {
    await openFullSetup(tester, {...fullStep1, ...fullStep2});
    expect(find.text('الخطوة 3 من 7'), findsOneWidget);
    expect(find.text('التعليم والعمل'), findsOneWidget);
    // Android back: the previous step, answers kept
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('الخطوة 2 من 7'), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('hijab-hijab'))).selected, isTrue);
  });

  testWidgets('a Christian woman: no hijab or sect question, and none of them in the final save', (tester) async {
    final (adapter, _) = await openFullSetup(
      tester,
      {...fullStep1, ...fullStep2, 'sect': 'سني', ...fullStep3, ...fullStep4, ...fullStep6},
      options: {...fullOptions, ...religionOptions},
    );
    // «الديانة» is missing: back on step 2
    expect(find.text('الخطوة 2 من 7'), findsOneWidget);
    expect(find.text('الحجاب'), findsOneWidget);
    expect(find.text('المذهب'), findsOneWidget);
    await tapIn(tester, find.byKey(const Key('religion-مسيحي')));
    expect(find.text('الحجاب'), findsNothing);
    expect(find.text('المذهب'), findsNothing);
    for (var i = 0; i < 6; i++) {
      await tapNext(tester);
    }
    final body = dataOf(adapter.to('PUT', '/api/profile').single.data);
    expect(body['religion'], 'مسيحي');
    for (final k in ['hijab', 'niqab', 'beard', 'sect', 'prefSect', 'prefHijab', 'prefBeard']) {
      expect(body.containsKey(k), isFalse, reason: k);
    }
    for (final r in adapter.to('PATCH', '/api/profile/draft')) {
      expect(dataOf(r.data).keys, isNot(contains('hijab')));
    }
  });

  testWidgets('an old server (no religion list): no «الديانة», no religion keys in any request', (tester) async {
    final step2 = {...fullStep2}..remove('religiosity');
    final (adapter, _) = await openFullSetup(tester, {...fullStep1, ...step2, ...fullStep3, ...fullStep4, ...fullStep6});
    expect(find.text('الخطوة 2 من 7'), findsOneWidget);
    expect(find.text('الديانة'), findsNothing);
    await tapIn(tester, find.byKey(const Key('religiosity-ملتزم')));
    for (var i = 0; i < 6; i++) {
      await tapNext(tester);
    }
    expect(adapter.to('PUT', '/api/profile'), hasLength(1));
    for (final r in [...adapter.to('PATCH', '/api/profile/draft'), ...adapter.to('PUT', '/api/profile')]) {
      expect(dataOf(r.data).keys, isNot(contains('religion')));
      expect(dataOf(r.data).keys, isNot(contains('prefReligion')));
    }
  });

  testWidgets('step 7: a city preference from step 6 gets its toggle; ticked, it goes in the final save',
      (tester) async {
    final (adapter, _) = await openFullSetup(tester, {...fullStep1, ...fullStep2, ...fullStep3, ...fullStep4});
    expect(find.text('الخطوة 6 من 7'), findsOneWidget);
    expect(find.text('من تبحثين عنه'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('age-min')), '28');
    await tester.enterText(find.byKey(const Key('age-max')), '38');
    await tester.pumpAndSettle();
    await tapIn(tester, find.widgetWithText(FilterChip, 'الرياض'));
    await tapNext(tester);
    expect(find.text('الخطوة 7 من 7'), findsOneWidget);
    expect(find.text('شروط أساسية'), findsOneWidget);
    expect(find.byKey(const Key('db-city')), findsOneWidget);
    expect(find.byKey(const Key('db-education')), findsNothing);
    await tapIn(tester, find.byKey(const Key('db-city')));
    expect(find.text('حفظ والبدء'), findsOneWidget);
    await tapNext(tester);
    final body = dataOf(adapter.to('PUT', '/api/profile').single.data);
    expect(body['dealbreakers'], ['city']);
    expect(body['prefCity'], ['الرياض']);
    expect(body['prefAgeMin'], 28);
    expect(body['prefAgeMax'], 38);
  });

  // The age range is required on step 6, so step 7 always has its toggle: DealbreakerToggles' empty line («لم
  // تحدّدي تفضيلات بعد…») can't show in setup
  testWidgets('step 7 with only the age range filled: only the age toggle', (tester) async {
    await openFullSetup(tester, {...fullStep1, ...fullStep2, ...fullStep3, ...fullStep4});
    await tester.enterText(find.byKey(const Key('age-min')), '28');
    await tester.enterText(find.byKey(const Key('age-max')), '38');
    await tester.pumpAndSettle();
    await tapNext(tester);
    // The age range is filled, so its toggle is offered; nothing else
    expect(find.byKey(const Key('db-age')), findsOneWidget);
    expect(find.byKey(const Key('db-city')), findsNothing);
  });

  testWidgets('«حفظ والبدء» sends one PUT with every answer and leaves the setup like today', (tester) async {
    final (adapter, container) =
        await openFullSetup(tester, {...fullStep1, ...fullStep2, ...fullStep3, ...fullStep4, ...fullStep6});
    expect(find.text('الخطوة 7 من 7'), findsOneWidget);
    adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA')}));
    await tapNext(tester);
    final body = dataOf(adapter.to('PUT', '/api/profile').single.data);
    expect(body, containsPair('dateOfBirth', '1997-03-15'));
    expect(body, containsPair('childrenCount', 0));
    expect(body, containsPair('hijab', true));
    expect(body, containsPair('niqab', false));
    expect(body, containsPair('drivingLicense', false));
    expect(body, containsPair('willingToRelocate', 'no'));
    expect(body, containsPair('job', 'مهندس'));
    expect(body, containsPair('housingType', 'ملك'));
    expect(body, containsPair('monthlyExpenses', 'أقل من 3000 ر.س'));
    expect(body, containsPair('prefAgeMin', 28));
    expect(body, containsPair('dealbreakers', <String>[]));
    expect(body.containsKey('beard'), isFalse);
    expect(container.read(authControllerProvider).me!.profileComplete, isTrue);
  });

  testWidgets('a job left on «أخرى» with no text is not an answer', (tester) async {
    final step3 = {...fullStep3}..remove('job');
    final (adapter, _) = await openFullSetup(tester, {...fullStep1, ...fullStep2, ...step3});
    expect(find.text('الخطوة 3 من 7'), findsOneWidget);
    await tapIn(tester, find.widgetWithText(ChoiceChip, 'أخرى'));
    await tapNext(tester);
    expect(find.text('الوظيفة مطلوبة'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('field-jobCustom')), 'طيّارة');
    await tester.pumpAndSettle();
    await tapNext(tester);
    expect(find.text('الخطوة 4 من 7'), findsOneWidget);
    expect(dataOf(adapter.to('PATCH', '/api/profile/draft').single.data)['job'], 'طيّارة');
  });

  testWidgets('iPhone SE with the keyboard open on step 5: «التالي» scrolls into view and works', (tester) async {
    final step4 = {...fullStep4}..remove('housingType');
    await openFullSetup(
      tester,
      {...fullStep1, ...fullStep2, ...fullStep3, ...step4},
      size: const Size(375, 667),
    );
    expect(find.text('الخطوة 4 من 7'), findsOneWidget);
    await tapIn(tester, find.byKey(const Key('housingType-ملك')));
    await tapNext(tester);
    expect(find.text('الخطوة 5 من 7'), findsOneWidget);
    await tester.tap(find.byKey(const Key('field-aboutMe')));
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('field-aboutMe')), 'نبذة قصيرة');
    await tester.pumpAndSettle();
    await tapNext(tester);
    expect(find.text('الخطوة 6 من 7'), findsOneWidget);
  });

  group('emptied answers and the server\'s rules', () {
    /// The server's schema for what these tests touch: numbers are numbers (never ""), texts strings, lists lists
    FakeResponse serverRules(RequestOptions r) {
      final body = dataOf(r.data);
      for (final k in ['height', 'weight', 'numberOfSiblings', 'childrenCount', 'prefAgeMin', 'prefAgeMax']) {
        if (body.containsKey(k) && body[k] is! int) return const FakeResponse(400, {'error': 'Expected number'});
      }
      for (final k in ['aboutMe', 'area', 'tribe']) {
        if (body.containsKey(k) && body[k] is! String) return const FakeResponse(400, {'error': 'Expected string'});
      }
      for (final k in ['prefCity', 'prefEducation']) {
        if (body.containsKey(k) && body[k] is! List) return const FakeResponse(400, {'error': 'Expected array'});
      }
      return const FakeResponse(200, {'ok': true});
    }

    Future<(FakeAdapter, ProviderContainer)> open(WidgetTester tester, Map<String, dynamic> profile) async {
      final (adapter, container) = await openFullSetup(tester, profile);
      adapter.handlers['PATCH /api/profile/draft'] = serverRules;
      adapter.handlers['PUT /api/profile'] = serverRules;
      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA')}));
      return (adapter, container);
    }

    testWidgets('an emptied stored height is left out (never ""), and the final save succeeds', (tester) async {
      final step1 = {...fullStep1, 'height': 170}..remove('skinColor');
      final (adapter, container) =
          await open(tester, {...step1, ...fullStep2, ...fullStep3, ...fullStep4, ...fullStep6});
      expect(find.text('الخطوة 1 من 7'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('field-height')), '');
      await tapIn(tester, find.byKey(const Key('skinColor-حنطي')));
      await tapNext(tester);
      expect(dataOf(adapter.to('PATCH', '/api/profile/draft').single.data).keys, isNot(contains('height')));
      for (var i = 0; i < 6; i++) {
        await tapNext(tester);
      }
      expect(dataOf(adapter.to('PUT', '/api/profile').single.data).keys, isNot(contains('height')));
      expect(container.read(authControllerProvider).me!.profileComplete, isTrue);
    });

    testWidgets('a city without areas clears the stored area ("")', (tester) async {
      final step1 = {...fullStep1, 'area': 'العليا'}..remove('skinColor');
      final (adapter, _) = await open(tester, {...step1, ...fullStep2, ...fullStep3, ...fullStep4, ...fullStep6});
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('area-العليا'))).selected, isTrue);
      await tapIn(tester, find.byKey(const Key('city-جدة')));
      expect(find.byKey(const Key('area-العليا')), findsNothing);
      await tapIn(tester, find.byKey(const Key('skinColor-حنطي')));
      await tapNext(tester);
      final draft = dataOf(adapter.to('PATCH', '/api/profile/draft').single.data);
      expect(draft['city'], 'جدة');
      expect(draft['area'], '');
    });

    testWidgets('an emptied stored text is sent "" and an emptied list [], and the save succeeds', (tester) async {
      final (adapter, container) = await open(tester, {
        ...fullStep1, ...fullStep2, ...fullStep3, ...fullStep4, 'aboutMe': 'نبذة قديمة', 'prefCity': ['جدة'],
      });
      // The age range is missing: step 6; back to step 5 for the text
      expect(find.text('الخطوة 6 من 7'), findsOneWidget);
      await tester.tap(find.byTooltip('السابق'));
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 5 من 7'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('field-aboutMe')), '');
      await tester.pumpAndSettle();
      await tapNext(tester);
      expect(dataOf(adapter.to('PATCH', '/api/profile/draft').single.data)['aboutMe'], '');
      await tester.enterText(find.byKey(const Key('age-min')), '28');
      await tester.enterText(find.byKey(const Key('age-max')), '38');
      await tester.pumpAndSettle();
      await tapIn(tester, find.widgetWithText(FilterChip, 'جدة'));
      await tapNext(tester);
      expect(dataOf(adapter.to('PATCH', '/api/profile/draft').last.data)['prefCity'], <String>[]);
      await tapNext(tester);
      final body = dataOf(adapter.to('PUT', '/api/profile').single.data);
      expect(body['aboutMe'], '');
      expect(body['prefCity'], <String>[]);
      expect(container.read(authControllerProvider).me!.profileComplete, isTrue);
    });
  });
}
