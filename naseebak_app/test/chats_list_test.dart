import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chats_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> chat({String? last, int unread = 0}) => {
      'id': 'c1',
      'matchId': 'x1',
      'partner': {'id': 'p1', 'firstName': 'عمر'},
      'status': 'ACTIVE',
      'expiresAt': '2099-01-01T00:00:00.000Z',
      'lastMessage': last == null ? null : {'body': last, 'createdAt': '2026-11-09T10:00:00.000Z', 'mine': false, 'readAt': null},
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
    final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': [chat()]}));
    await openList(tester, adapter);
    final before = adapter.to('GET', '/api/chats').length;
    expect(before, 1);

    adapter.on('GET', '/api/chats', FakeResponse(200, {'conversations': [chat(last: 'السلام عليكم', unread: 1)]}));
    await tester.pump(ChatsScreen.refreshEvery + const Duration(seconds: 1));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.to('GET', '/api/chats').length, greaterThan(before));
    expect(find.text('السلام عليكم'), findsOneWidget);
  });

  testWidgets('coming back to the Chats tab reloads the list at once', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': [chat()]}));
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
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(ValueListenableBuilder<bool>(
        valueListenable: shown,
        builder: (_, on, child) => TickerMode(enabled: on, child: child!),
        child: const ChatsScreen(),
      )),
    ));
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
    final adapter = FakeAdapter()..on('GET', '/api/chats', FakeResponse(200, {'conversations': [chat()]}));
    await openList(tester, adapter);
    expect(find.text('ابدئي المحادثة بالسلام'), findsOneWidget);
  });
}
