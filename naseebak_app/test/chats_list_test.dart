import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chats_screen.dart';
import 'package:naseebak_app/shared/widgets/alpha_fade.dart';

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

  group('chips', () {
    List<Map<String, dynamic>> mixed() => [
      chat(id: 'a', name: 'عمر'),
      chat(id: 'e', name: 'خالد', status: 'EXPIRED', last: 'إلى اللقاء', unread: 3),
      chat(id: 'n', name: 'سامي', status: 'ENDED'),
      chat(id: 'b', name: 'ماهر', blocked: true, last: 'مرحبا'),
    ];

    test('chatsForChip and unreadChipLabel', () {
      final list = [
        for (final m in mixed()) ChatSummary.fromJson(m),
        ChatSummary.fromJson(chat(id: 'u', name: 'يوسف', last: 'هلا', unread: 2)),
      ];
      expect(chatsForChip(list, ChatsChip.all).map((c) => c.id), ['a', 'u']);
      expect(chatsForChip(list, ChatsChip.unread).map((c) => c.id), ['u']);
      expect(chatsForChip(list, ChatsChip.ended).map((c) => c.id), ['e', 'n', 'b']);
      expect(unreadChipLabel(0), 'غير مقروءة');
      expect(unreadChipLabel(2), 'غير مقروءة 2');
    });

    testWidgets('opens on «الكل» with only the chats she can still write in', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': mixed()}));
      await openList(tester, adapter);
      expect(find.byKey(const Key('chats-chip-all')), findsOneWidget);
      expect(find.byKey(const Key('chats-chip-unread')), findsOneWidget);
      expect(find.byKey(const Key('chats-chip-ended')), findsOneWidget);
      expect(tester.getSize(find.byKey(const Key('chats-chip-all'))).height, 44);
      expect(find.text('عمر'), findsOneWidget);
      expect(find.text('خالد'), findsNothing);
      expect(find.text('سامي'), findsNothing);
      expect(find.text('ماهر'), findsNothing);
    });

    testWidgets('«غير مقروءة 1» lists the active chat with unread only', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats', FakeResponse(200, {
          'conversations': [...mixed(), chat(id: 'u', name: 'يوسف', last: 'هلا', unread: 4)],
        }));
      await openList(tester, adapter);
      expect(find.text('غير مقروءة 1'), findsOneWidget);
      await tester.tap(find.byKey(const Key('chats-chip-unread')));
      await tester.pumpAndSettle();
      expect(find.text('يوسف'), findsOneWidget);
      expect(find.text('عمر'), findsNothing);
      expect(find.text('خالد'), findsNothing);
    });

    testWidgets('«المنتهية» lists ended, expired and read-only chats, dimmed, with no unread badge', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': mixed()}));
      await openList(tester, adapter);
      await tester.tap(find.byKey(const Key('chats-chip-ended')));
      await tester.pumpAndSettle();
      expect(find.text('خالد'), findsOneWidget);
      expect(find.text('سامي'), findsOneWidget);
      expect(find.text('ماهر'), findsOneWidget);
      expect(find.text('عمر'), findsNothing);
      expect(find.text('3'), findsNothing);
      expect(find.byType(AlphaFade), findsWidgets);
    });

    testWidgets('each chip has its own empty message', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats', FakeResponse(200, {'conversations': [chat(id: 'e', name: 'خالد', status: 'EXPIRED')]}));
      await openList(tester, adapter);
      expect(find.text('لا توجد محادثات نشطة'), findsOneWidget);
      await tester.tap(find.byKey(const Key('chats-chip-unread')));
      await tester.pumpAndSettle();
      expect(find.text('لا توجد رسائل غير مقروءة'), findsOneWidget);
      await tester.tap(find.byKey(const Key('chats-chip-ended')));
      await tester.pumpAndSettle();
      expect(find.text('خالد'), findsOneWidget);
    });

    testWidgets('coming back to Chats opens on «الكل» again', (tester) async {
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
      await tester.tap(find.byKey(const Key('chats-chip-ended')));
      await tester.pumpAndSettle();
      expect(find.text('خالد'), findsOneWidget);

      shown.value = false;
      await tester.pump(const Duration(seconds: 1));
      shown.value = true;
      await tester.pumpAndSettle();
      expect(find.text('عمر'), findsOneWidget);
      expect(find.text('خالد'), findsNothing);
    });

    testWidgets('the days-left line shows only in the last 3 days', (tester) async {
      final soon = DateTime.now().add(const Duration(days: 2, hours: 5)).toUtc().toIso8601String();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats', FakeResponse(200, {
          'conversations': [
            chat(id: 'a', name: 'عمر'),
            {...chat(id: 's', name: 'سعد'), 'expiresAt': soon},
          ],
        }));
      await openList(tester, adapter);
      expect(find.textContaining('تبقّى'), findsOneWidget);
    });

    testWidgets('an ended chat with no messages shows its status label like the others', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats', FakeResponse(200, {
          'conversations': [chat(id: 'n', name: 'سامي', status: 'ENDED'), chat(id: 'e', name: 'خالد', status: 'ENDED', last: 'إلى اللقاء')],
        }));
      await openList(tester, adapter);
      await tester.tap(find.byKey(const Key('chats-chip-ended')));
      await tester.pumpAndSettle();
      expect(find.text('منتهية'), findsNWidgets(2));
      expect(find.text('لا توجد رسائل'), findsOneWidget);
    });
  });
}

