import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/profile/profile_field_control.dart';

import 'helpers/fake_api.dart';

const lists = CountryLists(
  cities: ['عمّان', 'إربد'],
  areas: {
    'عمّان': ['عبدون', 'الصويفية'],
  },
  nationalitiesFemale: ['أردنية'],
  options: {
    'skinColor': ['أبيض', 'قمحي', 'أسمر'],
    'job': ['مهندس', 'ربة منزل', 'أخرى'],
    'education': ['بكالوريوس', 'ماجستير'],
  },
);

typedef Change = (String, Object?);

Future<List<Change>> pumpControl(
  WidgetTester tester,
  String key, {
  Map<String, Object?> values = const {},
  bool female = true,
  TextEditingController? controller,
  String? error,
  bool clearable = true,
}) async {
  final changes = <Change>[];
  await tester.pumpWidget(rtlApp(Scaffold(
    body: SingleChildScrollView(
      child: ProfileFieldControl(
        fieldKey: key,
        values: values,
        onChanged: (k, v) => changes.add((k, v)),
        lists: lists,
        female: female,
        controller: controller,
        error: error,
        clearable: clearable,
      ),
    ),
  )));
  await tester.pumpAndSettle();
  return changes;
}

void main() {
  testWidgets('a choice chip reports its value under the field key, with the edit title', (tester) async {
    final changes = await pumpControl(tester, 'skinColor');
    expect(find.text('لون البشرة'), findsOneWidget);
    await tester.tap(find.byKey(const Key('skinColor-قمحي')));
    expect(changes, [('skinColor', 'قمحي')]);
  });

  testWidgets('tapping the chosen chip clears it, unless not clearable', (tester) async {
    var changes = await pumpControl(tester, 'education', values: {'education': 'بكالوريوس'});
    await tester.tap(find.byKey(const Key('education-بكالوريوس')));
    expect(changes, [('education', null)]);

    changes = await pumpControl(tester, 'education', values: {'education': 'بكالوريوس'}, clearable: false);
    await tester.tap(find.byKey(const Key('education-بكالوريوس')));
    expect(changes, isEmpty);
  });

  testWidgets('«منتقبة» writes hijab and niqab together', (tester) async {
    final changes = await pumpControl(tester, 'hijab');
    expect(find.text('الحجاب'), findsOneWidget);
    await tester.tap(find.byKey(const Key('hijab-niqab')));
    expect(changes, containsAll([('hijab', true), ('niqab', true)]));
    expect(changes, hasLength(2));
  });

  testWidgets('yes / no writes a bool', (tester) async {
    final changes = await pumpControl(tester, 'beard', female: false);
    expect(find.text('هل أنت ملتحٍ؟'), findsOneWidget);
    await tester.tap(find.byKey(const Key('beard-false')));
    expect(changes, [('beard', false)]);
  });

  testWidgets('job «أخرى» is reported and shows the custom job field', (tester) async {
    final custom = TextEditingController();
    addTearDown(custom.dispose);
    var changes = await pumpControl(tester, 'job', controller: custom);
    expect(find.byKey(const Key('field-jobCustom')), findsNothing);
    await tester.tap(find.text('أخرى'));
    expect(changes, [('job', 'أخرى')]);

    changes = await pumpControl(tester, 'job', values: {'job': 'أخرى'}, controller: custom);
    expect(find.byKey(const Key('field-jobCustom')), findsOneWidget);
    expect(find.text('حدّدي وظيفتكِ...'), findsOneWidget);
  });

  testWidgets('a stored job outside the list reads as «أخرى» with its text', (tester) async {
    final custom = TextEditingController(text: 'نجّار');
    addTearDown(custom.dispose);
    await pumpControl(tester, 'job', values: {'job': 'نجّار'}, controller: custom);
    expect(find.byKey(const Key('field-jobCustom')), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'أخرى')).selected, isTrue);
  });

  testWidgets('«ربة منزل» is not offered to a man', (tester) async {
    await pumpControl(tester, 'job', female: false, controller: TextEditingController());
    expect(find.text('ربة منزل'), findsNothing);
  });

  testWidgets('the error shows under the field', (tester) async {
    await pumpControl(tester, 'skinColor', error: 'مطلوب');
    expect(find.text('مطلوب'), findsOneWidget);
  });

  testWidgets('a number field takes the number keyboard and the edit title', (tester) async {
    final c = TextEditingController();
    addTearDown(c.dispose);
    await pumpControl(tester, 'height', controller: c);
    expect(find.text('الطول (سم)'), findsOneWidget);
    final field = tester.widget<TextField>(find.byKey(const Key('field-height')));
    expect(field.keyboardType, TextInputType.number);
    expect(field.onTapOutside, isNotNull);
    expect(field.maxLength, isNull);
  });

  testWidgets('a long text keeps 500 characters and four lines', (tester) async {
    final c = TextEditingController();
    addTearDown(c.dispose);
    await pumpControl(tester, 'aboutMe', controller: c);
    final field = tester.widget<TextField>(find.byKey(const Key('field-aboutMe')));
    expect(field.maxLength, 500);
    expect(field.maxLines, 4);
    expect(field.keyboardType, TextInputType.text);
  });

  testWidgets('the city shows its areas, and a city change keeps only a valid area', (tester) async {
    final changes = await pumpControl(tester, 'city', values: {'city': 'عمّان', 'area': 'عبدون'});
    expect(find.text('المنطقة'), findsOneWidget);
    expect(find.byKey(const Key('area-عبدون')), findsOneWidget);
    await tester.tap(find.byKey(const Key('city-إربد')));
    expect(changes, containsAll([('area', null), ('city', 'إربد')]));

    final none = await pumpControl(tester, 'city', values: {'city': 'إربد'});
    expect(find.text('المنطقة'), findsNothing);
    expect(none, isEmpty);
  });

  testWidgets('the date button shows the chosen date', (tester) async {
    await pumpControl(tester, 'dateOfBirth', values: {'dateOfBirth': '1998-04-02'});
    expect(find.text('تاريخ الميلاد'), findsOneWidget);
    expect(find.byKey(const Key('field-dateOfBirth')), findsOneWidget);
    expect(find.text('اختيار التاريخ'), findsNothing);
    // Not a raw keyboard field
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('a stored birth date older than the picker allows (a website date) still opens it', (tester) async {
    final now = DateTime.now();
    final old = DateTime(now.year - 85, now.month, 1);
    final young = DateTime(now.year - 10, 1, 1);
    for (final dob in [old, young]) {
      final iso = '${dob.year.toString().padLeft(4, '0')}-${dob.month.toString().padLeft(2, '0')}-01';
      await pumpControl(tester, 'dateOfBirth', values: {'dateOfBirth': iso});
      await tester.tap(find.byKey(const Key('field-dateOfBirth')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(DatePickerDialog), findsOneWidget);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
    }
  });

  testWidgets('typing in a text, number or «أخرى» job field reports the field key', (tester) async {
    final typed = <String>[];
    Future<void> pump(String key, Map<String, Object?> values) => tester.pumpWidget(rtlApp(Scaffold(
          body: ProfileFieldControl(
            fieldKey: key,
            values: values,
            onChanged: (_, _) {},
            onTextChanged: typed.add,
            lists: lists,
            female: true,
            controller: TextEditingController(),
          ),
        )));
    await pump('height', const {});
    await tester.enterText(find.byKey(const Key('field-height')), '165');
    await pump('job', const {'job': 'أخرى'});
    await tester.enterText(find.byKey(const Key('field-jobCustom')), 'طيّارة');
    expect(typed, ['height', 'job']);
  });
}
