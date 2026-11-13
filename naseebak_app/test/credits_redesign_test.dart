import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/localization/digits.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/credits/credits_repository.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';

import 'helpers/fake_api.dart';

const endsAt = '2026-11-20T21:59:00.000Z';

Map<String, dynamic> plansJson({bool offer = false}) => {
      'country': 'JO',
      'purchasesEnabled': true,
      if (offer) 'offer': {'percent': 50, 'title': 'عروض الجمعة البيضاء', 'endsAt': endsAt},
      'packages': [
        {
          'id': 'c10',
          'name': offer ? '10 أرصدة + 5 هدية' : '10 أرصدة',
          'credits': 10,
          'price': 3,
          'currency': 'JOD',
          'currencySymbol': 'د.أ',
          if (offer) 'bonusCredits': 5,
        },
        {
          'id': 'c25',
          'name': offer ? '25 رصيداً + 13 هدية' : '25 رصيداً',
          'credits': 25,
          'price': 6,
          'currency': 'JOD',
          'currencySymbol': 'د.أ',
          'popular': true,
          'wasPrice': 8,
          if (offer) 'bonusCredits': 13,
        },
        {
          'id': 'c50',
          'name': offer ? '50 رصيداً + 25 هدية' : '50 رصيداً',
          'credits': 50,
          'price': 10,
          'currency': 'JOD',
          'currencySymbol': 'د.أ',
          if (offer) 'bonusCredits': 25,
        },
      ],
    };

Map<String, dynamic> payment(int i) => {
      'id': 'pay$i',
      'status': 'COMPLETED',
      'amount': i + 2,
      'currency': 'JOD',
      'description': 'شراء دفعة $i',
      'createdAt': '2026-11-1${i}T10:00:00.000Z',
    };

Future<FakeAdapter> pumpCredits(
  WidgetTester tester, {
  bool appPayments = true,
  bool offer = false,
  List<Map<String, dynamic>> history = const [],
  bool historyFails = false,
}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(credits: 7), 'appPayments': appPayments}}))
    ..on('GET', '/api/payments/plans', FakeResponse(200, plansJson(offer: offer)))
    ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {'creditOnInterest': true}}))
    ..on(
      'GET',
      '/api/payments/history',
      historyFails
          ? const FakeResponse(500, {'error': 'حدث خطأ في الخادم'})
          : FakeResponse(200, {'payments': history, 'matchCredits': 7}),
    );
  final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  final router = GoRouter(
    initialLocation: '/credits',
    routes: [
      GoRoute(path: '/credits', builder: (_, _) => const CreditsScreen()),
      GoRoute(path: '/credits/history', builder: (_, _) => const Scaffold(body: Text('history-screen'))),
      GoRoute(path: '/pro', builder: (_, _) => const Scaffold(body: Text('pro-screen'))),
    ],
  );
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
  await tester.pumpAndSettle();
  return adapter;
}

void main() {
  group('parsing', () {
    test('a server before the sale fields: no offer, no gift', () {
      final p = Plans.fromJson(plansJson());
      expect(p.offer, isNull);
      expect(p.packages.every((e) => e.bonusCredits == 0), isTrue);
    });

    test('the sale fields', () {
      final p = Plans.fromJson(plansJson(offer: true));
      expect(p.offer!.percent, 50);
      expect(p.offer!.title, 'عروض الجمعة البيضاء');
      expect(p.offer!.endsAt, DateTime.parse(endsAt));
      expect(p.packages.first.bonusCredits, 5);
    });

    test('an offer without an end date is ignored', () {
      final p = Plans.fromJson({
        ...plansJson(),
        'offer': {'percent': 50, 'title': 'x'},
      });
      expect(p.offer, isNull);
    });
  });

  group('«أقل سعر للرصيد»', () {
    CreditPackage pkg(String id, int credits, double price, {bool popular = false}) => CreditPackage(
          id: id,
          name: id,
          credits: credits,
          price: price,
          currency: 'JOD',
          currencySymbol: 'د.أ',
          popular: popular,
        );

    test('the lowest price per credit', () {
      expect(lowestRatePackageId([pkg('a', 10, 3), pkg('b', 25, 6), pkg('c', 50, 10)]), 'c');
    });

    test('a tie goes to the larger package', () {
      expect(lowestRatePackageId([pkg('a', 10, 2), pkg('b', 20, 4), pkg('c', 5, 3)]), 'b');
    });

    test('a tie never lands on the popular package when another one ties', () {
      expect(lowestRatePackageId([pkg('a', 10, 2), pkg('b', 20, 4, popular: true), pkg('c', 5, 3)]), 'a');
    });

    test('the popular package keeps it when it alone is the lowest', () {
      expect(lowestRatePackageId([pkg('a', 10, 3), pkg('b', 20, 4, popular: true)]), 'b');
    });

    test('nothing to compare: one package, or every package at one rate', () {
      expect(lowestRatePackageId([pkg('a', 10, 3)]), isNull);
      expect(lowestRatePackageId([pkg('a', 10, 2), pkg('b', 20, 4), pkg('c', 5, 1)]), isNull);
    });
  });

  testWidgets('balance, the «مهتم» line, packages with their tags; no sale lines without an offer', (tester) async {
    await pumpCredits(tester);
    expect(find.byKey(const Key('balance')), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
    expect(find.text('رصيد متاح · «مهتم» برصيد واحد'), findsOneWidget);
    expect(find.text('شراء رصيد'), findsOneWidget);
    expect(find.text('10 أرصدة'), findsOneWidget);
    expect(find.text('3 د.أ'), findsOneWidget);
    expect(find.text('الأكثر طلباً'), findsOneWidget);
    expect(find.text('أقل سعر للرصيد'), findsOneWidget);
    // On the 50 package, not on the popular 25
    expect(
      find.descendant(of: find.byKey(const Key('package-c50')), matching: find.text('أقل سعر للرصيد')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: find.byKey(const Key('package-c25')), matching: find.text('الأكثر طلباً')),
      findsOneWidget,
    );
    final was = tester.widget<Text>(find.text('8 د.أ'));
    expect(was.style?.decoration, TextDecoration.lineThrough);
    expect(find.byKey(const Key('offer-banner')), findsNothing);
    expect(find.textContaining('هدية'), findsNothing);
  });

  testWidgets('a sale: banner with the title and end date, gift tags, the gift not printed twice', (tester) async {
    await pumpCredits(tester, offer: true);
    final banner = find.byKey(const Key('offer-banner'));
    expect(banner, findsOneWidget);
    expect(find.descendant(of: banner, matching: find.text('عروض الجمعة البيضاء')), findsOneWidget);
    final ends = formatDate(DateTime.parse(endsAt), withYear: false);
    expect(find.descendant(of: banner, matching: find.textContaining(ends)), findsOneWidget);
    expect(find.text('10 أرصدة'), findsOneWidget);
    expect(find.text('+5 هدية'), findsOneWidget);
    expect(find.text('+13 هدية'), findsOneWidget);
    expect(find.text('10 أرصدة + 5 هدية'), findsNothing);
  });

  testWidgets('«آخر الحركات»: the last 3 payments, «السجل» opens the history', (tester) async {
    await pumpCredits(tester, history: [for (var i = 1; i <= 4; i++) payment(i)]);
    await tester.scrollUntilVisible(find.text('آخر الحركات'), 200);
    expect(find.text('شراء دفعة 1'), findsOneWidget);
    expect(find.text('شراء دفعة 3'), findsOneWidget);
    expect(find.text('شراء دفعة 4'), findsNothing);
    expect(find.text('3 د.أ'), findsWidgets);
    // «السجل» sits in the bar, there from the first frame and stable once the payments load
    final link = find.widgetWithText(TextButton, 'السجل');
    expect(link, findsOneWidget);
    await tester.tap(link);
    await tester.pumpAndSettle();
    expect(find.text('history-screen'), findsOneWidget);
  });

  testWidgets('«آخر الحركات» hidden with no payments, and when the history fails to load', (tester) async {
    await pumpCredits(tester);
    expect(find.text('آخر الحركات'), findsNothing);
    // The history stays reachable from the bar
    expect(find.text('السجل'), findsOneWidget);
    await pumpCredits(tester, historyFails: true);
    expect(find.text('آخر الحركات'), findsNothing);
    expect(find.text('السجل'), findsOneWidget);
  });

  testWidgets('payments hidden (test account or switch off): no buying, sale or recent payments', (tester) async {
    final adapter = await pumpCredits(tester, appPayments: false, offer: true, history: [payment(1)]);
    expect(find.byKey(const Key('balance')), findsOneWidget);
    expect(find.text('شراء رصيد'), findsNothing);
    expect(find.byKey(const Key('offer-banner')), findsNothing);
    expect(find.text('آخر الحركات'), findsNothing);
    expect(find.text('السجل'), findsNothing);
    expect(find.textContaining('Pro'), findsNothing);
    expect(adapter.to('GET', '/api/payments/plans'), isEmpty);
    expect(adapter.to('GET', '/api/payments/history'), isEmpty);
  });

  testWidgets('the buy button announces the gift', (tester) async {
    await pumpCredits(tester, offer: true);
    final handle = tester.ensureSemantics();
    expect(find.bySemanticsLabel(RegExp(r'^شراء .*، \+5 هدية$')), findsOneWidget);
    handle.dispose();
  });

  testWidgets('a narrow phone with large text: no overflow, 44 px buy buttons', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpCredits(tester, offer: true, history: [payment(1)]);
    expect(tester.takeException(), isNull);
    expect(tester.getSize(find.byKey(const Key('buy-c25'))).height, greaterThanOrEqualTo(44));
  });
}
