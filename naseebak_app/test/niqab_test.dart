import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_edit_plan.dart';
import 'package:naseebak_app/features/profile/profile_edit_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';
import 'package:naseebak_app/features/profile/profile_screen.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/widgets/person_details_view.dart';

import 'helpers/fake_api.dart';

Widget scoped(List<Override> overrides, Widget child) => ProviderScope(overrides: overrides, child: rtlApp(child));
Map<String, dynamic> bodyOf(RequestOptions r) => Map<String, dynamic>.from(r.data as Map);

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> scrollTo(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 300, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

const _basics = {
  'dateOfBirth': '1998-04-02T00:00:00.000Z',
  'nationality': 'أردنية',
  'city': 'عمّان',
  'education': 'بكالوريوس',
  'maritalStatus': 'أعزب/عزباء',
  'religiosity': 'ملتزم',
  'childrenCount': 0,
  'prefAgeMin': 25,
  'prefAgeMax': 35,
  'isComplete': true,
};

MyProfile woman(Map<String, Object?> extra) => MyProfile.fromJson({
      'user': {
        'id': 'u1',
        'firstName': 'سارة',
        'lastName': 'أحمد',
        'gender': 'FEMALE',
        'profile': {..._basics, ...extra},
      },
      'completeness': {'total': 60, 'sections': []},
    });

const lists = CountryLists(
  cities: ['عمّان', 'إربد'],
  nationalitiesFemale: ['أردنية'],
  incomeRanges: ['أقل من 500 د.أ'],
  expenseRanges: ['أقل من 300 د.أ'],
  tribeLabel: 'العشيرة',
  options: {
    'education': ['ثانوية عامة', 'بكالوريوس'],
    'job': ['مهندس', 'أخرى'],
    'maritalStatus': ['أعزب/عزباء', 'مطلق/مطلقة'],
    'religiosity': ['ملتزم', 'متوسط'],
    'smokingStatus': ['لا أدخن'],
  },
);

FakeAdapter editAdapter() => FakeAdapter()
  ..on('PUT', '/api/profile', const FakeResponse(200, {'message': 'ok'}))
  ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': true}))
  ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}}))
  ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));

Future<void> openEditor(WidgetTester tester, FakeAdapter adapter, MyProfile profile, {PendingEdit? pending}) async {
  await tester.pumpWidget(scoped(
    await testOverrides(adapter),
    Scaffold(body: ProfileEditForm(profile: profile, lists: lists, pending: pending)),
  ));
  await tester.pumpAndSettle();
}

Future<void> pickAndSave(WidgetTester tester, String chip) async {
  await scrollTo(tester, find.byKey(Key(chip)));
  await tester.tap(find.byKey(Key(chip)));
  await tester.pump();
  await scrollTo(tester, find.byKey(const Key('save-profile')));
  await tester.tap(find.byKey(const Key('save-profile')));
  await tester.pumpAndSettle();
}

void main() {
  group('models', () {
    test('a person carries niqab next to hijab', () {
      final p = PersonDetails.fromJson({'id': 'a', 'firstName': 'هند', 'hijab': true, 'niqab': true});
      expect(p.hijab, isTrue);
      expect(p.niqab, isTrue);
      expect(PersonDetails.fromJson({'id': 'a', 'firstName': 'هند', 'hijab': true}).niqab, isNull);
    });

    test('the hijab answer reads منتقبة / محجبة / غير محجبة', () {
      expect(hijabLabel(true, true), 'منتقبة');
      expect(hijabLabel(true, false), 'محجبة');
      expect(hijabLabel(true, null), 'محجبة');
      expect(hijabLabel(false, false), 'غير محجبة');
      expect(hijabLabel(false, null), 'غير محجبة');
      expect(hijabLabel(null, null), isNull);
    });

    test('prefHijab «منتقبة» is read, counts as a filled lock and is sent back unchanged', () {
      final p = PartnerPrefs.fromJson({'prefHijab': 'منتقبة', 'dealbreakers': ['hijab']});
      expect(p.hijab, 'منتقبة');
      expect(p.dealbreakerFilled('hijab', female: false), isTrue);
      expect(p.activeDealbreakers(female: false), ['hijab']);
      expect(p.toChanges(female: false)['prefHijab'], 'منتقبة');
      // Beard and children never take it
      expect(PartnerPrefs.fromJson({'prefBeard': 'منتقبة'}).beard, isNull);
    });

    test('the hijab pair travels together: one under review takes the other with it', () {
      final plan = keepHijabPairTogether(planProfileEdit(
        {'hijab': false, 'niqab': null},
        {'hijab': true, 'niqab': true},
      ));
      expect(plan.fills, isEmpty);
      expect(plan.reviewed, {'hijab': true, 'niqab': true});

      final fillOnly = keepHijabPairTogether(planProfileEdit({'hijab': true, 'niqab': null}, {'hijab': true, 'niqab': true}));
      expect(fillOnly.fills, {'niqab': true});
      expect(fillOnly.reviewed, isEmpty);
    });
  });

  group('her answer in «تعديل ملفي»', () {
    testWidgets('one question with three choices; the stored answer is selected', (tester) async {
      phone(tester);
      await openEditor(tester, editAdapter(), woman({'hijab': true, 'niqab': true}));
      await scrollTo(tester, find.byKey(const Key('hijab-niqab')));
      expect(find.text('الحجاب'), findsWidgets);
      expect(find.text('هل أنتِ محجبة؟'), findsNothing);
      ChoiceChip chip(String k) => tester.widget<ChoiceChip>(find.byKey(Key(k)));
      expect(chip('hijab-hijab').selected, isFalse);
      expect(chip('hijab-niqab').selected, isTrue);
      expect(chip('hijab-none').selected, isFalse);
    });

    testWidgets('«منتقبة» on an empty niqab saves at once', (tester) async {
      phone(tester);
      final adapter = editAdapter();
      await openEditor(tester, adapter, woman({'hijab': true, 'niqab': null}));
      await pickAndSave(tester, 'hijab-niqab');
      final put = bodyOf(adapter.to('PUT', '/api/profile').single);
      expect(put['niqab'], isTrue);
      expect(put.containsKey('hijab'), isFalse);
      expect(adapter.to('POST', '/api/profile/update-request'), isEmpty);
    });

    testWidgets('«منتقبة» after «غير محجبة» goes to review as both fields', (tester) async {
      phone(tester);
      final adapter = editAdapter();
      await openEditor(tester, adapter, woman({'hijab': false, 'niqab': null}));
      await pickAndSave(tester, 'hijab-niqab');
      expect(adapter.to('PUT', '/api/profile'), isEmpty);
      expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'hijab': true, 'niqab': true});
    });

    testWidgets('«غير محجبة» after «منتقبة» clears both through review', (tester) async {
      phone(tester);
      final adapter = editAdapter();
      await openEditor(tester, adapter, woman({'hijab': true, 'niqab': true}));
      await pickAndSave(tester, 'hijab-none');
      expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'hijab': false, 'niqab': false});
    });

    testWidgets('«محجبة» after «منتقبة» sends niqab false for review', (tester) async {
      phone(tester);
      final adapter = editAdapter();
      await openEditor(tester, adapter, woman({'hijab': true, 'niqab': true}));
      await pickAndSave(tester, 'hijab-hijab');
      expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'niqab': false});
    });

    testWidgets('a pending niqab change is named «النقاب»', (tester) async {
      phone(tester);
      await openEditor(tester, editAdapter(), woman({'hijab': true, 'niqab': true}),
          pending: const PendingEdit(id: 'r1', fields: ['hijab', 'niqab']));
      expect(find.textContaining('طلب تعديل قيد المراجعة: الحجاب، النقاب'), findsOneWidget);
    });
  });

  group('his preference', () {
    testWidgets('«منتقبة» is a choice and is saved as the stored value', (tester) async {
      phone(tester);
      final adapter = FakeAdapter()
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': false}))
        ..on('PUT', '/api/profile/dealbreakers', const FakeResponse(200, {'keys': []}))
        ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {}}));
      await tester.pumpWidget(scoped(
        await testOverrides(adapter),
        const Scaffold(
          body: PreferencesForm(
            initial: PartnerPrefs(ageMin: 24, ageMax: 34),
            cities: ['عمّان'],
            female: false,
            withDealbreakers: true,
          ),
        ),
      ));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.byKey(const Key('pref-hijab-منتقبة')));
      await tester.tap(find.byKey(const Key('pref-hijab-منتقبة')));
      await tester.pump();
      await scrollTo(tester, find.byKey(const Key('db-hijab')));
      await tester.tap(find.byKey(const Key('db-hijab')));
      await tester.pump();
      await scrollTo(tester, find.byKey(const Key('save-prefs')));
      await tester.tap(find.byKey(const Key('save-prefs')));
      await tester.pumpAndSettle();
      final changes = Map<String, dynamic>.from(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'] as Map);
      expect(changes['prefHijab'], 'منتقبة');
      expect(bodyOf(adapter.to('PUT', '/api/profile/dealbreakers').single)['keys'], ['hijab']);
    });

    testWidgets('a woman is never offered «منتقبة» for his beard', (tester) async {
      phone(tester);
      await tester.pumpWidget(scoped(
        await testOverrides(FakeAdapter()),
        const Scaffold(
          body: PreferencesForm(initial: PartnerPrefs(), cities: [], female: true, withDealbreakers: false),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('منتقبة'), findsNothing);
    });
  });

  group('showing it', () {
    testWidgets('person details read «منتقبة» when niqab is true', (tester) async {
      phone(tester);
      Future<void> show(Map<String, dynamic> j) async {
        await tester.pumpWidget(rtlApp(Scaffold(
          body: SingleChildScrollView(
            child: PersonDetailsView(person: PersonDetails.fromJson(j), female: true, initiallyExpanded: true),
          ),
        )));
        await tester.pumpAndSettle();
      }

      await show({'id': 'a', 'firstName': 'هند', 'hijab': true, 'niqab': true});
      expect(find.text('منتقبة'), findsOneWidget);
      expect(find.text('محجبة'), findsNothing);
      await show({'id': 'a', 'firstName': 'هند', 'hijab': true, 'niqab': false});
      expect(find.text('محجبة'), findsOneWidget);
      await show({'id': 'a', 'firstName': 'هند', 'hijab': false});
      expect(find.text('غير محجبة'), findsOneWidget);
    });

    testWidgets('my own profile shows my hijab answer', (tester) async {
      phone(tester);
      final adapter = FakeAdapter()
        ..on(
          'GET',
          '/api/profile',
          const FakeResponse(200, {
            'user': {
              'id': 'u1',
              'firstName': 'سارة',
              'lastName': 'أحمد',
              'gender': 'FEMALE',
              'profile': {..._basics, 'hijab': true, 'niqab': true},
            },
            'completeness': {'total': 60, 'sections': []},
          }),
        );
      await tester.pumpWidget(scoped(await testOverrides(adapter), const ProfileScreen()));
      await tester.pumpAndSettle();
      expect(find.text('الحجاب'), findsOneWidget);
      expect(find.text('منتقبة'), findsOneWidget);
    });

    testWidgets('«ملفي» shows an edit waiting for review, and the job', (tester) async {
      phone(tester);
      final adapter = FakeAdapter()
        ..on('GET', '/api/profile', const FakeResponse(200, {
          'user': {
            'id': 'u1',
            'firstName': 'سارة',
            'lastName': 'أحمد',
            'gender': 'FEMALE',
            'profile': {..._basics, 'job': 'معلمة'},
          },
          'completeness': {'total': 60, 'sections': []},
        }))
        ..on('GET', '/api/profile/update-request', const FakeResponse(200, {
          'requests': [
            {'id': 'r1', 'status': 'PENDING', 'changes': {'city': 'إربد'}, 'createdAt': '2026-11-10T10:00:00.000Z'},
          ],
        }));
      await tester.pumpWidget(scoped(await testOverrides(adapter), const ProfileScreen()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile-pending-review')), findsOneWidget);
      expect(find.textContaining('المدينة'), findsWidgets);
      expect(find.text('معلمة'), findsOneWidget);
    });
  });
}
