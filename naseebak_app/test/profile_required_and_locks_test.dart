import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/profile/guardian_form.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_edit_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';

import 'helpers/fake_api.dart';

Widget scoped(List<Override> overrides, Widget child) => ProviderScope(overrides: overrides, child: rtlApp(child));
Map<String, dynamic> bodyOf(RequestOptions r) => Map<String, dynamic>.from(r.data as Map);

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> scrollTo(WidgetTester tester, Finder f) =>
    tester.scrollUntilVisible(f, 300, scrollable: find.byType(Scrollable).first);

MyProfile profileWith(Map<String, Object?> p) => MyProfile.fromJson({
      'user': {'id': 'u1', 'firstName': 'سارة', 'lastName': 'أحمد', 'gender': 'FEMALE', 'profile': p},
      'completeness': {'total': 60, 'sections': []},
    });

const stored = {
  'dateOfBirth': '1998-04-02T00:00:00.000Z',
  'nationality': 'أردنية',
  'city': 'عمّان',
  'area': 'عبدون',
  'education': 'بكالوريوس',
  'maritalStatus': 'أعزب/عزباء',
  'religiosity': 'ملتزم',
  'childrenCount': 0,
  'hijab': false,
  'isComplete': true,
};

const lists = CountryLists(
  cities: ['عمّان', 'إربد'],
  areas: {
    'عمّان': ['عبدون', 'الصويفية'],
    'إربد': ['الحصن'],
  },
  nationalitiesFemale: ['أردنية'],
  options: {
    'education': ['ثانوية عامة', 'بكالوريوس'],
    'job': ['مهندس', 'أخرى'],
    'maritalStatus': ['أعزب/عزباء', 'مطلق/مطلقة'],
    'religiosity': ['ملتزم', 'متوسط'],
  },
);

ChoiceChip chip(WidgetTester tester, String key) => tester.widget<ChoiceChip>(find.byKey(Key(key)));

void main() {
  group('profile edit: required choices and the area', () {
    test('rules mirror the website edit page', () {
      expect(missingRequiredChoice({...stored}), isNull);
      expect(missingRequiredChoice({...stored, 'education': null}), 'يرجى اختيار المستوى التعليمي');
      expect(missingRequiredChoice({...stored, 'nationality': ''}), 'يرجى إدخال الجنسية');
      expect(missingRequiredChoice({...stored, 'religiosity': null}), 'يرجى اختيار مستوى التدين');
      expect(areaAfterCityChange('عبدون', ['الحصن']), isNull);
      expect(areaAfterCityChange('عبدون', ['عبدون']), 'عبدون');
      expect(requiredChoices, containsAll(['nationality', 'city', 'education', 'maritalStatus', 'religiosity']));
    });

    testWidgets('tapping the chosen chip of a required field keeps it; an optional one clears', (tester) async {
      phone(tester);
      await tester.pumpWidget(scoped(
        await testOverrides(FakeAdapter()),
        Scaffold(body: ProfileEditForm(profile: profileWith({...stored, 'skinColor': null}), lists: lists, pending: null)),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('education-بكالوريوس')));
      await tester.pump();
      expect(chip(tester, 'education-بكالوريوس').selected, isTrue);
      await tester.tap(find.byKey(const Key('city-عمّان')));
      await tester.pump();
      expect(chip(tester, 'city-عمّان').selected, isTrue);
      // The area of an optional field can still be cleared
      await tester.tap(find.byKey(const Key('area-عبدون')));
      await tester.pump();
      expect(chip(tester, 'area-عبدون').selected, isFalse);
    });

    testWidgets('a new city drops the old city\'s area: it goes to review as cleared', (tester) async {
      phone(tester);
      final adapter = FakeAdapter()
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': true}))
        ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}}))
        ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));
      await tester.pumpWidget(scoped(
        await testOverrides(adapter),
        Scaffold(body: ProfileEditForm(profile: profileWith(stored), lists: lists, pending: null)),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('city-إربد')));
      await tester.pump();
      expect(find.byKey(const Key('area-عبدون')), findsNothing);
      expect(chip(tester, 'area-الحصن').selected, isFalse);
      await scrollTo(tester, find.byKey(const Key('save-profile')));
      await tester.tap(find.byKey(const Key('save-profile')));
      await tester.pumpAndSettle();
      expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'city': 'إربد', 'area': null});
    });

    testWidgets('a profile missing a required choice can\'t be saved until it is picked', (tester) async {
      phone(tester);
      final adapter = FakeAdapter();
      await tester.pumpWidget(scoped(
        await testOverrides(adapter),
        Scaffold(body: ProfileEditForm(profile: profileWith({...stored, 'religiosity': null}), lists: lists, pending: null)),
      ));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.byKey(const Key('save-profile')));
      await tester.tap(find.byKey(const Key('save-profile')));
      await tester.pumpAndSettle();
      expect(adapter.requests, isEmpty);
      expect(find.text('يرجى اختيار مستوى التدين'), findsOneWidget);
    });
  });

  group('«شروطي الأساسية»', () {
    test('only locks on a filled-in preference are sent (the website\'s activeDealbreakers)', () {
      const p = PartnerPrefs(
        ageMin: 25,
        ageMax: 35,
        cities: [],
        religiosity: ['ملتزم'],
        beard: 'لا يهم',
        children: 'نعم',
        dealbreakers: {'age', 'city', 'religiosity', 'beard', 'children', 'hijab'},
      );
      expect(p.activeDealbreakers(female: true).toSet(), {'age', 'religiosity'});
      const q = PartnerPrefs(beard: 'نعم', hijab: 'نعم', children: 'لا', dealbreakers: {'beard', 'hijab', 'children'});
      // Her lock is on his beard; his would be on her hijab
      expect(q.activeDealbreakers(female: true).toSet(), {'beard', 'children'});
      expect(q.activeDealbreakers(female: false).toSet(), {'hijab', 'children'});
    });

    testWidgets('emptying a preference unticks its lock; the save never sends it', (tester) async {
      phone(tester);
      final adapter = FakeAdapter()
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': false}))
        ..on('PUT', '/api/profile/dealbreakers', const FakeResponse(200, {'keys': []}))
        ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {}}));
      await tester.pumpWidget(scoped(
        await testOverrides(adapter),
        const Scaffold(
          body: PreferencesForm(
            initial: PartnerPrefs(
              ageMin: 24,
              ageMax: 34,
              cities: ['إربد'],
              religiosity: ['ملتزم'],
              // A lock saved earlier on an empty preference
              dealbreakers: {'city', 'religiosity', 'smokingStatus'},
            ),
            cities: ['عمّان', 'إربد'],
            female: true,
            withDealbreakers: true,
          ),
        ),
      ));
      await tester.pumpAndSettle();
      FilterChip lock(String k) => tester.widget<FilterChip>(find.byKey(Key('db-$k')));
      expect(lock('city').selected, isTrue);

      await tester.tap(find.text('إربد'));
      await tester.pump();
      expect(lock('city').selected, isFalse);
      expect(lock('city').onSelected, isNull);

      await scrollTo(tester, find.byKey(const Key('save-prefs')));
      await tester.tap(find.byKey(const Key('save-prefs')));
      await tester.pumpAndSettle();
      expect(bodyOf(adapter.to('PUT', '/api/profile/dealbreakers').single)['keys'], ['religiosity']);
    });
  });

  group('guardian', () {
    final jo = Country.fromJson(joJson);

    test('an unchanged number is sent in its stored form (the server\'s consent-only shortcut compares it)', () {
      final f = GuardianFields()
        ..fill(const GuardianInfo(name: 'أحمد', phone: '962791234567', relationship: 'father', address: 'عمّان'), '962');
      expect(f.phone.text, '0791234567');
      expect(f.phoneToSend(jo), '962791234567');
      f.phone.text = '٠٧٩١٢٣٤٥٦٧';
      expect(f.phoneToSend(jo), '962791234567');
      f.phone.text = '0781234567';
      expect(f.phoneToSend(jo), '0781234567');
      f.dispose();
    });

    test('a new guardian is sent as typed (local form)', () {
      final f = GuardianFields()..phone.text = '0791234567';
      expect(f.phoneToSend(jo), '0791234567');
      f.dispose();
    });
  });
}
