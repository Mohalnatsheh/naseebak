import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> pay(String id, String desc) =>
    {'id': id, 'status': 'COMPLETED', 'amount': 3, 'currency': 'JOD', 'description': desc, 'createdAt': '2026-10-30T10:00:00.000Z'};

void main() {
  testWidgets('payment history: «عرض المزيد» adds the older page once, then stops', (tester) async {
    final adapter = FakeAdapter();
    adapter.handlers['GET /api/payments/history'] = (r) {
      final page = r.queryParameters['page'] == 2 ? 2 : 1;
      return FakeResponse(200, {
        'payments': page == 1 ? [pay('p1', 'باقة 1'), pay('p2', 'باقة 2')] : [pay('p2', 'باقة 2'), pay('p3', 'باقة 3')],
        'balance': 5,
        'page': page,
        'total': 3,
        'totalPages': 2,
      });
    };
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t'));
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const PaymentHistoryScreen())));
    await tester.pumpAndSettle();
    expect(find.text('باقة 3'), findsNothing);

    await tester.tap(find.byKey(const Key('payments-more')));
    await tester.pumpAndSettle();
    expect(find.text('باقة 3'), findsOneWidget);
    expect(find.text('باقة 2'), findsOneWidget, reason: 'a row repeated on the next page is shown once');
    expect(find.byKey(const Key('payments-more')), findsNothing);
  });
}
