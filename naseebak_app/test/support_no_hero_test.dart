// Crashlytics (1.0.0): «RenderBox was not laid out: RenderConstrainedBox» in _HeroFlightManifest._boundingBoxFor.
// The app's only Hero was the support screen's «تذكرة جديدة» button (a FloatingActionButton has one by default),
// which flew between two support screens opened on top of each other (a double tap).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/support/support_screen.dart';

import 'helpers/fake_api.dart';

void main() {
  testWidgets('the support screen has no Hero to fly', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/support', const FakeResponse(200, {'tickets': [], 'page': 1, 'totalPages': 1, 'total': 0}));
    await tester.pumpWidget(ProviderScope(overrides: await testOverrides(adapter), child: rtlApp(const SupportScreen())));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byKey(const Key('new-ticket')), findsOneWidget);
    expect(find.byType(Hero), findsNothing);
  });

  testWidgets('opening support twice in a row does not crash', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/support', const FakeResponse(200, {'tickets': [], 'page': 1, 'totalPages': 1, 'total': 0}));
    final nav = GlobalKey<NavigatorState>();
    await tester.pumpWidget(ProviderScope(
      overrides: await testOverrides(adapter),
      child: MaterialApp(navigatorKey: nav, home: const Scaffold(body: SizedBox())),
    ));
    nav.currentState!.push(MaterialPageRoute<void>(builder: (_) => const SupportScreen()));
    await tester.pump(const Duration(milliseconds: 30));
    nav.currentState!.push(MaterialPageRoute<void>(builder: (_) => const SupportScreen()));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
