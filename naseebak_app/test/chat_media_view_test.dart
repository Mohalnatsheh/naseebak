import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/localization/digits.dart';
import 'package:naseebak_app/core/network/authed_media.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';

import 'helpers/fake_api.dart';
import 'helpers/fake_voice_player.dart';

final _t0 = DateTime.utc(2026, 11, 10, 10);

ChatMessage _image({String id = 'm1', String? localPath, int? width = 1200, int? height = 800}) => ChatMessage(
  id: id,
  body: 'صورة (حدّث التطبيق لعرضها)',
  createdAt: _t0,
  mine: false,
  kind: MessageKind.image,
  media: ChatMedia(url: '/api/chats/c1/media/$id', type: 'image/jpeg', width: width, height: height),
  localPath: localPath,
);

ChatMessage _voice({String id = 'v1', int durationSec = 11}) => ChatMessage(
  id: id,
  body: 'رسالة صوتية (حدّث التطبيق لسماعها)',
  createdAt: _t0,
  mine: false,
  kind: MessageKind.voice,
  media: ChatMedia(url: '/api/chats/c1/media/$id', type: 'audio/mp4', durationSec: durationSec),
);

/// A photo that fails to load with an HTTP status (404 = gone, 401 = signed out)
class _FailingImage extends ImageProvider<_FailingImage> {
  const _FailingImage(this.uri, this.status);
  final Uri uri;
  final int status;

  @override
  Future<_FailingImage> obtainKey(ImageConfiguration configuration) => SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(_FailingImage key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(Future.error(NetworkImageLoadException(statusCode: status, uri: uri)));
}

/// Never finishes loading (enough to see what the bubble draws)
class _PendingImage extends ImageProvider<_PendingImage> {
  const _PendingImage();
  @override
  Future<_PendingImage> obtainKey(ImageConfiguration configuration) => SynchronousFuture(this);
  @override
  ImageStreamCompleter loadImage(_PendingImage key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(Completer<ImageInfo>().future);
}

class _Harness {
  final adapter = FakeAdapter();
  final players = <FakeVoicePlayer>[];
  int unauthorized = 0;
  bool failVoice = false;
  Duration? realDuration;
  ImageProvider Function(Uri uri, Map<String, String> headers)? image;

  Future<List<Override>> overrides() async {
    final store = MemoryTokenStore('t1');
    return [
      ...await testOverrides(adapter, store: store),
      apiClientProvider.overrideWithValue(fakeClient(adapter, store: store, onUnauthorized: () => unauthorized++)),
      voicePlayerFactoryProvider.overrideWithValue(() {
        final p = FakeVoicePlayer(failLoad: failVoice, realDuration: realDuration);
        players.add(p);
        return p;
      }),
      if (image != null) mediaImageProvider.overrideWithValue(image!),
    ];
  }
}

Future<void> _pump(WidgetTester tester, _Harness h, Widget child) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: await h.overrides(),
      child: rtlApp(Scaffold(body: child)),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('authedMedia resolves the relative URL and adds the Bearer token', (tester) async {
    final h = _Harness();
    late ({Uri uri, Map<String, String> headers}) got;
    await _pump(
      tester,
      h,
      Consumer(
        builder: (context, ref, _) {
          return TextButton(
            onPressed: () async => got = await authedMedia(ref, '/api/chats/c1/media/m1'),
            child: const Text('go'),
          );
        },
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pump();
    expect(got.uri.toString(), 'http://test.local/api/chats/c1/media/m1');
    expect(got.headers['Authorization'], 'Bearer t1');
  });

  testWidgets('an IMAGE message renders a PhotoBubble, never its fallback body', (tester) async {
    final h = _Harness()..image = (_, _) => const _PendingImage();
    await _pump(tester, h, ChatBubble(message: _image()));
    expect(find.byType(PhotoBubble), findsOneWidget);
    expect(find.textContaining('حدّث التطبيق'), findsNothing);
  });

  testWidgets('the photo is loaded with the Bearer header', (tester) async {
    Map<String, String>? sent;
    Uri? at;
    final h = _Harness()
      ..image = (uri, headers) {
        at = uri;
        sent = headers;
        return const _PendingImage();
      };
    await _pump(tester, h, ChatBubble(message: _image()));
    expect(at.toString(), 'http://test.local/api/chats/c1/media/m1');
    expect(sent?['Authorization'], 'Bearer t1');
  });

  testWidgets('a photo that is gone (404) shows the placeholder, no sign-out', (tester) async {
    final h = _Harness()..image = (uri, _) => _FailingImage(uri, 404);
    await _pump(tester, h, ChatBubble(message: _image()));
    await tester.pump();
    expect(find.text('تعذّر عرض الصورة'), findsOneWidget);
    expect(h.unauthorized, 0);
  });

  testWidgets('a photo answered 401 shows the placeholder and goes through the sign-out path once', (tester) async {
    final h = _Harness()..image = (uri, _) => _FailingImage(uri, 401);
    await _pump(tester, h, ChatBubble(message: _image()));
    await tester.pump();
    await tester.pump();
    expect(find.text('تعذّر عرض الصورة'), findsOneWidget);
    expect(h.unauthorized, 1);
  });

  testWidgets('my photo still sending shows the local file, not the network', (tester) async {
    var networkLoads = 0;
    final h = _Harness()
      ..image = (_, _) {
        networkLoads++;
        return const _PendingImage();
      };
    await _pump(tester, h, ChatBubble(message: _image(localPath: '/tmp/photo.jpg')));
    final img = tester.widget<Image>(find.descendant(of: find.byType(PhotoBubble), matching: find.byType(Image)));
    expect((img.image as ResizeImage).imageProvider, isA<FileImage>());
    expect(networkLoads, 0);
  });

  testWidgets('tapping a photo opens the full-screen viewer', (tester) async {
    final h = _Harness()..image = (_, _) => const _PendingImage();
    await _pump(tester, h, ChatBubble(message: _image()));
    await tester.tap(find.byType(PhotoBubble));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
  });

  testWidgets('the photo viewer names the sender and the day', (tester) async {
    final h = _Harness()..image = (_, _) => const _PendingImage();
    final theirs = _image();
    final mine = ChatMessage(
      id: 'm2',
      body: '',
      createdAt: _t0.add(const Duration(days: 1)),
      mine: true,
      kind: MessageKind.image,
      media: const ChatMedia(url: '/api/chats/c1/media/m2', type: 'image/jpeg', width: 10, height: 10),
    );
    await _pump(
      tester,
      h,
      ChatPhotoGallery(
        photos: () => [theirs, mine],
        partnerName: 'عمر',
        child: ChatBubble(message: theirs, partnerName: 'عمر'),
      ),
    );
    await tester.tap(find.byType(PhotoBubble));
    await tester.pumpAndSettle();
    final title = find.byKey(const Key('photo-viewer-title'));
    expect(find.descendant(of: title, matching: find.text('عمر')), findsOneWidget);
    expect(
      find.descendant(of: title, matching: find.text('${chatDayLabel(theirs.createdAt)}، ${formatTime(theirs.createdAt)}')),
      findsOneWidget,
    );
    await tester.fling(find.byKey(const Key('photo-viewer-pages')), const Offset(500, 0), 1500);
    await tester.pumpAndSettle();
    expect(find.descendant(of: title, matching: find.text('أنت')), findsOneWidget);
    expect(find.descendant(of: title, matching: find.text('عمر')), findsNothing);
  });

  testWidgets('a VOICE bubble shows m:ss from durationSec and never its body', (tester) async {
    final h = _Harness();
    await _pump(tester, h, ChatBubble(message: _voice()));
    expect(find.byType(VoiceBubble), findsOneWidget);
    expect(find.text('0:11'), findsOneWidget);
    expect(find.textContaining('حدّث التطبيق'), findsNothing);
    // Created lazily: nothing until the first play
    expect(h.players, isEmpty);
  });

  testWidgets('the label keeps the server durationSec once the note loads (the player says 10.4 s for an 11 s note)',
      (tester) async {
    final h = _Harness()..realDuration = const Duration(milliseconds: 10400);
    await _pump(tester, h, ChatBubble(message: _voice()));
    expect(find.text('0:11'), findsOneWidget);
    await tester.tap(find.byTooltip('تشغيل'));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byTooltip('إيقاف مؤقت'));
    await tester.pump();
    await tester.pump();
    expect(h.players.single.plays, 1);
    expect(find.text('0:11'), findsOneWidget);
    expect(find.text('0:10'), findsNothing);
  });

  test('formatVoiceDuration', () {
    expect(formatVoiceDuration(const Duration(seconds: 11)), '0:11');
    expect(formatVoiceDuration(const Duration(seconds: 65)), '1:05');
    expect(formatVoiceDuration(const Duration(seconds: 180)), '3:00');
  });

  testWidgets('play loads the voice with the Bearer token; only one voice plays at a time; disposed with the bubble', (
    tester,
  ) async {
    final h = _Harness();
    await _pump(
      tester,
      h,
      Column(
        children: [
          ChatBubble(message: _voice(id: 'v1')),
          ChatBubble(message: _voice(id: 'v2', durationSec: 65)),
        ],
      ),
    );
    expect(find.text('1:05'), findsOneWidget);
    final buttons = find.byTooltip('تشغيل');
    expect(buttons, findsNWidgets(2));
    expect(tester.getSize(buttons.first).width, greaterThanOrEqualTo(44));

    await tester.tap(buttons.first);
    await tester.pump();
    await tester.pump();
    expect(h.players, hasLength(1));
    final first = h.players.single;
    expect(first.loadedUri.toString(), 'http://test.local/api/chats/c1/media/v1');
    expect(first.loadedHeaders?['Authorization'], 'Bearer t1');
    expect(first.plays, 1);
    expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);

    await tester.tap(find.byTooltip('تشغيل'));
    await tester.pump();
    await tester.pump();
    expect(h.players, hasLength(2));
    expect(first.pauses, 1, reason: 'starting the second voice pauses the first');
    expect(h.players[1].plays, 1);

    await tester.pumpWidget(const SizedBox());
    expect(first.disposed, isTrue);
    expect(h.players[1].disposed, isTrue);
  });

  testWidgets('a voice that fails to load shows the placeholder; a 401 goes through the sign-out path', (tester) async {
    final h = _Harness()..failVoice = true;
    h.adapter.on('GET', '/api/chats/c1/media/v1', const FakeResponse(401, {'error': 'غير مصرح'}));
    await _pump(tester, h, ChatBubble(message: _voice()));
    await tester.tap(find.byTooltip('تشغيل'));
    await _until(tester, find.text('تعذّر تشغيل الرسالة'));
    expect(find.text('تعذّر تشغيل الرسالة'), findsOneWidget);
    expect(h.unauthorized, 1);
  });

  testWidgets('a voice that is gone (404) shows the placeholder without signing out', (tester) async {
    final h = _Harness()..failVoice = true;
    await _pump(tester, h, ChatBubble(message: _voice()));
    await tester.tap(find.byTooltip('تشغيل'));
    await _until(tester, find.text('تعذّر تشغيل الرسالة'));
    expect(find.text('تعذّر تشغيل الرسالة'), findsOneWidget);
    expect(h.unauthorized, 0);
  });

  group('the token goes only to the API origin', () {
    final store = MemoryTokenStore('t1');
    test('a same-origin relative URL gets the Bearer header', () async {
      final m = await authedMediaFor('http://test.local', store, '/api/chats/c1/media/m1');
      expect(m.uri.toString(), 'http://test.local/api/chats/c1/media/m1');
      expect(m.headers['Authorization'], 'Bearer t1');
    });
    test('a same-origin absolute URL gets it too', () async {
      final m = await authedMediaFor('https://naseebak.com', store, 'https://naseebak.com/api/chats/c1/media/m1');
      expect(m.headers['Authorization'], 'Bearer t1');
    });
    test('an absolute CDN URL gets no Authorization header', () async {
      final m = await authedMediaFor('https://naseebak.com', store, 'https://cdn.example.net/chat/m1.jpg');
      expect(m.uri.toString(), 'https://cdn.example.net/chat/m1.jpg');
      expect(m.headers.containsKey('Authorization'), isFalse);
    });
    test('another scheme or port is another origin', () async {
      expect((await authedMediaFor('https://naseebak.com', store, 'http://naseebak.com/x')).headers, isEmpty);
      expect((await authedMediaFor('https://naseebak.com', store, 'https://naseebak.com:8443/x')).headers, isEmpty);
      expect((await authedMediaFor('https://naseebak.com', store, 'https://naseebak.com.evil.io/x')).headers, isEmpty);
    });
    test('sameOrigin fills in default ports and ignores case', () {
      expect(sameOrigin(Uri.parse('https://NASEEBAK.com:443/a'), Uri.parse('https://naseebak.com')), isTrue);
    });
  });

  testWidgets('a CDN photo is loaded without the token, and its 401 never signs out', (tester) async {
    Map<String, String>? sent;
    final h = _Harness()
      ..image = (uri, headers) {
        sent = headers;
        return _FailingImage(uri, 401);
      };
    final msg = ChatMessage(
      id: 'm9',
      body: 'صورة',
      createdAt: _t0,
      mine: false,
      kind: MessageKind.image,
      media: const ChatMedia(url: 'https://cdn.example.net/m9.jpg', type: 'image/jpeg'),
    );
    await _pump(tester, h, ChatBubble(message: msg));
    await tester.pump();
    await tester.pump();
    expect(sent, isEmpty);
    expect(find.text('تعذّر عرض الصورة'), findsOneWidget);
    expect(h.unauthorized, 0);
  });

  testWidgets('a CDN voice note is played without the token and never probed', (tester) async {
    final h = _Harness()..failVoice = true;
    final msg = ChatMessage(
      id: 'v9',
      body: 'صوت',
      createdAt: _t0,
      mine: false,
      kind: MessageKind.voice,
      media: const ChatMedia(url: 'https://cdn.example.net/v9.m4a', type: 'audio/mp4', durationSec: 5),
    );
    await _pump(tester, h, ChatBubble(message: msg));
    await tester.tap(find.byTooltip('تشغيل'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(h.players.single.loadedUri.toString(), 'https://cdn.example.net/v9.m4a');
    expect(h.players.single.loadedHeaders, isEmpty);
    expect(find.text('تعذّر تشغيل الرسالة'), findsOneWidget);
    expect(h.adapter.requests, isEmpty, reason: 'no probe to another host');
    expect(h.unauthorized, 0);
  });

  testWidgets('the probe for a same-origin voice never follows redirects', (tester) async {
    final h = _Harness()..failVoice = true;
    h.adapter.on('GET', '/api/chats/c1/media/v1', const FakeResponse(404, {'error': 'غير موجود'}));
    await _pump(tester, h, ChatBubble(message: _voice()));
    await tester.tap(find.byTooltip('تشغيل'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    final probe = h.adapter.to('GET', '/api/chats/c1/media/v1').single;
    expect(probe.followRedirects, isFalse);
    expect(probe.headers['Authorization'], 'Bearer t1');
  });
}

/// Pumps until [f] shows (at most 50 short frames), so a slower fake answer never makes the test flaky
Future<void> _until(WidgetTester tester, Finder f) async {
  for (var i = 0; i < 50 && f.evaluate().isEmpty; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
}
