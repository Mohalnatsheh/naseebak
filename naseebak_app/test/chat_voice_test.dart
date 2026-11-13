import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/core/system/app_settings.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_media_picker.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/voice_recorder.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/pro/pro_repository.dart';
import 'package:record/record.dart' show AudioEncoder;

import 'helpers/chat_room_helpers.dart' show pickFromGallery;
import 'helpers/fake_api.dart';
import 'helpers/fake_recorder.dart';
import 'helpers/fake_voice_player.dart';

/// The microphone in tests: a real temp file, a clock the test sets, and a record of what the screen asked for.
/// A 1×1 PNG
const _png = [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, //
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49,
  0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

Map<String, dynamic> _page(String status, [List<Map<String, dynamic>> extra = const []]) => {
      'conversation': {
        'id': 'c1',
        'matchId': 'x1',
        'partner': {'id': 'p1', 'firstName': 'عمر'},
        'status': status,
        'expiresAt': '2099-01-01T00:00:00.000Z',
      },
      'messages': [
        {'id': 'm001', 'body': 'السلام عليكم', 'createdAt': '2026-10-30T10:00:00.000Z', 'mine': false},
        ...extra,
      ],
      'hasMore': false,
      'chatEnabled': true,
    };

class _Harness {
  _Harness({this.isPro = true, this.pollInterval = const Duration(hours: 1)});
  bool isPro;
  final Duration pollInterval;
  String status = 'ACTIVE';
  List<Map<String, dynamic>> serverExtra = [];
  Future<bool> Function() permission = () async => true;
  bool failStart = false;
  final recorders = <FakeRecorder>[];
  FakeRecorder get rec => recorders.single;
  final players = <FakeVoicePlayer>[];
  int settingsOpened = 0;

  /// The chat sits on top of a first page, so back has somewhere to go
  bool withBack = false;

  late final Directory dir = () {
    final d = Directory.systemTemp.createTempSync('chat_voice_test');
    addTearDown(() {
      if (d.existsSync()) d.deleteSync(recursive: true);
    });
    return d;
  }();

  late final FakeAdapter adapter = FakeAdapter()
    ..handlers['GET /api/mobile/me'] = ((_) => FakeResponse(200, {
          'user': {...meJson(), 'appPayments': true},
        }))
    ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
    ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}))
    ..handlers['GET /api/chats/c1'] = ((_) => FakeResponse(200, _page(status, serverExtra)))
    ..handlers['GET /api/pro'] = ((_) => FakeResponse(200, {
          'enabled': true,
          'isPro': isPro,
          'cancelAtPeriodEnd': false,
          'pastDue': false,
          'canBuy': true,
          'offers': [],
        }))
    ..handlers['GET /api/me/counts'] = ((_) => FakeResponse(200, {
          'flags': {},
          'pro': {'isPro': isPro},
        }))
    ..handlers['POST /api/chats/c1/media'] = ((r) {
      final fields = Map.fromEntries((r.data as FormData).fields);
      return FakeResponse(200, {
        'message': {
          'id': 'srv-${fields['clientNonce']}',
          'body': '🎤 رسالة صوتية',
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'mine': true,
          'kind': 'VOICE',
          'media': {'url': '/api/chats/c1/media/srv', 'type': 'audio/mp4', 'durationSec': int.parse(fields['durationSec']!)},
        },
      });
    });

  late final ProviderContainer container;
  late final GoRouter router;

  Future<void> open(WidgetTester tester) async {
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    container = ProviderContainer(overrides: [
      ...overrides,
      chatCacheProvider.overrideWithValue(MemoryChatCache()),
      chatPhotoPickerProvider.overrideWithValue(() async {
        final f = File('${dir.path}/picked.jpg')..writeAsBytesSync([0xFF, 0xD8, 0xFF]);
        return PickedPhoto(path: f.path, bytes: 3);
      }),
      // Server copies of photos never reach the network in tests
      mediaImageProvider.overrideWithValue((_, _) => MemoryImage(Uint8List.fromList(_png))),
      voiceRecorderProvider.overrideWithValue(() {
        final r = FakeRecorder(dir, permission)..failStart = failStart;
        recorders.add(r);
        return r;
      }),
      voicePlayerFactoryProvider.overrideWithValue(() {
        final p = FakeVoicePlayer();
        players.add(p);
        return p;
      }),
      voiceAudioSessionProvider.overrideWithValue(() async {}),
      openAppSettingsProvider.overrideWithValue(() async => settingsOpened++),
    ]);
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    router = GoRouter(
      initialLocation: withBack ? '/' : '/chats/c1',
      routes: [
        GoRoute(path: '/', builder: (_, _) => const Scaffold(body: Text('chats-list'))),
        GoRoute(
          path: '/chats/:id',
          builder: (_, s) => ChatRoomScreen(chatId: s.pathParameters['id']!, pollInterval: pollInterval),
        ),
        GoRoute(path: '/pro', builder: (_, _) => const Scaffold(body: Text('pro-screen'))),
      ],
    );
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        theme: AppTheme.light(),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        routerConfig: router,
      ),
    ));
    await tester.pump();
    if (withBack) {
      router.push('/chats/c1');
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// Leaves the chat (the screen is disposed)
  Future<void> leave(WidgetTester tester) =>
      tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));

  List<RequestOptions> get uploads => adapter.to('POST', '/api/chats/c1/media');
}

final _mic = find.byKey(const Key('chat-mic'));
final _send = find.byKey(const Key('voice-send'));
final _cancel = find.byKey(const Key('voice-cancel'));
final _clock = find.byKey(const Key('voice-clock'));

/// The recording bar's clock ticks every 250 ms
Future<void> _tick(WidgetTester tester) => tester.pump(const Duration(milliseconds: 300));

/// The paperclip → «المعرض», then «إرسال» on the preview (nothing is uploaded before it)
Future<void> pickAndSendPhoto(WidgetTester tester) async {
  await pickFromGallery(tester);
  final send = find.byKey(const Key('photo-preview-send'));
  for (var i = 0; i < 20 && send.evaluate().isEmpty; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
  await tester.pump(const Duration(milliseconds: 400));
  await tester.tap(send);
  await tester.pump();
  // Until the preview has fully gone (its route no longer blocks taps)
  for (var i = 0; i < 40 && find.byKey(const Key('photo-preview-image'), skipOffstage: false).evaluate().isNotEmpty; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  test('durationSec: rounded up, at least 1', () {
    expect(voiceDurationSec(const Duration(milliseconds: 10200)), 11);
    expect(voiceDurationSec(const Duration(seconds: 10)), 10);
    expect(voiceDurationSec(const Duration(milliseconds: 300)), 1);
    expect(voiceDurationSec(Duration.zero), 1);
  });

  test('voice notes record AAC-LC 64 kbps in mono', () {
    expect(voiceRecordConfig.numChannels, 1);
    expect(voiceRecordConfig.encoder, AudioEncoder.aacLc);
    expect(voiceRecordConfig.bitRate, 64000);
  });

  testWidgets('the microphone refused: the SnackBar shows and nothing records', (tester) async {
    final h = _Harness()..permission = () async => false;
    await h.open(tester);
    expect(_mic, findsOneWidget);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    // The first refusal: a reason, with the way to the settings
    expect(find.text(micRefusedText), findsOneWidget);
    expect(h.rec.asked, isTrue);
    expect(h.rec.started, isFalse);
    expect(h.rec.disposed, isTrue);
    expect(_clock, findsNothing);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    expect(h.uploads, isEmpty);
  });

  testWidgets('refused again (the phone no longer asks): «الإعدادات» opens the app settings', (tester) async {
    final h = _Harness()..permission = () async => false;
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    // The SnackBar goes by itself (it never stays over the composer)
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsNothing);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(find.text(micBlockedText), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.text('الإعدادات'));
    await tester.pump();
    expect(h.settingsOpened, 1);
    expect(h.recorders.every((r) => !r.started), isTrue);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('back while recording asks first: «إلغاء» keeps the recording, «حذف والخروج» deletes it and leaves',
      (tester) async {
    final h = _Harness()..withBack = true;
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(h.rec.started, isTrue);
    await h.router.routerDelegate.popRoute();
    await tester.pumpAndSettle();
    expect(find.text('حذف الرسالة الصوتية؟'), findsOneWidget);
    // Stay: the recording goes on
    await tester.tap(find.widgetWithText(TextButton, 'إلغاء').last);
    await tester.pumpAndSettle();
    expect(_clock, findsOneWidget);
    expect(h.rec.cancelled, isFalse);
    await h.router.routerDelegate.popRoute();
    await tester.pumpAndSettle();
    await tester.tap(find.text('حذف والخروج'));
    await tester.pumpAndSettle();
    expect(find.text('chats-list'), findsOneWidget);
    expect(h.rec.cancelled, isTrue);
    expect(h.uploads, isEmpty);
  });

  testWidgets('recording shows the clock, «إرسال» and «إلغاء» in place of the text box', (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(h.rec.started, isTrue);
    expect(find.byKey(const Key('chat-input')), findsNothing);
    expect(find.text('إرسال'), findsOneWidget);
    expect(find.text('إلغاء'), findsOneWidget);
    h.rec.now = const Duration(seconds: 65, milliseconds: 400);
    await _tick(tester);
    expect(find.descendant(of: _clock, matching: find.text('1:05')), findsOneWidget);
    await tester.tap(_cancel);
    await tester.pump();
  });

  testWidgets('at 3 minutes the recording stops, the bar says so and waits: nothing uploads until «إرسال»',
      (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    h.rec.now = const Duration(seconds: 180);
    await _tick(tester);
    await tester.pump();
    expect(h.rec.stopped, isTrue);
    expect(find.text('بلغ التسجيل الحد الأقصى'), findsOneWidget);
    await tester.pump(const Duration(seconds: 30));
    expect(h.uploads, isEmpty);
    expect(h.rec.cancelled, isFalse);
    expect(h.rec.file!.existsSync(), isTrue);
    await tester.tap(_send);
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(1));
    expect(Map.fromEntries((h.uploads.single.data as FormData).fields)['durationSec'], '180');
  });

  testWidgets('«إرسال» uploads kind=VOICE, durationSec=11 for 10.2 s, as audio/mp4', (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    h.rec.now = const Duration(milliseconds: 10200);
    await _tick(tester);
    await tester.tap(_send);
    await tester.pumpAndSettle();
    expect(h.rec.stopped, isTrue);
    expect(h.rec.disposed, isTrue);
    expect(h.uploads, hasLength(1));
    final form = h.uploads.single.data as FormData;
    final fields = Map.fromEntries(form.fields);
    expect(fields['kind'], 'VOICE');
    expect(fields['durationSec'], '11');
    expect(fields['clientNonce'], isNotNull);
    expect(form.files.single.value.filename, 'voice.m4a');
    expect(form.files.single.value.contentType.toString(), 'audio/mp4');
    // The bar is gone and the server copy replaced the sending bubble
    expect(_clock, findsNothing);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    expect(find.byType(ChatBubble), findsNWidgets(2));
  });

  testWidgets('«إلغاء» stops, deletes the file and sends nothing', (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    final file = h.rec.file!;
    expect(file.existsSync(), isTrue);
    await tester.tap(_cancel);
    await tester.pumpAndSettle();
    expect(h.rec.cancelled, isTrue);
    expect(h.rec.disposed, isTrue);
    expect(file.existsSync(), isFalse);
    expect(h.uploads, isEmpty);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
  });

  testWidgets('leaving the chat during the permission prompt: nothing records, nothing uploads, no setState',
      (tester) async {
    final h = _Harness();
    final answer = Completer<bool>();
    h.permission = () => answer.future;
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    expect(h.rec.asked, isTrue);
    await h.leave(tester);
    answer.complete(true);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(h.rec.started, isFalse);
    expect(h.rec.cancelled, isTrue);
    expect(h.rec.disposed, isTrue);
    expect(h.uploads, isEmpty);
  });

  testWidgets('while the microphone prompt is open the mic shows a spinner, not a dead button', (tester) async {
    final h = _Harness();
    final answer = Completer<bool>();
    h.permission = () => answer.future;
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    expect(find.byKey(const Key('chat-media-busy')), findsOneWidget);
    answer.complete(true);
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('chat-media-busy')), findsNothing);
    expect(_clock, findsOneWidget);
    await tester.tap(_cancel);
    await tester.pump();
  });

  testWidgets('the recorder fails to start: «تعذّر بدء التسجيل», released, nothing sent', (tester) async {
    final h = _Harness()..failStart = true;
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(find.text('تعذّر بدء التسجيل'), findsOneWidget);
    expect(h.rec.disposed, isTrue);
    expect(_clock, findsNothing);
    expect(h.uploads, isEmpty);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Pro lapses mid-recording: the microphone is released and the bar goes back', (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(_clock, findsOneWidget);
    h.isPro = false;
    h.container.invalidate(proStateProvider);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(_clock, findsNothing);
    expect(h.rec.cancelled, isTrue);
    expect(h.uploads, isEmpty);
  });

  testWidgets('leaving the chat mid-recording releases the microphone and deletes the file', (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    final file = h.rec.file!;
    await h.leave(tester);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(h.rec.cancelled, isTrue);
    expect(h.rec.disposed, isTrue);
    expect(file.existsSync(), isFalse);
    expect(h.uploads, isEmpty);
  });

  testWidgets('the chat ending mid-recording cancels the recording', (tester) async {
    final h = _Harness(pollInterval: const Duration(seconds: 1));
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(h.rec.started, isTrue);
    h.status = 'ENDED';
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    await tester.pump();
    expect(h.rec.cancelled, isTrue);
    expect(h.rec.disposed, isTrue);
    expect(_clock, findsNothing);
    expect(find.text('انتهت هذه المحادثة.'), findsOneWidget);
    await h.leave(tester);
  });

  testWidgets('not Pro: the mic is greyed with the «Pro» tag and opens the plans, never the recorder', (tester) async {
    final h = _Harness(isPro: false);
    await h.open(tester);
    await tester.pumpAndSettle();
    expect(_mic, findsOneWidget);
    await tester.tap(_mic);
    await tester.pumpAndSettle();
    expect(h.recorders, isEmpty);
    expect(find.text('pro-screen'), findsOneWidget);
  });

  testWidgets('a photo that failed with no answer is matched to its server copy by kind: shown once', (tester) async {
    final h = _Harness(pollInterval: const Duration(seconds: 1));
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse.network();
    await h.open(tester);
    await pickAndSendPhoto(tester);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    // The server did save it: the next poll brings «📷 صورة» (no nonce in the GET)
    h.serverExtra = [
      {
        'id': 'm002',
        'body': '📷 صورة',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'mine': true,
        'kind': 'IMAGE',
        'media': {'url': '/api/chats/c1/media/m002', 'type': 'image/jpeg', 'width': 1, 'height': 1},
      },
    ];
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('chat-failed-info')), findsNothing);
    expect(find.byType(ChatBubble), findsNWidgets(2));
    await h.leave(tester);
  });

  testWidgets('a failed photo is not matched to a server voice note, nor to a text message', (tester) async {
    final h = _Harness(pollInterval: const Duration(seconds: 1));
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse.network();
    await h.open(tester);
    await pickAndSendPhoto(tester);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    final now = DateTime.now().toUtc().toIso8601String();
    h.serverExtra = [
      {
        'id': 'm002',
        'body': '🎤 رسالة صوتية',
        'createdAt': now,
        'mine': true,
        'kind': 'VOICE',
        'media': {'url': '/api/chats/c1/media/m002', 'type': 'audio/mp4', 'durationSec': 3},
      },
      {'id': 'm003', 'body': '', 'createdAt': now, 'mine': true},
    ];
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    await h.leave(tester);
  });

  testWidgets('the app goes to the background at 12.4 s: recording stops and waits; send → durationSec 13',
      (tester) async {
    final h = _Harness();
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    h.rec.now = const Duration(milliseconds: 12400);
    await _tick(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    await tester.pump();
    expect(h.rec.stopped, isTrue);
    // The real clock would keep going: what was recorded stays frozen
    h.rec.now = const Duration(seconds: 90);
    // A paused app draws no frames: the bar is checked once it is back
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(const Duration(seconds: 5));
    expect(find.text('توقف التسجيل'), findsOneWidget);
    expect(find.text('بلغ التسجيل الحد الأقصى'), findsNothing);
    expect(find.descendant(of: _clock, matching: find.text('0:12')), findsOneWidget);
    expect(h.uploads, isEmpty);
    expect(h.rec.cancelled, isFalse);
    await tester.tap(_send);
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(1));
    final fields = Map.fromEntries((h.uploads.single.data as FormData).fields);
    expect(fields['kind'], 'VOICE');
    expect(fields['durationSec'], '13');
  });

  testWidgets('two photos, one sent and one failed with no answer: the failed one keeps its retry until its own copy arrives',
      (tester) async {
    // Tall enough that every bubble is built
    tester.view.physicalSize = const Size(800, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = _Harness(pollInterval: const Duration(seconds: 1));
    final gate = Completer<void>();
    var handled = 0;
    Map<String, dynamic>? sentCopy;
    h.adapter.handlers['POST /api/chats/c1/media'] = (r) {
      handled++;
      // The second photo goes through first; the first one (held) then gets no answer
      if (handled == 2) return const FakeResponse.network();
      final nonce = Map.fromEntries((r.data as FormData).fields)['clientNonce'];
      sentCopy = {
        'id': 'srv-$nonce',
        'body': '📷 صورة',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'mine': true,
        'kind': 'IMAGE',
        'media': {'url': '/api/chats/c1/media/srv-$nonce', 'type': 'image/jpeg', 'width': 1, 'height': 1},
      };
      return FakeResponse(200, {'message': sentCopy});
    };
    await h.open(tester);
    h.adapter.hold('POST', '/api/chats/c1/media', gate.future);
    await pickAndSendPhoto(tester);
    for (var i = 0; i < 5 && h.uploads.isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(h.uploads, hasLength(1));
    h.adapter.holds.clear();
    await pickAndSendPhoto(tester);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(sentCopy, isNotNull);
    gate.complete();
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    expect(find.byType(ChatBubble), findsNWidgets(3));
    // The server holds only the photo that was sent: the failed one keeps its retry
    h.serverExtra = [sentCopy!];
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    expect(find.byType(ChatBubble), findsNWidgets(3));
    // Its own copy turns up after all: shown once
    h.serverExtra = [
      sentCopy!,
      {
        'id': 'zz-late',
        'body': '📷 صورة',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'mine': true,
        'kind': 'IMAGE',
        'media': {'url': '/api/chats/c1/media/zz-late', 'type': 'image/jpeg', 'width': 1, 'height': 1},
      },
    ];
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('chat-failed-info')), findsNothing);
    expect(find.byType(ChatBubble), findsNWidgets(3));
    await h.leave(tester);
  });

  group('voice playback in the chat', () {
    const note = {
      'id': 'v001',
      'body': 'رسالة صوتية',
      'createdAt': '2026-10-30T10:01:00.000Z',
      'mine': false,
      'kind': 'VOICE',
      'media': {'url': '/api/chats/c1/media/v001', 'type': 'audio/mp4', 'durationSec': 7},
    };

    Future<void> play(WidgetTester tester) async {
      await tester.tap(find.byTooltip('تشغيل'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
    }

    void background(WidgetTester tester) {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    }

    void foreground(WidgetTester tester) {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    }

    testWidgets('a note playing pauses when the app goes to the background; leaving the chat disposes its player',
        (tester) async {
      final h = _Harness()..serverExtra = [note];
      await h.open(tester);
      await play(tester);
      expect(h.players.single.plays, 1);
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
      background(tester);
      await tester.pump();
      expect(h.players.single.pauses, 1);
      expect(find.byTooltip('تشغيل'), findsOneWidget);
      foreground(tester);
      await tester.pump();
      expect(h.players.single.plays, 1, reason: 'never resumes on its own');
      await h.leave(tester);
      await tester.pumpAndSettle();
      expect(h.players.single.disposed, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('starting a recording pauses the note playing, and nothing plays while recording', (tester) async {
      final h = _Harness()..serverExtra = [note];
      await h.open(tester);
      await play(tester);
      await tester.tap(_mic);
      await tester.pump();
      await tester.pump();
      expect(h.rec.started, isTrue);
      expect(h.players.single.pauses, 1);
      await tester.tap(find.byTooltip('تشغيل'));
      await tester.pump();
      expect(h.players.single.plays, 1);
      await tester.tap(_cancel);
      await tester.pump();
      await h.leave(tester);
    });

    testWidgets('Pro bought elsewhere: the counts poll sees it and the mic unlocks without leaving the chat',
        (tester) async {
      final h = _Harness(isPro: false);
      await h.open(tester);
      await tester.pumpAndSettle();
      final before = h.adapter.to('GET', '/api/pro').length;
      h.isPro = true;
      // The counts poll
      h.container.invalidate(countsProvider);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(h.adapter.to('GET', '/api/pro').length, greaterThan(before));
      await tester.tap(_mic);
      await tester.pump();
      await tester.pump();
      expect(h.recorders, hasLength(1), reason: 'the mic records now, no plans page');
      expect(find.text('pro-screen'), findsNothing);
      await tester.tap(_cancel);
      await tester.pump();
      await h.leave(tester);
    });

    testWidgets('Pro bought in the browser with nothing else changing: the open chat unlocks within a minute',
        (tester) async {
      final h = _Harness(isPro: false);
      await h.open(tester);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-mic-pro-tag')), findsOneWidget);
      h.isPro = true;
      await tester.pump(const Duration(seconds: 61));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(find.byKey(const Key('chat-mic-pro-tag')), findsNothing);
      // Unlocked: no more re-reads
      final reads = h.adapter.to('GET', '/api/pro').length;
      await tester.pump(const Duration(seconds: 61));
      expect(h.adapter.to('GET', '/api/pro').length, reads);
      await h.leave(tester);
    });

    testWidgets('back in the foreground the chat re-reads Pro once', (tester) async {
      final h = _Harness(isPro: false);
      await h.open(tester);
      await tester.pumpAndSettle();
      final before = h.adapter.to('GET', '/api/pro').length;
      h.isPro = true;
      background(tester);
      foreground(tester);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(h.adapter.to('GET', '/api/pro').length, before + 1);
      await tester.tap(_mic);
      await tester.pump();
      await tester.pump();
      expect(h.recorders, hasLength(1));
      await tester.tap(_cancel);
      await tester.pump();
      await h.leave(tester);
    });
  });

  testWidgets('a failed voice note\'s temporary file is deleted when the chat is left', (tester) async {
    final h = _Harness();
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse(500, {'error': 'خطأ'});
    await h.open(tester);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    h.rec.now = const Duration(seconds: 3);
    await _tick(tester);
    final file = h.rec.file!;
    await tester.tap(_send);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    expect(file.existsSync(), isTrue, reason: 'kept for the retry while the chat is open');
    await h.leave(tester);
    await tester.pumpAndSettle();
    expect(file.existsSync(), isFalse);
  });

  group('one voice playback per chat', () {
    Map<String, dynamic> voiceMsg(String id) => {
      'id': id,
      'body': 'رسالة صوتية',
      'createdAt': '2026-10-30T10:01:00.000Z',
      'mine': false,
      'kind': 'VOICE',
      'media': {'url': '/api/chats/c1/media/$id', 'type': 'audio/mp4', 'durationSec': 7},
    };

    testWidgets('a chat pushed on top (a notice) and popped leaves the first chat\'s notes and guard working',
        (tester) async {
      final h = _Harness()..serverExtra = [voiceMsg('v001')];
      h.adapter
        ..handlers['GET /api/chats/c2'] = ((_) => FakeResponse(200, {
              ..._page('ACTIVE', [voiceMsg('v002')]),
              'conversation': {..._page('ACTIVE')['conversation'] as Map<String, dynamic>, 'id': 'c2'},
            }))
        ..on('POST', '/api/chats/c2/read', const FakeResponse(200, {'ok': true}));
      await h.open(tester);
      unawaited(h.router.push('/chats/c2'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(find.byType(ChatRoomScreen), findsNWidgets(2));
      h.router.pop();
      await tester.pumpAndSettle();
      expect(find.byType(ChatRoomScreen), findsOneWidget);
      // A's note still plays
      await tester.tap(find.byTooltip('تشغيل'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(h.players, hasLength(1));
      expect(h.players.single.plays, 1);
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
      // A's guard still works: recording pauses the note and nothing plays meanwhile
      await tester.tap(_mic);
      await tester.pump();
      await tester.pump();
      expect(h.players.single.pauses, 1);
      await tester.tap(find.byTooltip('تشغيل'));
      await tester.pump();
      expect(h.players.single.plays, 1);
      await tester.tap(_cancel);
      await tester.pump();
      await h.leave(tester);
      await tester.pumpAndSettle();
    });

    testWidgets('my note played while sending carries on as the server copy; its file goes when the chat is left',
        (tester) async {
      final h = _Harness();
      final upload = Completer<void>();
      h.adapter.hold('POST', '/api/chats/c1/media', upload.future);
      await h.open(tester);
      await tester.tap(_mic);
      await tester.pump();
      await tester.pump();
      h.rec.now = const Duration(seconds: 4);
      await _tick(tester);
      final file = h.rec.file!;
      await tester.tap(_send);
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      // Still uploading: play the local copy
      await tester.tap(find.byTooltip('تشغيل'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(h.players.single.loadedUri, Uri.file(file.path));
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
      upload.complete();
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      // Confirmed: the server bubble shows the same note still playing, nothing new loaded, the file kept meanwhile
      expect(h.uploads, hasLength(1));
      expect(find.byTooltip('إيقاف مؤقت'), findsOneWidget);
      expect(h.players, hasLength(1));
      expect(h.players.single.disposed, isFalse);
      expect(file.existsSync(), isTrue);
      // Pause works through the new bubble
      await tester.tap(find.byTooltip('إيقاف مؤقت'));
      await tester.pump();
      expect(h.players.single.pauses, 1);
      await h.leave(tester);
      await tester.pumpAndSettle();
      expect(h.players.single.disposed, isTrue);
      expect(file.existsSync(), isFalse);
    });

    testWidgets('my note never played while sending: its file is deleted at once on confirm', (tester) async {
      final h = _Harness();
      await h.open(tester);
      await tester.tap(_mic);
      await tester.pump();
      await tester.pump();
      h.rec.now = const Duration(seconds: 4);
      await _tick(tester);
      final file = h.rec.file!;
      await tester.tap(_send);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(h.uploads, hasLength(1));
      expect(file.existsSync(), isFalse);
      await h.leave(tester);
    });
  });
}
