import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/shared/widgets/grouped_section.dart';

import 'helpers/fake_api.dart';

void main() {
  // «حسابي» «صوري» on an iPhone SE at large text (sweep I2): the value never squeezes the title away
  for (final scale in [1.0, 1.6, 2.0]) {
    testWidgets('a row with a long value keeps its title readable at ${scale}x text, no overflow', (tester) async {
      tester.view.physicalSize = const Size(375, 667);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(rtlApp(MediaQuery(
        data: MediaQueryData(size: const Size(375, 667), textScaler: TextScaler.linear(scale)),
        child: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: GroupedSection(rows: [
              GroupedRow(
                icon: Icons.photo_library_outlined,
                title: 'صوري',
                value: 'ضبابية حتى التوافق',
                rowKey: const Key('row'),
                onTap: () {},
              ),
            ]),
          ),
        ),
      )));
      expect(tester.takeException(), isNull);
      final row = tester.getSize(find.byKey(const Key('row'))).width;
      final title = tester.getSize(find.text('صوري')).width;
      final value = tester.getSize(find.text('ضبابية حتى التوافق')).width;
      // The value takes at most about half of the row
      expect(value, lessThanOrEqualTo(row * 0.5));
      // The title keeps a real share of the row (it had 0 width at 2x before)
      expect(title, greaterThanOrEqualTo(row * 0.25));
      final valueText = tester.widget<Text>(find.text('ضبابية حتى التوافق'));
      expect(valueText.maxLines, 1);
    });
  }
}
