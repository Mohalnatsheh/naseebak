import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/profile/guardian_form.dart';

import 'helpers/fake_api.dart';

void main() {
  testWidgets('guardian form: an error goes as soon as that answer is fixed, not at the next save', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const GuardianScreen())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حفظ'));
    await tester.pumpAndSettle();
    expect(find.text('اسم ولي الأمر مطلوب'), findsOneWidget);
    expect(find.text('العنوان مطلوب'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'اسم وليّ الأمر'), 'محمد');
    await tester.pump();
    expect(find.text('اسم ولي الأمر مطلوب'), findsNothing);
    // The others stay until answered
    expect(find.text('العنوان مطلوب'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'العنوان (المدينة والحي)'), 'عمّان');
    await tester.pump();
    expect(find.text('العنوان مطلوب'), findsNothing);
  });

  testWidgets('a picked chip keeps its width (no ✓), so the row never re-wraps under the finger', (tester) async {
    Future<Size> size(bool selected) async {
      await tester.pumpWidget(rtlApp(Scaffold(
        body: Center(child: ChoiceChip(key: const Key('c'), label: const Text('بكالوريوس'), selected: selected, onSelected: (_) {})),
      )));
      await tester.pumpAndSettle();
      return tester.getSize(find.byKey(const Key('c')));
    }

    expect(await size(true), await size(false));
  });
}
