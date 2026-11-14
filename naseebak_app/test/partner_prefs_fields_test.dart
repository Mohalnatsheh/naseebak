import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';

import 'helpers/fake_api.dart';

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Widget host(Widget child) => rtlApp(Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  group('PartnerPrefsFields', () {
    testWidgets('picking a city reports the new preferences', (tester) async {
      phone(tester);
      PartnerPrefs? got;
      await tester.pumpWidget(
        host(
          PartnerPrefsFields(
            value: const PartnerPrefs(ageMin: 24, ageMax: 34),
            onChanged: (p) => got = p,
            cities: const ['عمّان', 'إربد'],
            female: true,
            christian: false,
          ),
        ),
      );
      await tester.tap(find.text('إربد'));
      await tester.pump();
      expect(got?.cities, ['إربد']);
      expect(got?.ageMin, 24);
      expect(got?.ageMax, 34);
    });

    testWidgets('typing an age reports it', (tester) async {
      phone(tester);
      PartnerPrefs? got;
      await tester.pumpWidget(
        host(
          PartnerPrefsFields(
            value: const PartnerPrefs(),
            onChanged: (p) => got = p,
            cities: const ['عمّان'],
            female: false,
            christian: false,
          ),
        ),
      );
      await tester.enterText(find.byKey(const Key('age-min')), '25');
      await tester.pump();
      expect(got?.ageMin, 25);
      expect(got?.ageMax, isNull);
    });

    testWidgets('the age fields show ageError; no lock and no save button', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        host(
          PartnerPrefsFields(
            value: const PartnerPrefs(),
            onChanged: (_) {},
            cities: const ['عمّان'],
            female: false,
            christian: false,
            ageError: 'يُرجى تحديد العمر الأدنى والأقصى',
          ),
        ),
      );
      expect(find.text('يُرجى تحديد العمر الأدنى والأقصى'), findsOneWidget);
      expect(find.text('شرط أساسي'), findsNothing);
      expect(find.byKey(const Key('save-prefs')), findsNothing);
    });

    testWidgets('a Christian is never asked the hijab or sect preference', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        host(
          PartnerPrefsFields(
            value: const PartnerPrefs(),
            onChanged: (_) {},
            cities: const ['بيروت'],
            female: false,
            christian: true,
            sectOptions: const ['سني', 'شيعي'],
          ),
        ),
      );
      expect(find.text('هل تفضل محجبة؟'), findsNothing);
      expect(find.text('المذهب'), findsNothing);
    });

    testWidgets('«الديانة لدى الشريك» shows with the list and reports the pick', (tester) async {
      phone(tester);
      String? picked;
      await tester.pumpWidget(
        host(
          PartnerPrefsFields(
            value: const PartnerPrefs(),
            onChanged: (_) {},
            cities: const ['عمّان'],
            female: false,
            christian: false,
            religionOptions: const ['نفس ديانتي', 'لا مانع'],
            prefReligion: 'نفس ديانتي',
            onPrefReligion: (v) => picked = v,
          ),
        ),
      );
      expect(find.text('الديانة لدى الشريك'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pref-religion-لا مانع')));
      await tester.pump();
      expect(picked, 'لا مانع');
    });
  });

  group('DealbreakerToggles', () {
    testWidgets('nothing filled: the empty line (gendered)', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(),
            selected: const {},
            onChanged: (_) {},
            female: false,
            christian: false,
          ),
        ),
      );
      expect(find.text('لم تحدّد تفضيلات بعد، يمكنك المتابعة.'), findsOneWidget);

      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(),
            selected: const {},
            onChanged: (_) {},
            female: true,
            christian: false,
          ),
        ),
      );
      expect(find.text('لم تحدّدي تفضيلات بعد، يمكنكِ المتابعة.'), findsOneWidget);
    });

    testWidgets('a filled city shows its toggle; ticking reports {city}', (tester) async {
      phone(tester);
      Set<String>? got;
      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(cities: ['إربد']),
            selected: const {},
            onChanged: (s) => got = s,
            female: false,
            christian: false,
          ),
        ),
      );
      expect(find.text('لم تحدّد تفضيلات بعد، يمكنك المتابعة.'), findsNothing);
      expect(find.text('لن نقترح عليك من لا يحققه'), findsOneWidget);
      expect(find.byKey(const Key('db-city')), findsOneWidget);
      expect(find.byKey(const Key('db-education')), findsNothing);
      await tester.tap(find.byKey(const Key('db-city')));
      await tester.pump();
      expect(got, {'city'});
    });

    testWidgets('unticking removes the key; her explanation line is gendered', (tester) async {
      phone(tester);
      Set<String>? got;
      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(cities: ['إربد'], religiosity: ['ملتزم']),
            selected: const {'city', 'religiosity'},
            onChanged: (s) => got = s,
            female: true,
            christian: false,
          ),
        ),
      );
      expect(find.text('لن نقترح عليكِ من لا يحققه'), findsOneWidget);
      await tester.tap(find.byKey(const Key('db-city')));
      await tester.pump();
      expect(got, {'religiosity'});
    });

    testWidgets('a Christian sees no hijab, beard or sect toggle', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(hijab: 'نعم', sect: ['سني'], cities: ['بيروت']),
            selected: const {},
            onChanged: (_) {},
            female: false,
            christian: true,
          ),
        ),
      );
      expect(find.byKey(const Key('db-city')), findsOneWidget);
      expect(find.byKey(const Key('db-hijab')), findsNothing);
      expect(find.byKey(const Key('db-sect')), findsNothing);

      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(beard: 'نعم', cities: ['بيروت']),
            selected: const {},
            onChanged: (_) {},
            female: true,
            christian: true,
          ),
        ),
      );
      expect(find.byKey(const Key('db-beard')), findsNothing);
    });

    testWidgets('a Muslim man with a hijab preference sees its toggle', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        host(
          DealbreakerToggles(
            value: const PartnerPrefs(hijab: 'نعم'),
            selected: const {},
            onChanged: (_) {},
            female: false,
            christian: false,
          ),
        ),
      );
      expect(find.byKey(const Key('db-hijab')), findsOneWidget);
    });
  });
}
