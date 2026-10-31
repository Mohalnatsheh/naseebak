import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/notifications/notifications_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> row(String id, String title, {bool read = false}) =>
    {'id': id, 'type': 'SUPPORT', 'title': title, 'body': '', 'isRead': read, 'createdAt': '2026-10-30T10:00:00.000Z'};

Map<String, dynamic> page(List<Map<String, dynamic>> rows) =>
    {'notifications': rows, 'page': 1, 'total': rows.length, 'totalPages': 1};

void main() {
  testWidgets('notifications off: the card shows, «لاحقاً» hides it on home; on: nothing', (tester) async {
    Future<void> pump(bool? allowed, {bool dismissible = false}) async {
      final overrides = await testOverrides(FakeAdapter());
      await tester.pumpWidget(ProviderScope(
        key: UniqueKey(),
        overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => allowed)],
        child: rtlApp(Scaffold(body: PushOffCard(dismissible: dismissible))),
      ));
      await tester.pumpAndSettle();
    }

    await pump(true);
    expect(find.byKey(const Key('push-off-card')), findsNothing);
    await pump(null);
    expect(find.byKey(const Key('push-off-card')), findsNothing);

    await pump(false, dismissible: true);
    expect(find.text('الإشعارات غير مفعّلة'), findsOneWidget);
    expect(find.text('فعّل الإشعارات'), findsOneWidget);
    await tester.tap(find.byTooltip('لاحقاً'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('push-off-card')), findsNothing);
  });

  testWidgets('the steps sheet speaks to her and names the iPhone switch', (tester) async {
    await tester.pumpWidget(rtlApp(const Scaffold(body: PushStepsSheet(female: true, ios: true))));
    expect(find.text('فعّلي «السماح بالإشعارات».'), findsOneWidget);
    expect(find.text('اضغطي «فتح الإعدادات» في الأسفل.'), findsOneWidget);
    expect(find.byKey(const Key('open-push-settings')), findsOneWidget);
  });

  testWidgets('swipe deletes one notice (put back if the server refuses); «حذف الكل» empties the list',
      (tester) async {
    var deleteStatus = 200;
    final adapter = FakeAdapter()
      ..on('GET', '/api/notifications', FakeResponse(200, page([row('a', 'إشعار أ'), row('b', 'إشعار ب')])))
      ..on('DELETE', '/api/notifications', const FakeResponse(200, {'message': 'ok'}));
    adapter.handlers['DELETE /api/notifications/a/read'] = (_) => FakeResponse(deleteStatus, const {'error': 'خطأ'});
    adapter.handlers['DELETE /api/notifications/b/read'] = (_) => const FakeResponse(200, {'message': 'ok'});
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const NotificationsScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.support_agent_rounded), findsNWidgets(2));

    // The server refuses: «أ» comes back
    deleteStatus = 500;
    await tester.drag(find.text('إشعار أ'), const Offset(-600, 0));
    await tester.pumpAndSettle();
    // The request goes out once the swipe's resize animation is over
    await tester.pump(const Duration(seconds: 1));
    expect(adapter.to('DELETE', '/api/notifications/a/read'), hasLength(1));
    expect(find.text('إشعار أ'), findsOneWidget);

    await tester.drag(find.text('إشعار ب'), const Offset(600, 0));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('إشعار ب'), findsNothing);

    await tester.tap(find.byKey(const Key('notifications-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حذف الكل'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'حذف الكل'));
    await tester.pumpAndSettle();
    expect(adapter.to('DELETE', '/api/notifications'), hasLength(1));
    expect(find.text('إشعار أ'), findsNothing);
    expect(find.text('لا توجد إشعارات'), findsOneWidget);
  });
}
