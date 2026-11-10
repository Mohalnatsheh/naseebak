import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/welcome/brand_visuals.dart';
import 'package:naseebak_app/shared/widgets/alpha_fade.dart';

void main() {
  group('AlphaFade (QA A-L10: no opacity layer in the entrances)', () {
    testWidgets('fades with a colour filter, and none once fully shown', (tester) async {
      await tester.pumpWidget(const Directionality(
        textDirection: TextDirection.rtl,
        child: AlphaFade(opacity: 0.4, child: Text('نص')),
      ));
      expect(find.byType(ColorFiltered), findsOneWidget);
      expect(find.byType(Opacity), findsNothing);
      await tester.pumpWidget(const Directionality(
        textDirection: TextDirection.rtl,
        child: AlphaFade(opacity: 1, child: Text('نص')),
      ));
      expect(find.byType(ColorFiltered), findsNothing);
      expect(find.text('نص'), findsOneWidget);
    });

    test('the matrix scales only the alpha', () {
      expect(
        AlphaFade.filterFor(0.25),
        const ColorFilter.matrix(<double>[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.25, 0]),
      );
    });

    testWidgets('a field inside an entrance keeps its focus and text when the fade ends', (tester) async {
      final controller = TextEditingController();
      final focus = FocusNode();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FadeSlideIn(child: TextField(controller: controller, focusNode: focus)),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(Opacity), findsNothing);
      await tester.tap(find.byType(TextField));
      await tester.enterText(find.byType(TextField), '0791');
      expect(focus.hasFocus, isTrue);
      final state = tester.state(find.byType(EditableText));
      await tester.pumpAndSettle();
      expect(find.byType(ColorFiltered), findsNothing);
      expect(focus.hasFocus, isTrue);
      expect(controller.text, '0791');
      expect(tester.state(find.byType(EditableText)), same(state));
      focus.dispose();
      controller.dispose();
    });
  });
}
