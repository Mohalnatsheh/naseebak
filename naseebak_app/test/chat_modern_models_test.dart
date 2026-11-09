import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/reply_strip.dart';
import 'package:naseebak_app/features/chat/typing_signal.dart';

import 'helpers/fake_api.dart';

void main() {
  group('replyTo and reactions on a message', () {
    test('read from the API, kept through the cache shape', () {
      final m = ChatMessage.fromJson({
        'id': 'm2',
        'body': 'نعم',
        'createdAt': '2026-11-10T10:00:00.000Z',
        'mine': true,
        'replyTo': {'id': 'm1', 'mine': false, 'kind': 'TEXT', 'snippet': 'كيف حالك؟'},
        'reactions': [
          {'emoji': '❤️', 'mine': false},
          {'emoji': '👍', 'mine': true},
        ],
      });
      expect(m.replyTo!.id, 'm1');
      expect(m.replyTo!.mine, isFalse);
      expect(m.replyTo!.kind, MessageKind.text);
      expect(m.replyTo!.snippet, 'كيف حالك؟');
      expect(m.reactions.map((r) => r.emoji), ['❤️', '👍']);
      expect(m.myReaction, '👍');
      final back = ChatMessage.fromJson(m.toJson());
      expect(back.replyTo!.snippet, 'كيف حالك؟');
      expect(back.reactions.last.mine, isTrue);
      expect(back.sameAs(m), isTrue);
    });

    test('an old server (no fields) or a null quote: no quote, no reactions', () {
      final m = ChatMessage.fromJson({'id': 'm1', 'body': 'x', 'createdAt': '2026-11-10T10:00:00.000Z', 'mine': false});
      expect(m.replyTo, isNull);
      expect(m.reactions, isEmpty);
      expect(m.myReaction, isNull);
      final n = ChatMessage.fromJson({...m.toJson(), 'replyTo': null, 'reactions': null});
      expect(n.replyTo, isNull);
      expect(n.reactions, isEmpty);
    });

    test('a changed reaction makes the server copy differ (the poll replaces it)', () {
      final a = ChatMessage.fromJson({'id': 'm1', 'body': 'x', 'createdAt': '2026-11-10T10:00:00.000Z', 'mine': false});
      final b = ChatMessage.fromJson({
        ...a.toJson(),
        'reactions': [
          {'emoji': '❤️', 'mine': true},
        ],
      });
      expect(a.sameAs(b), isFalse);
      expect(a.withReactions(b.reactions).sameAs(b), isTrue);
    });

    test('copyWith keeps the quote and the reactions', () {
      const q = ReplyQuote(id: 'm1', mine: false, kind: MessageKind.text, snippet: 's');
      final m = ChatMessage(
        id: 'l1',
        body: 'x',
        createdAt: DateTime(2026),
        mine: true,
        replyTo: q,
        reactions: const [ChatReaction(emoji: '😊', mine: true)],
      );
      final f = m.copyWith(state: SendState.failed);
      expect(f.replyTo, same(q));
      expect(f.reactions.single.emoji, '😊');
    });

    test('toggling a reaction: a new one replaces mine, the same one again removes it', () {
      const theirs = ChatReaction(emoji: '❤️', mine: false);
      expect(toggledReactions(const [theirs], '👍').map((r) => (r.emoji, r.mine)), [('❤️', false), ('👍', true)]);
      expect(
        toggledReactions(const [theirs, ChatReaction(emoji: '👍', mine: true)], '😊').map((r) => r.emoji),
        ['❤️', '😊'],
      );
      expect(toggledReactions(const [theirs, ChatReaction(emoji: '👍', mine: true)], '👍'), [theirs]);
      expect(toggledReactions(const [theirs, ChatReaction(emoji: '👍', mine: true)], null), [theirs]);
    });

    test('only the four reactions', () {
      expect(chatReactionEmoji, ['❤️', '👍', '😊', '🤲']);
    });
  });

  group('the chat page', () {
    test('partnerTyping and starters, absent on an old server', () async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', const FakeResponse(200, {
          'conversation': {'id': 'c1', 'matchId': 'x1', 'partner': {'id': 'p1', 'firstName': 'عمر'}, 'status': 'ACTIVE'},
          'messages': [],
          'hasMore': false,
          'partnerTyping': true,
          'starters': ['ما خططك للسنوات القادمة؟', 'كيف تحب أن تقضي يوم الجمعة؟'],
        }))
        ..on('GET', '/api/chats/c2', const FakeResponse(200, {
          'conversation': {'id': 'c2', 'matchId': 'x2', 'partner': {'id': 'p1', 'firstName': 'عمر'}, 'status': 'ACTIVE'},
          'messages': [],
          'hasMore': false,
        }));
      final repo = ChatRepository(fakeClient(adapter));
      final a = await repo.load('c1');
      expect(a.partnerTyping, isTrue);
      expect(a.starters, hasLength(2));
      final b = await repo.load('c2');
      expect(b.partnerTyping, isFalse);
      expect(b.starters, isEmpty);
    });
  });

  group('the repository', () {
    late FakeAdapter adapter;
    late ChatRepository repo;
    setUp(() {
      adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse(201, {
          'message': {
            'id': 'm9',
            'body': 'نعم',
            'createdAt': '2026-11-10T10:00:00.000Z',
            'mine': true,
            'replyTo': {'id': 'm1', 'mine': false, 'kind': 'IMAGE', 'snippet': '📷 صورة'},
          },
        }))
        ..on('POST', '/api/chats/c1/messages/m1/reaction', const FakeResponse(200, {
          'reactions': [
            {'emoji': '🤲', 'mine': true},
          ],
        }))
        ..on('POST', '/api/chats/c1/typing', const FakeResponse(204))
        ..on('POST', '/api/chats/c1/media', const FakeResponse(200, {
          'message': {'id': 'm10', 'body': '📷 صورة', 'createdAt': '2026-11-10T10:00:00.000Z', 'mine': true, 'kind': 'IMAGE'},
        }));
      repo = ChatRepository(fakeClient(adapter, store: MemoryTokenStore('t')));
    });

    test('a reply sends replyToId; a plain message does not', () async {
      final sent = await repo.send('c1', 'نعم', nonce: 'n1', replyToId: 'm1');
      expect(sent.replyTo!.kind, MessageKind.image);
      await repo.send('c1', 'نعم', nonce: 'n2');
      final bodies = adapter.to('POST', '/api/chats/c1/messages').map((r) => r.data as Map).toList();
      expect(bodies[0]['replyToId'], 'm1');
      expect(bodies[1].containsKey('replyToId'), isFalse);
    });

    test('a photo reply carries replyToId in the form', () async {
      final dir = await Future.value(Directory.systemTemp.createTempSync('reply_media'));
      addTearDown(() => dir.deleteSync(recursive: true));
      final f = File('${dir.path}/p.jpg')..writeAsBytesSync([0xFF, 0xD8]);
      await repo.sendMedia('c1', kind: 'IMAGE', filePath: f.path, mime: 'image/jpeg', nonce: 'n', replyToId: 'm1');
      final form = adapter.to('POST', '/api/chats/c1/media').single.data as FormData;
      expect(Map.fromEntries(form.fields)['replyToId'], 'm1');
    });

    test('react posts the emoji (or null to remove) and returns the server reactions', () async {
      final r = await repo.react('c1', 'm1', '🤲');
      expect(r.single.mine, isTrue);
      await repo.react('c1', 'm1', null);
      final bodies = adapter.to('POST', '/api/chats/c1/messages/m1/reaction').map((r) => r.data as Map).toList();
      expect(bodies[0], {'emoji': '🤲'});
      expect(bodies[1], {'emoji': null});
    });

    test('typing posts to the typing route', () async {
      await repo.typing('c1');
      expect(adapter.to('POST', '/api/chats/c1/typing'), hasLength(1));
    });
  });

  group('typing throttle', () {
    test('at most one signal per 3 s', () {
      var now = DateTime(2026, 11, 10, 10);
      final t = TypingThrottle(clock: () => now);
      expect(t.tryNow(), isTrue);
      now = now.add(const Duration(seconds: 1));
      expect(t.tryNow(), isFalse);
      now = now.add(const Duration(milliseconds: 1999));
      expect(t.tryNow(), isFalse);
      now = now.add(const Duration(milliseconds: 1));
      expect(t.tryNow(), isTrue);
      t.reset();
      expect(t.tryNow(), isTrue);
    });
  });

  group('reply snippets (same rules as the server)', () {
    ChatMessage mk(String body, [MessageKind kind = MessageKind.text]) =>
        ChatMessage(id: 'a', body: body, createdAt: DateTime(2026), mine: true, kind: kind);

    test('one line, at most 80 characters, emoji never cut', () {
      expect(replySnippetOf(mk('  سطر\nثانٍ  ')), 'سطر ثانٍ');
      final long = List.filled(100, 'ب').join();
      final s = replySnippetOf(mk(long));
      expect(s.runes.length, 80);
      expect(s.endsWith('…'), isTrue);
      final emoji = '${List.filled(78, 'ا').join()}😊😊😊';
      expect(replySnippetOf(mk(emoji)).runes.length, 80);
    });

    test('a photo or a voice note by its label', () {
      expect(replySnippetOf(mk('📷 صورة', MessageKind.image)), '📷 صورة');
      expect(replySnippetOf(mk('', MessageKind.voice)), '🎤 رسالة صوتية');
    });
  });

  group('live events', () {
    test('an Ably message names the event and carries its data (string or object)', () {
      final a = ChatLiveEvent.fromSse('{"name":"typing","data":"{\\"userId\\":\\"p1\\"}","encoding":"json"}');
      expect(a.name, 'typing');
      expect(a.data!['userId'], 'p1');
      final b = ChatLiveEvent.fromSse(
          '{"name":"reaction","data":{"messageId":"m1","reactions":[{"emoji":"❤️","userId":"u1"}]}}');
      expect(b.name, 'reaction');
      expect(b.data!['messageId'], 'm1');
      final c = ChatLiveEvent.fromSse('not json');
      expect(c.name, isNull);
    });

    test('live reactions: mine from the user id', () {
      final r = reactionsFromLive([
        {'emoji': '❤️', 'userId': 'u1'},
        {'emoji': '👍', 'userId': 'p1'},
      ], 'u1');
      expect(r.map((x) => (x.emoji, x.mine)), [('❤️', true), ('👍', false)]);
    });
  });
}
