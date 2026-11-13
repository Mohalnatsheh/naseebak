import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_media_picker.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';

import 'helpers/chat_room_helpers.dart' show openFailed, pickFromGallery;
import 'helpers/fake_api.dart';

/// A 1×1 PNG (the bubble shows the local file while it sends)
const _png = [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, //
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49,
  0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

Map<String, dynamic> _conv(String status) => {
      'id': 'c1',
      'matchId': 'x1',
      'partner': {'id': 'p1', 'firstName': 'عمر'},
      'status': status,
      'expiresAt': '2099-01-01T00:00:00.000Z',
    };

Map<String, dynamic> _page(String status) => {
      'conversation': _conv(status),
      'messages': [
        {'id': 'm001', 'body': 'السلام عليكم', 'createdAt': '2026-10-30T10:00:00.000Z', 'mine': false},
      ],
      'hasMore': false,
      'chatEnabled': true,
    };

Map<String, dynamic> _pro({bool isPro = false, bool canBuy = true}) =>
    {'enabled': true, 'isPro': isPro, 'cancelAtPeriodEnd': false, 'pastDue': false, 'canBuy': canBuy, 'offers': []};

class _Harness {
  _Harness({this.isPro = true, this.canBuy = true, this.status = 'ACTIVE', this.appPayments = true});
  bool isPro;
  bool appPayments;
  bool canBuy;
  String status;
  late final File photo = () {
    final dir = Directory.systemTemp.createTempSync('chat_media_test');
    addTearDown(() => dir.deleteSync(recursive: true));
    return File('${dir.path}/picked.jpg')..writeAsBytesSync(_png);
  }();
  int pickedBytes = _png.length;
  int picks = 0;

  late final FakeAdapter adapter = FakeAdapter()
    ..handlers['GET /api/mobile/me'] = ((_) => FakeResponse(200, {
          'user': {...meJson(), 'appPayments': appPayments},
        }))
    ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
    ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}))
    ..handlers['GET /api/chats/c1'] = ((_) => FakeResponse(200, _page(status)))
    ..handlers['GET /api/pro'] = ((_) => FakeResponse(200, _pro(isPro: isPro, canBuy: canBuy)))
    ..handlers['GET /api/me/counts'] = ((_) => FakeResponse(200, {
          'flags': {},
          'pro': {'isPro': isPro},
        }))
    ..handlers['POST /api/chats/c1/media'] = ((r) {
      final nonce = (r.data as FormData).fields.firstWhere((f) => f.key == 'clientNonce').value;
      return FakeResponse(200, {
        'message': {
          'id': 'srv-$nonce',
          'body': '📷 صورة',
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'mine': true,
          'kind': 'IMAGE',
          'media': {'url': '/api/chats/c1/media/srv', 'type': 'image/jpeg', 'width': 1, 'height': 1},
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
        picks++;
        return PickedPhoto(path: photo.path, bytes: pickedBytes);
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
        GoRoute(
          path: '/chats/c1',
          builder: (_, _) => const ChatRoomScreen(chatId: 'c1', pollInterval: Duration(hours: 1)),
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
    await tester.pumpAndSettle();
  }

  List<RequestOptions> get uploads => adapter.to('POST', '/api/chats/c1/media');
}

final _photo = find.byKey(const Key('chat-attach'));
final _proTag = find.byKey(const Key('chat-media-pro-tag'));

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
  testWidgets('Pro in an active chat: the photo goes up as multipart IMAGE with the nonce, then the server copy shows',
      (tester) async {
    final h = _Harness();
    await h.open(tester);
    expect(_photo, findsOneWidget);
    expect(_proTag, findsNothing);
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(1));
    final req = h.uploads.single;
    final form = req.data as FormData;
    expect(Map.fromEntries(form.fields)['kind'], 'IMAGE');
    final nonce = Map.fromEntries(form.fields)['clientNonce'];
    expect(nonce, isNotNull);
    expect(form.fields.any((f) => f.key == 'durationSec'), isFalse);
    final file = form.files.single;
    expect(file.key, 'file');
    expect(file.value.filename, 'photo.jpg');
    expect(file.value.contentType.toString(), 'image/jpeg');
    expect(req.sendTimeout, const Duration(seconds: 120));
    expect(req.receiveTimeout, const Duration(seconds: 120));
    expect(req.contentType, startsWith('multipart/form-data'));
    // One bubble: the optimistic one was replaced by the server's
    final cached = (await h.container.read(chatCacheProvider).read('u1', 'c1'))!;
    expect(cached.messages.map((m) => m.id), ['m001', 'srv-$nonce']);
    // The picker's copy is deleted once the server has the photo
    expect(h.photo.existsSync(), isFalse);
  });

  testWidgets('sending a photo with the keyboard open: the keyboard closes and stays closed (TestFlight report)',
      (tester) async {
    final h = _Harness();
    await h.open(tester);
    final hides = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.textInput, (call) async {
      if (call.method == 'TextInput.hide') hides.add(call.method);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.textInput, null));
    // The composer focused: the keyboard is up
    await tester.tap(find.byKey(const Key('chat-input')));
    await tester.pump();
    final field = tester.widget<TextField>(find.byKey(const Key('chat-input')));
    expect(field.focusNode!.hasFocus, isTrue);
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(1));
    // Nothing is left focused under the picker and preview, and the keyboard is told to go
    expect(field.focusNode!.hasFocus, isFalse);
    expect(hides, isNotEmpty);
  });

  testWidgets('a photo over 10 MB is refused in the app and nothing is sent', (tester) async {
    final h = _Harness()..pickedBytes = 10 * 1024 * 1024 + 1;
    await h.open(tester);
    await pickFromGallery(tester);
    await tester.pump();
    expect(find.text('الصورة كبيرة جداً'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(h.uploads, isEmpty);
  });

  testWidgets('not Pro, payments on and can buy: greyed with a «Pro» tag that opens the Pro screen', (tester) async {
    final h = _Harness(isPro: false);
    await h.open(tester);
    expect(_proTag, findsOneWidget);
    await tester.tap(_proTag); // the tag (over the greyed button) opens the plans too
    await tester.pumpAndSettle();
    expect(h.picks, 0);
    expect(find.text('pro-screen'), findsOneWidget);
  });

  testWidgets('a test account (canBuy false, not Pro) sees no media buttons', (tester) async {
    final h = _Harness(isPro: false, canBuy: false);
    await h.open(tester);
    expect(_photo, findsNothing);
    expect(_proTag, findsNothing);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
  });

  testWidgets('a test account (app payments off) that can buy sees no greyed buttons', (tester) async {
    final h = _Harness(isPro: false, appPayments: false);
    await h.open(tester);
    expect(_photo, findsNothing);
    expect(_proTag, findsNothing);
  });

  testWidgets('a Pro test account (app payments off) can still send a photo', (tester) async {
    final h = _Harness(appPayments: false, canBuy: false);
    await h.open(tester);
    expect(_photo, findsOneWidget);
    expect(_proTag, findsNothing);
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(1));
  });

  testWidgets('an ENDED chat shows no media buttons, even for Pro', (tester) async {
    final h = _Harness(status: 'ENDED');
    await h.open(tester);
    expect(_photo, findsNothing);
    expect(_proTag, findsNothing);
  });

  testWidgets('a failed upload keeps the bubble with retry, and retry sends the same nonce', (tester) async {
    final h = _Harness();
    final ok = h.adapter.handlers['POST /api/chats/c1/media']!;
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse.network();
    await h.open(tester);
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    h.adapter.handlers['POST /api/chats/c1/media'] = ok;
    await openFailed(tester);
    await tester.tap(find.byKey(const Key('failed-retry')));
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(2));
    String nonceOf(RequestOptions r) => Map.fromEntries((r.data as FormData).fields)['clientNonce']!;
    expect(nonceOf(h.uploads[1]), nonceOf(h.uploads[0]));
    expect(h.picks, 1); // the retry reuses the picked file
    expect(find.byKey(const Key('chat-failed-info')), findsNothing);
  });

  testWidgets('PRO_REQUIRED: the bubble fails with the server message and the Pro state reloads', (tester) async {
    final h = _Harness();
    await h.open(tester);
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) {
      // Pro lapsed meanwhile
      h.isPro = false;
      return const FakeResponse(403, {'error': 'إرسال الصور متاح لأعضاء Pro', 'code': 'PRO_REQUIRED'});
    };
    final proReads = h.adapter.to('GET', '/api/pro').length;
    final countReads = h.adapter.to('GET', '/api/me/counts').length;
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(find.text('إرسال الصور متاح لأعضاء Pro'), findsOneWidget);
    expect(h.adapter.to('GET', '/api/pro').length, greaterThan(proReads));
    expect(h.adapter.to('GET', '/api/me/counts').length, greaterThan(countReads));
    // The buttons follow: greyed with the «Pro» tag
    expect(_proTag, findsOneWidget);
    // Resending can't work: no «إعادة المحاولة» in the ⓘ sheet, a link to «عضوية Pro» instead
    await openFailed(tester);
    expect(find.byKey(const Key('failed-retry')), findsNothing);
    expect(find.byKey(const Key('chat-failed-delete')), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('chat-failed-pro')));
    await tester.pumpAndSettle();
    expect(find.text('pro-screen'), findsOneWidget);
  });

  testWidgets('PRO_REQUIRED for a member who can\'t buy: the message alone, no retry, no link', (tester) async {
    final h = _Harness(canBuy: false);
    await h.open(tester);
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) {
      h.isPro = false;
      return const FakeResponse(403, {'error': 'إرسال الصور متاح لأعضاء Pro', 'code': 'PRO_REQUIRED'});
    };
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(find.text('إرسال الصور متاح لأعضاء Pro'), findsOneWidget);
    await openFailed(tester);
    expect(find.byKey(const Key('failed-retry')), findsNothing);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-failed-pro')), findsNothing);
  });

  testWidgets('leaving the chat mid-upload: no setState after dispose', (tester) async {
    final h = _Harness();
    final gate = Completer<void>();
    h.adapter.hold('POST', '/api/chats/c1/media', gate.future);
    await h.open(tester);
    await pickAndSendPhoto(tester);
    for (var i = 0; i < 10 && h.uploads.isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(h.uploads, hasLength(1));
    await tester.pumpWidget(UncontrolledProviderScope(container: h.container, child: const SizedBox()));
    gate.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a retry whose file the phone has removed drops the bubble with a line, and sends nothing', (tester) async {
    final h = _Harness();
    h.adapter.handlers['POST /api/chats/c1/media'] = (_) => const FakeResponse.network();
    await h.open(tester);
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    h.photo.deleteSync();
    await openFailed(tester);
    await tester.tap(find.byKey(const Key('failed-retry')));
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(1));
    expect(find.byKey(const Key('chat-failed-info')), findsNothing);
    expect(find.text(mediaFileGoneText), findsOneWidget);
  });

  testWidgets('a chat photo is decoded at the bubble size; the full-screen viewer gets the full image', (tester) async {
    final h = _Harness();
    await h.open(tester);
    await pickAndSendPhoto(tester);
    await tester.pumpAndSettle();
    final bubble = tester.widget<Image>(find.descendant(of: find.byType(PhotoBubble), matching: find.byType(Image)));
    expect(bubble.image, isA<ResizeImage>());
    expect((bubble.image as ResizeImage).width, lessThanOrEqualTo(240 * 3));
    await tester.tap(find.byType(PhotoBubble));
    await tester.pumpAndSettle();
    final full = tester.widget<Image>(find.descendant(of: find.byType(PhotoViewer), matching: find.byType(Image)));
    expect(full.image, isNot(isA<ResizeImage>()));
    // ✕ at the end side: the left half in Arabic
    final close = tester.getCenter(find.byKey(const Key('photo-viewer-close')));
    expect(close.dx, lessThan(tester.getSize(find.byType(PhotoViewer)).width / 2));
    await tester.tap(find.byKey(const Key('photo-viewer-close')));
    await tester.pumpAndSettle();
    expect(find.byType(PhotoViewer), findsNothing);
  });
}
