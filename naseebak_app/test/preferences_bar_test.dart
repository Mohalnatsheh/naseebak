import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/discovery/preferences_bar.dart';

import 'helpers/fake_api.dart';

void main() {
  FakeAdapter adapter({required bool mutual}) => FakeAdapter()
    ..on('GET', '/api/me/counts', FakeResponse(200, {'flags': {'mutualSuggestions': mutual}}))
    ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {
      'profile': {'prefAgeMin': 25, 'prefAgeMax': 35, 'prefCity': ['عمّان'], 'dealbreakers': ['age', 'city']},
    }));

  Future<void> pumpBar(WidgetTester tester, FakeAdapter a, VoidCallback onEdit) async {
    await tester.pumpWidget(ProviderScope(
      overrides: await testOverrides(a),
      child: rtlApp(Scaffold(body: PreferencesBar(onEdit: onEdit))),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('shows the age range and «شروطي الأساسية», and opens the editor', (tester) async {
    var edits = 0;
    await pumpBar(tester, adapter(mutual: true), () => edits++);

    expect(find.text('تفضيلاتي وشروطي الأساسية'), findsOneWidget);
    expect(find.text('العمر 25–35 · شرطان أساسيان'), findsOneWidget);
    expect(find.widgetWithText(Chip, 'العمر'), findsOneWidget);
    expect(find.widgetWithText(Chip, 'المدينة'), findsOneWidget);

    await tester.tap(find.text('تعديل'));
    await tester.tap(find.byKey(const Key('prefs-bar')));
    expect(edits, 2);
  });

  testWidgets('without shared suggestions there are no dealbreaker chips', (tester) async {
    await pumpBar(tester, adapter(mutual: false), () {});
    expect(find.text('تفضيلاتي'), findsOneWidget);
    expect(find.byType(Chip), findsNothing);
  });
}
