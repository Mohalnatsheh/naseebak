import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/discovery/card_facts.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/widgets/person_details_view.dart';

PersonDetails person(Map<String, dynamic> j) => PersonDetails.fromJson({'id': 'p1', 'firstName': 'هدى', ...j});

List<String> keys(List<CardFact> f) => f.map((e) => e.key).toList();

Widget rtlApp(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('cardFacts', () {
    final full = {
      'job': 'موظف',
      'education': 'بكالوريوس',
      'religiosity': 'ملتزم',
      'hijab': true,
      'niqab': false,
      'beard': true,
      'height': 170,
      'maritalStatus': 'أعزب',
      'smokingStatus': 'غير مدخن',
      'tribe': 'الحديد',
    };

    test('a different religion leads as a ninth fact; same or unknown shows none', () {
      final c = person({...full, 'religion': 'مسيحي', 'hijab': null, 'niqab': null});
      final f = cardFacts(c, female: true, tribeLabel: 'العشيرة', lebanon: false, viewerReligion: 'مسلم');
      expect(f.first.key, 'religion');
      expect(f.first.label, 'الديانة');
      expect(f.first.value, 'مسيحية');
      expect(keys(f).contains('veil'), isFalse);
      expect(keys(cardFacts(c, female: true, tribeLabel: 'x', lebanon: false, viewerReligion: 'مسيحي')).contains('religion'), isFalse);
      expect(keys(cardFacts(c, female: true, tribeLabel: 'x', lebanon: false)).contains('religion'), isFalse);
      expect(keys(cardFacts(person(full), female: true, tribeLabel: 'x', lebanon: false, viewerReligion: 'مسيحي')).contains('religion'), isFalse);
    });

    test('a woman: fixed order with the veil, labels as on the website', () {
      final f = cardFacts(person(full), female: true, tribeLabel: 'العشيرة', lebanon: false);
      expect(keys(f), ['job', 'education', 'religiosity', 'veil', 'height', 'maritalStatus', 'smoking', 'tribe']);
      expect(f.map((e) => e.label).toList(),
          ['العمل', 'التعليم', 'الالتزام', 'الحجاب', 'الطول', 'الحالة الاجتماعية', 'التدخين', 'العشيرة']);
      expect(f[3].value, 'محجبة');
      expect(f[4].value, '170 سم');
    });

    test('a man: beard instead of the veil', () {
      final f = cardFacts(person(full), female: false, tribeLabel: 'العشيرة', lebanon: false);
      expect(keys(f), ['job', 'education', 'religiosity', 'beard', 'height', 'maritalStatus', 'smoking', 'tribe']);
      expect(f[3].label, 'اللحية');
      expect(f[3].value, 'ملتحٍ');
      expect(cardFacts(person({'beard': false}), female: false, tribeLabel: 'x', lebanon: false).single.value, 'غير ملتحٍ');
    });

    test('Lebanon: the sect replaces the tribe, and the tribe stays when there is no sect', () {
      final withSect = cardFacts(person({...full, 'sect': 'شيعي'}), female: true, tribeLabel: 'العائلة', lebanon: true);
      expect(keys(withSect).last, 'sect');
      expect(withSect.last.label, 'المذهب');
      expect(withSect.last.value, 'شيعية');
      expect(keys(withSect), isNot(contains('tribe')));
      final noSect = cardFacts(person(full), female: true, tribeLabel: 'العائلة', lebanon: true);
      expect(keys(noSect).last, 'tribe');
      expect(noSect.last.label, 'العائلة');
      final undisclosed = cardFacts(person({...full, 'sect': sectUndisclosed}), female: true, tribeLabel: 'العائلة', lebanon: true);
      expect(keys(undisclosed).last, 'tribe');
      // outside Lebanon the sect is never shown
      final jo = cardFacts(person({...full, 'sect': 'سني'}), female: true, tribeLabel: 'العشيرة', lebanon: false);
      expect(keys(jo), isNot(contains('sect')));
    });

    test('empty fields are skipped', () {
      expect(cardFacts(person({}), female: true, tribeLabel: 'العشيرة', lebanon: false), isEmpty);
      final f = cardFacts(person({'job': '', 'education': 'ماجستير', 'tribe': ''}), female: true, tribeLabel: 'العشيرة', lebanon: false);
      expect(keys(f), ['education']);
    });

    test('values follow the gender', () {
      final j = {'maritalStatus': 'أعزب', 'religiosity': 'ملتزم'};
      final she = cardFacts(person(j), female: true, tribeLabel: 'x', lebanon: false);
      final he = cardFacts(person(j), female: false, tribeLabel: 'x', lebanon: false);
      expect(she[0].value, OptionLabels.describe('religiosity', 'ملتزم', female: true));
      expect(he[0].value, OptionLabels.describe('religiosity', 'ملتزم', female: false));
      expect(she[1].value, OptionLabels.describe('maritalStatus', 'أعزب', female: true));
      expect(he[1].value, OptionLabels.describe('maritalStatus', 'أعزب', female: false));
    });
  });

  group('PersonDetailsView religion', () {
    testWidgets('the full profile always shows «الديانة»; a Christian gets no mosque icon', (tester) async {
      await tester.pumpWidget(rtlApp(PersonDetailsView(
          person: person({'religion': 'مسلم', 'religiosity': 'ملتزم'}), female: true, alwaysExpanded: true)));
      expect(find.text('الديانة'), findsOneWidget);
      expect(find.text('مسلمة'), findsOneWidget);
      expect(find.byIcon(Icons.mosque_outlined), findsOneWidget);
      await tester.pumpWidget(rtlApp(PersonDetailsView(
          person: person({'religion': 'مسيحي', 'religiosity': 'ملتزم'}), female: false, alwaysExpanded: true)));
      expect(find.text('مسيحي'), findsOneWidget);
      expect(find.byIcon(Icons.mosque_outlined), findsNothing);
      await tester.pumpWidget(rtlApp(PersonDetailsView(person: person({'religiosity': 'ملتزم'}), female: true, alwaysExpanded: true)));
      expect(find.text('الديانة'), findsNothing);
    });
  });

  group('PersonDetailsView alwaysExpanded', () {
    final j = {'height': 168, 'aboutMe': 'أحب القراءة', 'job': 'معلمة'};

    testWidgets('shows the extra facts and texts with no toggle', (tester) async {
      await tester.pumpWidget(rtlApp(PersonDetailsView(person: person(j), female: true, alwaysExpanded: true)));
      expect(find.text('الطول'), findsOneWidget);
      expect(find.text('نبذة'), findsOneWidget);
      expect(find.text('أحب القراءة'), findsOneWidget);
      expect(find.text('عرض كل التفاصيل'), findsNothing);
      expect(find.text('إخفاء التفاصيل'), findsNothing);
    });

    testWidgets('default keeps the toggle and hides the extras', (tester) async {
      await tester.pumpWidget(rtlApp(PersonDetailsView(person: person(j), female: true)));
      expect(find.text('الطول'), findsNothing);
      expect(find.text('عرض كل التفاصيل'), findsOneWidget);
    });
  });
}
