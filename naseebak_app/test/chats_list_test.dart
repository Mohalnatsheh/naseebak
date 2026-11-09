import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chats_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> chat({
  String? last,
  int unread = 0,
  String id = 'c1',
  String name = 'عمر',
  String status = 'ACTIVE',
  bool blocked = false,
}) => {
  'id': id,
  'matchId': 'x$id',
  'partner': {'id': 'p$id', 'firstName': name},
  'status': status,
  'blocked': blocked,
  'expiresAt': '2099-01-01T00:00:00.000Z',
  'lastMessage': last == null
      ? null
      : {'body': last, 'createdAt': '2026-11-09T10:00:00.000Z', 'mine': false, 'readAt': null},
  'unread': unread,
};

/// Signed in as a woman (meJson)
Future<ProviderContainer> openList(WidgetTester tester, FakeAdapter adapter) async {
  adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
  final container = ProviderContainer(overrides: overrides);
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const ChatsScreen())));
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
  return container;
}

void main() {
  testWidgets('the open chats list picks up a new incoming message by itself', (tester) async {
    final adapter = FakeAdapter()
      ..on(
        'GET',
        '/api/chats',
        FakeResponse(200, {
          'conversations': [chat()],
        }),
      );
    await openList(tester, adapter);
    final before = adapter.to('GET', '/api/chats').length;
    expect(before, 1);

    adapter.on(
      'GET',
      '/api/chats',
      FakeResponse(200, {
        'conversations': [chat(last: 'السلام عليكم', unread: 1)],
      }),
    );
    await tester.pump(ChatsScreen.refreshEvery + const Duration(seconds: 1));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.to('GET', '/api/chats').length, greaterThan(before));
    expect(find.text('السلام عليكم'), findsOneWidget);
  });

  testWidgets('coming back to the Chats tab reloads the list at once', (tester) async {
    final adapter = FakeAdapter()
      ..on(
        'GET',
        '/api/chats',
        FakeResponse(200, {
          'conversations': [chat()],
        }),
      );
    adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    final container = ProviderContainer(overrides: overrides);
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    // The shell keeps the tab alive and switches its tickers off while another tab is shown
    final shown = ValueNotifier(true);
    addTearDown(shown.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: rtlApp(
          ValueListenableBuilder<bool>(
            valueListenable: shown,
            builder: (_, on, child) => TickerMode(enabled: on, child: child!),
            child: const ChatsScreen(),
          ),
        ),
      ),
    );
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    shown.value = false;
    await tester.pump(const Duration(seconds: 2));
    final before = adapter.to('GET', '/api/chats').length;

    shown.value = true;
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.to('GET', '/api/chats').length, greaterThan(before));
  });

  testWidgets('an empty chat invites her with the feminine form', (tester) async {
    final adapter = FakeAdapter()
      ..on(
        'GET',
        '/api/chats',
        FakeResponse(200, {
          'conversations': [chat()],
        }),
      );
    await openList(tester, adapter);
    expect(find.text('ابدئي المحادثة بالسلام'), findsOneWidget);
  });

  group('active and ended tabs', () {
    List<Map<String, dynamic>> mixed() => [
      chat(id: 'a', name: 'عمر'),
      chat(id: 'e', name: 'خالد', status: 'EXPIRED', last: 'إلى اللقاء'),
      chat(id: 'n', name: 'سامي', status: 'ENDED'),
      chat(id: 'b', name: 'ماهر', blocked: true, last: 'مرحبا'),
    ];

    testWidgets('opens on «النشطة» with only the chats she can still write in', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': mixed()}));
      await openList(tester, adapter);
      expect(find.text('النشطة'), findsOneWidget);
      expect(find.text('المنتهية'), findsOneWidget);
      expect(find.text('عمر'), findsOneWidget);
      expect(find.text('خالد'), findsNothing);
      expect(find.text('سامي'), findsNothing);
      expect(find.text('ماهر'), findsNothing);
    });

    testWidgets('«المنتهية» lists ended, expired and read-only chats', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': mixed()}));
      await openList(tester, adapter);
      await tester.tap(find.text('المنتهية'));
      await tester.pumpAndSettle();
      expect(find.text('خالد'), findsOneWidget);
      expect(find.text('سامي'), findsOneWidget);
      expect(find.text('ماهر'), findsOneWidget);
      expect(find.text('عمر'), findsNothing);
    });

    testWidgets('each tab has its own empty message', (tester) async {
      final adapter = FakeAdapter()
        ..on(
          'GET',
          '/api/chats',
          FakeResponse(200, {
            'conversations': [chat(id: 'e', name: 'خالد', status: 'EXPIRED')],
          }),
        );
      await openList(tester, adapter);
      expect(find.text('لا توجد محادثات نشطة'), findsOneWidget);
      await tester.tap(find.text('المنتهية'));
      await tester.pumpAndSettle();
      expect(find.text('خالد'), findsOneWidget);
    });

    testWidgets('an unread message shows on its tab', (tester) async {
      final adapter = FakeAdapter()
        ..on(
          'GET',
          '/api/chats',
          FakeResponse(200, {
            'conversations': [chat(id: 'a', name: 'عمر', last: 'السلام', unread: 2)],
          }),
        );
      await openList(tester, adapter);
      expect(find.descendant(of: find.byType(Tab), matching: find.text('2')), findsOneWidget);
    });

    testWidgets('coming back to Chats opens on «النشطة» again', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': mixed()}));
      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
      final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
      final container = ProviderContainer(overrides: overrides);
      addTearDown(container.dispose);
      container.read(authControllerProvider);
      await tester.pumpWidget(const SizedBox());
      for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      final shown = ValueNotifier(true);
      addTearDown(shown.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: rtlApp(
            ValueListenableBuilder<bool>(
              valueListenable: shown,
              builder: (_, on, child) => TickerMode(enabled: on, child: child!),
              child: const ChatsScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('المنتهية'));
      await tester.pumpAndSettle();
      expect(find.text('خالد'), findsOneWidget);

      shown.value = false;
      await tester.pump(const Duration(seconds: 1));
      shown.value = true;
      await tester.pumpAndSettle();
      expect(find.text('عمر'), findsOneWidget);
      expect(find.text('خالد'), findsNothing);
    });

    testWidgets('an ended chat with no messages shows its status label like the others', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats', FakeResponse(200, {
          'conversations': [chat(id: 'n', name: 'سامي', status: 'ENDED'), chat(id: 'e', name: 'خالد', status: 'ENDED', last: 'إلى اللقاء')],
        }));
      await openList(tester, adapter);
      await tester.tap(find.text('المنتهية'));
      await tester.pumpAndSettle();
      expect(find.text('منتهية'), findsNWidgets(2));
      expect(find.text('لا توجد رسائل'), findsOneWidget);
    });
  });
}

