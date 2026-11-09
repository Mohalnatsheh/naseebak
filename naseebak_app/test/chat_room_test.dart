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

Map<String, dynamic> msg(int n, {bool mine = false, DateTime? readAt}) => {
      'id': 'm${n.toString().padLeft(3, '0')}',
      'body': 'رسالة $n',
      'createdAt': _t0.add(Duration(minutes: n)).toIso8601String(),
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
    {Duration pollInterval = const Duration(hours: 1)}) async {
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
    child: rtlApp(ChatRoomScreen(chatId: 'c1', pollInterval: pollInterval)),
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

    testWidgets('a read tick on a message already on screen updates and is kept', (tester) async {
      final cache = MemoryChatCache();
      DateTime? readAt;
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (_) => FakeResponse(200, {
              ...page([]),
              'messages': [msg(1), msg(2, mine: true, readAt: readAt)],
            });
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.done_rounded), findsOneWidget);
      // The partner reads it: the next poll brings the same message with its read time
      readAt = _t0.add(const Duration(minutes: 5));
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.done_all_rounded), findsOneWidget);
      expect(find.byIcon(Icons.done_rounded), findsNothing);
      expect(find.text('رسالة 2'), findsOneWidget);
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id), ['m001', 'm002']);
      expect(saved.messages.last.readAt, isNotNull);
      // While it was unread the poll asked from my unread message, so its tick could come back
      final polls = adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('after'));
      expect(polls.first.queryParameters['after'], _t0.add(const Duration(minutes: 2)).toIso8601String());
    });

    testWidgets('first load offline, a later poll recovers: older messages can still load', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([]));
      var online = false;
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (r) => !online
            ? const FakeResponse.network()
            : r.queryParameters.containsKey('before')
                ? FakeResponse(200, page(List.generate(30, (i) => i + 1)))
                : FakeResponse(200, page(List.generate(30, (i) => i + 31), hasMore: true));
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      online = true;
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 60'), findsOneWidget);
      expect((await cache.read('u1', 'c1'))!.hasMore, isTrue);
      await tester.drag(find.byType(ListView), const Offset(0, 4000));
      await tester.pumpAndSettle();
      expect(adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('before')), isNotEmpty);
    });

    testWidgets('a send with no answer that the server saved: the failed bubble goes on the next poll', (tester) async {
      final cache = MemoryChatCache();
      Map<String, dynamic>? saved;
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse.network())
        ..handlers['GET /api/chats/c1'] = (_) => FakeResponse(200, {
              ...page([1, 2]),
              'messages': [msg(1), msg(2), ?saved],
            });
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'السلام عليكم');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);
      // The request did reach the server: its copy comes with the next poll
      saved = {
        'id': 'm900',
        'body': 'السلام عليكم',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'mine': true,
        'readAt': null,
      };
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('السلام عليكم'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
      final retried = adapter.to('POST', '/api/chats/c1/messages');
      expect(retried, hasLength(1));
      expect((retried.single.data as Map)['clientNonce'], isNotNull);
    });

    testWidgets('a chat that can no longer change has no live link', (tester) async {
      final cache = MemoryChatCache();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'conversation': {...conv, 'status': 'ENDED'}}));
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('انتهت هذه المحادثة.'), findsOneWidget);
      await tester.pump(const Duration(seconds: 30));
      expect(adapter.to('GET', '/api/chats/ably-token'), isEmpty);
      // Not every 4 s: only the first load in 30 s
      expect(adapter.to('GET', '/api/chats/c1'), hasLength(1));
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

  group('keyboard and the chats list', () {
    testWidgets('a tap outside the input closes the keyboard', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-input')));
      await tester.pump();
      expect(tester.testTextInput.isVisible, isTrue);
      await tester.tapAt(const Offset(200, 200));
      await tester.pump();
      expect(tester.testTextInput.isVisible, isFalse);
    });

    testWidgets('tapping send keeps the keyboard open for the next message', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])))
        ..on('POST', '/api/chats/c1/messages', FakeResponse(201, {
          'message': {'id': 'm901', 'body': 'السلام عليكم', 'createdAt': DateTime.utc(2026, 10, 30, 12).toIso8601String(), 'mine': true, 'readAt': null},
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-input')));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('chat-input')), 'السلام عليكم');
      await tester.tap(find.byKey(const Key('chat-send')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(tester.testTextInput.isVisible, isTrue);
    });

    testWidgets('a sent message reloads the chats list (its last message and order)', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])))
        ..on('GET', '/api/chats', const FakeResponse(200, {'conversations': []}))
        ..on('POST', '/api/chats/c1/messages', FakeResponse(201, {
          'message': {'id': 'm900', 'body': 'السلام عليكم', 'createdAt': DateTime.utc(2026, 10, 30, 12).toIso8601String(), 'mine': true, 'readAt': null},
        }));
      final c = await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      // The Chats tab has its list loaded and kept alive
      final sub = c.listen(chatListProvider, (_, _) {});
      addTearDown(sub.close);
      await tester.pump(const Duration(milliseconds: 50));
      final before = adapter.to('GET', '/api/chats').length;
      expect(before, 1);
      await tester.enterText(find.byKey(const Key('chat-input')), 'السلام عليكم');
      await tester.tap(find.byKey(const Key('chat-send')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(adapter.to('GET', '/api/chats').length, greaterThan(before));
    });
  });
}
