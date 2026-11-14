import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/routing/popup_tracker.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/alerts/alert_gate.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

/// Review I-2: the daily notifications reminder opens only while home is what the member sees, never over another
/// screen or popup, and a reminder that could not show is not counted as shown.
void main() {
  final dueAt = DateTime.now().subtract(const Duration(days: 2)).millisecondsSinceEpoch;

  Future<List<Override>> overrides(FakeAdapter adapter) async => [
        ...await testOverrides(adapter,
            store: MemoryTokenStore('t1'), prefs: {pushExplainedKey: true, pushReminderAtKey: dueAt}),
        pushAllowedProvider.overrideWith((ref) async => false),
      ];

  testWidgets('home not on top: no reminder, the day is kept; it shows once home is back on top', (tester) async {
    final nav = GlobalKey<NavigatorState>();
    await tester.pumpWidget(ProviderScope(
      overrides: await overrides(FakeAdapter()),
      child: MaterialApp(
        navigatorKey: nav,
        theme: AppTheme.light(),
        // '/chat' opens over '/': home under a chat
        initialRoute: '/chat',
        onGenerateRoute: (s) => MaterialPageRoute<void>(
          builder: (_) => Scaffold(body: s.name == '/' ? const PushAskGate() : const Text('chat')),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('chat'), findsOneWidget);
    expect(find.byType(PushAskSheet), findsNothing);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getInt(pushReminderAtKey), dueAt);

    nav.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsOneWidget);
    expect(prefs.getInt(pushReminderAtKey)! > dueAt, isTrue);
  });

  testWidgets('home is a hidden tab (tickers off): no reminder until it is the visible tab', (tester) async {
    final visible = ValueNotifier(false);
    await tester.pumpWidget(ProviderScope(
      overrides: await overrides(FakeAdapter()),
      child: rtlApp(Scaffold(
        body: ValueListenableBuilder<bool>(
          valueListenable: visible,
          builder: (_, v, _) => TickerMode(enabled: v, child: const PushAskGate()),
        ),
      )),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsNothing);
    expect((await SharedPreferences.getInstance()).getInt(pushReminderAtKey), dueAt);
    visible.value = true;
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsOneWidget);
  });

  testWidgets('the app in the background: no reminder until it comes back', (tester) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    addTearDown(() => tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed));
    await tester.pumpWidget(ProviderScope(
      overrides: await overrides(FakeAdapter()),
      child: rtlApp(const Scaffold(body: PushAskGate())),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsOneWidget);
  });

  testWidgets('admin popup open: no reminder over it; the reminder follows once it is closed', (tester) async {
    var alert = <String, dynamic>{'id': 'a1', 'title': 'تحديث مهم', 'body': 'نص'};
    final adapter = FakeAdapter()
      ..handlers['GET /api/alerts/current'] = ((_) => FakeResponse(200, {'alert': alert.isEmpty ? null : alert}))
      ..handlers['POST /api/alerts/a1/dismiss'] = (_) {
        alert = const {};
        return const FakeResponse(200, {'ok': true});
      };
    await tester.pumpWidget(ProviderScope(
      overrides: await overrides(adapter),
      child: rtlApp(const AlertGate(child: Scaffold(body: PushAskGate()))),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('app-alert')), findsOneWidget);
    expect(find.byType(PushAskSheet), findsNothing);
    expect((await SharedPreferences.getInstance()).getInt(pushReminderAtKey), dueAt);

    await tester.tap(find.text('حسناً'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('app-alert')), findsNothing);
    expect(find.byType(PushAskSheet), findsOneWidget);
  });

  testWidgets('while the admin popup is being asked for, the reminder waits (they never stack)', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('GET', '/api/alerts/current', const FakeResponse(200, {'alert': {'id': 'a1', 'title': 'تحديث مهم', 'body': 'نص'}}))
      ..on('POST', '/api/alerts/a1/dismiss', const FakeResponse(200, {'ok': true}))
      ..hold('GET', '/api/alerts/current', gate.future);
    await tester.pumpWidget(ProviderScope(
      overrides: await overrides(adapter),
      child: rtlApp(const AlertGate(child: Scaffold(body: PushAskGate()))),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(PushAskSheet), findsNothing);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('app-alert')), findsOneWidget);
    expect(find.byType(PushAskSheet), findsNothing);
  });

  testWidgets('any tracked popup (the match dialog) holds the reminder back', (tester) async {
    final o = await overrides(FakeAdapter());
    final c = ProviderContainer(overrides: o);
    addTearDown(c.dispose);
    c.read(popupShowingProvider.notifier).open();
    await tester.pumpWidget(UncontrolledProviderScope(
      container: c,
      child: rtlApp(const Scaffold(body: PushAskGate())),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsNothing);
    c.read(popupShowingProvider.notifier).close();
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsOneWidget);
  });
}
