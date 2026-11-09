import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/chat/chat_media_picker.dart';
import 'package:naseebak_app/features/chat/hold_to_record.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/voice_recorder.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/fake_api.dart';
import 'helpers/fake_recorder.dart';
import 'helpers/fake_voice_player.dart';

/// Live events the test pushes (Ably's SSE in the app)
class FakeLive extends ChatLive {
  FakeLive(super.api);
  final controller = StreamController<ChatLiveEvent>.broadcast();

  @override
  Stream<ChatLiveEvent> events(String chatId, {void Function(bool connected)? connected}) {
    scheduleMicrotask(() => connected?.call(true));
    return controller.stream;
  }
}

class _Room {
  _Room({
    this.status = 'ACTIVE',
    List<Map<String, dynamic>>? messages,
    this.starters = const [],
    this.partnerTyping = false,
    this.pollInterval = const Duration(hours: 1),
  }) : messages = messages ?? [msg(1)];

  String status;
  List<Map<String, dynamic>> messages;
  List<String> starters;
  bool partnerTyping;
  final Duration pollInterval;

  /// `polledAt` on every answer (null = a server before the field)
  String? polledAt;

  /// `reactionUpdates` on a poll that sends `reactionsSince`
  List<Map<String, dynamic>> reactionUpdates = const [];

  /// While set, a recorder's start waits for it (a slow microphone)
  Completer<void>? startGate;
  final recorders = <FakeRecorder>[];
  FakeRecorder get rec => recorders.single;
  Future<bool> Function() permission = () async => true;
  FakeLive? live;
  late ProviderContainer container;
  int picks = 0;

  late final Directory dir = () {
    final d = Directory.systemTemp.createTempSync('chat_composer_test');
    addTearDown(() {
      if (d.existsSync()) d.deleteSync(recursive: true);
    });
    return d;
  }();
  File? picked;

  late final FakeAdapter adapter = FakeAdapter()
    ..handlers['GET /api/chats/c1'] = ((req) {
      // Like the server: `?after=` returns the messages from that time on
      final after = req.queryParameters['after'] as String?;
      final from = after == null ? null : DateTime.parse(after);
      return FakeResponse(200, {
          'conversation': {...conv, 'status': status},
          'messages': [
            for (final m in messages)
              if (from == null || !DateTime.parse(m['createdAt'] as String).isBefore(from)) m,
          ],
          'hasMore': false,
          'chatEnabled': true,
          'partnerTyping': partnerTyping,
          'starters': starters,
          'polledAt': ?polledAt,
          if (req.queryParameters['reactionsSince'] != null) 'reactionUpdates': reactionUpdates,
        });
    })
    ..on('POST', '/api/chats/c1/end', const FakeResponse(200, {'message': 'تم'}))
    ..handlers['GET /api/pro'] = ((_) => const FakeResponse(200, {
          'enabled': true,
          'isPro': true,
          'cancelAtPeriodEnd': false,
          'pastDue': false,
          'canBuy': true,
          'offers': [],
        }))
    ..handlers['GET /api/me/counts'] = ((_) => const FakeResponse(200, {
          'flags': {},
          'pro': {'isPro': true},
        }))
    ..handlers['POST /api/chats/c1/messages'] = ((r) {
      final body = r.data as Map;
      return FakeResponse(201, {
        'message': {
          'id': 'srv-${body['clientNonce']}',
          'body': body['body'],
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'mine': true,
          if (body['replyToId'] != null)
            'replyTo': {'id': body['replyToId'], 'mine': false, 'kind': 'TEXT', 'snippet': 'رسالة 1'},
        },
      });
    })
    ..on('POST', '/api/chats/c1/typing', const FakeResponse(204))
    ..handlers['POST /api/chats/c1/messages/m001/reaction'] = ((r) {
      final emoji = (r.data as Map)['emoji'];
      return FakeResponse(200, {
        'reactions': [
          if (emoji != null) {'emoji': emoji, 'mine': true},
        ],
      });
    })
    ..handlers['POST /api/chats/c1/media'] = ((r) {
      final fields = Map.fromEntries((r.data as FormData).fields);
      return FakeResponse(200, {
        'message': {
          'id': 'srv-${fields['clientNonce']}',
          'body': '🎤 رسالة صوتية',
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'mine': true,
          'kind': fields['kind'],
          'media': {'url': '/api/chats/c1/media/srv', 'type': 'audio/mp4', 'durationSec': 2},
        },
      });
    });

  Future<void> open(WidgetTester tester) async {
    container = await openRoom(tester, adapter, MemoryChatCache(), pollInterval: pollInterval, extra: [
      voiceRecorderProvider.overrideWithValue(() {
        final r = FakeRecorder(dir, permission)..startGate = startGate;
        recorders.add(r);
        return r;
      }),
      voicePlayerFactoryProvider.overrideWithValue(FakeVoicePlayer.new),
      voiceAudioSessionProvider.overrideWithValue(() async {}),
      chatPhotoPickerProvider.overrideWithValue(() async {
        picks++;
        final f = picked = File('${dir.path}/picked-$picks.jpg')..writeAsBytesSync([0xFF, 0xD8, 0xFF]);
        return PickedPhoto(path: f.path, bytes: 3);
      }),
      if (live != null) chatLiveProvider.overrideWith((ref) => live!),
    ]);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
    await tester.pump(const Duration(seconds: 1));
  }

  List<RequestOptions> get uploads => adapter.to('POST', '/api/chats/c1/media');
  List<Map> get sends => adapter.to('POST', '/api/chats/c1/messages').map((r) => r.data as Map).toList();
}

final _mic = find.byKey(const Key('chat-mic'));
final _input = find.byKey(const Key('chat-input'));

/// Presses the mic and holds past the hold delay (the recorder starts)
Future<TestGesture> _hold(WidgetTester tester) async {
  final g = await tester.startGesture(tester.getCenter(_mic));
  await tester.pump(holdDelay + const Duration(milliseconds: 20));
  await tester.pump();
  await tester.pump();
  return g;
}

Future<void> _frames(WidgetTester tester, [int n = 8]) async {
  for (var i = 0; i < n; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

void main() {
  group('composer', () {
    testWidgets('one round button: mic while empty, send with text; the photo button sits inside the field',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      expect(_mic, findsOneWidget);
      expect(find.byKey(const Key('chat-send')), findsNothing);
      final field = tester.getRect(find.ancestor(of: _input, matching: find.byType(Container)).first);
      final photo = tester.getRect(find.byKey(const Key('chat-photo')));
      expect(field.contains(photo.center), isTrue);
      await tester.enterText(_input, 'السلام عليكم');
      await tester.pump();
      expect(_mic, findsNothing);
      expect(find.byKey(const Key('chat-send')), findsOneWidget);
      expect(tester.getSize(find.byKey(const Key('chat-send'))).width, greaterThanOrEqualTo(44));
      await tester.enterText(_input, '  ');
      await tester.pump();
      expect(_mic, findsOneWidget);
    });
  });

  group('hold to record', () {
    testWidgets('hold, then release after 1.5 s: one voice note goes up', (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      expect(r.rec.started, isTrue);
      expect(find.byKey(const Key('voice-hold-bar')), findsOneWidget);
      expect(find.text('اسحب للإلغاء'), findsOneWidget);
      expect(find.byKey(const Key('voice-lock-hint')), findsOneWidget);
      r.rec.now = const Duration(milliseconds: 1500);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump();
      // The live level bars follow the microphone
      expect(find.byKey(const Key('voice-level')), findsOneWidget);
      await g.up();
      await _frames(tester);
      expect(r.uploads, hasLength(1));
      expect(Map.fromEntries((r.uploads.single.data as FormData).fields)['durationSec'], '2');
      expect(find.byKey(const Key('voice-hold-bar')), findsNothing);
      await r.leave(tester);
    });

    testWidgets('released under 1 s: dropped with «الرسالة قصيرة جداً», the file deleted, nothing sent',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(milliseconds: 600);
      final file = r.rec.file!;
      await g.up();
      await _frames(tester);
      expect(find.text(holdTooShortText), findsOneWidget);
      expect(r.uploads, isEmpty);
      expect(r.rec.cancelled, isTrue);
      expect(file.existsSync(), isFalse);
      expect(_input, findsOneWidget);
      await r.leave(tester);
    });

    testWidgets('slide towards the start edge (right in Arabic) cancels: nothing sent, even on release',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 4);
      await g.moveBy(const Offset(60, 0));
      await tester.pump();
      await g.moveBy(const Offset(60, 0));
      await tester.pump();
      expect(r.rec.cancelled, isTrue);
      expect(find.byKey(const Key('voice-hold-bar')), findsNothing);
      await g.up();
      await _frames(tester);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the slide direction follows the language: towards the end edge never cancels', (tester) async {
      expect(holdSlideFor(const Offset(120, 0), TextDirection.rtl), HoldSlide.cancel);
      expect(holdSlideFor(const Offset(-120, 0), TextDirection.rtl), HoldSlide.none);
      expect(holdSlideFor(const Offset(-120, 0), TextDirection.ltr), HoldSlide.cancel);
      expect(holdSlideFor(const Offset(0, -90), TextDirection.rtl), HoldSlide.lock);
      expect(holdReleaseSends(const Offset(20, -30)), isTrue);
      expect(holdReleaseSends(const Offset(-90, 0)), isFalse);
    });

    testWidgets('slide up locks: release sends nothing; the bar has stop, cancel and send', (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 3);
      await g.moveBy(const Offset(0, -50));
      await tester.pump();
      await g.moveBy(const Offset(0, -50));
      await tester.pump();
      expect(find.byKey(const Key('voice-stop')), findsOneWidget);
      expect(find.byKey(const Key('voice-cancel')), findsOneWidget);
      expect(find.byKey(const Key('voice-send')), findsOneWidget);
      await g.up();
      await _frames(tester);
      expect(r.uploads, isEmpty);
      expect(r.rec.stopped, isFalse, reason: 'still recording hands-free');
      // Stop: waits for «إرسال»
      await tester.tap(find.byKey(const Key('voice-stop')));
      await _frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await tester.tap(find.byKey(const Key('voice-send')));
      await _frames(tester);
      expect(r.uploads, hasLength(1));
      await r.leave(tester);
    });

    testWidgets('the pointer is cancelled mid-hold (a call, a system gesture): it stops and waits, never sends',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 5);
      await g.cancel();
      await _frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(r.rec.cancelled, isFalse);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      await tester.pump(const Duration(seconds: 10));
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('a second finger on the mic mid-hold: it stops and waits; lifting both sends nothing',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 5);
      final second = await tester.startGesture(tester.getCenter(_mic) + const Offset(4, 4), pointer: 7);
      await _frames(tester);
      expect(r.rec.stopped, isTrue);
      await second.up();
      await g.up();
      await _frames(tester);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the finger wanders off the button (no cancel, no lock) and lets go: it stops and waits',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 5);
      // Towards the end edge and down: neither cancel nor lock
      await g.moveBy(const Offset(-70, 40));
      await tester.pump();
      await g.up();
      await _frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the app goes to the background mid-hold: it stops and waits; the later release sends nothing',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 6);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await g.up();
      await _frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('held to the 3-minute limit: it stops and waits; the release sends nothing', (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = maxVoiceDuration;
      await tester.pump(const Duration(milliseconds: 300));
      await _frames(tester);
      expect(find.text('بلغ التسجيل الحد الأقصى'), findsOneWidget);
      await g.up();
      await _frames(tester);
      expect(r.uploads, isEmpty);
      await tester.tap(find.byKey(const Key('voice-send')));
      await _frames(tester);
      expect(r.uploads, hasLength(1));
      await r.leave(tester);
    });

    testWidgets('let go during the microphone prompt: nothing records and nothing is sent', (tester) async {
      final r = _Room();
      final answer = Completer<bool>();
      r.permission = () => answer.future;
      await r.open(tester);
      final g = await _hold(tester);
      await g.up();
      await tester.pump();
      answer.complete(true);
      await _frames(tester);
      expect(r.rec.started, isFalse);
      expect(r.rec.disposed, isTrue);
      expect(r.uploads, isEmpty);
      expect(_input, findsOneWidget);
      await r.leave(tester);
    });

    testWidgets('leaving the chat mid-hold: the microphone is released, nothing sent', (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(seconds: 3);
      final file = r.rec.file!;
      await r.leave(tester);
      await g.up();
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(r.rec.cancelled, isTrue);
      expect(file.existsSync(), isFalse);
      expect(r.uploads, isEmpty);
    });
  });

  group('reply', () {
    testWidgets('long-press → «رد»: the strip shows the quote; the send carries replyToId and the bubble the quote',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-reply')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('chat-reply-strip')), matching: find.text('عمر')), findsOneWidget);
      await tester.enterText(_input, 'نعم');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(r.sends.single['replyToId'], 'm001');
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
      expect(find.byKey(const Key('chat-quote-m001')), findsOneWidget);
    });

    testWidgets('✕ drops the reply: the message goes without replyToId', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-reply')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-reply-close')));
      await tester.pump();
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
      await tester.enterText(_input, 'نعم');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(r.sends.single.containsKey('replyToId'), isFalse);
    });

    testWidgets('swipe a bubble towards the end side (left in Arabic) to reply; the other way does nothing',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.drag(find.text('رسالة 1'), const Offset(90, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
      await tester.drag(find.text('رسالة 1'), const Offset(-90, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsOneWidget);
    });

    testWidgets('a photo reply carries replyToId too', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.drag(find.text('رسالة 1'), const Offset(-90, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-photo')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('photo-preview-send')));
      await tester.pumpAndSettle();
      expect(Map.fromEntries((r.uploads.single.data as FormData).fields)['replyToId'], 'm001');
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    });

    testWidgets('tapping a quote scrolls to the original and tints it for a moment', (tester) async {
      final r = _Room(messages: [
        for (var n = 1; n <= 60; n++) {...msg(n), 'readAt': '2026-10-30T12:00:00.000Z'},
        {
          ...msg(61, mine: true),
          'body': 'جوابي',
          'replyTo': {'id': 'm001', 'mine': false, 'kind': 'TEXT', 'snippet': 'نص الاقتباس'},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsNothing);
      await tester.tap(find.byKey(const Key('chat-quote-m001')));
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 30));
      }
      expect(find.text('رسالة 1'), findsOneWidget);
      final tint = tester.widget<AnimatedContainer>(
        find.ancestor(of: find.text('رسالة 1'), matching: find.byType(AnimatedContainer)).first,
      );
      expect((tint.decoration as BoxDecoration?)?.color, isNot(Colors.transparent));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
    });

    testWidgets('a reply from the server shows its quote (the old field body stays the text)', (tester) async {
      final r = _Room(messages: [
        msg(1),
        {
          ...msg(2),
          'replyTo': {'id': 'm001', 'mine': true, 'kind': 'IMAGE', 'snippet': '📷 صورة'},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 2'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('chat-quote-m001')), matching: find.text('أنت')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('chat-quote-m001')), matching: find.text('📷 صورة')), findsOneWidget);
    });
  });

  group('long-press menu and reactions', () {
    testWidgets('a reaction shows at once and goes to the server; tapping my chip removes it', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-react-🤲')), findsOneWidget);
      await tester.tap(find.byKey(const Key('menu-react-❤️')));
      await tester.pumpAndSettle();
      final calls = r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction');
      expect((calls.single.data as Map)['emoji'], '❤️');
      expect(find.byKey(const Key('chat-reactions-m001')), findsOneWidget);
      await tester.tap(find.byKey(const Key('chat-reactions-m001')));
      await tester.pumpAndSettle();
      final after = r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction');
      expect(after, hasLength(2));
      expect((after.last.data as Map)['emoji'], isNull);
      expect(find.byKey(const Key('chat-reactions-m001')), findsNothing);
    });

    testWidgets('a refused reaction goes back with the server\'s message', (tester) async {
      final r = _Room();
      r.adapter.on('POST', '/api/chats/c1/messages/m001/reaction', const FakeResponse(429, {'error': 'تمهّل قليلاً'}));
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-react-👍')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reactions-m001')), findsNothing);
      expect(find.text('تمهّل قليلاً'), findsOneWidget);
    });

    testWidgets('«نسخ» copies the text; «إبلاغ عن الرسالة» opens the report with that message named', (tester) async {
      final r = _Room();
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-copy')));
      await tester.pumpAndSettle();
      expect(copied, 'رسالة 1');
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-report')));
      await tester.pumpAndSettle();
      expect(find.text('إبلاغ عن الرسالة'), findsOneWidget);
      // The message is shown as a quote (its id goes with the report); the details start empty
      final quote = find.byKey(const Key('report-message'));
      expect(find.descendant(of: quote, matching: find.text('رسالة 1')), findsOneWidget);
      final details = tester.widgetList<TextField>(find.byType(TextField)).last;
      expect(details.controller!.text, isEmpty);
    });

    testWidgets('my own message: no «إبلاغ»; a voice note: no «نسخ»', (tester) async {
      final r = _Room(messages: [
        {...msg(1, mine: true)},
        {
          ...msg(2),
          'body': 'رسالة صوتية',
          'kind': 'VOICE',
          'media': {'url': '/api/chats/c1/media/m002', 'type': 'audio/mp4', 'durationSec': 3},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-report')), findsNothing);
      expect(find.byKey(const Key('menu-copy')), findsOneWidget);
      Navigator.of(tester.element(find.byKey(const Key('menu-copy')))).pop();
      await tester.pumpAndSettle();
      await tester.longPress(find.byKey(const Key('voice-waveform')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-copy')), findsNothing);
      expect(find.byKey(const Key('menu-report')), findsOneWidget);
    });

    testWidgets('an ended chat: no reply, no reactions, no swipe; copy and report stay', (tester) async {
      final r = _Room(status: 'ENDED');
      await r.open(tester);
      await tester.pumpAndSettle();
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-reply')), findsNothing);
      expect(find.byKey(const Key('menu-react-❤️')), findsNothing);
      expect(find.byKey(const Key('menu-copy')), findsOneWidget);
      expect(find.byKey(const Key('menu-report')), findsOneWidget);
    });
  });

  group('typing', () {
    testWidgets('the poll says he is typing: «يكتب الآن…» under the name for 5 s', (tester) async {
      final r = _Room(partnerTyping: true);
      await r.open(tester);
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      // The viewer is a woman: her partner «يكتب»
      expect(find.text('يكتب الآن…'), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
      expect(find.byKey(const Key('chat-typing')), findsNothing);
    });

    testWidgets('never in an ended chat', (tester) async {
      final r = _Room(status: 'ENDED', partnerTyping: true);
      await r.open(tester);
      expect(find.byKey(const Key('chat-typing')), findsNothing);
    });

    testWidgets('my typing is sent at most every 3 s', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.enterText(_input, 'ا');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.enterText(_input, 'اه');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.enterText(_input, 'اهل');
      await tester.pump();
      expect(r.adapter.to('POST', '/api/chats/c1/typing'), hasLength(1));
    });

    testWidgets('live: his typing shows with no fetch, mine is ignored; a live reaction updates the bubble',
        (tester) async {
      final r = _Room();
      r.live = FakeLive(fakeClient(r.adapter));
      await r.open(tester);
      final gets = r.adapter.to('GET', '/api/chats/c1').length;
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'u1'}));
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsNothing);
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'p1'}));
      // Delivered on the next microtask, drawn on the frame after
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      r.live!.controller.add(const ChatLiveEvent('reaction', {
        'messageId': 'm001',
        'reactions': [
          {'emoji': '😊', 'userId': 'p1'},
        ],
      }));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-reactions-m001')), findsOneWidget);
      expect(r.adapter.to('GET', '/api/chats/c1').length, gets);
      await tester.pump(const Duration(seconds: 6));
      await r.leave(tester);
    });
  });

  group('starters', () {
    const starters = ['ما خططك للسنوات القادمة؟', 'كيف تحب أن تقضي يوم الجمعة؟'];

    testWidgets('shown while I haven\'t written; a tap fills the box to edit, nothing is sent', (tester) async {
      final r = _Room(starters: starters);
      await r.open(tester);
      expect(find.byKey(const Key('chat-starters')), findsOneWidget);
      await tester.tap(find.text(starters.first));
      await tester.pump();
      expect(tester.widget<TextField>(_input).controller!.text, starters.first);
      expect(r.sends, isEmpty);
      // While the box has text, the chips step aside
      expect(find.byKey(const Key('chat-starters')), findsNothing);
      await tester.enterText(_input, '${starters.first} وما رأيك؟');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(r.sends.single['body'], '${starters.first} وما رأيك؟');
      expect(find.byKey(const Key('chat-starters')), findsNothing);
    });

    testWidgets('none once I have written', (tester) async {
      final r = _Room(starters: starters, messages: [msg(1, mine: true)]);
      await r.open(tester);
      expect(find.byKey(const Key('chat-starters')), findsNothing);
    });
  });

  group('photo preview', () {
    testWidgets('«إلغاء» on the preview: nothing uploads and the picked copy is deleted', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.tap(find.byKey(const Key('chat-photo')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('photo-preview-send')), findsOneWidget);
      expect(r.uploads, isEmpty);
      await tester.tap(find.byKey(const Key('photo-preview-cancel')));
      await tester.pumpAndSettle();
      expect(r.uploads, isEmpty);
      expect(r.picked!.existsSync(), isFalse);
    });

    testWidgets('leaving the chat while the preview is open sends nothing', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.tap(find.byKey(const Key('chat-photo')));
      await tester.pumpAndSettle();
      await r.leave(tester);
      expect(tester.takeException(), isNull);
      expect(r.uploads, isEmpty);
    });
  });

  group('unread on open', () {
    testWidgets('«رسائل جديدة» is scrolled into view when the chat opens on many unread messages', (tester) async {
      final r = _Room(messages: [
        for (var n = 1; n <= 20; n++) {...msg(n), 'readAt': '2026-10-30T12:00:00.000Z'},
        for (var n = 21; n <= 60; n++) msg(n),
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      final divider = find.byKey(const Key('chat-unread-divider'));
      expect(divider, findsOneWidget);
      final list = tester.getRect(find.byType(ListView).first);
      final rect = tester.getRect(divider);
      expect(rect.top, greaterThanOrEqualTo(list.top));
      expect(rect.bottom, lessThanOrEqualTo(list.bottom));
      expect(find.text('رسالة 21'), findsOneWidget);
    });
  });

  group('review polish (Task 8b)', () {
    testWidgets('released while the microphone is still starting: «الرسالة قصيرة جداً», nothing kept or sent',
        (tester) async {
      final r = _Room()..startGate = Completer<void>();
      await r.open(tester);
      final g = await _hold(tester);
      // The recorder hasn't started yet (a slow microphone)
      expect(r.rec.started, isFalse);
      await g.up();
      await _frames(tester);
      expect(find.text(holdTooShortText), findsOneWidget);
      r.startGate!.complete();
      await _frames(tester);
      expect(r.rec.cancelled, isTrue);
      expect(r.uploads, isEmpty);
      expect(find.byKey(const Key('voice-hold-bar')), findsNothing);
      await r.leave(tester);
    });

    testWidgets('released while the microphone prompt is up: nothing said (the member was answering the phone)',
        (tester) async {
      final r = _Room();
      final answer = Completer<bool>();
      r.permission = () => answer.future;
      await r.open(tester);
      final g = await _hold(tester);
      await g.up();
      await _frames(tester);
      expect(find.text(holdTooShortText), findsNothing);
      answer.complete(true);
      await _frames(tester);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the reactions chip and a quote are at least 44 px tall to tap', (tester) async {
      final r = _Room(messages: [
        {
          ...msg(1),
          'reactions': [
            {'emoji': '❤️', 'mine': true},
          ],
        },
        {
          ...msg(2),
          'replyTo': {'id': 'm001', 'mine': false, 'kind': 'TEXT', 'snippet': 'رسالة 1'},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      final chip = find.byKey(const Key('chat-reactions-m001'));
      final tapArea = find.ancestor(of: chip, matching: find.byType(GestureDetector)).first;
      expect(tester.getSize(tapArea).height, greaterThanOrEqualTo(44));
      expect(tester.getSize(find.byKey(const Key('chat-quote-m001'))).height, greaterThanOrEqualTo(44));
    });

    testWidgets('a swipe past the reply point that the system cancels does not reply', (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await tester.startGesture(tester.getCenter(find.text('رسالة 1')));
      for (var i = 0; i < 6; i++) {
        await g.moveBy(const Offset(-15, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      await g.cancel();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    });

    testWidgets('a live «typing» that arrives after their message is not shown again', (tester) async {
      final r = _Room();
      r.live = FakeLive(fakeClient(r.adapter));
      await r.open(tester);
      r.live!.controller.add(const ChatLiveEvent('message', {'id': 'm002', 'senderId': 'p1'}));
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'p1'}));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsNothing);
      // A real new signal a moment later shows
      await tester.pump(const Duration(seconds: 2));
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'p1'}));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
      await r.leave(tester);
    });

    testWidgets('«إبلاغ عن الرسالة» sends the reported message id with the report', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-report')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-submit')));
      await tester.pumpAndSettle();
      final report = (r.adapter.to('POST', '/api/chats/c1/end').single.data as Map)['report'] as Map;
      expect(report['reason'], 'HARASSMENT');
      expect(report['messageId'], 'm001');
      expect(report.containsKey('details'), isFalse);
    });

    testWidgets('the chat menu «إبلاغ» (no message) sends no message id', (tester) async {
      final r = _Room();
      await r.open(tester);
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إبلاغ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-submit')));
      await tester.pumpAndSettle();
      final report = (r.adapter.to('POST', '/api/chats/c1/end').single.data as Map)['report'] as Map;
      expect(report.containsKey('messageId'), isFalse);
    });

    testWidgets('polling: reaction changes on older messages come back with the next poll (reactionsSince)',
        (tester) async {
      final r = _Room(
        pollInterval: const Duration(seconds: 4),
        messages: [
          for (var n = 1; n <= 40; n++)
            {
              ...msg(n),
              'readAt': '2026-10-30T12:00:00.000Z',
              if (n == 10)
                'reactions': [
                  {'emoji': '😊', 'mine': false},
                ],
            },
        ],
      )..polledAt = '2026-11-10T10:00:00.000Z';
      await r.open(tester);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reactions-m010')), findsNothing, reason: 'off screen');
      // The partner reacts to message 30 and takes back their reaction on message 10 (outside ?after=)
      r.reactionUpdates = [
        {
          'messageId': 'm030',
          'reactions': [
            {'emoji': '👍', 'mine': false},
          ],
        },
        {'messageId': 'm010', 'reactions': []},
      ];
      await tester.pump(const Duration(seconds: 4));
      await tester.pump();
      final poll = r.adapter.to('GET', '/api/chats/c1').last;
      // The last answer's polledAt, less a few seconds (nothing missed in between)
      expect(poll.queryParameters['reactionsSince'], '2026-11-10T09:59:55.000Z');
      expect(find.byKey(const Key('chat-reactions-m030')), findsOneWidget);
      await tester.dragUntilVisible(
        find.text('رسالة 10'),
        find.byType(ListView).first,
        const Offset(0, 300),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reactions-m010')), findsNothing);
      await r.leave(tester);
    });

    testWidgets('my voice note keeps its waveform when the server copy replaces the sending bubble', (tester) async {
      final r = _Room();
      await r.open(tester);
      final g = await _hold(tester);
      r.rec.now = const Duration(milliseconds: 1500);
      await tester.pump(const Duration(milliseconds: 300));
      await g.up();
      await _frames(tester);
      final nonce = Map.fromEntries((r.uploads.single.data as FormData).fields)['clientNonce'];
      final painter = tester
          .widgetList<CustomPaint>(find.byType(CustomPaint))
          .map((c) => c.painter)
          .whereType<VoiceWaveformPainter>()
          .single;
      expect(painter.bars, voiceWaveform('local-$nonce', 2));
      await r.leave(tester);
    });
  });
}
