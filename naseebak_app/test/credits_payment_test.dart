import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';

import 'helpers/fake_api.dart';

const plans = {
  'country': 'JO',
  'purchasesEnabled': true,
  'packages': [
    {'id': 'p1', 'name': 'باقة', 'credits': 5, 'price': 5, 'currency': 'JOD', 'currencySymbol': 'د.أ'},
  ],
};

/// A Stripe checkout against a fake server: the payment's status, the balance and the app payments switch can be
/// changed while the screen runs.
class FakePayments {
  String status = 'PENDING';
  int credits = 10;
  bool appPayments = true;
  final opened = <Uri>[];

  /// What `POST /api/payments/cancel` does on the server (sets [status] / [credits])
  void Function()? onCancel;

  late final FakeAdapter adapter = FakeAdapter()
    ..handlers['GET /api/mobile/me'] =
        ((_) => FakeResponse(200, {'user': {...meJson(credits: credits), 'appPayments': appPayments}}))
    ..on('GET', '/api/payments/plans', const FakeResponse(200, plans))
    ..on('POST', '/api/payments/checkout',
        const FakeResponse(200, {'checkoutUrl': 'https://checkout.stripe.com/c/pay_cs1', 'paymentId': 'pay1'}))
    ..handlers['GET /api/payments/pay1/status'] =
        ((_) => FakeResponse(200, {'payment': {'id': 'pay1', 'status': status}, 'credits': credits}))
    ..handlers['POST /api/payments/cancel'] = ((_) {
      onCancel?.call();
      return FakeResponse(200, {'success': true, if (status == 'COMPLETED') 'paid': true});
    })
    ..on('GET', '/api/payments/history', const FakeResponse(200, {'payments': []}))
    ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
}

Future<void> pumpScreen(
  WidgetTester tester,
  FakePayments pay, {
  Duration pollWindow = const Duration(minutes: 10),
}) async {
  final container = ProviderContainer(overrides: await testOverrides(pay.adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: rtlApp(CreditsScreen(
      openCheckout: (url) async {
        pay.opened.add(url);
        leaveApp(tester);
        return true;
      },
      pollInterval: const Duration(seconds: 2),
      pollWindow: pollWindow,
      cancelGrace: const Duration(seconds: 5),
    )),
  ));
  await tester.pumpAndSettle();
}

/// The browser takes over
void leaveApp(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
}

/// Back in the app from the checkout page
void returnToApp(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
}

Future<void> advance(WidgetTester tester, Duration d) async {
  for (var t = Duration.zero; t < d; t += const Duration(milliseconds: 500)) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

/// «شراء»: checkout, the browser opens and the waiting dialog shows
Future<void> buy(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('buy-p1')));
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// Unmounts the screen and lets its last poll timer run out
Future<void> unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 5));
}

final waiting = find.text('بانتظار تأكيد الدفع…');
final cancelButton = find.byKey(const Key('cancel-payment'));

void main() {
  testWidgets('opening the screen re-reads me', (tester) async {
    final pay = FakePayments();
    final container = ProviderContainer(overrides: await testOverrides(pay.adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    final before = pay.adapter.to('GET', '/api/mobile/me').length;
    pay.credits = 3;
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const CreditsScreen())));
    await tester.pumpAndSettle();
    expect(pay.adapter.to('GET', '/api/mobile/me').length, before + 1);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('a slow payment: back closes the dialog, the check goes on past 2 minutes and the balance updates',
      (tester) async {
    final pay = FakePayments();
    await pumpScreen(tester, pay);
    await buy(tester);
    expect(pay.opened.single.toString(), 'https://checkout.stripe.com/c/pay_cs1');
    expect(waiting, findsOneWidget);

    // Still paying after the old 2-minute limit: nothing reported yet
    await advance(tester, const Duration(minutes: 3));
    expect(waiting, findsOneWidget);
    expect(find.textContaining('لم يصلنا تأكيد الدفع'), findsNothing);

    // Back in the app, Android back: only the dialog closes
    returnToApp(tester);
    await tester.pump();
    await tester.binding.handlePopRoute();
    await advance(tester, const Duration(seconds: 1));
    expect(waiting, findsNothing);
    expect(find.textContaining('نتابع تأكيد الدفع'), findsOneWidget);
    expect(find.byKey(const Key('payment-pending')), findsOneWidget);

    final polls = pay.adapter.to('GET', '/api/payments/pay1/status').length;
    pay
      ..status = 'COMPLETED'
      ..credits = 15;
    await advance(tester, const Duration(seconds: 3));
    expect(pay.adapter.to('GET', '/api/payments/pay1/status').length, greaterThan(polls));
    expect(find.text('تم الدفع بنجاح. رصيدك الآن 15.'), findsOneWidget);
    expect(find.text('15'), findsOneWidget);
    expect(find.byKey(const Key('payment-pending')), findsNothing);
    await unmount(tester);
  });

  testWidgets('back from Stripe and still pending: «إلغاء الدفع» after the grace cancels on the server',
      (tester) async {
    final pay = FakePayments();
    pay.onCancel = () => pay.status = 'FAILED';
    await pumpScreen(tester, pay);
    await buy(tester);

    returnToApp(tester);
    await advance(tester, const Duration(seconds: 3));
    expect(cancelButton, findsNothing);
    await advance(tester, const Duration(seconds: 3));
    expect(cancelButton, findsOneWidget);

    await tester.tap(cancelButton);
    await tester.pumpAndSettle();
    expect(pay.adapter.to('POST', '/api/payments/cancel').single.data, {'paymentId': 'pay1'});
    expect(waiting, findsNothing);
    expect(find.text('تم إلغاء الدفع، ولم يُخصم شيء.'), findsOneWidget);
    expect(find.text('10'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('cancel from the screen card when it was paid meanwhile: credited instead', (tester) async {
    final pay = FakePayments();
    pay.onCancel = () {
      pay
        ..status = 'COMPLETED'
        ..credits = 15;
    };
    await pumpScreen(tester, pay);
    await buy(tester);
    returnToApp(tester);
    await tester.pump();
    await tester.tap(find.text('إخفاء'));
    await advance(tester, const Duration(seconds: 6));
    expect(find.byKey(const Key('payment-pending')), findsOneWidget);
    await tester.tap(cancelButton);
    await tester.pumpAndSettle();
    expect(find.text('تم الدفع بنجاح. رصيدك الآن 15.'), findsOneWidget);
    expect(find.text('15'), findsOneWidget);
    expect(find.byKey(const Key('payment-pending')), findsNothing);
    await unmount(tester);
  });

  testWidgets('window over: reported once, kept, and checked again on the next return to the app', (tester) async {
    final pay = FakePayments();
    await pumpScreen(tester, pay, pollWindow: const Duration(seconds: 10));
    await buy(tester);
    returnToApp(tester);
    await advance(tester, const Duration(seconds: 12));
    expect(waiting, findsNothing);
    expect(find.text('لم يصلنا تأكيد الدفع بعد. سيُضاف رصيدك تلقائياً عند التأكيد.'), findsOneWidget);
    expect(find.byKey(const Key('payment-pending')), findsOneWidget);

    final polls = pay.adapter.to('GET', '/api/payments/pay1/status').length;
    await advance(tester, const Duration(seconds: 10));
    expect(pay.adapter.to('GET', '/api/payments/pay1/status').length, polls, reason: 'stopped after the window');

    pay
      ..status = 'COMPLETED'
      ..credits = 15;
    leaveApp(tester);
    returnToApp(tester);
    await advance(tester, const Duration(seconds: 1));
    expect(find.text('تم الدفع بنجاح. رصيدك الآن 15.'), findsOneWidget);
    expect(find.text('15'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('APP_PURCHASES_DISABLED: message shown and me re-read, so the packages disappear', (tester) async {
    final pay = FakePayments();
    pay.adapter.on('POST', '/api/payments/checkout',
        const FakeResponse(403, {'error': 'الشراء غير متاح في التطبيق حالياً', 'code': 'APP_PURCHASES_DISABLED'}));
    await pumpScreen(tester, pay);
    expect(find.text('شراء رصيد'), findsOneWidget);

    pay.appPayments = false;
    await tester.tap(find.byKey(const Key('buy-p1')));
    await tester.pumpAndSettle();
    expect(find.text('الشراء غير متاح في التطبيق حالياً'), findsOneWidget);
    expect(find.text('شراء رصيد'), findsNothing);
    expect(find.text('السجل'), findsNothing);
    expect(pay.opened, isEmpty);
  });
}
