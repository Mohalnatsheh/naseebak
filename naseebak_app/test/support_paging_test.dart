import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/settings/settings_screen.dart';
import 'package:naseebak_app/features/support/support_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> ticket(int i) => {
      'id': 't$i',
      'type': 'ISSUE',
      'subject': 'تذكرة رقم $i',
      'description': 'وصف التذكرة',
      'status': 'OPEN',
      'createdAt': '2026-10-29T14:30:30.834Z',
    };

void main() {
  testWidgets('support: older tickets load page by page with «عرض المزيد»', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter()
      ..handlers['GET /api/support'] = (r) {
        final page = int.parse('${r.queryParameters['page']}');
        return FakeResponse(200, {
          'tickets': page == 1 ? [ticket(1), ticket(2)] : [ticket(2), ticket(3)],
          'page': page,
          'totalPages': 2,
          'total': 3,
        });
      };
    await tester.pumpWidget(ProviderScope(overrides: await testOverrides(adapter), child: rtlApp(const SupportScreen())));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.text('تذكرة رقم 1'), findsOneWidget);
    expect(find.text('تذكرة رقم 3'), findsNothing);

    await tester.tap(find.byKey(const Key('support-load-more')));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.to('GET', '/api/support').map((r) => r.queryParameters['page']), [1, 2]);
    expect(find.text('تذكرة رقم 3'), findsOneWidget);
    // A ticket that moved to the next page is shown once; the last page has no «عرض المزيد»
    expect(find.text('تذكرة رقم 2'), findsOneWidget);
    expect(find.byKey(const Key('support-load-more')), findsNothing);
  });

  group('notification settings follow the switches (like the website)', () {
    List<String> keys(CycleFlags f) => visibleNotificationPrefs(f).map((k) => k.$1).toList();

    test('legacy cycle: interest and visit notices, no intro requests or chat', () {
      expect(keys(const CycleFlags()), ['suggestions', 'interests', 'matches', 'visitUpdates', 'payments', 'support']);
    });

    test('new cycle: intro requests; chat messages only with chat on', () {
      expect(keys(const CycleFlags(introRequests: true)), ['suggestions', 'matches', 'introRequests', 'payments', 'support']);
      expect(keys(const CycleFlags(introRequests: true, chat: true)),
          ['suggestions', 'matches', 'introRequests', 'chatMessages', 'payments', 'support']);
    });
  });

  testWidgets('account deletion asks for an optional reason and sends it', (tester) async {
    String? result = 'not closed';
    await tester.pumpWidget(rtlApp(Builder(
      builder: (context) => TextButton(
        onPressed: () async => result = await showDialog<String>(context: context, builder: (_) => const DeleteAccountDialog()),
        child: const Text('open'),
      ),
    )));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('delete-reason')), '  وجدت نصيبي  ');
    await tester.tap(find.byKey(const Key('delete-confirm')));
    await tester.pumpAndSettle();
    expect(result, 'وجدت نصيبي');

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();
    expect(result, isNull);
  });
}
