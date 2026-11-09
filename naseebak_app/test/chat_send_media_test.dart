import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';
import 'package:naseebak_app/features/chat/chat_media_picker.dart';

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
  _Harness({this.isPro = true, this.canBuy = true, this.status = 'ACTIVE'});
  bool isPro;
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
          'user': {...meJson(), 'appPayments': true},
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
        GoRoute(
          path: '/credits',
          builder: (_, s) => Scaffold(body: Text('credits:${s.uri.queryParameters['section']}')),
        ),
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

final _photo = find.byKey(const Key('chat-photo'));
final _proTag = find.byKey(const Key('chat-media-pro-tag'));

void main() {
  testWidgets('Pro in an active chat: the photo goes up as multipart IMAGE with the nonce, then the server copy shows',
      (tester) async {
    final h = _Harness();
    await h.open(tester);
    expect(_photo, findsOneWidget);
    expect(_proTag, findsNothing);
    await tester.tap(_photo);
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
  });

  testWidgets('a photo over 10 MB is refused in the app and nothing is sent', (tester) async {
    final h = _Harness()..pickedBytes = 10 * 1024 * 1024 + 1;
    await h.open(tester);
    await tester.tap(_photo);
    await tester.pump();
    expect(find.text('الصورة كبيرة جداً'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(h.uploads, isEmpty);
  });

  testWidgets('not Pro, payments on and can buy: greyed with a «Pro» tag that opens the plans section', (tester) async {
    final h = _Harness(isPro: false);
    await h.open(tester);
    expect(_proTag, findsOneWidget);
    await tester.tap(_proTag); // the tag (over the greyed button) opens the plans too
    await tester.pumpAndSettle();
    expect(h.picks, 0);
    expect(find.text('credits:pro'), findsOneWidget);
  });

  testWidgets('a test account (canBuy false, not Pro) sees no media buttons', (tester) async {
    final h = _Harness(isPro: false, canBuy: false);
    await h.open(tester);
    expect(_photo, findsNothing);
    expect(_proTag, findsNothing);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
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
    await tester.tap(_photo);
    await tester.pumpAndSettle();
    expect(find.text('إعادة الإرسال'), findsOneWidget);
    h.adapter.handlers['POST /api/chats/c1/media'] = ok;
    await tester.tap(find.text('إعادة الإرسال'));
    await tester.pumpAndSettle();
    expect(h.uploads, hasLength(2));
    String nonceOf(RequestOptions r) => Map.fromEntries((r.data as FormData).fields)['clientNonce']!;
    expect(nonceOf(h.uploads[1]), nonceOf(h.uploads[0]));
    expect(h.picks, 1); // the retry reuses the picked file
    expect(find.text('إعادة الإرسال'), findsNothing);
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
    await tester.tap(_photo);
    await tester.pumpAndSettle();
    expect(find.text('إرسال الصور متاح لأعضاء Pro'), findsOneWidget);
    expect(h.adapter.to('GET', '/api/pro').length, greaterThan(proReads));
    expect(h.adapter.to('GET', '/api/me/counts').length, greaterThan(countReads));
    // The buttons follow: greyed with the «Pro» tag
    expect(_proTag, findsOneWidget);
  });

  testWidgets('leaving the chat mid-upload: no setState after dispose', (tester) async {
    final h = _Harness();
    final gate = Completer<void>();
    h.adapter.hold('POST', '/api/chats/c1/media', gate.future);
    await h.open(tester);
    await tester.tap(_photo);
    for (var i = 0; i < 10 && h.uploads.isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(h.uploads, hasLength(1));
    await tester.pumpWidget(UncontrolledProviderScope(container: h.container, child: const SizedBox()));
    gate.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('the credits screen opened for Pro scrolls to the plans section', (tester) async {
    tester.view.physicalSize = const Size(420, 500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter()
      ..handlers['GET /api/mobile/me'] = ((_) => FakeResponse(200, {
            'user': {...meJson(), 'appPayments': true},
          }))
      ..on('GET', '/api/payments/plans', const FakeResponse(200, {'country': 'JO', 'purchasesEnabled': true, 'packages': []}))
      ..on('GET', '/api/pro', FakeResponse(200, {
            ..._pro(),
            'offers': [
              {'id': 'monthly', 'price': 4, 'currency': 'JOD', 'chargeCurrency': 'usd', 'chargeAmount': 564, 'credits': 5, 'interval': 'month'},
            ],
          }))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(const CreditsScreen(scrollToPro: true)),
    ));
    await tester.pumpAndSettle();
    final top = tester.getTopLeft(find.byKey(const Key('pro-section'))).dy;
    expect(top, lessThan(200)); // brought up to the top of the screen
    final list = tester.state<ScrollableState>(find.byType(Scrollable).first);
    expect(list.position.pixels, greaterThan(0));
  });
}
