import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/notifications/notifications_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> row(String id, String title, {String type = 'SYSTEM'}) =>
    {'id': id, 'type': type, 'title': title, 'body': '', 'isRead': false, 'createdAt': '2026-10-30T10:00:00.000Z'};

Map<String, dynamic> page(int n, int totalPages, List<Map<String, dynamic>> rows) =>
    {'notifications': rows, 'page': n, 'total': 10, 'totalPages': totalPages};

AppNotification n(String id, String title) => AppNotification.fromJson(row(id, title));

void main() {
  test('a further page never adds a row twice; a repeated row is updated in place', () {
    final merged = mergeNotificationPage([n('a', 'A'), n('b', 'B')], [n('b', 'B2'), n('c', 'C'), n('c', 'C')]);
    expect(merged.map((e) => e.id), ['a', 'b', 'c']);
    expect(merged[1].title, 'B2');
  });

  testWidgets('«عرض المزيد» skips rows already shown (chat notice bumped); pull-to-refresh reloads page 1',
      (tester) async {
    var first = page(1, 2, [row('a', 'إشعار أ'), row('b', 'إشعار ب')]);
    final adapter = FakeAdapter()
      ..handlers['GET /api/notifications'] = (r) => FakeResponse(
            200,
            r.queryParameters['page'] == 2
                // «ب» moved down a place on the server (a newer row came in), so page 2 starts with it again
                ? page(2, 2, [row('b', 'إشعار ب'), row('c', 'إشعار ج')])
                : first,
          );
    final overrides = await testOverrides(adapter);
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: rtlApp(const NotificationsScreen())));
    await tester.pumpAndSettle();

    await tester.tap(find.text('عرض المزيد'));
    await tester.pumpAndSettle();
    expect(find.text('إشعار أ'), findsOneWidget);
    expect(find.text('إشعار ب'), findsOneWidget);
    expect(find.text('إشعار ج'), findsOneWidget);
    expect(find.text('عرض المزيد'), findsNothing);

    // A chat notice bumped to the top since: pull-to-refresh starts again from page 1
    first = page(1, 2, [row('c', 'إشعار ج', type: 'CHAT'), row('a', 'إشعار أ')]);
    await tester.fling(find.text('إشعار أ'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    final requests = adapter.to('GET', '/api/notifications');
    expect(requests.last.queryParameters['page'], 1);
    expect(find.text('إشعار ب'), findsNothing);
    expect(find.text('إشعار ج'), findsOneWidget);
    expect(find.text('عرض المزيد'), findsOneWidget);
    expect(tester.getTopLeft(find.text('إشعار ج')).dy, lessThan(tester.getTopLeft(find.text('إشعار أ')).dy));
  });
}
