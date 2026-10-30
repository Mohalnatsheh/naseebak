import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';

import 'helpers/fake_api.dart';

final _t0 = DateTime.utc(2026, 10, 30, 10);

Map<String, dynamic> msg(int n, {bool mine = false}) => {
      'id': 'm${n.toString().padLeft(3, '0')}',
      'body': 'رسالة $n',
      'createdAt': _t0.add(Duration(minutes: n)).toIso8601String(),
      'mine': mine,
      'readAt': null,
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
Future<ProviderContainer> openRoom(WidgetTester tester, FakeAdapter adapter, MemoryChatCache cache) async {
  adapter
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
    ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
    ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
  final container = ProviderContainer(overrides: [...overrides, chatCacheProvider.overrideWithValue(cache)]);
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
    child: rtlApp(const ChatRoomScreen(chatId: 'c1', pollInterval: Duration(hours: 1))),
  ));
  return container;
}

void main() {
  group('chat cache', () {
    test('keeps only the newest confirmed messages and says older ones exist', () {
      final many = cached(List.generate(130, (i) => i + 1));
      final encoded = ChatCache.encode(many);
      final back = ChatCache.decode(encoded)!;
      expect(back.messages.length, ChatCache.keep);
      expect(back.messages.first.id, 'm031');
      expect(back.messages.last.id, 'm130');
      expect(back.hasMore, isTrue);
      expect(back.conversation.partnerName, 'عمر');
    });

    test('an unknown or broken file is ignored', () {
      expect(ChatCache.decode({'v': 2}), isNull);
      expect(ChatCache.decode('x'), isNull);
    });
  });

  group('chat room', () {
    testWidgets('opens from the device copy, then merges the newest page', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached(List.generate(40, (i) => i + 1), hasMore: true));
      // The server's newest 30 overlap the copy (11..40) and add 41, 42
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 13), hasMore: true)));
      await openRoom(tester, adapter, cache);
      await tester.pump();
      expect(find.text('رسالة 40'), findsOneWidget); // from the cache, before the network
      await tester.pumpAndSettle();
      expect(find.text('رسالة 42'), findsOneWidget);
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id).take(2), ['m001', 'm002']); // older cached messages kept
      expect(saved.messages.last.id, 'm042');
      expect(saved.messages.length, 42);
    });

    testWidgets('more than a page arrived meanwhile: starts again from the newest page', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached(List.generate(10, (i) => i + 1)));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 51), hasMore: true)));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.first.id, 'm051'); // no hole between 10 and 51
      expect(saved.hasMore, isTrue);
    });

    testWidgets('a chat that is no longer mine is removed from the device', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([1, 2, 3]));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', const FakeResponse(404, {'error': 'غير موجود'}));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      expect(await cache.read('u1', 'c1'), isNull);
      expect(find.text('رسالة 1'), findsNothing);
    });

    testWidgets('offline with a device copy: the copy stays on screen', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([1, 2, 3]));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', const FakeResponse.network());
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 3'), findsOneWidget);
    });

    testWidgets('older messages load with the exact cursor (time + id)', (tester) async {
      final cache = MemoryChatCache();
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (r) => r.queryParameters.containsKey('before')
            ? FakeResponse(200, page(List.generate(30, (i) => i + 1)))
            : FakeResponse(200, page(List.generate(30, (i) => i + 31), hasMore: true));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 4000));
      await tester.pumpAndSettle();
      final older = adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('before')).first;
      expect(older.queryParameters['beforeId'], 'm031');
      // The older page is above what's on screen: scroll up to its first message
      await tester.drag(find.byType(ListView), const Offset(0, 4000));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsOneWidget);
      expect(adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('before')), hasLength(1));
    });

    test('sign-out wipes every chat kept on the device', () async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([1]));
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}));
      final c = ProviderContainer(
        overrides: [...await testOverrides(adapter, store: MemoryTokenStore('t1')), chatCacheProvider.overrideWithValue(cache)],
      );
      addTearDown(c.dispose);
      c.read(authControllerProvider);
      for (var i = 0; i < 50 && !c.read(authControllerProvider).isSignedIn; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      await c.read(authControllerProvider.notifier).logout();
      expect(cache.data, isEmpty);
    });
  });
}
