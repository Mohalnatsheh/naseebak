import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/privacy/screen_privacy.dart';
import 'package:naseebak_app/core/storage/picker_files.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_drafts.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/voice_played_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';
import 'helpers/fake_voice_player.dart';

final _t0 = DateTime.utc(2026, 11, 10, 10);

Future<VoiceSource> _src() async => (uri: Uri.parse('https://test.local/v.m4a'), headers: null);

ChatMessage _voice({String id = 'v1', int durationSec = 20, bool mine = false}) => ChatMessage(
      id: id,
      body: 'رسالة صوتية',
      createdAt: _t0,
      mine: mine,
      kind: MessageKind.voice,
      media: ChatMedia(url: '/api/chats/c1/media/$id', type: 'audio/mp4', durationSec: durationSec),
    );

ChatMessage _photo(String id) => ChatMessage(
      id: id,
      body: 'صورة',
      createdAt: _t0,
      mine: false,
      kind: MessageKind.image,
      media: ChatMedia(url: '/api/chats/c1/media/$id', type: 'image/jpeg', width: 800, height: 600),
    );

ChatMessage _text(String id) => ChatMessage(id: id, body: 'مرحبا', createdAt: _t0, mine: true);

/// Never finishes loading; records which photo was asked for
class _PendingImage extends ImageProvider<_PendingImage> {
  const _PendingImage(this.uri);
  final Uri uri;
  @override
  Future<_PendingImage> obtainKey(ImageConfiguration configuration) => SynchronousFuture(this);
  @override
  ImageStreamCompleter loadImage(_PendingImage key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(Completer<ImageInfo>().future);
}

class _Harness {
  final adapter = FakeAdapter();

  /// Every player fails to load (a note that can't be played)
  bool failLoad = false;
  final players = <FakeVoicePlayer>[];
  final asked = <Uri>[];

  Future<List<Override>> overrides({Map<String, Object> prefs = const {}}) async {
    final store = MemoryTokenStore('t1');
    return [
      ...await testOverrides(adapter, store: store, prefs: prefs),
      apiClientProvider.overrideWithValue(fakeClient(adapter, store: store)),
      voicePlayerFactoryProvider.overrideWithValue(() {
        final p = FakeVoicePlayer(failLoad: failLoad);
        players.add(p);
        return p;
      }),
      mediaImageProvider.overrideWithValue((uri, _) {
        asked.add(uri);
        return _PendingImage(uri);
      }),
    ];
  }
}

Future<ProviderContainer> _pump(WidgetTester tester, _Harness h, Widget child, {Map<String, Object> prefs = const {}}) async {
  final container = ProviderContainer(overrides: await h.overrides(prefs: prefs));
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: rtlApp(Scaffold(body: child))),
  );
  await tester.pump();
  await tester.pump();
  return container;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
}

void main() {
  group('VoicePlayback seek and speed', () {
    late List<FakeVoicePlayer> players;
    late VoicePlayback playback;

    setUp(() {
      players = [];
      playback = VoicePlayback(
        createPlayer: () {
          final p = FakeVoicePlayer();
          players.add(p);
          return p;
        },
      );
    });

    test('a seek before the first play is remembered and applied once loaded', () async {
      final s = playback.attach('a');
      playback.seek('a', const Duration(seconds: 5));
      expect(s.value.position, const Duration(seconds: 5));
      expect(players, isEmpty, reason: 'seeking alone loads nothing');
      await playback.toggle('a', _src);
      expect(players.single.seeks, [const Duration(seconds: 5)]);
      expect(players.single.plays, 1);
    });

    test('a seek on a loaded note goes straight to the player, playing or paused', () async {
      final s = playback.attach('a');
      await playback.toggle('a', _src);
      playback.seek('a', const Duration(seconds: 3));
      await Future<void>.delayed(Duration.zero);
      expect(players.single.seeks.last, const Duration(seconds: 3));
      expect(s.value.position, const Duration(seconds: 3));
    });

    test('speed cycles 1× → 1.5× → 2× → 1× and applies to loaded and later notes', () async {
      playback.attach('a');
      await playback.toggle('a', _src);
      expect(players.single.speed, 1);
      playback.cycleSpeed();
      await Future<void>.delayed(Duration.zero);
      expect(playback.speed.value, 1.5);
      expect(players.single.speed, 1.5);
      playback.cycleSpeed();
      expect(playback.speed.value, 2);
      // The next note starts at the same speed
      playback.attach('b');
      await playback.toggle('b', _src);
      expect(players[1].speed, 2);
      playback.cycleSpeed();
      expect(playback.speed.value, 1);
    });

    test('the speed survives the chat being left (one for the app run)', () async {
      playback.cycleSpeed();
      playback.closeAll();
      expect(playback.speed.value, 1.5);
    });
  });

  group('voiceWaveform', () {
    test('the same note always draws the same, another note differently', () {
      expect(voiceWaveform('m1', 12), voiceWaveform('m1', 12));
      expect(voiceWaveform('m1', 12), isNot(voiceWaveform('m2', 12)));
    });
    test('more bars for a longer note, 20 to 36, each 0.2–1', () {
      expect(voiceWaveform('m1', 1), hasLength(20));
      expect(voiceWaveform('m1', 10), hasLength(32));
      expect(voiceWaveform('m1', 180), hasLength(36));
      expect(voiceWaveform('m1', 180).every((v) => v >= 0.2 && v <= 1), isTrue);
    });
    test('speed labels', () {
      expect(formatVoiceSpeed(1), '1×');
      expect(formatVoiceSpeed(1.5), '1.5×');
      expect(formatVoiceSpeed(2), '2×');
    });
  });

  group('voice bubble', () {
    testWidgets('tapping the waveform seeks from the start side (right in Arabic)', (tester) async {
      final h = _Harness();
      final c = await _pump(tester, h, ChatBubble(message: _voice()));
      final wave = find.byKey(const Key('voice-waveform'));
      final box = tester.getRect(wave);
      // A quarter of the way in from the right edge = 25 % of a 20 s note
      await tester.tapAt(Offset(box.right - box.width / 4, box.center.dy));
      await tester.pump();
      final s = c.read(voicePlaybackProvider).sessionFor('v1')!;
      expect(s.value.position.inMilliseconds, closeTo(5000, 300));
      expect(find.text('0:05'), findsOneWidget);
    });

    testWidgets('dragging the waveform seeks where the finger lets go', (tester) async {
      final h = _Harness();
      final c = await _pump(tester, h, ChatBubble(message: _voice()));
      await tester.tap(find.byTooltip('تشغيل'));
      await _settle(tester);
      final box = tester.getRect(find.byKey(const Key('voice-waveform')));
      final g = await tester.startGesture(Offset(box.right - 4, box.center.dy));
      await g.moveBy(const Offset(-30, 0));
      await g.moveTo(Offset(box.right - box.width / 2, box.center.dy));
      await g.up();
      await tester.pump();
      expect(h.players.single.seeks.last.inMilliseconds, closeTo(10000, 400));
      expect(c.read(voicePlaybackProvider).sessionFor('v1')!.value.position.inMilliseconds, closeTo(10000, 400));
    });

    testWidgets('the speed button shows once the note plays and cycles 1× / 1.5× / 2×', (tester) async {
      final h = _Harness();
      await _pump(tester, h, ChatBubble(message: _voice()));
      expect(find.byKey(const Key('voice-speed')), findsNothing);
      await tester.tap(find.byTooltip('تشغيل'));
      await _settle(tester);
      expect(find.text('1×'), findsOneWidget);
      expect(tester.getSize(find.byKey(const Key('voice-speed'))).width, greaterThanOrEqualTo(44));
      await tester.tap(find.byKey(const Key('voice-speed')));
      await tester.pump();
      expect(find.text('1.5×'), findsOneWidget);
      expect(h.players.single.speed, 1.5);
      await tester.tap(find.byKey(const Key('voice-speed')));
      await tester.pump();
      expect(find.text('2×'), findsOneWidget);
    });

    testWidgets("the partner's note shows an unplayed dot until played, remembered on the phone", (tester) async {
      final h = _Harness();
      await _pump(tester, h, ChatBubble(message: _voice()));
      expect(find.byKey(const Key('voice-unplayed')), findsOneWidget);
      await tester.tap(find.byTooltip('تشغيل'));
      await _settle(tester);
      expect(find.byKey(const Key('voice-unplayed')), findsNothing);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getStringList(VoicePlayedStore.prefsKey), ['v1']);
    });

    testWidgets('a note that fails to load keeps its unplayed dot', (tester) async {
      final h = _Harness()..failLoad = true;
      await _pump(tester, h, ChatBubble(message: _voice()));
      await tester.tap(find.byTooltip('تشغيل'));
      await _settle(tester);
      expect(find.text(voiceErrorText), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getStringList(VoicePlayedStore.prefsKey), isNull);
      // Back from the error: still unplayed
      await tester.tap(find.byKey(const Key('voice-retry')));
      await _settle(tester);
      expect(find.byKey(const Key('voice-unplayed')), findsOneWidget);
    });

    testWidgets('a screen reader can seek the note: increase / decrease move it by 5 s', (tester) async {
      final h = _Harness();
      final c = await _pump(tester, h, ChatBubble(message: _voice()));
      SemanticsProperties slider() => tester
          .widget<Semantics>(
            find.ancestor(of: find.byKey(const Key('voice-waveform')), matching: find.byType(Semantics)).first,
          )
          .properties;
      expect(slider().slider, isTrue);
      // Time, not a percent, and whose note it is (QA A-L08)
      expect(slider().increasedValue, startsWith('0:05 من '));
      expect(slider().label, 'رسالة صوتية من الطرف الآخر');
      slider().onIncrease!();
      await tester.pump();
      final s = c.read(voicePlaybackProvider).sessionFor('v1')!;
      expect(s.value.position, const Duration(seconds: 5));
      slider().onIncrease!();
      await tester.pump();
      expect(s.value.position, const Duration(seconds: 10));
      slider().onDecrease!();
      await tester.pump();
      expect(s.value.position, const Duration(seconds: 5));
    });

    testWidgets('a note played before shows no dot; my own notes never do', (tester) async {
      final h = _Harness();
      await _pump(
        tester,
        h,
        Column(children: [
          ChatBubble(message: _voice(id: 'v1')),
          ChatBubble(message: _voice(id: 'v2', mine: true)),
        ]),
        prefs: {
          VoicePlayedStore.prefsKey: ['v1'],
        },
      );
      expect(find.byKey(const Key('voice-unplayed')), findsNothing);
    });
  });

  test('sign-out clears the played notes even when an earlier clean-up step fails', () async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}));
    final c = ProviderContainer(overrides: [
      ...await testOverrides(adapter, store: MemoryTokenStore('t1')),
      chatCacheProvider.overrideWithValue(MemoryChatCache()),
      pickerFilesCleanerProvider.overrideWithValue(() async => throw const FileSystemException('busy')),
      chatDraftsProvider.overrideWithValue(MemoryChatDrafts()),
    ]);
    addTearDown(c.dispose);
    c.read(authControllerProvider);
    for (var i = 0; i < 50 && !c.read(authControllerProvider).isSignedIn; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    final store = c.read(voicePlayedStoreProvider);
    await store.markPlayed('v1');
    try {
      await c.read(authControllerProvider.notifier).logout();
    } catch (_) {}
    expect(store.isPlayed('v1'), isFalse);
    expect(c.read(authControllerProvider).isSignedIn, isFalse);
  });

  test('sign-out clears the played notes', () async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}));
    final c = ProviderContainer(overrides: [
      ...await testOverrides(adapter, store: MemoryTokenStore('t1')),
      chatCacheProvider.overrideWithValue(MemoryChatCache()),
      pickerFilesCleanerProvider.overrideWithValue(() async {}),
      chatDraftsProvider.overrideWithValue(MemoryChatDrafts()),
    ]);
    addTearDown(c.dispose);
    c.read(authControllerProvider);
    for (var i = 0; i < 50 && !c.read(authControllerProvider).isSignedIn; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    final store = c.read(voicePlayedStoreProvider);
    await store.markPlayed('v1');
    expect(store.isPlayed('v1'), isTrue);
    await c.read(authControllerProvider.notifier).logout();
    expect(store.isPlayed('v1'), isFalse);
    expect(c.read(sharedPreferencesProvider).getStringList(VoicePlayedStore.prefsKey), isNull);
  });

  group('photo viewer', () {
    Widget chat(List<ChatMessage> all) => ChatPhotoGallery(
          photos: () => all,
          child: ListView(children: [for (final m in all) ChatBubble(key: ValueKey(m.id), message: m)]),
        );

    testWidgets("opens at the tapped photo and swipes through the chat's photos in order", (tester) async {
      final h = _Harness();
      final all = [_photo('p1'), _text('t1'), _photo('p2'), _photo('p3')];
      await _pump(tester, h, chat(all));
      await tester.tap(find.byType(PhotoBubble).at(1));
      await tester.pumpAndSettle();
      expect(find.byType(PhotoViewer), findsOneWidget);
      expect(find.text('2 / 3'), findsOneWidget, reason: 'the text message is skipped');
      expect(find.byType(SecureArea), findsWidgets);
      expect(h.asked.last.path, '/api/chats/c1/media/p2');
      // RTL: the next (newer) photo is to the left, so the finger moves right
      await tester.fling(find.byKey(const Key('photo-viewer-pages')), const Offset(500, 0), 1500);
      await tester.pumpAndSettle();
      expect(find.text('3 / 3'), findsOneWidget);
      expect(h.asked.last.path, '/api/chats/c1/media/p3');
      await tester.fling(find.byKey(const Key('photo-viewer-pages')), const Offset(-500, 0), 1500);
      await tester.pumpAndSettle();
      await tester.fling(find.byKey(const Key('photo-viewer-pages')), const Offset(-500, 0), 1500);
      await tester.pumpAndSettle();
      expect(find.text('1 / 3'), findsOneWidget);
    });

    testWidgets('black, no download or share, ✕ at the end side closes it', (tester) async {
      final h = _Harness();
      await _pump(tester, h, chat([_photo('p1'), _photo('p2')]));
      await tester.tap(find.byType(PhotoBubble).first);
      await tester.pumpAndSettle();
      final scaffold = tester.widget<Scaffold>(
        find.ancestor(of: find.byKey(const Key('photo-viewer-pages')), matching: find.byType(Scaffold)).first,
      );
      expect(scaffold.backgroundColor, Colors.black);
      expect(find.byIcon(Icons.download_rounded), findsNothing);
      expect(find.byIcon(Icons.share_rounded), findsNothing);
      final viewer = tester.getRect(find.byType(PhotoViewer));
      expect(tester.getCenter(find.byKey(const Key('photo-viewer-close'))).dx, lessThan(viewer.center.dx));
      await tester.tap(find.byKey(const Key('photo-viewer-close')));
      await tester.pumpAndSettle();
      expect(find.byType(PhotoViewer), findsNothing);
    });

    testWidgets('a zoomed photo pans instead of turning the page; double-tap zooms back out', (tester) async {
      final h = _Harness();
      await _pump(tester, h, chat([_photo('p1'), _photo('p2')]));
      await tester.tap(find.byType(PhotoBubble).first);
      await tester.pumpAndSettle();
      final pages = find.byKey(const Key('photo-viewer-pages'));
      await tester.tap(pages);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(pages);
      await tester.pumpAndSettle();
      expect(tester.widget<PageView>(pages).physics, isA<NeverScrollableScrollPhysics>());
      await tester.fling(pages, const Offset(500, 0), 1500);
      await tester.pumpAndSettle();
      expect(find.text('1 / 2'), findsOneWidget);
      await tester.tap(pages);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(pages);
      await tester.pumpAndSettle();
      expect(tester.widget<PageView>(pages).physics, isA<PageScrollPhysics>());
    });

    testWidgets('double-tap zooms around the middle of the photo area (under the bar), not the whole screen',
        (tester) async {
      final h = _Harness();
      await _pump(tester, h, chat([_photo('p1')]));
      await tester.tap(find.byType(PhotoBubble).first);
      await tester.pumpAndSettle();
      final viewer = find.byType(InteractiveViewer);
      final size = tester.getSize(viewer);
      await tester.tap(viewer);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(viewer);
      await tester.pumpAndSettle();
      final m = tester.widget<InteractiveViewer>(viewer).transformationController!.value;
      expect(m.getMaxScaleOnAxis(), closeTo(2, 0.001));
      final t = m.getTranslation();
      expect(t.x, closeTo(-size.width / 2, 0.5));
      expect(t.y, closeTo(-size.height / 2, 0.5));
    });

    testWidgets('outside a chat (no gallery) the viewer shows just that photo', (tester) async {
      final h = _Harness();
      await _pump(tester, h, ChatBubble(message: _photo('p1')));
      await tester.tap(find.byType(PhotoBubble));
      await tester.pumpAndSettle();
      expect(find.byType(PhotoViewer), findsOneWidget);
      expect(find.byKey(const Key('photo-viewer-count')), findsNothing);
    });

    testWidgets('the time and ticks sit over the photo corner', (tester) async {
      final h = _Harness();
      await _pump(tester, h, ChatBubble(message: _photo('p1')));
      final photo = tester.getRect(find.byType(PhotoBubble));
      final time = tester.getRect(find.byKey(const Key('chat-photo-time')));
      expect(photo.contains(time.topLeft) && photo.contains(time.bottomRight), isTrue);
      expect(time.bottom, greaterThan(photo.center.dy));
    });
  });
}
