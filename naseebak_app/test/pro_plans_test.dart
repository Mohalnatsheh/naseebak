import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/pro/pro_repository.dart';
import 'package:naseebak_app/features/pro/pro_screen.dart';
import 'package:naseebak_app/features/pro/pro_section.dart';
import 'package:naseebak_app/features/settings/settings_screen.dart';

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
  /// false = a test or review account (`EXTRA_TEST_PHONES`): the app shows no payments
  bool appPayments = true;
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
      'user': {...meJson(), 'appPayments': appPayments},
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

Future<ProviderContainer> _signIn(WidgetTester tester, FakePro pro) async {
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
  return container;
}

/// The Pro screen (`/pro`)
Future<void> _pump(WidgetTester tester, FakePro pro) async {
  final container = await _signIn(tester, pro);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: rtlApp(
        ProScreen(
          openCheckout: (url) async {
            pro.opened.add(url);
            _leaveApp(tester);
            return true;
          },
          pollInterval: const Duration(seconds: 2),
          pollWindow: const Duration(seconds: 10),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// The credits screen inside a router, so the «عضوية Pro» card can open `/pro`
Future<void> _pumpCredits(WidgetTester tester, FakePro pro) async {
  final container = await _signIn(tester, pro);
  final router = GoRouter(
    initialLocation: '/credits',
    routes: [
      GoRoute(path: '/credits', builder: (_, _) => const CreditsScreen()),
      GoRoute(path: '/pro', builder: (_, _) => const Scaffold(body: Text('pro-screen'))),
    ],
  );
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
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
    expect(find.text('أولوية في الاقتراحات'), findsOneWidget);
    // Weekly sits on the right in RTL
    final weekly = tester.getCenter(find.text('أسبوعي')).dx;
    final yearly = tester.getCenter(find.text('سنوي')).dx;
    expect(weekly, greaterThan(yearly));
    expect(tester.getSize(find.byKey(const Key('pro-plan-weekly'))).height, greaterThanOrEqualTo(44));
    // Pro has its own screen: no credit packages here
    expect(find.text('الباقات'), findsNothing);
    expect(find.byKey(const Key('buy-p1')), findsNothing);
  });

  testWidgets('a member who can\'t buy (canBuy false, not Pro) sees «غير متاحة», nothing to buy', (tester) async {
    final pro = FakePro()..canBuy = false;
    await _pump(tester, pro);
    expect(find.byKey(const Key('pro-unavailable')), findsOneWidget);
    expect(find.byType(ProPlansCard), findsNothing);
    expect(find.byType(MyProCard), findsNothing);
    expect(find.byKey(const Key('pro-subscribe')), findsNothing);
  });

  testWidgets('a test account (app payments off) opening /pro sees nothing purchasable, even when Pro', (tester) async {
    for (final isPro in [false, true]) {
      final pro = FakePro()
        ..appPayments = false
        ..isPro = isPro;
      await _pump(tester, pro);
      expect(find.byKey(const Key('pro-unavailable')), findsOneWidget, reason: 'isPro=$isPro');
      expect(find.byType(ProPlansCard), findsNothing);
      expect(find.byType(MyProCard), findsNothing);
      expect(find.text('اشتراكي'), findsNothing);
      expect(find.textContaining('د.أ'), findsNothing);
      // `/api/pro` isn't even read
      expect(pro.adapter.to('GET', '/api/pro'), isEmpty);
    }
  });

  testWidgets('the plans card lists «حذف الرسائل ومسح المحادثة» only while the server says chatDelete', (tester) async {
    final o = _offers.map(ProOffer.fromJson).toList();
    Widget card({required bool chatDelete}) => rtlApp(Scaffold(
          body: SingleChildScrollView(
            child: ProPlansCard(
                offers: o, canBuy: true, chatDelete: chatDelete, female: false, busy: false, onSubscribe: (_) {}),
          ),
        ));
    await tester.pumpWidget(card(chatDelete: true));
    expect(find.text(proChatDeleteLabel), findsOneWidget);
    await tester.pumpWidget(card(chatDelete: false));
    expect(find.text(proChatDeleteLabel), findsNothing);
    // An older server sends no chatDelete: the line stays hidden
    expect(MyProState.fromJson(const {}).chatDelete, isFalse);
    expect(MyProState.fromJson(const {'chatDelete': true}).chatDelete, isTrue);
  });

  testWidgets('a picked plan that a reload no longer offers falls back to the default, not a stale choice',
      (tester) async {
    List<ProOffer> offers(List<Map<String, dynamic>> l) => l.map(ProOffer.fromJson).toList();
    Widget card(List<ProOffer> o) => rtlApp(Scaffold(
          body: SingleChildScrollView(
            child: ProPlansCard(offers: o, canBuy: true, female: false, busy: false, onSubscribe: (_) {}),
          ),
        ));
    await tester.pumpWidget(card(offers(_offers)));
    await tester.tap(find.text('سنوي'));
    await tester.pumpAndSettle();
    expect(find.textContaining('36'), findsWidgets);
    await tester.pumpWidget(card(offers([_offers[0], _offers[1]])));
    await tester.pumpAndSettle();
    // Yearly is back after another reload: the pick went to the default (monthly), not to the old yearly
    await tester.pumpWidget(card(offers(_offers)));
    await tester.pumpAndSettle();
    expect(find.textContaining('36'), findsNothing);
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
    expect(find.text('حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.'), findsOneWidget);
  });

  testWidgets('local mock checkout (debug + local backend): finished in the app, then Pro is read', (tester) async {
    final pro = FakePro()..checkoutUrl = '/dashboard/pro?mockPro=pay1';
    pro.adapter.handlers['POST /api/dev/mock-checkout/pay1'] = (_) {
      pro.isPro = true;
      return const FakeResponse(200, {'ok': true});
    };
    final container = await _signIn(tester, pro);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(ProScreen(allowMock: true, openCheckout: (url) async {
        pro.opened.add(url);
        return true;
      })),
    ));
    await tester.pumpAndSettle();
    await _subscribe(tester);
    expect(pro.opened, isEmpty);
    await tester.tap(find.byKey(const Key('mock-pro-pay')));
    await _advance(tester, const Duration(seconds: 3));
    expect(pro.adapter.to('POST', '/api/dev/mock-checkout/pay1').single.data, {'outcome': 'paid'});
    expect(find.text('تم تفعيل عضوية Pro في حسابك.'), findsOneWidget);
  });

  testWidgets('a relative mock url is refused outside a local debug build', (tester) async {
    final pro = FakePro()..checkoutUrl = '/dashboard/pro?mockPro=pay1';
    await _pump(tester, pro);
    await _subscribe(tester);
    expect(find.byKey(const Key('mock-pro-pay')), findsNothing);
    expect(pro.opened, isEmpty);
    expect(find.text('حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.'), findsOneWidget);
  });

  testWidgets('back from the browser: polls until Pro is on, then a success snack', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    final before = pro.adapter.to('GET', '/api/pro').length;
    // The app shell watches the counts (here, a listener stands in for it)
    final sub = ProviderScope.containerOf(tester.element(find.byType(ProScreen))).listen(countsProvider, (_, _) {});
    addTearDown(sub.close);
    await tester.pump();
    final countsBefore = pro.adapter.to('GET', '/api/me/counts').length;
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 3));
    expect(pro.adapter.to('GET', '/api/pro').length, greaterThan(before));
    // The counts (badge, credits) are re-read with it
    expect(pro.adapter.to('GET', '/api/me/counts').length, greaterThan(countsBefore));
    pro.isPro = true;
    await _advance(tester, const Duration(seconds: 3));
    expect(find.text('تم تفعيل عضوية Pro في حسابك.'), findsOneWidget);
    expect(find.byType(MyProCard), findsOneWidget);
    // Polling stopped
    final after = pro.adapter.to('GET', '/api/pro').length;
    await _advance(tester, const Duration(seconds: 12));
    expect(pro.adapter.to('GET', '/api/pro').length, after);
  });

  testWidgets('back from a cancelled checkout: polling stops, a plain line, never «سيتم تفعيل…»', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    _returnToApp(tester);
    ProviderScope.containerOf(tester.element(find.byType(ProScreen))).read(proReturnProvider.notifier).state =
        ProReturn.cancel;
    await _advance(tester, const Duration(seconds: 1));
    expect(find.text(proCheckoutCancelledText), findsOneWidget);
    final after = pro.adapter.to('GET', '/api/pro').length;
    await _advance(tester, const Duration(seconds: 12));
    expect(pro.adapter.to('GET', '/api/pro').length, after);
    expect(find.text(proActivatingText), findsNothing);
    expect(find.byType(ProPlansCard), findsOneWidget);
  });

  testWidgets('back from the browser with no return link (left the page): nothing is promised', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 12));
    expect(find.text(proActivatingText), findsNothing);
    expect(find.text(proCheckoutCancelledText), findsNothing);
  });

  testWidgets('back from the browser before the webhook: a neutral line after 10 s, no error', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    await _subscribe(tester);
    // Stripe's return link says it was paid (the router writes it)
    ProviderScope.containerOf(tester.element(find.byType(ProScreen))).read(proReturnProvider.notifier).state =
        ProReturn.success;
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 12));
    expect(find.text(proActivatingText), findsOneWidget);
    expect(find.text('تعذّر التحميل'), findsNothing);
    // A later resume without a new checkout re-reads once, no polling
    final after = pro.adapter.to('GET', '/api/pro').length;
    _leaveApp(tester);
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 5));
    expect(pro.adapter.to('GET', '/api/pro').length, after + 1);
  });

  testWidgets('resume without a checkout from this screen re-reads Pro once (bought elsewhere), no polling', (
    tester,
  ) async {
    final pro = FakePro();
    await _pump(tester, pro);
    expect(find.byType(MyProCard), findsNothing);
    final before = pro.adapter.to('GET', '/api/pro').length;
    // Bought on the website meanwhile
    pro.isPro = true;
    _leaveApp(tester);
    _returnToApp(tester);
    await _advance(tester, const Duration(seconds: 5));
    expect(pro.adapter.to('GET', '/api/pro').length, before + 1);
    expect(find.byType(MyProCard), findsOneWidget);
  });

  testWidgets('reopening /pro re-reads a Pro state another screen kept alive (bought elsewhere → «اشتراكي»)', (
    tester,
  ) async {
    final pro = FakePro();
    final container = await _signIn(tester, pro);
    // «حسابي» keeps the (non-Pro) state alive, as in the app
    final keep = container.listen(proStateProvider, (_, _) {});
    addTearDown(keep.close);
    for (var i = 0; i < 20 && !container.read(proStateProvider).hasValue; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(container.read(proStateProvider).value?.isPro, isFalse);
    pro.isPro = true;
    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: rtlApp(ProScreen(openCheckout: (_) async => true))),
    );
    // A spinner, never the stale plans
    expect(find.byKey(const Key('pro-subscribe')), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(find.byType(MyProCard), findsOneWidget);
  });

  testWidgets('a first open reads Pro once (nothing kept alive)', (tester) async {
    final pro = FakePro();
    await _pump(tester, pro);
    expect(pro.adapter.to('GET', '/api/pro'), hasLength(1));
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
    expect(find.byKey(const Key('pro-unavailable')), findsOneWidget);
  });

  testWidgets('a failed Pro load shows the error view; retry loads the plans', (tester) async {
    final pro = FakePro()..failState = true;
    await _pump(tester, pro);
    expect(find.text('تعذّر التحميل'), findsOneWidget);
    expect(find.byType(ProPlansCard), findsNothing);
    pro.failState = false;
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.byType(ProPlansCard), findsOneWidget);
  });

  group('credits screen', () {
    testWidgets('packages and a small «عضوية Pro» card that opens /pro; no plans on it', (tester) async {
      final pro = FakePro();
      await _pumpCredits(tester, pro);
      expect(find.byKey(const Key('buy-p1')), findsOneWidget);
      expect(find.byType(ProPlansCard), findsNothing);
      expect(find.byType(MyProCard), findsNothing);
      expect(find.byKey(const Key('pro-link')), findsOneWidget);
      await tester.tap(find.byKey(const Key('pro-link')));
      await tester.pumpAndSettle();
      expect(find.text('pro-screen'), findsOneWidget);
    });

    testWidgets('a Pro member who can no longer buy still gets the card', (tester) async {
      final pro = FakePro()
        ..isPro = true
        ..canBuy = false;
      await _pumpCredits(tester, pro);
      expect(find.byKey(const Key('pro-link')), findsOneWidget);
      expect(find.text('مزايا Pro فعّالة في حسابك.'), findsOneWidget);
    });

    testWidgets('no card for a member who can\'t buy', (tester) async {
      final pro = FakePro()..canBuy = false;
      await _pumpCredits(tester, pro);
      expect(find.byKey(const Key('pro-link')), findsNothing);
      expect(find.textContaining('Pro'), findsNothing);
    });

    testWidgets('a test account (app payments off) sees nothing about Pro, even when Pro', (tester) async {
      final pro = FakePro()
        ..appPayments = false
        ..isPro = true;
      await _pumpCredits(tester, pro);
      expect(find.byKey(const Key('pro-link')), findsNothing);
      expect(find.textContaining('Pro'), findsNothing);
      expect(pro.adapter.to('GET', '/api/pro'), isEmpty);
    });
  });

  group('account menu', () {
    Future<void> pumpMenu(WidgetTester tester, FakePro pro) async {
      final container = await _signIn(tester, pro);
      final router = GoRouter(
        initialLocation: '/account',
        routes: [
          GoRoute(path: '/account', builder: (_, _) => const AccountScreen()),
          GoRoute(path: '/pro', builder: (_, _) => const Scaffold(body: Text('pro-screen'))),
        ],
      );
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
      await tester.pumpAndSettle();
    }

    testWidgets('«عضوية Pro» sits under the credits entry and opens /pro', (tester) async {
      final pro = FakePro();
      await pumpMenu(tester, pro);
      final entry = find.byKey(const Key('menu-pro'));
      expect(entry, findsOneWidget);
      expect(tester.getTopLeft(entry).dy, greaterThan(tester.getTopLeft(find.text('الرصيد والباقات')).dy));
      await tester.tap(entry);
      await tester.pumpAndSettle();
      expect(find.text('pro-screen'), findsOneWidget);
    });

    testWidgets('no entry for a test account (app payments off), even when Pro, nor for one who can\'t buy',
        (tester) async {
      final testAccount = FakePro()
        ..appPayments = false
        ..isPro = true;
      await pumpMenu(tester, testAccount);
      expect(find.byKey(const Key('menu-pro')), findsNothing);
      expect(find.textContaining('Pro'), findsNothing);
      expect(testAccount.adapter.to('GET', '/api/pro'), isEmpty);

      final cantBuy = FakePro()..canBuy = false;
      await pumpMenu(tester, cantBuy);
      expect(find.byKey(const Key('menu-pro')), findsNothing);
    });

    // Smoke QA: the row arrived after first paint and moved the list. The last answer on this device draws it (or
    // leaves it out) in the first frame while /api/pro reloads.
    Future<GoRouter> pumpMenuThenAway(WidgetTester tester, FakePro pro) async {
      final container = await _signIn(tester, pro);
      final router = GoRouter(
        initialLocation: '/account',
        routes: [
          GoRoute(path: '/account', builder: (_, _) => const AccountScreen()),
          GoRoute(path: '/away', builder: (_, _) => const Scaffold(body: Text('away'))),
        ],
      );
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
      await tester.pumpAndSettle();
      // Away and back: the screen's Pro state is gone (autoDispose) and reloads
      router.go('/away');
      await tester.pumpAndSettle();
      return router;
    }

    testWidgets('the remembered row is there in the first frame, before /api/pro answers', (tester) async {
      final pro = FakePro()..isPro = true;
      final router = await pumpMenuThenAway(tester, pro);
      final gate = Completer<void>();
      pro.adapter.hold('GET', '/api/pro', gate.future);
      router.go('/account');
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('menu-pro')), findsOneWidget);
      expect(find.text('مزايا Pro فعّالة في حسابك.'), findsOneWidget);
      final top = tester.getTopLeft(find.text('دعوة الأصدقاء')).dy;
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-pro')), findsOneWidget);
      expect(tester.getTopLeft(find.text('دعوة الأصدقاء')).dy, top);
    });

    testWidgets('a remembered «no row» stays out while loading; the live answer still wins', (tester) async {
      final pro = FakePro()..canBuy = false;
      final router = await pumpMenuThenAway(tester, pro);
      final gate = Completer<void>();
      pro.adapter.hold('GET', '/api/pro', gate.future);
      pro.canBuy = true;
      router.go('/account');
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('menu-pro')), findsNothing);
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-pro')), findsOneWidget);
    });
  });

  test('the footnote promises free credits only when a plan has some', () {
    final withCredits = MyProState.fromJson({'enabled': true, 'canBuy': true, 'offers': _offers}).offers;
    expect(proFootnote(withCredits), contains('الرصيد المجاني'));
    final none = MyProState.fromJson({
      'enabled': true,
      'canBuy': true,
      'offers': [for (final o in _offers) {...o, 'credits': 0}],
    }).offers;
    expect(proFootnote(none), isNot(contains('رصيد')));
    expect(proFootnote(none), contains('يتجدد الاشتراك تلقائياً'));
  });

  test('the pitch reads as one sentence, the free credits only when a plan has some', () {
    final withCredits = MyProState.fromJson({'enabled': true, 'canBuy': true, 'offers': _offers}).offers;
    final none = MyProState.fromJson({
      'enabled': true,
      'canBuy': true,
      'offers': [for (final o in _offers) {...o, 'credits': 0}],
    }).offers;
    expect(proPitch(none), 'مع Pro يمكنك إرسال الصور والرسائل الصوتية في المحادثة، ولك أولوية في الاقتراحات.');
    expect(
      proPitch(withCredits),
      'مع Pro يمكنك إرسال الصور والرسائل الصوتية في المحادثة، ولك أولوية في الاقتراحات، ويصلك رصيد مجاني مع الاشتراك.',
    );
  });

  testWidgets('a failed cancel (subscription already gone, 404) reloads «اشتراكي»', (tester) async {
    final pro = FakePro()..isPro = true;
    pro.adapter.handlers['POST /api/pro/cancel'] = (_) {
      pro.isPro = false;
      return const FakeResponse(404, {'error': 'لا يوجد اشتراك'});
    };
    await _pump(tester, pro);
    final before = pro.adapter.to('GET', '/api/pro').length;
    final cancel = find.byKey(const Key('pro-cancel'));
    await tester.ensureVisible(cancel);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pro-cancel-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('لا يوجد اشتراك'), findsOneWidget);
    expect(pro.adapter.to('GET', '/api/pro').length, greaterThan(before));
    expect(find.byType(MyProCard), findsNothing);
  });

  group('«اشتراكي» credits line', () {
    final offer = {'id': 'monthly', 'price': 4, 'currency': 'JOD', 'chargeCurrency': 'usd', 'chargeAmount': 564, 'credits': 20, 'interval': 'month'};

    test("the subscription's own credits win over today's offer, with the next grant's date", () {
      final s = MyProState.fromJson({
        'isPro': true,
        'plan': 'monthly',
        'creditsPerGrant': 8,
        'nextGrantAt': '2026-12-10T10:00:00.000Z',
        'offers': [offer],
      });
      expect(s.creditsPerGrant, 8);
      final line = myProCreditsLine(s)!;
      expect(line, startsWith('8 أرصدة كل شهر · الدفعة القادمة في '));
      expect(line, isNot(contains('20')));
    });

    test('no next grant (cancelled): the credits alone; weekly says كل أسبوع; none: no line', () {
      expect(myProCreditsLine(MyProState.fromJson({'isPro': true, 'plan': 'weekly', 'creditsPerGrant': 5, 'offers': []})),
          '5 أرصدة كل أسبوع');
      expect(myProCreditsLine(MyProState.fromJson({'isPro': true, 'plan': 'monthly', 'creditsPerGrant': 0, 'offers': [offer]})),
          isNull);
    });

    test("a server before the field: the plan's offer of today", () {
      final s = MyProState.fromJson({'isPro': true, 'plan': 'monthly', 'offers': [offer]});
      expect(s.creditsPerGrant, isNull);
      expect(myProCreditsLine(s), '20 رصيداً مجاناً كل شهر');
    });
  });
}
