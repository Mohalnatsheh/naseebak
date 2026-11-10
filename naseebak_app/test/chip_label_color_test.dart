import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';

/// The colour the chip's label is actually painted with (null = no colour: iOS paints that white, owner report
/// 2026-11-10: every unselected chip looked empty)
Color? _labelColor(WidgetTester tester, String text) => tester.renderObject<RenderParagraph>(find.text(text)).text.style?.color;

Future<void> _pump(WidgetTester tester, Widget chip) =>
    tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: Scaffold(body: Center(child: chip))));

void main() {
  testWidgets('the theme paints chip labels: ink when not picked, white on navy when picked', (tester) async {
    await _pump(tester, FilterChip(label: const Text('إربد'), selected: false, onSelected: (_) {}));
    expect(_labelColor(tester, 'إربد'), AppColors.ink);

    await _pump(tester, FilterChip(label: const Text('إربد'), selected: true, onSelected: (_) {}));
    expect(_labelColor(tester, 'إربد'), Colors.white);

    await _pump(tester, ChoiceChip(label: const Text('نعم'), selected: false, onSelected: (_) {}));
    expect(_labelColor(tester, 'نعم'), AppColors.ink);

    // A plain chip (the dealbreakers summary) is never picked
    await _pump(tester, const Chip(label: Text('العمر')));
    expect(_labelColor(tester, 'العمر'), AppColors.ink);
  });
}
