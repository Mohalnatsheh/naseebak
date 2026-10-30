import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/update/app_update.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> config({String min = '', String latest = '', String store = 'https://play.google.com/x'}) => {
      'android': {'minVersion': min, 'latestVersion': latest, 'storeUrl': store},
      'ios': {'minVersion': '9.9.9', 'latestVersion': '', 'storeUrl': ''},
    };

Future<void> pumpGate(WidgetTester tester, FakeAdapter adapter, {String version = '1.0.0'}) async {
  final overrides = await testOverrides(adapter);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      ...overrides,
      appVersionProvider.overrideWith((ref) async => version),
      appPlatformProvider.overrideWithValue('android'),
    ],
    child: rtlApp(const UpdateGate(child: Scaffold(body: Text('التطبيق')))),
  ));
  await tester.pumpAndSettle();
}

void main() {
  test('versions compare by number, not as text', () {
    expect(compareVersions('1.10.0', '1.9.0'), 1);
    expect(compareVersions('1.0.0+5', '1.0.0'), 0);
    expect(compareVersions('1.0', '1.0.1'), -1);
    expect(compareVersions('2.0.0', '10.0.0'), -1);
  });

  test('required wins over optional; each platform has its own versions', () {
    expect(UpdateStatus.from(config(min: '1.1.0', latest: '1.2.0'), 'android', '1.0.0').level, UpdateLevel.required);
    expect(UpdateStatus.from(config(min: '1.0.0', latest: '1.2.0'), 'android', '1.0.0').level, UpdateLevel.optional);
    expect(UpdateStatus.from(config(latest: '1.0.0'), 'android', '1.0.0').level, UpdateLevel.none);
    expect(UpdateStatus.from(config(), 'ios', '1.0.0').level, UpdateLevel.required);
  });

  testWidgets('a required update replaces the app', (tester) async {
    await pumpGate(tester, FakeAdapter()..on('GET', '/api/mobile/config', FakeResponse(200, config(min: '1.1.0'))));
    expect(find.byKey(const Key('update-required')), findsOneWidget);
    expect(find.text('التطبيق'), findsNothing);
  });

  testWidgets('an optional update shows a card; «لاحقاً» hides it for that version', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/mobile/config', FakeResponse(200, config(latest: '1.1.0')));
    await pumpGate(tester, adapter);
    expect(find.text('التطبيق'), findsOneWidget);
    expect(find.byKey(const Key('update-optional')), findsOneWidget);
    await tester.tap(find.byKey(const Key('update-later')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('update-optional')), findsNothing);
  });

  testWidgets('offline: the app is never blocked', (tester) async {
    await pumpGate(tester, FakeAdapter()..on('GET', '/api/mobile/config', const FakeResponse.network()));
    expect(find.text('التطبيق'), findsOneWidget);
    expect(find.byKey(const Key('update-required')), findsNothing);
  });
}
