import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/features/auth/otp_screen.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/auth/phone_screen.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/phone_validation.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/matches/match_models.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';
import 'package:naseebak_app/features/profile/guardian_form.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/widgets/person_details_view.dart';

import 'package:naseebak_app/features/profile/profile_edit_screen.dart';

import 'account_parity_test.dart' show lists, profileWith, storedProfile;
import 'helpers/fake_api.dart';
import 'setup_progress_test.dart' show answerStep2Rest, setupWith, basics, step2Rest;

const sectOptions = ['سني', 'شيعي', 'أفضّل عدم الذكر'];
const prefSectOptions = ['سني', 'شيعي'];

Map<String, dynamic> lbDetails() => {
      'country': {
        ...lbJson,
        'lists': {
          'cities': ['بيروت', 'طرابلس', 'صيدا'],
          'areas': <String, Object>{},
          'nationalities': {
            'male': ['لبناني', 'سوري'],
            'female': ['لبنانية', 'سورية'],
          },
        },
        'options': {'religiosity': ['ملتزم جداً', 'ملتزم', 'متوسط', 'غير ملتزم'], 'sect': sectOptions, 'prefSect': prefSectOptions},
      },
    };

/// Signed-in Lebanese member (u1, a woman) in setup
Future<(FakeAdapter, List<Override>)> lbSetupWith(Map<String, dynamic>? profile, {int? savedStep}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/countries/LB', FakeResponse(200, lbDetails()))
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'LB', complete: false)}))
    ..on('GET', '/api/me/counts', const FakeResponse(200, {
      'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': true},
    }))
    ..on('GET', '/api/profile', FakeResponse(200, {
      'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': profile},
      'completeness': {'total': 0},
    }))
    ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}))
    ..on('PATCH', '/api/profile/draft', const FakeResponse(200, {'ok': true}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t'), prefs: {'setup_step_u1': ?savedStep});
  return (adapter, overrides);
}

const lbBasics = {
  'dateOfBirth': '1997-03-15T00:00:00.000Z',
  'nationality': 'لبنانية',
  'city': 'بيروت',
  'education': 'بكالوريوس',
};

Map<String, dynamic> bodyOf(RequestOptions r) => Map<String, dynamic>.from(r.data as Map);

void main() {
  group('the sign-in code channel comes from the server', () {
    test('otpChannel is read, with the old fallback when missing (Saudi = WhatsApp, else SMS)', () {
      expect(Country.fromJson(lbJson).otpByWhatsapp, isTrue);
      expect(Country.fromJson(joJson).otpByWhatsapp, isFalse);
      expect(Country.fromJson(saJson).otpByWhatsapp, isTrue);
      expect(Country.fromJson({...joJson, 'otpChannel': 'whatsapp'}).otpByWhatsapp, isTrue);
      expect(Country.fromJson({...saJson, 'otpChannel': 'sms'}).otpByWhatsapp, isFalse);
      expect(Country.fromJson(lbJson).otpChannel, 'whatsapp');
      expect(Country.fromJson(joJson).otpChannel, 'sms');
    });
  });

  testWidgets('a Lebanese code is announced «عبر واتساب» on the phone and code screens; the number keeps no 0', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/countries', const FakeResponse(200, {'defaultCountry': 'JO', 'countries': [joJson, saJson, lbJson]}))
      ..on('POST', '/api/auth/send-otp', const FakeResponse(200, {'message': 'ok'}));
    final router = GoRouter(initialLocation: '/auth/phone', routes: [
      GoRoute(path: '/auth/phone', builder: (_, _) => const PhoneScreen()),
      GoRoute(path: '/auth/otp', builder: (_, _) => const OtpScreen()),
    ]);
    final container = ProviderContainer(overrides: await testOverrides(adapter, prefs: {'selected_country': 'LB'}));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        routerConfig: router,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('+961'), findsOneWidget);
    expect(find.textContaining('عبر واتساب'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('phone-field')), '70123456');
    await tester.tap(find.byKey(const Key('send-otp')));
    await tester.pump();
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(adapter.to('POST', '/api/auth/send-otp').single.data, {'phone': '70123456', 'context': 'login', 'country': 'LB'});
    expect(container.read(pendingAuthProvider)?.otpByWhatsapp, isTrue);
    expect(container.read(pendingAuthProvider)?.withCode('111111').otpByWhatsapp, isTrue);
    expect(find.textContaining('عبر واتساب إلى'), findsOneWidget);
  });

  group('Lebanese phones', () {
    final lb = Country.fromJson(lbJson);

    test('03 numbers keep their 0, 7x and 81 numbers are written without one', () {
      expect(validatePhone('03123456', lb), isNull);
      expect(validatePhone('70123456', lb), isNull);
      expect(validatePhone('+961 3 123 456', lb), isNull);
      expect(validatePhone('9613123456', lb), isNull);
      expect(validatePhone('0096181123456', lb), isNull);
      expect(validatePhone('0791234567', lb), isNotNull);
      expect(localPhone('03123456', lb), '03123456');
      expect(localPhone('+9613123456', lb), '03123456');
      expect(localPhone('70123456', lb), '70123456');
      expect(localPhone('96181123456', lb), '81123456');
    });

    test('a guardian number reads +961 and grouped, like the other countries', () {
      expect(formatGuardianPhone('96171123456'), '+961 71 123 456');
      expect(formatGuardianPhone('9613123456', dialCode: '961'), '+961 3 123 456');
      expect(formatGuardianPhone('03123456', dialCode: '961'), '+961 3 123 456');
      expect(formatGuardianPhone('71123456', dialCode: '961'), '+961 71 123 456');
      // The others are unchanged
      expect(formatGuardianPhone('962791234567'), '+962 79 123 4567');
      expect(formatGuardianPhone('0501234567', dialCode: '966'), '+966 50 123 4567');
    });

    test('a stored guardian number fills the field in the local form', () {
      final f = GuardianFields()
        ..fill(const GuardianInfo(name: 'أحمد', phone: '96171123456', relationship: 'father', address: 'بيروت'), '961');
      expect(f.phone.text, '71123456');
      expect(f.phoneToSend(lb), '96171123456');
      f.fill(const GuardianInfo(name: 'أحمد', phone: '9613123456', relationship: 'father', address: 'بيروت'), '961');
      expect(f.phone.text, '03123456');
      f.dispose();
    });
  });

  group('«المذهب»', () {
    test('labels follow the gender; «أفضّل عدم الذكر» stays as is', () {
      expect(OptionLabels.describe('sect', 'سني', female: true), 'سنية');
      expect(OptionLabels.describe('sect', 'شيعي', female: true), 'شيعية');
      expect(OptionLabels.describe('sect', 'سني', female: false), 'سني');
      expect(OptionLabels.self('sect', 'أفضّل عدم الذكر', female: true), 'أفضّل عدم الذكر');
    });

    testWidgets('a card shows the sect only when the payload has one', (tester) async {
      Future<void> show(Map<String, dynamic> j) => tester.pumpWidget(rtlApp(SingleChildScrollView(
            child: PersonDetailsView(person: PersonDetails.fromJson(j), female: true, initiallyExpanded: true),
          )));
      await show({'id': 'p1', 'firstName': 'هدى', 'sect': 'شيعي', 'religiosity': 'ملتزم'});
      expect(find.text('المذهب'), findsOneWidget);
      expect(find.text('شيعية'), findsOneWidget);
      await show({'id': 'p1', 'firstName': 'هدى', 'sect': null, 'religiosity': 'ملتزم'});
      expect(find.text('المذهب'), findsNothing);
    });

    test('partner preference: read, saved only when offered, and a «شرط أساسي» once filled', () {
      final p = PartnerPrefs.fromJson({'prefSect': ['سني'], 'dealbreakers': ['sect']});
      expect(p.sect, ['سني']);
      expect(p.activeDealbreakers(female: true), ['sect']);
      expect(const PartnerPrefs(dealbreakers: {'sect'}).activeDealbreakers(female: true), isEmpty);
      expect(p.toChanges(female: true, withSect: true)['prefSect'], ['سني']);
      expect(p.toChanges(female: true).containsKey('prefSect'), isFalse);
    });

    testWidgets('preferences: the sect question shows only with the country\'s options', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final adapter = FakeAdapter()
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': false}))
        ..on('PUT', '/api/profile/dealbreakers', const FakeResponse(200, {'keys': []}))
        ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {}}));
      final overrides = await testOverrides(adapter);
      Future<void> show({List<String> sect = const []}) => tester.pumpWidget(ProviderScope(
            overrides: overrides,
            child: rtlApp(Scaffold(
              body: PreferencesForm(
                initial: const PartnerPrefs(ageMin: 24, ageMax: 34),
                cities: const ['بيروت'],
                female: true,
                withDealbreakers: true,
                sectOptions: sect,
              ),
            )),
          ));
      await show();
      await tester.pumpAndSettle();
      expect(find.text('المذهب'), findsNothing);

      await show(sect: prefSectOptions);
      await tester.pumpAndSettle();
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.byKey(const Key('db-sect')), 300, scrollable: scrollable);
      expect(find.text('المذهب'), findsOneWidget);
      // His sect, in his gender
      await tester.tap(find.text('سني'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('db-sect')));
      await tester.pump();
      await tester.scrollUntilVisible(find.byKey(const Key('save-prefs')), 300, scrollable: scrollable);
      await tester.tap(find.byKey(const Key('save-prefs')));
      await tester.pumpAndSettle();
      final changes = bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'] as Map;
      expect(changes['prefSect'], ['سني']);
      expect(bodyOf(adapter.to('PUT', '/api/profile/dealbreakers').single)['keys'], contains('sect'));
    });
  });

  group('profile edit', () {
    // The stored profile's answers plus Lebanon's «المذهب»
    final lbLists = CountryLists(
      cities: lists.cities,
      nationalitiesFemale: lists.nationalitiesFemale,
      options: {...lists.options, 'sect': sectOptions},
    );

    Future<FakeAdapter> openEditor(WidgetTester tester, CountryLists l, Map<String, Object?> stored) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final adapter = FakeAdapter()
        ..on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}))
        ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}}))
        ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));
      await tester.pumpWidget(ProviderScope(
        overrides: await testOverrides(adapter),
        child: rtlApp(Scaffold(body: ProfileEditForm(profile: profileWith(stored), lists: l, pending: null))),
      ));
      await tester.pumpAndSettle();
      return adapter;
    }

    Future<void> save(WidgetTester tester) async {
      await tester.scrollUntilVisible(find.byKey(const Key('save-profile')), 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('save-profile')));
      await tester.pumpAndSettle();
    }

    testWidgets('Lebanon: the own sect is required (like religiosity); her «أفضّل عدم الذكر» is offered', (tester) async {
      final adapter = await openEditor(tester, lbLists, storedProfile);
      expect(find.byKey(const Key('sect-أفضّل عدم الذكر')), findsOneWidget);
      await save(tester);
      expect(find.text('يرجى اختيار المذهب'), findsOneWidget);
      expect(adapter.requests.where((r) => r.method == 'PUT'), isEmpty);

      await tester.scrollUntilVisible(find.byKey(const Key('sect-شيعي')), -300, scrollable: find.byType(Scrollable).first);
      await tester.drag(find.byType(Scrollable).first, const Offset(0, 200));
      await tester.pumpAndSettle();
      expect(find.text('شيعية'), findsOneWidget);
      await tester.tap(find.byKey(const Key('sect-شيعي')));
      await save(tester);
      expect(bodyOf(adapter.to('PUT', '/api/profile').single)['sect'], 'شيعي');
    });

    testWidgets('Jordan (no sect options): not shown, not required', (tester) async {
      await openEditor(tester, lists, storedProfile);
      expect(find.text('المذهب'), findsNothing);
      expect(find.byKey(const Key('sect-سني')), findsNothing);
    });
  });

  group('setup step 2 asks «المذهب» only when the country\'s options carry it', () {
    testWidgets('Lebanon: required, then saved with the step', (tester) async {
      final (adapter, overrides) = await lbSetupWith(
        {...lbBasics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم'},
        savedStep: 2,
      );
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      // The sect is still missing: on step 2
      expect(find.text('الخطوة 2 من 7'), findsOneWidget);
      expect(find.text('المذهب'), findsOneWidget);
      expect(find.text('أفضّل عدم الذكر'), findsOneWidget);
      await answerStep2Rest(tester);

      final next = find.byKey(const Key('setup-next'));
      await tester.scrollUntilVisible(next, 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(next);
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 2 من 7'), findsOneWidget);
      expect(find.text('المذهب مطلوب'), findsOneWidget);

      // Her own answer, in her gender
      await tester.ensureVisible(find.text('سنية'));
      await tester.tap(find.text('سنية'));
      await tester.pumpAndSettle();
      expect(find.text('المذهب مطلوب'), findsNothing);
      await tester.scrollUntilVisible(next, 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(next);
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 3 من 7'), findsOneWidget);
      expect(adapter.to('PATCH', '/api/profile/draft').single.data, {
        'religiosity': 'ملتزم',
        'sect': 'سني',
        ...step2Rest,
      });
    });

    testWidgets('Saudi Arabia (no sect options, as every older server): not asked', (tester) async {
      final (adapter, overrides) = await setupWith(
        {...basics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم'},
        savedStep: 1,
      );
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 2 من 7'), findsOneWidget);
      expect(find.text('المذهب'), findsNothing);
      await answerStep2Rest(tester);
      final next = find.byKey(const Key('setup-next'));
      await tester.scrollUntilVisible(next, 300, scrollable: find.byType(Scrollable).first);
      await tester.tap(next);
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 3 من 7'), findsOneWidget);
      expect(adapter.to('PATCH', '/api/profile/draft').single.data, {'religiosity': 'ملتزم', ...step2Rest});
    });
  });
}
