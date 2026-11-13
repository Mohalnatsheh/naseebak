import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/settings/settings_list_screen.dart';
import 'package:naseebak_app/features/settings/settings_screen.dart';

import 'helpers/fake_api.dart';

Future<(ProviderContainer, FakeAdapter)> _signedIn(WidgetTester tester, {bool renewingPro = false}) async {
  final adapter = FakeAdapter()
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
    ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}))
    ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}))
    ..on(
        'GET',
        '/api/pro',
        renewingPro
            ? const FakeResponse(200, {'enabled': true, 'isPro': true, 'plan': 'monthly', 'renewsAt': '2026-12-10T10:00:00.000Z'})
            : const FakeResponse(200, {'enabled': true}));
  final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  await tester.runAsync(() => settled(container));
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  return (container, adapter);
}

Future<void> _pump(WidgetTester tester, ProviderContainer container) async {
  final router = GoRouter(
    initialLocation: '/settings',
    routes: [
      GoRoute(path: '/settings', builder: (_, _) => const SettingsListScreen()),
      for (final p in ['/settings/notifications', '/settings/blocks', '/profile/guardian', '/profile/edit'])
        GoRoute(path: p, builder: (_, _) => Scaffold(body: Text('at $p'))),
    ],
  );
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  testWidgets('holds every row in order', (tester) async {
    final (c, _) = await _signedIn(tester);
    await _pump(tester, c);
    final order = [
      'إعدادات الإشعارات',
      'المحظورون',
      'بيانات وليّ الأمر',
      'تعديل ملفي',
      'الشروط والأحكام',
      'سياسة الخصوصية',
      'الأسئلة الشائعة',
      'إيقاف الحساب مؤقتاً',
      'حذف الحساب',
      'تسجيل الخروج',
    ];
    var last = -1.0;
    for (final t in order) {
      final f = find.text(t);
      expect(f, findsOneWidget, reason: t);
      final y = tester.getTopLeft(f).dy;
      expect(y, greaterThan(last), reason: t);
      last = y;
    }
  });

  testWidgets('rows route where they did', (tester) async {
    final (c, _) = await _signedIn(tester);
    for (final (label, path) in [
      ('إعدادات الإشعارات', '/settings/notifications'),
      ('المحظورون', '/settings/blocks'),
      ('بيانات وليّ الأمر', '/profile/guardian'),
      ('تعديل ملفي', '/profile/edit'),
    ]) {
      await _pump(tester, c);
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
      expect(find.text('at $path'), findsOneWidget, reason: label);
    }
  });

  testWidgets('pause and delete open their dialogs with the Pro line for a renewing member', (tester) async {
    final (c, _) = await _signedIn(tester, renewingPro: true);
    await _pump(tester, c);
    await tester.tap(find.text('إيقاف الحساب مؤقتاً'));
    await tester.pumpAndSettle();
    expect(find.textContaining('لن يتجدد بعد الإيقاف'), findsOneWidget);
    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حذف الحساب'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('delete-pro')), findsOneWidget);
  });

  testWidgets('sign-out confirms, then calls the auth controller logout', (tester) async {
    final (c, adapter) = await _signedIn(tester);
    await _pump(tester, c);
    await tester.tap(find.byKey(const Key('logout')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('خروج'));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.requests.any((r) => r.path == '/api/mobile/auth/logout'), isTrue);
  });

  testWidgets('«حسابي» keeps only its own rows and a link to «الإعدادات»', (tester) async {
    final (c, _) = await _signedIn(tester);
    await tester.pumpWidget(UncontrolledProviderScope(container: c, child: rtlApp(const AccountScreen())));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('الإعدادات'), findsWidgets);
    for (final t in ['إيقاف الحساب مؤقتاً', 'حذف الحساب', 'المحظورون', 'إعدادات الإشعارات', 'الشروط والأحكام', 'تسجيل الخروج']) {
      expect(find.text(t), findsNothing, reason: t);
    }
  });
}
