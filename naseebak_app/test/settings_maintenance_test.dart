import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/maintenance_gate.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/network/api_exception.dart';

import 'helpers/fake_api.dart';

const config = {
  'android': {'minVersion': '', 'latestVersion': '', 'storeUrl': ''},
  'ios': {'minVersion': '', 'latestVersion': '', 'storeUrl': ''},
};

Map<String, dynamic> withMaintenance(bool on, [String message = '']) => {
      ...config,
      'maintenance': {'enabled': on, 'message': message},
    };

/// Lets the fake HTTP answer arrive, then rebuilds
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}

void main() {
  testWidgets('maintenance on: a full-screen page with the server message; «إعادة المحاولة» lifts it', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/config', FakeResponse(200, withMaintenance(true, 'نعود بعد ساعة')));
    await tester.pumpWidget(ProviderScope(
      overrides: await testOverrides(adapter),
      child: rtlApp(const MaintenanceGate(child: Text('home'))),
    ));
    await settle(tester);
    expect(find.byKey(const Key('maintenance')), findsOneWidget);
    expect(find.text('نعود بعد ساعة'), findsOneWidget);
    expect(find.text('home'), findsNothing);

    adapter.on('GET', '/api/mobile/config', FakeResponse(200, withMaintenance(false)));
    await tester.tap(find.byKey(const Key('maintenance-retry')));
    await settle(tester);
    expect(find.byKey(const Key('maintenance')), findsNothing);
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('rechecked when the app returns to the foreground', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/mobile/config', FakeResponse(200, withMaintenance(false)));
    await tester.pumpWidget(ProviderScope(
      overrides: await testOverrides(adapter),
      child: rtlApp(const MaintenanceGate(child: Text('home'))),
    ));
    await settle(tester);
    expect(find.text('home'), findsOneWidget);

    adapter.on('GET', '/api/mobile/config', FakeResponse(200, withMaintenance(true)));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await settle(tester);
    // No message from the admin: the default text
    expect(find.text(MaintenanceState.defaultMessage), findsOneWidget);
  });

  test('a failed check, or an older server without the field, never turns maintenance on', () async {
    final adapter = FakeAdapter()..on('GET', '/api/mobile/config', const FakeResponse(200, config));
    final c = ProviderContainer(overrides: await testOverrides(adapter));
    addTearDown(c.dispose);
    await c.read(maintenanceProvider.notifier).check();
    expect(c.read(maintenanceProvider).enabled, isFalse);
    adapter.on('GET', '/api/mobile/config', const FakeResponse.network());
    await c.read(maintenanceProvider.notifier).check();
    expect(c.read(maintenanceProvider).enabled, isFalse);
  });

  test('a 503 MAINTENANCE from any call checks the config; a plain 503 is a server error, not maintenance', () async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/config', FakeResponse(200, withMaintenance(true, 'صيانة')))
      ..on('POST', '/api/mobile/auth/token', const FakeResponse(503, {'error': 'صيانة', 'code': 'MAINTENANCE'}))
      ..on('GET', '/api/me/counts', const FakeResponse(503, 'Service Unavailable'));
    final c = ProviderContainer(overrides: await testOverrides(adapter));
    addTearDown(c.dispose);
    final api = c.read(apiClientProvider);

    await expectLater(
      api.get('/api/me/counts'),
      throwsA(isA<ApiException>()
          .having((e) => e.kind, 'kind', ApiErrorKind.server)
          .having((e) => e.message, 'message', isNot(contains('الصيانة')))),
    );
    expect(adapter.to('GET', '/api/mobile/config'), isEmpty);

    await expectLater(
      api.post('/api/mobile/auth/token', auth: false),
      throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.maintenance)),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(c.read(maintenanceProvider).enabled, isTrue);
    expect(c.read(maintenanceProvider).message, 'صيانة');
  });
}
