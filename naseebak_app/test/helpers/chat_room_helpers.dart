/// Shared by the chat room tests: a page of messages from the fake API, and a signed-in member with a room open.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';

import 'fake_api.dart';

/// The time of message 0
final chatT0 = DateTime.utc(2026, 10, 30, 10);

Map<String, dynamic> msg(int n, {bool mine = false, DateTime? readAt}) => {
      'id': 'm${n.toString().padLeft(3, '0')}',
      'body': 'رسالة $n',
      'createdAt': chatT0.add(Duration(minutes: n)).toIso8601String(),
      'mine': mine,
      'readAt': readAt?.toIso8601String(),
    };

const conv = {
  'id': 'c1',
  'matchId': 'x1',
  'partner': {'id': 'p1', 'firstName': 'عمر'},
  'status': 'ACTIVE',
  'expiresAt': '2099-01-01T00:00:00.000Z',
};

Map<String, dynamic> page(Iterable<int> ns, {bool hasMore = false}) =>
    {'conversation': conv, 'messages': [for (final n in ns) msg(n)], 'hasMore': hasMore, 'chatEnabled': true};

CachedChat cached(Iterable<int> ns, {bool hasMore = false}) => CachedChat(
      conversation: ChatSummary.fromJson(conv),
      messages: [for (final n in ns) ChatMessage.fromJson(msg(n))],
      hasMore: hasMore,
    );

/// A signed-in member (id u1) with the chat room open on c1
Future<ProviderContainer> openRoom(WidgetTester tester, FakeAdapter adapter, MemoryChatCache cache,
    {Duration pollInterval = const Duration(hours: 1), List<Override> extra = const []}) async {
  adapter
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
    ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
    ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
  final container = ProviderContainer(overrides: [...overrides, chatCacheProvider.overrideWithValue(cache), ...extra]);
  addTearDown(container.dispose);
  container.read(authControllerProvider);
  // The fake API answers inside the test's fake clock: pump until the session is restored
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  expect(container.read(authControllerProvider).me?.id, 'u1');
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: rtlApp(ChatRoomScreen(chatId: 'c1', pollInterval: pollInterval)),
  ));
  return container;
}

/// Opens the sheet of the failed message's red ⓘ («إعادة المحاولة» / «تعديل الرسالة» / «حذف»)
Future<void> openFailed(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('chat-failed-info')));
  await tester.pumpAndSettle();
}
