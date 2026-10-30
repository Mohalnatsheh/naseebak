import 'package:flutter/widgets.dart';
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
    {'id': 'p1', 'name': 'باقة', 'credits': 5, 'price': 5, 'currency': 'JOD', 'currencySymbol': 'د.أ', 'chargeLabel': '7 USD'},
  ],
};

Future<FakeAdapter> pumpCredits(WidgetTester tester, {required bool appPayments}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(), 'appPayments': appPayments}}))
    ..on('GET', '/api/payments/plans', const FakeResponse(200, plans));
  final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  // The screen is only reachable signed in: restore the session first
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const CreditsScreen())));
  await tester.pumpAndSettle();
  return adapter;
}

void main() {
  testWidgets('payments shown: packages are offered', (tester) async {
    final adapter = await pumpCredits(tester, appPayments: true);
    expect(find.text('الباقات'), findsOneWidget);
    expect(find.text('السجل'), findsOneWidget);
    expect(adapter.to('GET', '/api/payments/plans'), isNotEmpty);
  });

  testWidgets('payments hidden (admin switch or a test account): balance only, no packages', (tester) async {
    final adapter = await pumpCredits(tester, appPayments: false);
    expect(find.text('رصيدك الحالي'), findsOneWidget);
    expect(find.text('الباقات'), findsNothing);
    expect(find.text('السجل'), findsNothing);
    expect(adapter.to('GET', '/api/payments/plans'), isEmpty);
  });
}
