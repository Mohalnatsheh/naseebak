import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/alerts/alert_gate.dart';

import 'helpers/fake_api.dart';

void main() {
  testWidgets('the waiting alert pops up; «حسناً» closes it on the server, then the next one shows', (tester) async {
    final queue = [
      {'id': 'a1', 'title': 'تحديث مهم', 'body': 'أضفنا ميزة جديدة'},
      {'id': 'a2', 'title': 'تنبيه ثانٍ', 'body': 'نص', 'buttonLabel': 'افتح', 'buttonUrl': '/dashboard'},
    ];
    final adapter = FakeAdapter()
      ..handlers['GET /api/alerts/current'] = (r) {
        expect(r.queryParameters['platform'], 'app');
        return FakeResponse(200, {'alert': queue.isEmpty ? null : queue.first});
      };
    for (final id in ['a1', 'a2']) {
      adapter.handlers['POST /api/alerts/$id/dismiss'] = (_) {
        queue.removeWhere((a) => a['id'] == id);
        return const FakeResponse(200, {'ok': true});
      };
    }
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: overrides,
      child: rtlApp(const AlertGate(child: Scaffold(body: Text('tabs')))),
    ));
    await tester.pumpAndSettle();

    expect(find.text('تحديث مهم'), findsOneWidget);
    expect(find.byKey(const Key('app-alert-action')), findsNothing);
    await tester.tap(find.text('حسناً'));
    await tester.pumpAndSettle();

    expect(adapter.to('POST', '/api/alerts/a1/dismiss'), hasLength(1));
    expect(find.text('تنبيه ثانٍ'), findsOneWidget);
    expect(find.text('افتح'), findsOneWidget);
    expect(find.text('لاحقاً'), findsOneWidget);
    await tester.tap(find.text('لاحقاً'));
    await tester.pumpAndSettle();
    expect(adapter.to('POST', '/api/alerts/a2/dismiss'), hasLength(1));
    expect(find.byKey(const Key('app-alert')), findsNothing);
  });

  testWidgets('no alert, no popup', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/alerts/current', const FakeResponse(200, {'alert': null}));
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const AlertGate(child: Text('tabs')))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('app-alert')), findsNothing);
  });
}
