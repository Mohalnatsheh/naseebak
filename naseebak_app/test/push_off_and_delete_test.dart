import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/notifications/notifications_screen.dart';

import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

bool prefsSeen = false;

Map<String, dynamic> row(String id, String title, {bool read = false}) =>
    {'id': id, 'type': 'SUPPORT', 'title': title, 'body': '', 'isRead': read, 'createdAt': '2026-10-30T10:00:00.000Z'};

Map<String, dynamic> page(List<Map<String, dynamic>> rows) =>
    {'notifications': rows, 'page': 1, 'total': rows.length, 'totalPages': 1};

void main() {
  testWidgets('home asks for notifications with what they are for; while still off, a reminder once a day', (tester) async {
    late SharedPreferences prefs;
    Future<void> pump(bool? allowed, {int? reminderAt}) async {
      final overrides = await testOverrides(FakeAdapter(), prefs: {
        if (prefsSeen) pushExplainedKey: true,
        pushReminderAtKey: ?reminderAt,
      });
      await tester.pumpWidget(ProviderScope(
        key: UniqueKey(),
        overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => allowed)],
        child: rtlApp(const Scaffold(body: PushAskGate())),
      ));
      prefs = await SharedPreferences.getInstance();
      await tester.pumpAndSettle();
    }

    // Already allowed or unknown: no sheet
    prefsSeen = false;
    await pump(true);
    expect(find.byType(PushAskSheet), findsNothing);
    await pump(null);
    expect(find.byType(PushAskSheet), findsNothing);
    // Not allowed yet, never explained: the sheet, before any system prompt
    await pump(false);
    expect(find.byType(PushAskSheet), findsOneWidget);
    expect(find.textContaining('عندما يبدي أحدٌ اهتمامه'), findsOneWidget);
    await tester.tap(find.byKey(const Key('push-ask-later')));
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsNothing);
    expect(prefs.getBool(pushExplainedKey), isTrue);
    expect(prefs.getInt(pushReminderAtKey), isNotNull);
    prefsSeen = true;
    // Asked under a day ago: nothing
    final now = DateTime.now();
    await pump(false, reminderAt: now.subtract(const Duration(hours: 23)).millisecondsSinceEpoch);
    expect(find.byType(PushAskSheet), findsNothing);
    // A day later and still off: the reminder, with its own title and button
    await pump(false, reminderAt: now.subtract(const Duration(days: 1, minutes: 1)).millisecondsSinceEpoch);
    expect(find.byType(PushAskSheet), findsOneWidget);
    expect(find.text('الإشعارات غير مفعّلة'), findsOneWidget);
    expect(find.text('فعّل الإشعارات'), findsOneWidget);
    await tester.tap(find.byKey(const Key('push-ask-later')));
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsNothing);
    expect(prefs.getInt(pushReminderAtKey)! >= now.millisecondsSinceEpoch, isTrue);
    // Allowed now: never a reminder, however long ago
    await pump(true, reminderAt: now.subtract(const Duration(days: 5)).millisecondsSinceEpoch);
    expect(find.byType(PushAskSheet), findsNothing);
  });

  testWidgets('the reminder\'s button explains the phone\'s settings when the system can no longer ask',
      (tester) async {
    prefsSeen = true;
    final overrides = await testOverrides(FakeAdapter(), prefs: {
      pushExplainedKey: true,
      pushReminderAtKey: DateTime.now().subtract(const Duration(days: 2)).millisecondsSinceEpoch,
    });
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => false)],
      child: rtlApp(const Scaffold(body: PushAskGate())),
    ));
    await tester.pumpAndSettle();
    // No Firebase in tests: the system answer counts as a refusal, so the steps sheet follows
    await tester.tap(find.byKey(const Key('push-ask-allow')));
    await tester.pumpAndSettle();
    expect(find.byType(PushStepsSheet), findsOneWidget);
  });

  testWidgets('«السماح» then a refusal on that first prompt: no second «how to enable» sheet at once', (tester) async {
    prefsSeen = false;
    final overrides = await testOverrides(FakeAdapter());
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => false)],
      child: rtlApp(const Scaffold(body: PushAskGate())),
    ));
    await tester.pumpAndSettle();
    // No Firebase in tests: the system answer counts as a refusal
    await tester.tap(find.byKey(const Key('push-ask-allow')));
    await tester.pumpAndSettle();
    expect(find.byType(PushAskSheet), findsNothing);
    expect(find.byType(PushStepsSheet), findsNothing);
  });

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

    // «لاحقاً» lasts until the stored time, also after the app restarts (design P1-5)
    final overrides = await testOverrides(FakeAdapter(), prefs: {
      pushCardHiddenUntilKey: DateTime.now().add(const Duration(hours: 20)).millisecondsSinceEpoch,
    });
    await tester.pumpWidget(ProviderScope(
      key: UniqueKey(),
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => false)],
      child: rtlApp(const Scaffold(body: PushOffCard(dismissible: true))),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('push-off-card')), findsNothing);
  });

  testWidgets('«لاحقاً» hides the card for one day, then it comes back on resume without a restart (audit M7)',
      (tester) async {
    final overrides = await testOverrides(FakeAdapter());
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => false)],
      child: rtlApp(const Scaffold(body: PushOffCard(dismissible: true))),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('لاحقاً'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('push-off-card')), findsNothing);
    final prefs = await SharedPreferences.getInstance();
    final until = prefs.getInt(pushCardHiddenUntilKey)!;
    expect(until - DateTime.now().millisecondsSinceEpoch, closeTo(pushCardSnooze.inMilliseconds, 60000));

    // A resume within the day: still hidden
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('push-off-card')), findsNothing);

    // The day is over (the app stayed alive in the background): the next resume shows it again
    await prefs.setInt(pushCardHiddenUntilKey, DateTime.now().subtract(const Duration(minutes: 1)).millisecondsSinceEpoch);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('push-off-card')), findsOneWidget);
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
