import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';

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
  cacheVersionTests();
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
}

void cacheVersionTests() {
  test('a v1 payload is ignored, a v2 media message survives', () {
    final j = ChatCache.encode(chat([1]));
    expect(j['v'], 2);
    expect(ChatCache.decode(j), isNotNull);
    expect(ChatCache.decode({...j, 'v': 1}), isNull);
  });
}
