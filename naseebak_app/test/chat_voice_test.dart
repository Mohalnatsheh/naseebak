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
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_media_picker.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/voice_recorder.dart';

import 'helpers/fake_api.dart';

/// The microphone in tests: a real temp file, a clock the test sets, and a record of what the screen asked for.
class FakeRecorder implements VoiceRecorder {
  FakeRecorder(this.dir, this.permission);
  final Directory dir;
  final Future<bool> Function() permission;
  Duration now = Duration.zero;
  bool asked = false;
  bool started = false;
  bool stopped = false;
  bool cancelled = false;
  bool disposed = false;
  File? file;

  @override
  Future<bool> hasPermission() {
    asked = true;
    return permission();
  }

  @override
  Future<void> start() async {
    started = true;
    file = File('${dir.path}/voice-${DateTime.now().microsecondsSinceEpoch}.m4a')..writeAsBytesSync([0, 1, 2, 3]);
  }

  @override
  Duration get elapsed => now;

  @override
  Future<String?> stop() async {
    stopped = true;
    return file?.path;
  }

  @override
  Future<void> cancel() async {
    cancelled = true;
    final f = file;
    if (f != null && f.existsSync()) f.deleteSync();
  }

  @override
  Future<void> dispose() async => disposed = true;
}

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
  final recorders = <FakeRecorder>[];
  FakeRecorder get rec => recorders.single;

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
        final r = FakeRecorder(dir, permission);
        recorders.add(r);
        return r;
      }),
    ]);
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    final router = GoRouter(
      initialLocation: '/chats/c1',
      routes: [
        GoRoute(path: '/chats/c1', builder: (_, _) => ChatRoomScreen(chatId: 'c1', pollInterval: pollInterval)),
        GoRoute(path: '/credits', builder: (_, s) => Scaffold(body: Text('credits:${s.uri.queryParameters['section']}'))),
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

void main() {
  test('durationSec: rounded up, at least 1', () {
    expect(voiceDurationSec(const Duration(milliseconds: 10200)), 11);
    expect(voiceDurationSec(const Duration(seconds: 10)), 10);
    expect(voiceDurationSec(const Duration(milliseconds: 300)), 1);
    expect(voiceDurationSec(Duration.zero), 1);
  });

  testWidgets('the microphone refused: the SnackBar shows and nothing records', (tester) async {
    final h = _Harness()..permission = () async => false;
    await h.open(tester);
    expect(_mic, findsOneWidget);
    await tester.tap(_mic);
    await tester.pump();
    await tester.pump();
    expect(find.text('يمكنك السماح باستخدام الميكروفون من إعدادات الهاتف لإرسال رسالة صوتية'), findsOneWidget);
    expect(h.rec.asked, isTrue);
    expect(h.rec.started, isFalse);
    expect(h.rec.disposed, isTrue);
    expect(_clock, findsNothing);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
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
    expect(h.rec.disposed, isTrue);
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
    expect(find.text('credits:pro'), findsOneWidget);
  });

  testWidgets('a photo that failed with no answer is matched to its server copy by kind: shown once', (tester) async {
    final h = _Harness(pollInterval: const Duration(seconds: 1));
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse.network();
    await h.open(tester);
    await tester.tap(find.byKey(const Key('chat-photo')));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.text('إعادة الإرسال'), findsOneWidget);
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
    expect(find.text('إعادة الإرسال'), findsNothing);
    expect(find.byType(ChatBubble), findsNWidgets(2));
    await h.leave(tester);
  });

  testWidgets('a failed photo is not matched to a server voice note, nor to a text message', (tester) async {
    final h = _Harness(pollInterval: const Duration(seconds: 1));
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse.network();
    await h.open(tester);
    await tester.tap(find.byKey(const Key('chat-photo')));
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
    expect(find.text('إعادة الإرسال'), findsOneWidget);
    await h.leave(tester);
  });
}
