import 'dart:io';

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
    expect(find.text('صلة القرابة مطلوبة'), findsOneWidget);
    // The address is optional (server 2026-11-13): never «مطلوب»
    expect(find.text('العنوان مطلوب'), findsNothing);
    expect(find.text('العنوان (اختياري)'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'اسم وليّ الأمر'), 'محمد');
    await tester.pump();
    expect(find.text('اسم ولي الأمر مطلوب'), findsNothing);
    // The others stay until answered
    expect(find.text('صلة القرابة مطلوبة'), findsOneWidget);
  });

  test('validateGuardian: an empty address is fine; name and relationship stay required', () {
    final f = GuardianFields();
    addTearDown(f.dispose);
    var e = validateGuardian(f);
    expect(e['parentName'], isNotNull);
    expect(e['relationship'], isNotNull);
    expect(e.containsKey('address'), isFalse);
    f.name.text = 'محمد';
    f.relationship = 'father';
    e = validateGuardian(f);
    expect(e.values.where((v) => v != null), isEmpty);
    f.address.text = 'ع' * 301;
    expect(validateGuardian(f)['address'], 'العنوان طويل جداً');
  });

  testWidgets('guardian form saves with an empty address (sent as empty, which the server stores as null)',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}))
      ..on('PUT', '/api/profile/parent-info', const FakeResponse(200, {'success': true}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const GuardianScreen())));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'اسم وليّ الأمر'), 'محمد');
    await tester.enterText(find.byType(TextField).at(1), '0791234567');
    await tester.tap(find.text('صلة القرابة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الأب').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('حفظ'));
    await tester.pumpAndSettle();
    final puts = adapter.to('PUT', '/api/profile/parent-info');
    expect(puts, hasLength(1));
    final body = puts.single.data as Map;
    expect(body['address'], '');
    expect(body['relationship'], 'father');
  });

  testWidgets('a setup chip keeps its width when picked (no ✓), so the row never re-wraps under the finger',
      (tester) async {
    final src = File('lib/features/onboarding/setup_screen.dart').readAsStringSync();
    expect(src.contains('showCheckmark: false'), isTrue, reason: 'setup chips have no ✓');
    Future<Size> size(bool selected) async {
      await tester.pumpWidget(rtlApp(Scaffold(
        body: Center(
          child: ChoiceChip(
            key: const Key('c'),
            label: const Text('بكالوريوس'),
            showCheckmark: false,
            selected: selected,
            onSelected: (_) {},
          ),
        ),
      )));
      await tester.pumpAndSettle();
      return tester.getSize(find.byKey(const Key('c')));
    }

    expect(await size(true), await size(false));
  });
}
