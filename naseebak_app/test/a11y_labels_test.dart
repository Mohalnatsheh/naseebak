// QA A2-L9 (backdrops read «رفض» / «تمويه», tab badges read before the name) and A-M05 (text stopped at 1.3×).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/app.dart' show appMaxTextScale;
import 'package:naseebak_app/app/material_labels.dart';
import 'package:naseebak_app/app/shell.dart' show tabTooltip;

void main() {
  testWidgets('a dialog or sheet backdrop says «إغلاق»', (tester) async {
    late MaterialLocalizations labels;
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        AppMaterialLocalizationsDelegate(),
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Builder(builder: (context) {
        labels = MaterialLocalizations.of(context);
        return const SizedBox();
      }),
    ));
    expect(labels.modalBarrierDismissLabel, 'إغلاق');
    expect(labels.scrimLabel, 'إغلاق');
    // Everything else stays Flutter's Arabic
    expect(labels.okButtonLabel, isNotEmpty);
  });

  test('a tab with something new is read name first', () {
    expect(tabTooltip('الاقتراحات', 10), 'الاقتراحات، 10 جديدة');
    expect(tabTooltip('المحادثات', 0), 'المحادثات');
    expect(tabTooltip('الاقتراحات', 120), 'الاقتراحات، أكثر من 99 جديدة');
  });

  test('system text is followed up to 2×', () => expect(appMaxTextScale, 2.0));
}
