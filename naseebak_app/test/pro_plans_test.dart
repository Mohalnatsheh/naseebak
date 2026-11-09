import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';
import 'package:naseebak_app/features/pro/pro_section.dart';

import 'helpers/fake_api.dart';

const _plans = {
  'country': 'JO',
  'purchasesEnabled': true,
  'packages': [
    {'id': 'p1', 'name': 'باقة', 'credits': 5, 'price': 5, 'currency': 'JOD', 'currencySymbol': 'د.أ'},
  ],
};

const _offers = [
  {
    'id': 'weekly',
    'price': 1.5,
    'currency': 'JOD',
    'chargeCurrency': 'usd',
    'chargeAmount': 212,
    'credits': 1,
    'interval': 'week',
  },
  {
    'id': 'monthly',
    'price': 4,
    'currency': 'JOD',
    'chargeCurrency': 'usd',
    'chargeAmount': 564,
    'credits': 5,
    'interval': 'month',
  },
  {
    'id': 'yearly',
    'price': 36,
    'currency': 'JOD',
    'chargeCurrency': 'usd',
    'chargeAmount': 5076,
    'credits': 8,
    'interval': 'year',
  },
];

/// A fake server whose Pro state can change while the screen runs
class FakePro {
  bool canBuy = true;
  bool isPro = false;
  bool cancelAtPeriodEnd = false;
  bool pastDue = false;
  bool failState = false;
  String checkoutUrl = 'https://checkout.stripe.com/c/pro_cs1';
  final opened = <Uri>[];

  Map<String, dynamic> get state => {
    'enabled': true,
    'isPro': isPro,
    'plan': isPro ? 'monthly' : null,
    'renewsAt': isPro ? '2026-12-01T10:00:00.000Z' : null,
    'cancelAtPeriodEnd': cancelAtPeriodEnd,
    'pastDue': pastDue,
    'canBuy': canBuy,
    'offers': canBuy ? _offers : const [],
  };

  late final FakeAdapter adapter = FakeAdapter()
    ..handlers['GET /api/mobile/me'] = ((_) => FakeResponse(200, {
      'user': {...meJson(), 'appPayments': true},
    }))
    ..on('GET', '/api/payments/plans', const FakeResponse(200, _plans))
    ..handlers['GET /api/pro'] = ((_) =>
        failState ? const FakeResponse(500, {'error': 'خطأ'}) : FakeResponse(200, state))
    ..handlers['POST /api/pro/checkout'] = ((_) => FakeResponse(200, {'url': checkoutUrl}))
    ..handlers['POST /api/pro/cancel'] = ((_) {
      cancelAtPeriodEnd = true;
      return const FakeResponse(200, {'success': true});
    })
    ..handlers['POST /api/pro/resume'] = ((_) {
      cancelAtPeriodEnd = false;
      return const FakeResponse(200, {'success': true});
    })
    ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
}

Future<void> _pump(WidgetTester tester, FakePro pro) async {
  // A tall phone: the whole screen (Pro section and packages) is laid out
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(overrides: await testOverrides(pro.adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: rtlApp(
        CreditsScreen(
          openCheckout: (url) async {
            pro.opened.add(url);
            _leaveApp(tester);
            return true;
          },
          proPollInterval: const Duration(seconds: 2),
          proPollWindow: const Duration(seconds: 10),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void _leaveApp(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
}

void _returnToApp(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
}

Future<void> _advance(WidgetTester tester, Duration d) async {
  for (var t = Duration.zero; t < d; t += const Duration(milliseconds: 500)) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

Future<void> _subscribe(WidgetTester tester) async {
  final button = find.byKey(const Key('pro-subscribe'));
  await tester.ensureVisible(button);
  await tester.tap(button);
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets('plans show for a member who can buy, monthly first, above the packages', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    expect(find.byType(ProPlansCard), findsOneWidget);
    expect(find.textContaining('4 د.أ'), findsOneWidget);
    expect(find.text('في الشهر'), findsOneWidget);
    expect(find.text('الأكثر طلباً'), findsOneWidget);
    expect(find.textContaining('تدفعين'), findsOneWidget);
    expect(find.textContaining('5.64\$'), findsOneWidget);
    expect(find.text('إرسال الصور في المحادثة'), findsOneWidget);
    // Weekly sits on the right in RTL
    final weekly = tester.getCenter(find.text('أسبوعي')).dx;
    final yearly = tester.getCenter(find.text('سنوي')).dx;
    expect(weekly, greaterThan(yearly));
    expect(tester.getSize(find.byKey(const Key('pro-plan-weekly'))).height, greaterThanOrEqualTo(44));
    // The section sits above the packages
    expect(tester.getTopLeft(find.byType(ProPlansCard)).dy, lessThan(tester.getTopLeft(find.text('الباقات')).dy));
    expect(find.byKey(const Key('buy-p1')), findsOneWidget);
  });

  testWidgets('a test account (canBuy false, not Pro) sees no plans', (tester) async {
    final pro = FakePro()..canBuy = false;
    await _pump(tester, pro);
    expect(find.byType(ProPlansCard), findsNothing);
    expect(find.byType(MyProCard), findsNothing);
    expect(find.textContaining('Pro'), findsNothing);
    expect(find.byKey(const Key('buy-p1')), findsOneWidget);
  });

  testWidgets('choosing «سنوي» shows the yearly price and credits every month', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await tester.tap(find.text('سنوي'));
    await tester.pumpAndSettle();
    expect(find.textContaining('36 د.أ'), findsOneWidget);
    expect(find.text('في السنة'), findsOneWidget);
    expect(find.textContaining('كل شهر'), findsOneWidget);
    expect(find.textContaining('8 أرصدة'), findsOneWidget);
    expect(find.text('الأكثر طلباً'), findsNothing);
  });

  testWidgets('subscribe opens the returned https page with the chosen plan', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    expect(pro.opened.single.toString(), 'https://checkout.stripe.com/c/pro_cs1');
    expect(pro.adapter.to('POST', '/api/pro/checkout').single.data, {'plan': 'monthly'});
  });

  testWidgets('a non-https checkout url is never opened', (tester) async {
    final pro = FakePro()..checkoutUrl = 'http://evil.example/x';
    await _pump(tester, pro);
    await _subscribe(tester);
    expect(pro.opened, isEmpty);
    expect(find.text('حدث خطأ غير متوقع. حاول مرة أخرى.'), findsOneWidget);
  });

  testWidgets('back from the browser: polls until Pro is on, then a success snack', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    final before = pro.adapter.to('GET', '/api/pro').length;
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 3));
    expect(pro.adapter.to('GET', '/api/pro').length, greaterThan(before));
    pro.isPro = true;
    await _advance(tester, const Duration(seconds: 3));
    expect(find.text('تم تفعيل عضوية Pro في حسابك.'), findsOneWidget);
    expect(find.byType(MyProCard), findsOneWidget);
    // Polling stopped
    final after = pro.adapter.to('GET', '/api/pro').length;
    await _advance(tester, const Duration(seconds: 12));
    expect(pro.adapter.to('GET', '/api/pro').length, after);
  });

  testWidgets('back from the browser before the webhook: a neutral line after 10 s, no error', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 12));
    expect(find.text('سيتم تفعيل العضوية خلال لحظات'), findsOneWidget);
    expect(find.text('تعذّر التحميل'), findsNothing);
    // A later resume without a new checkout does not poll
    final after = pro.adapter.to('GET', '/api/pro').length;
    _leaveApp(tester);
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 5));
    expect(pro.adapter.to('GET', '/api/pro').length, after);
  });

  testWidgets('resume without a checkout from this screen does not poll', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    final before = pro.adapter.to('GET', '/api/pro').length;
    _leaveApp(tester);
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 5));
    expect(pro.adapter.to('GET', '/api/pro').length, before);
  });

  testWidgets('a Pro member sees «اشتراكي» even when canBuy is false; cancel asks first and never refunds', (
    tester,
  ) async {
    final pro = FakePro()
      ..isPro = true
      ..canBuy = false;
    await _pump(tester, pro);
    expect(find.byType(MyProCard), findsOneWidget);
    expect(find.byType(ProPlansCard), findsNothing);
    expect(find.textContaining('الباقة: شهري'), findsOneWidget);
    expect(find.textContaining('يتجدد في 1 ديسمبر 2026'), findsOneWidget);

    final cancel = find.byKey(const Key('pro-cancel'));
    await tester.ensureVisible(cancel);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    expect(find.textContaining('لا يُسترد'), findsOneWidget);
    expect(find.textContaining('سيتوقف التجديد وتبقى العضوية حتى 1 ديسمبر 2026.'), findsOneWidget);
    expect(pro.adapter.to('POST', '/api/pro/cancel'), isEmpty);
    await tester.tap(find.byKey(const Key('pro-cancel-confirm')));
    await tester.pumpAndSettle();
    expect(pro.adapter.to('POST', '/api/pro/cancel').length, 1);
    expect(find.textContaining('ينتهي في 1 ديسمبر 2026'), findsOneWidget);

    final resume = find.byKey(const Key('pro-resume'));
    await tester.ensureVisible(resume);
    await tester.tap(resume);
    await tester.pumpAndSettle();
    expect(pro.adapter.to('POST', '/api/pro/resume').length, 1);
    expect(find.textContaining('يتجدد في 1 ديسمبر 2026'), findsOneWidget);
  });

  testWidgets('past due shows the amber note', (tester) async {
    final pro = FakePro()
      ..isPro = true
      ..pastDue = true;
    await _pump(tester, pro);
    expect(find.text('تعذّر تجديد الاشتراك، يمكنك تحديث بطاقتك من الموقع'), findsOneWidget);
  });

  testWidgets('a server without Pro (404) shows nothing about it', (tester) async {
    final pro = FakePro();
    pro.adapter.on('GET', '/api/pro', const FakeResponse(404, {'error': 'غير موجود'}));
    await _pump(tester, pro);
    expect(find.byKey(const Key('pro-section')), findsNothing);
    expect(find.byKey(const Key('pro-error')), findsNothing);
    expect(find.byKey(const Key('buy-p1')), findsOneWidget);
  });

  testWidgets('a failed Pro load shows the error view and keeps the packages', (tester) async {
    final pro = FakePro()..failState = true;
    await _pump(tester, pro);
    expect(find.byKey(const Key('pro-error')), findsOneWidget);
    expect(find.byKey(const Key('buy-p1')), findsOneWidget);
    pro.failState = false;
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.byType(ProPlansCard), findsOneWidget);
  });
}
