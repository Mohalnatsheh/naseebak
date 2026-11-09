import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';

import 'helpers/fake_api.dart';
import 'helpers/fake_voice_player.dart';

Future<VoiceSource> _src() async => (uri: Uri.parse('https://test.local/v.m4a'), headers: null);

ChatMessage _voice(String id) => ChatMessage(
  id: id,
  body: 'رسالة صوتية',
  createdAt: DateTime.utc(2026, 11, 10),
  mine: false,
  kind: MessageKind.voice,
  media: ChatMedia(url: '/api/chats/c1/media/$id', type: 'audio/mp4', durationSec: 9),
);

void main() {
  group('VoicePlayback', () {
    late List<FakeVoicePlayer> players;
    late int sessionPrepared;
    late VoicePlayback playback;

    setUp(() {
      players = [];
      sessionPrepared = 0;
      playback = VoicePlayback(
        createPlayer: () {
          final p = FakeVoicePlayer();
          players.add(p);
          return p;
        },
        beforePlay: () async => sessionPrepared++,
      );
    });

    test('the audio session is prepared before each play (iPhone silent switch)', () async {
      playback.attach('a');
      await playback.toggle('a', _src);
      expect(sessionPrepared, 1);
      expect(players.single.plays, 1);
    });

    test('one note at a time: playing b pauses a', () async {
      playback
        ..attach('a')
        ..attach('b');
      await playback.toggle('a', _src);
      await playback.toggle('b', _src);
      expect(players[0].pauses, 1);
      expect(players[1].plays, 1);
      expect(playback.currentKey, 'b');
    });

    test('the bubble scrolling away does not stop the note playing; scrolling back finds the same session', () async {
      final s = playback.attach('a');
      await playback.toggle('a', _src);
      await Future<void>.delayed(Duration.zero);
      playback.detach(s);
      expect(players.single.disposed, isFalse);
      expect(players.single.pauses, 0);
      expect(identical(playback.attach('a'), s), isTrue);
      expect(s.value.playing, isTrue);
    });

    test('a note that is not playing closes with its bubble', () async {
      final a = playback.attach('a');
      playback.attach('b');
      await playback.toggle('a', _src);
      await playback.toggle('b', _src);
      playback.detach(a);
      expect(players[0].disposed, isTrue);
      expect(playback.sessionCount, 1);
    });

    test('a playing note whose bubble is gone closes when another note takes over', () async {
      final a = playback.attach('a');
      playback.attach('b');
      await playback.toggle('a', _src);
      playback.detach(a);
      expect(players[0].disposed, isFalse);
      await playback.toggle('b', _src);
      expect(players[0].disposed, isTrue);
    });

    test('handOver: my note confirmed while playing carries on under the server id', () async {
      final s = playback.attach('/tmp/v.m4a');
      await playback.toggle('/tmp/v.m4a', _src);
      await Future<void>.delayed(Duration.zero);
      expect(playback.handOver('/tmp/v.m4a', 'srv1'), isTrue, reason: 'still uses the file');
      expect(playback.currentKey, 'srv1');
      expect(identical(playback.sessionFor('srv1'), s), isTrue);
      expect(playback.sessionFor('/tmp/v.m4a'), isNull);
      // The old bubble going away (by session) leaves it playing; the new bubble finds it
      playback.detach(s);
      expect(players.single.disposed, isFalse);
      expect(identical(playback.attach('srv1'), s), isTrue);
      expect(s.value.playing, isTrue);
    });

    test('handOver of a note never played: nothing to keep', () {
      playback.attach('/tmp/v.m4a');
      expect(playback.handOver('/tmp/v.m4a', 'srv1'), isFalse);
    });

    test('handOver when the server copy already has a bubble: the local note stops', () async {
      playback.attach('/tmp/v.m4a');
      await playback.toggle('/tmp/v.m4a', _src);
      playback.attach('srv1');
      expect(playback.handOver('/tmp/v.m4a', 'srv1'), isFalse);
      expect(players.single.disposed, isTrue);
      expect(playback.currentKey, isNull);
    });

    test('pauseCurrent pauses the note playing (the app left the foreground)', () async {
      playback.attach('a');
      await playback.toggle('a', _src);
      playback.pauseCurrent();
      expect(players.single.pauses, 1);
    });

    test('nothing plays while a note is recorded', () async {
      var recording = true;
      playback.canPlay = () => !recording;
      playback.attach('a');
      await playback.toggle('a', _src);
      expect(players, isEmpty);
      recording = false;
      await playback.toggle('a', _src);
      expect(players.single.plays, 1);
    });

    test('closeAll disposes every player', () async {
      playback
        ..attach('a')
        ..attach('b');
      await playback.toggle('a', _src);
      await playback.toggle('b', _src);
      playback.closeAll();
      expect(players.every((p) => p.disposed), isTrue);
      expect(playback.sessionCount, 0);
    });

    test('the end of a note on a torn-down player never throws (no fatal async error)', () async {
      final s = playback.attach('a');
      await playback.toggle('a', _src);
      players.single
        ..throwOnPause = true
        ..complete();
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(s.value.position, Duration.zero);
    });

    test('a pause during the load wins: the note never starts', () async {
      playback.attach('a');
      final f = playback.toggle('a', _src);
      playback.pauseCurrent();
      await f;
      expect(players.single.plays, 0);
    });
  });

  group('VoiceBubble', () {
    Future<List<FakeVoicePlayer>> pump(WidgetTester tester, ValueNotifier<bool> shown, {bool fail = false}) async {
      final players = <FakeVoicePlayer>[];
      final adapter = FakeAdapter();
      final store = MemoryTokenStore('t1');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...await testOverrides(adapter, store: store),
            voicePlayerFactoryProvider.overrideWithValue(() {
              final p = FakeVoicePlayer(failLoad: fail && players.isEmpty);
              players.add(p);
              return p;
            }),
            voiceAudioSessionProvider.overrideWithValue(() async {}),
          ],
          child: rtlApp(
            Scaffold(
              body: ValueListenableBuilder<bool>(
                valueListenable: shown,
                builder: (_, v, _) => v ? ChatBubble(message: _voice('v1')) : const SizedBox(),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      return players;
    }

    testWidgets('scrolled out of view while playing: keeps playing, and the bubble back shows it playing', (
      tester,
    ) async {
      final shown = ValueNotifier(true);
      final players = await pump(tester, shown);
      await tester.tap(find.byTooltip('تشغيل'));
      await tester.pump();
      await tester.pump();
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
      shown.value = false;
      await tester.pump();
      expect(players.single.disposed, isFalse);
      expect(players.single.pauses, 0);
      shown.value = true;
      await tester.pump();
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
      expect(players, hasLength(1));
    });

    testWidgets('a failed note can be tried again with a tap', (tester) async {
      final shown = ValueNotifier(true);
      final players = await pump(tester, shown, fail: true);
      await tester.tap(find.byTooltip('تشغيل'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(find.text(voiceErrorText), findsOneWidget);
      await tester.tap(find.byKey(const Key('voice-retry')));
      await tester.pump();
      expect(players.single.disposed, isTrue, reason: 'the failed player goes with the retry');
      expect(find.byTooltip('تشغيل'), findsOneWidget);
      await tester.tap(find.byTooltip('تشغيل'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(players, hasLength(2));
      expect(players[1].plays, 1);
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
    });
  });
}
