import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart' show olderCursorOf;

final _t0 = DateTime.utc(2026, 10, 30, 10);

CachedChat chat(Iterable<int> ns) => CachedChat(
      conversation: ChatSummary.fromJson(const {
        'id': 'c1',
        'matchId': 'x1',
        'partner': {'id': 'p1', 'firstName': 'عمر'},
        'status': 'ACTIVE',
      }),
      messages: [
        for (final n in ns)
          ChatMessage(id: 'm$n', body: 'رسالة $n', createdAt: _t0.add(Duration(minutes: n)), mine: false),
      ],
      hasMore: false,
    );

void main() {
  test('a v1 payload is ignored, a v2 media message survives with its media', () {
    final c = CachedChat(
      conversation: chat([]).conversation,
      messages: [
        ChatMessage(
          id: 'm9',
          body: '📷 صورة',
          createdAt: _t0,
          mine: true,
          kind: MessageKind.image,
          media: const ChatMedia(url: '/api/chats/c1/media/m9', type: 'image/webp', width: 800, height: 600),
        ),
      ],
      hasMore: false,
    );
    final j = ChatCache.encode(c);
    expect(j['v'], 2);
    final back = ChatCache.decode(j)!;
    expect(back.messages.single.kind, MessageKind.image);
    expect(back.messages.single.media?.url, '/api/chats/c1/media/m9');
    expect(back.messages.single.media?.width, 800);
    expect(ChatCache.decode({...j, 'v': 1}), isNull);
  });

  late Directory root;
  late FileChatCache cache;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('chat_cache_test');
    cache = FileChatCache(root: () async => root);
  });

  tearDown(() async {
    if (await root.exists()) await root.delete(recursive: true);
  });

  List<String> leftovers() =>
      root.listSync(recursive: true).map((e) => e.path).where((p) => p.endsWith('.tmp')).toList();

  test('a file from an older app version is deleted when read', () async {
    final f = File('${root.path}/chat_cache/u1/c1.json');
    await f.parent.create(recursive: true);
    await f.writeAsString('{"v":1,"messages":[]}');
    expect(await cache.read('u1', 'c1'), isNull);
    expect(f.existsSync(), isFalse);
  });

  test('writes to one chat at the same time land in order, with no temp file left', () async {
    await Future.wait([for (var i = 1; i <= 20; i++) cache.write('u1', 'c1', chat(List.generate(i, (j) => j + 1)))]);
    final back = (await cache.read('u1', 'c1'))!;
    expect(back.messages, hasLength(20));
    expect(back.messages.last.id, 'm20');
    expect(leftovers(), isEmpty);
  });

  test('a write is encoded when asked, not when its turn comes', () async {
    final messages = chat([1]).messages.toList();
    final c = CachedChat(conversation: chat([]).conversation, messages: messages, hasMore: false);
    final pending = cache.write('u1', 'c1', c);
    messages.add(ChatMessage(id: 'm2', body: 'رسالة 2', createdAt: _t0, mine: false));
    await pending;
    expect((await cache.read('u1', 'c1'))!.messages.map((m) => m.id), ['m1']);
  });

  test('sign-out while writes are queued: nothing comes back after it', () async {
    final writes = [for (var i = 1; i <= 10; i++) cache.write('u1', 'c$i', chat([i]))];
    final more = [for (var i = 1; i <= 10; i++) cache.write('u1', 'c1', chat(List.generate(i, (j) => j + 1)))];
    await cache.clearAll();
    await Future.wait([...writes, ...more]);
    for (var i = 1; i <= 10; i++) {
      expect(await cache.read('u1', 'c$i'), isNull);
    }
    expect(Directory('${root.path}/chat_cache').existsSync(), isFalse);
  });

  test('a write after sign-out is kept (the next member)', () async {
    await cache.write('u1', 'c1', chat([1]));
    await cache.clearAll();
    await cache.write('u2', 'c1', chat([2]));
    expect(await cache.read('u1', 'c1'), isNull);
    expect((await cache.read('u2', 'c1'))!.messages.single.id, 'm2');
  });

  test('remove waits for the write before it', () async {
    final w = cache.write('u1', 'c1', chat([1]));
    final r = cache.remove('u1', 'c1');
    await Future.wait([w, r]);
    expect(await cache.read('u1', 'c1'), isNull);
  });

  test('a failed reply keeps its quote through the cache (a retry still sends replyToId)', () {
    const quote = ReplyQuote(id: 'm1', mine: false, kind: MessageKind.text, snippet: 'رسالة 1');
    final c = CachedChat(
      conversation: chat([]).conversation,
      messages: [
        ...chat([1]).messages,
        ChatMessage(
          id: 'local-n1',
          body: 'نعم',
          createdAt: _t0.add(const Duration(minutes: 2)),
          mine: true,
          state: SendState.failed,
          nonce: 'n1',
          maybeSent: true,
          replyTo: quote,
        ),
      ],
      hasMore: false,
    );
    final back = ChatCache.decode(ChatCache.encode(c))!;
    final failed = back.messages.singleWhere((m) => m.state == SendState.failed);
    expect(failed.replyTo!.id, 'm1');
    expect(failed.replyTo!.snippet, 'رسالة 1');
    expect(failed.maybeSent, isTrue);
  });

  test('older messages page from the oldest saved message, never from a failed bubble above it', () {
    final failed = ChatMessage(
      id: 'local-n1',
      body: 'x',
      createdAt: _t0.subtract(const Duration(days: 1)),
      mine: true,
      state: SendState.failed,
      nonce: 'n1',
    );
    final sorted = sortedForChat([...chat([5, 6]).messages, failed]);
    expect(sorted.first.id, 'local-n1');
    expect(olderCursorOf(sorted)!.id, 'm5');
    expect(olderCursorOf([failed]), isNull);
    expect(olderCursorOf(const []), isNull);
  });

  ChatMessage failedText(String nonce, String body) => ChatMessage(
        id: 'local-$nonce',
        body: body,
        createdAt: _t0.add(const Duration(minutes: 5)),
        mine: true,
        state: SendState.failed,
        nonce: nonce,
        error: 'تعذّر الإرسال',
        maybeSent: true,
      );

  test('addFailed adds a failed text to the copy, once per nonce', () async {
    final mem = MemoryChatCache();
    await mem.write('u1', 'c1', chat([1]));
    await mem.addFailed('u1', 'c1', failedText('n1', 'نص'));
    await mem.addFailed('u1', 'c1', failedText('n1', 'نص'));
    final back = (await mem.read('u1', 'c1'))!;
    expect(back.messages.length, 2);
    expect(back.messages.last.state, SendState.failed);
    expect(back.messages.last.body, 'نص');
    expect(back.messages.last.maybeSent, isTrue);
    expect(back.messages.first.id, 'm1');
  });

  test('addFailed with no copy writes one from the conversation, or nothing without it', () async {
    final mem = MemoryChatCache();
    await mem.addFailed('u1', 'c1', failedText('n1', 'نص'));
    expect(await mem.read('u1', 'c1'), isNull);
    await mem.addFailed('u1', 'c1', failedText('n1', 'نص'), conversation: chat([]).conversation);
    final back = (await mem.read('u1', 'c1'))!;
    expect(back.messages.single.body, 'نص');
    expect(back.messages.single.state, SendState.failed);
    expect(back.hasMore, isTrue);
    expect(back.conversation.partnerName, 'عمر');
  });

  test('on the device, addFailed lands after the writes queued before it, and never across a sign-out', () async {
    final pending = cache.write('u1', 'c1', chat([1, 2]));
    await cache.addFailed('u1', 'c1', failedText('n1', 'نص'));
    await pending;
    final back = (await cache.read('u1', 'c1'))!;
    expect(back.messages.map((m) => m.id), ['m1', 'm2', 'local-n1']);

    final late = cache.addFailed('u1', 'c2', failedText('n2', 'نص'), conversation: chat([]).conversation);
    await cache.clearAll();
    await late;
    expect(await cache.read('u1', 'c2'), isNull);
  });
}
