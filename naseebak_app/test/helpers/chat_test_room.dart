/// The chat room under test with a live fake API: messages, polls, the recorder, the photo picker and live events.
/// Shared by the composer and read-on-top tests.
library;

import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/chat/chat_media_picker.dart';
import 'package:naseebak_app/features/chat/hold_to_record.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/voice_recorder.dart';

import 'chat_room_helpers.dart';
import 'fake_api.dart';
import 'fake_recorder.dart';
import 'fake_voice_player.dart';

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

class ChatTestRoom {
  ChatTestRoom({
    this.status = 'ACTIVE',
    List<Map<String, dynamic>>? messages,
    this.starters = const [],
    this.partnerTyping = false,
    this.pollInterval = const Duration(hours: 1),
    this.expiresAt,
  }) : messages = messages ?? [msg(1)];

  String status;
  List<Map<String, dynamic>> messages;
  List<String> starters;
  bool partnerTyping;
  final Duration pollInterval;

  /// The server's `deleteEnabled` (Pro chat delete; the test member is Pro with app payments)
  bool deleteEnabled = true;

  /// The conversation's `expiresAt` (default: far ahead)
  final DateTime? expiresAt;

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

  /// Every voice player the room made (a play shows in `plays`)
  final players = <FakeVoicePlayer>[];

  /// How a photo loads (null = the app's own network image)
  ImageProvider Function(Uri uri, Map<String, String> headers)? image;

  late final Directory dir = () {
    final d = Directory.systemTemp.createTempSync('chat_test_room');
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
          'conversation': {...conv, 'status': status, if (expiresAt != null) 'expiresAt': expiresAt!.toUtc().toIso8601String()},
          'messages': [
            for (final m in messages)
              if (from == null || !DateTime.parse(m['createdAt'] as String).isBefore(from)) m,
          ],
          'hasMore': false,
          'chatEnabled': true,
          'partnerTyping': partnerTyping,
          'deleteEnabled': deleteEnabled,
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
      voicePlayerFactoryProvider.overrideWithValue(() {
        final p = FakeVoicePlayer();
        players.add(p);
        return p;
      }),
      if (image != null) mediaImageProvider.overrideWithValue(image!),
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

final chatMic = find.byKey(const Key('chat-mic'));
final chatInput = find.byKey(const Key('chat-input'));

/// Presses the mic and holds past the hold delay (the recorder starts)
Future<TestGesture> holdMic(WidgetTester tester) async {
  final g = await tester.startGesture(tester.getCenter(chatMic));
  await tester.pump(holdDelay + const Duration(milliseconds: 20));
  await tester.pump();
  await tester.pump();
  return g;
}

Future<void> frames(WidgetTester tester, [int n = 8]) async {
  for (var i = 0; i < n; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}
