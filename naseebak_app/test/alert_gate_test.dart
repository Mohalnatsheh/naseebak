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

  group('home only (owner, 2026-11-14)', () {
    Future<FakeAdapter> setUp(WidgetTester tester, Widget Function(bool active) build, bool active) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/alerts/current', const FakeResponse(200, {
          'alert': {'id': 'a1', 'title': 'تحديث مهم', 'body': 'نص'}
        }))
        ..on('POST', '/api/alerts/a1/dismiss', const FakeResponse(200, {'ok': true}));
      final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
      await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(build(active))));
      await tester.pumpAndSettle();
      return adapter;
    }

    testWidgets('another tab: never asks, never shows', (tester) async {
      final adapter =
          await setUp(tester, (a) => AlertGate(active: a, child: const Scaffold(body: Text('tabs'))), false);
      expect(find.byKey(const Key('app-alert')), findsNothing);
      expect(adapter.to('GET', '/api/alerts/current'), isEmpty);
    });

    testWidgets('switching to the home tab shows the waiting alert', (tester) async {
      final active = ValueNotifier(false);
      final adapter = await setUp(
        tester,
        (_) => ValueListenableBuilder<bool>(
          valueListenable: active,
          builder: (_, a, _) => AlertGate(active: a, child: const Scaffold(body: Text('tabs'))),
        ),
        false,
      );
      expect(find.byKey(const Key('app-alert')), findsNothing);
      active.value = true;
      await tester.pumpAndSettle();
      expect(find.text('تحديث مهم'), findsOneWidget);
      expect(adapter.to('GET', '/api/alerts/current'), hasLength(1));
    });

    testWidgets('a page pushed over home: waits until it is closed', (tester) async {
      final navKey = GlobalKey<NavigatorState>();
      Map<String, dynamic>? current = {'id': 'a1', 'title': 'تحديث مهم', 'body': 'نص'};
      final adapter = FakeAdapter()
        ..handlers['GET /api/alerts/current'] = ((_) => FakeResponse(200, {'alert': current}))
        ..handlers['POST /api/alerts/a1/dismiss'] = (_) {
          current = null;
          return const FakeResponse(200, {'ok': true});
        }
        ..handlers['POST /api/alerts/a2/dismiss'] = (_) {
          current = null;
          return const FakeResponse(200, {'ok': true});
        };
      final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
      await tester.pumpWidget(ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          navigatorKey: navKey,
          home: const Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: Text('no gate yet')),
          ),
        ),
      ));
      // Home (with the gate) opened under a page already on top
      navKey.currentState!.push(MaterialPageRoute(
        builder: (_) => const AlertGate(child: Scaffold(body: Text('tabs'))),
      ));
      await tester.pumpAndSettle();
      expect(find.text('تحديث مهم'), findsOneWidget); // home on top: shows
      await tester.tap(find.text('حسناً'));
      await tester.pumpAndSettle();
      // Now a page over home: a new alert waits
      current = {'id': 'a2', 'title': 'تنبيه ثانٍ', 'body': 'نص'};
      navKey.currentState!.push(MaterialPageRoute(builder: (_) => const Scaffold(body: Text('chat'))));
      await tester.pumpAndSettle();
      final before = adapter.to('GET', '/api/alerts/current').length;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.text('تنبيه ثانٍ'), findsNothing);
      expect(adapter.to('GET', '/api/alerts/current').length, before);
      navKey.currentState!.pop();
      await tester.pumpAndSettle();
      expect(find.text('تنبيه ثانٍ'), findsOneWidget);
    });
  });
}
