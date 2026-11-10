// QA round 2: A-M01 / A2-H1 (a paused member saw «ما زال يتجدد», cancel failed, «ألغيت التجديد» after reactivating),
// A2-M3 (home stayed on errors after reactivating), A-L05 (delete dialog), A-L11 («اشتراكي» repeats the credits).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/paused_screen.dart';
import 'package:naseebak_app/features/pro/pro_repository.dart';
import 'package:naseebak_app/features/pro/pro_section.dart';
import 'package:naseebak_app/features/settings/settings_screen.dart';

import 'helpers/fake_api.dart';

void main() {
  final end = DateTime.utc(2026, 12, 10);

  test('the paused page says pausing stopped Pro, also before /api/pro answers (cold start)', () {
    expect(pausedProText(null, female: false), isNull);
    expect(pausedProText(null, female: true, stoppedByPause: true),
        allOf(contains('توقّف تجديد اشتراك Pro عند إيقاف حسابكِ'), isNot(contains('ما زال'))));
    expect(
      pausedProText(MyProState(isPro: true, cancelAtPeriodEnd: true, renewsAt: end), female: false, stoppedByPause: true),
      allOf(contains('عند إيقاف حسابك'), contains('2026'), contains('بعد إعادة التفعيل')),
    );
  });

  test('«اشتراكي» says why the renewal is off, and that resuming waits while paused', () {
    expect(myProEndingText(stoppedByPause: true, paused: false), startsWith('توقّف التجديد عند إيقاف حسابك'));
    expect(myProEndingText(stoppedByPause: false, paused: false), startsWith('ألغيت التجديد'));
    expect(myProEndingText(stoppedByPause: true, paused: true), contains('بعد إعادة تفعيل حسابك'));
  });

  test('the deactivate answer: proRenewalStopped wins, an older server falls back to what was renewing', () {
    expect(pauseStoppedRenewal({'proRenewalStopped': true}, wasRenewing: false), isTrue);
    expect(pauseStoppedRenewal({'proRenewalStopped': false}, wasRenewing: true), isFalse);
    expect(pauseStoppedRenewal({}, wasRenewing: true), isTrue);
    expect(pauseStoppedRenewal({}, wasRenewing: false), isFalse);
  });

  test('the delete dialog line says the renewal stops, no refund', () {
    expect(deleteProLine(end), allOf(contains('يتوقف تجديد اشتراك Pro'), contains('2026'), contains('دون استرداد')));
  });

  testWidgets('pausing with a renewing Pro remembers why, and the paused page reads it after the screen changed',
      (tester) async {
    var paused = false;
    final adapter = FakeAdapter()
      ..handlers['GET /api/mobile/me'] = ((_) => FakeResponse(200, {'user': meJson(deactivated: paused)}))
      ..handlers['POST /api/profile/deactivate'] = ((_) {
        paused = true;
        return const FakeResponse(200, {'isDeactivated': true, 'proRenewalStopped': true});
      })
      // Before X1's server change a paused member's GET /api/pro is refused: the note still speaks
      ..handlers['GET /api/pro'] = ((_) => paused
          ? const FakeResponse(403, {'error': 'الحساب معطّل', 'code': 'DEACTIVATED'})
          : const FakeResponse(200, {'enabled': true, 'isPro': true, 'plan': 'monthly', 'renewsAt': '2026-12-10T10:00:00.000Z'}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    await tester.runAsync(() => settled(container));
    tester.view.physicalSize = const Size(420, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const AccountScreen())));
    await tester.pump(const Duration(milliseconds: 200));
    final pause = find.text('إيقاف الحساب مؤقتاً');
    await tester.ensureVisible(pause);
    await tester.tap(pause);
    await tester.pumpAndSettle();
    expect(find.textContaining('لن يتجدد بعد الإيقاف'), findsOneWidget);
    await tester.tap(find.text('إيقاف'));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(container.read(proPauseNoteProvider).stopped('u1'), isTrue);

    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const PausedScreen())));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.byKey(const Key('paused-pro')), findsOneWidget);
    expect(find.textContaining('عند إيقاف حسابك'), findsOneWidget);
    expect(find.textContaining('ما زال يتجدد'), findsNothing);
  });

  testWidgets('«اشتراكي» while paused: no resume button; the plan\'s free credits are repeated', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(deactivated: true)}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    await tester.runAsync(() => settled(container));
    await container.read(sharedPreferencesProvider).setBool('pro_stopped_by_pause:u1', true);
    final state = MyProState.fromJson({
      'enabled': true,
      'isPro': true,
      'plan': 'monthly',
      'cancelAtPeriodEnd': true,
      'renewsAt': '2026-12-10T10:00:00.000Z',
      'offers': [
        {'id': 'monthly', 'price': 4, 'currency': 'JOD', 'chargeCurrency': 'usd', 'chargeAmount': 564, 'credits': 5, 'interval': 'month'},
      ],
    });
    tester.view.physicalSize = const Size(420, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(SingleChildScrollView(child: MyProCard(state: state, female: false))),
    ));
    await tester.pump();
    expect(container.read(authControllerProvider).me?.deactivated, isTrue);
    expect(find.byKey(const Key('pro-resume')), findsNothing);
    expect(find.byKey(const Key('pro-ending-text')), findsOneWidget);
    expect(find.textContaining('توقّف التجديد عند إيقاف حسابك'), findsOneWidget);
    expect(find.byKey(const Key('my-pro-credits')), findsOneWidget);
    expect(find.textContaining('5 أرصدة مجاناً كل شهر'), findsOneWidget);
  });
}
