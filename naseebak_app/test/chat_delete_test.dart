// Pro chat delete (2026-11-11): «حذف لديّ» / «حذف لدى الجميع» on a message, «مسح المحادثة» (لديّ / لدى الجميع) in
// the header. Nothing is erased on the server; a message deleted for everyone reads «تم حذف الرسالة» for both.
import 'dart:async';
import 'dart:convert';

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
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';
import 'package:naseebak_app/features/pro/pro_repository.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/fake_api.dart';

/// Live events the test pushes (Ably's SSE in the app)
class _FakeLive extends ChatLive {
  _FakeLive(super.api);
  final controller = StreamController<ChatLiveEvent>.broadcast();

  @override
  Stream<ChatLiveEvent> events(String chatId, {void Function(bool connected)? connected}) {
    scheduleMicrotask(() => connected?.call(true));
    return controller.stream;
  }
}

Map<String, dynamic> _pro({required bool isPro, required bool canBuy}) =>
    {'enabled': true, 'isPro': isPro, 'cancelAtPeriodEnd': false, 'pastDue': false, 'canBuy': canBuy, 'offers': []};

class _Room {
  _Room({
    this.isPro = true,
    this.canBuy = true,
    this.appPayments = true,
    this.deleteEnabled = true,
    this.status = 'ACTIVE',
    List<Map<String, dynamic>>? messages,
    this.withLive = false,
  }) : messages = messages ?? [msg(1), msg(2, mine: true)];

  bool isPro;
  bool canBuy;
  bool appPayments;
  bool deleteEnabled;
  String status;
  List<Map<String, dynamic>> messages;
  final bool withLive;
  bool hasMore = false;
  String? clearedBefore;

  /// What a poll (`?after=`) answers with
  List<Map<String, dynamic>> pollMessages = const [];
  List<String>? deletedIds;
  List<String>? hiddenIds;
  List<Map<String, dynamic>>? reactionUpdates;

  /// Answers to the delete and clear routes
  FakeResponse deleteAnswer = const FakeResponse(200, {'ok': true});
  FakeResponse clearAnswer = const FakeResponse(200, {'clearedBefore': '2026-10-30T12:00:00.000Z'});

  final MemoryChatCache cache = MemoryChatCache();
  _FakeLive? live;
  late final ProviderContainer container;

  Map<String, dynamic> get _conv => {...conv, 'status': status};

  late final FakeAdapter adapter = FakeAdapter()
    ..handlers['GET /api/mobile/me'] = ((_) => FakeResponse(200, {
          'user': {...meJson(), 'appPayments': appPayments},
        }))
    ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
    ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}))
    ..handlers['GET /api/pro'] = ((_) => FakeResponse(200, _pro(isPro: isPro, canBuy: canBuy)))
    ..handlers['GET /api/me/counts'] = ((_) => FakeResponse(200, {
          'flags': {},
          'pro': {'isPro': isPro},
        }))
    ..handlers['GET /api/chats/c1'] = ((r) {
      final poll = r.queryParameters.containsKey('after');
      // An older page: nothing more (the device copy holds the rest)
      final older = r.queryParameters.containsKey('before');
      return FakeResponse(200, {
        'conversation': _conv,
        'messages': poll ? pollMessages : (older ? const [] : messages),
        'hasMore': !poll && !older && hasMore,
        'chatEnabled': true,
        'deleteEnabled': deleteEnabled,
        'clearedBefore': clearedBefore,
        'polledAt': '2026-10-30T11:00:00.000Z',
        if (poll && deletedIds != null) 'deletedIds': deletedIds,
        if (poll && hiddenIds != null) 'hiddenIds': hiddenIds,
        if (poll && reactionUpdates != null) 'reactionUpdates': reactionUpdates,
      });
    })
    ..handlers['POST /api/chats/c1/clear'] = ((_) => clearAnswer);

  Future<void> open(WidgetTester tester) async {
    for (final m in messages) {
      adapter.handlers['POST /api/chats/c1/messages/${m['id']}/delete'] = (_) => deleteAnswer;
    }
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    if (withLive) live = _FakeLive(fakeClient(adapter));
    container = ProviderContainer(overrides: [
      ...overrides,
      chatCacheProvider.overrideWithValue(cache),
      if (live != null) chatLiveProvider.overrideWith((ref) => live!),
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

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
    await tester.pump(const Duration(milliseconds: 100));
  }

  List<RequestOptions> deletes(String id) => adapter.to('POST', '/api/chats/c1/messages/$id/delete');
  List<RequestOptions> get clears => adapter.to('POST', '/api/chats/c1/clear');
  int get deleteRequests =>
      adapter.requests.where((r) => r.method == 'POST' && (r.path.endsWith('/delete') || r.path.endsWith('/clear'))).length;
}

final _delete = find.byKey(const Key('menu-delete'));
final _deleteMe = find.byKey(const Key('menu-delete-me'));
final _deleteAll = find.byKey(const Key('menu-delete-everyone'));

/// A message of theirs quoting [id] with the snippet [snippet]
Map<String, dynamic> _quoting(int n, String id, String snippet) => {
      ...msg(n),
      'replyTo': {'id': id, 'mine': true, 'kind': 'TEXT', 'snippet': snippet},
    };

/// Selects the message, then the bar's «حذف»: the choice dialog (or, not Pro, the Pro screen)
Future<void> _menuOn(WidgetTester tester, String text) async {
  await _select(tester, text);
  await tester.tap(_delete);
  await tester.pumpAndSettle();
}

/// A long-press: the selection bar
Future<void> _select(WidgetTester tester, String text) async {
  await tester.longPress(find.text(text));
  await tester.pumpAndSettle();
}

Future<void> _openClear(WidgetTester tester) async {
  await tester.tap(find.byTooltip('خيارات'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('مسح المحادثة'));
  await tester.pumpAndSettle();
}

ChatMessage _m(String id, {int minute = 0, bool mine = false, SendState state = SendState.sent, ReplyQuote? replyTo}) =>
    ChatMessage(
      id: id,
      body: 'نص $id',
      createdAt: chatT0.add(Duration(minutes: minute)),
      mine: mine,
      state: state,
      replyTo: replyTo,
      reactions: const [ChatReaction(emoji: '❤️', mine: false)],
    );

void main() {
  group('helpers (same rules as the website)', () {
    test('applyDeletions: the trace in place, quotes of it read as the trace; unknown ids change nothing', () {
      final list = [
        _m('a', minute: 1),
        _m('b', minute: 2, replyTo: const ReplyQuote(id: 'a', mine: false, kind: MessageKind.image, snippet: '📷 صورة')),
      ];
      final out = applyDeletions(list, ['a']);
      expect(out.first.deleted, isTrue);
      expect(out.first.body, deletedTrace);
      expect(out.first.kind, MessageKind.text);
      expect(out.first.media, isNull);
      expect(out.first.replyTo, isNull);
      expect(out.first.reactions, isEmpty);
      expect(out[1].replyTo!.snippet, deletedTrace);
      expect(out[1].replyTo!.kind, MessageKind.text);
      expect(out[1].deleted, isFalse);
      // Nothing loaded is named: the same list back
      expect(identical(applyDeletions(list, ['zz']), list), isTrue);
      expect(identical(applyDeletions(list, const []), list), isTrue);
    });

    test('dropHidden: hidden ids and everything at or before the clear point go, sends on their way stay', () {
      final list = [
        _m('a', minute: 1),
        _m('b', minute: 2),
        _m('c', minute: 3, replyTo: const ReplyQuote(id: 'b', mine: false, kind: MessageKind.text, snippet: 'نص b')),
        _m('local-1', minute: 0, mine: true, state: SendState.sending),
      ];
      final hidden = dropHidden(list, ['b'], null);
      expect(hidden.map((m) => m.id), ['a', 'c', 'local-1']);
      expect(hidden[1].replyTo!.snippet, deletedTrace);
      final cleared = dropHidden(list, const [], chatT0.add(const Duration(minutes: 2)));
      expect(cleared.map((m) => m.id), ['c', 'local-1']);
      expect(identical(dropHidden(list, ['zz'], chatT0), list), isTrue);
      expect(identical(dropHidden(list, const [], null), list), isTrue);
    });

    test('entry mode: Pro uses, a buyer gets the upsell, nothing without the switch, payments or a way to buy', () {
      expect(deleteModeOf(deleteEnabled: true, appPayments: true, isPro: true, canBuy: false), DeleteMode.use);
      expect(deleteModeOf(deleteEnabled: true, appPayments: true, isPro: false, canBuy: true), DeleteMode.upsell);
      expect(deleteModeOf(deleteEnabled: true, appPayments: true, isPro: false, canBuy: false), DeleteMode.hidden);
      expect(deleteModeOf(deleteEnabled: true, appPayments: false, isPro: true, canBuy: true), DeleteMode.hidden);
      expect(deleteModeOf(deleteEnabled: false, appPayments: true, isPro: true, canBuy: true), DeleteMode.hidden);
    });
  });

  group('selection bar delete', () {
    testWidgets('delete from the bar: the choice dialog; «حذف لديّ» sends scope me; not Pro opens /pro', (tester) async {
      final r = _Room();
      await r.open(tester);
      await _select(tester, 'رسالة 1');
      expect(find.byKey(const Key('menu-delete-locked')), findsNothing);
      await tester.tap(_delete);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.byKey(const Key('selection-close')), findsNothing);
      await tester.tap(_deleteMe);
      await tester.pumpAndSettle();
      expect((r.deletes('m001').single.data as Map)['scope'], 'me');
      expect(find.text('رسالة 1'), findsNothing);

      r.isPro = false;
      r.container.invalidate(proStateProvider);
      await tester.pumpAndSettle();
      await _select(tester, 'رسالة 2');
      expect(find.byKey(const Key('menu-delete-locked')), findsOneWidget);
      await tester.tap(_delete);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('pro-screen'), findsOneWidget);
      expect(r.deletes('m002'), isEmpty);
    });

    testWidgets('Pro, my message: «حذف لديّ» and «حذف لدى الجميع»', (tester) async {
      final r = _Room();
      await r.open(tester);
      await _menuOn(tester, 'رسالة 2');
      expect(find.text('حذف الرسالة؟'), findsOneWidget);
      expect(_deleteMe, findsOneWidget);
      expect(_deleteAll, findsOneWidget);
      expect(find.text('حذف لديّ'), findsOneWidget);
      expect(find.text('حذف لدى الجميع'), findsOneWidget);
      // «إلغاء»: nothing sent, the selection already closed
      await tester.tap(find.text('إلغاء'));
      await tester.pumpAndSettle();
      expect(r.deleteRequests, 0);
      expect(find.byKey(const Key('selection-close')), findsNothing);
    });

    testWidgets('the other person\'s message: «حذف لديّ» only', (tester) async {
      final r = _Room();
      await r.open(tester);
      await _select(tester, 'رسالة 1');
      expect(find.byKey(const Key('selection-more')), findsOneWidget);
      await tester.tap(_delete);
      await tester.pumpAndSettle();
      expect(_deleteMe, findsOneWidget);
      expect(_deleteAll, findsNothing);
    });

    testWidgets('app payments off (test / review account): no delete entries and no «مسح المحادثة»', (tester) async {
      final r = _Room(appPayments: false);
      await r.open(tester);
      await _select(tester, 'رسالة 2');
      expect(_delete, findsNothing);
      await tester.tap(find.byKey(const Key('selection-close')));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      expect(find.text('مسح المحادثة'), findsNothing);
    });

    testWidgets('not Pro and can\'t buy (Lebanon before sales): no delete entries', (tester) async {
      final r = _Room(isPro: false, canBuy: false);
      await r.open(tester);
      await _select(tester, 'رسالة 2');
      expect(_delete, findsNothing);
    });

    testWidgets('the switch off: no delete entries', (tester) async {
      final r = _Room(deleteEnabled: false);
      await r.open(tester);
      await _select(tester, 'رسالة 2');
      expect(_delete, findsNothing);
    });

    testWidgets('a closed chat: «حذف لديّ» only, even on my message', (tester) async {
      final r = _Room(status: 'ENDED');
      await r.open(tester);
      await _menuOn(tester, 'رسالة 2');
      expect(_deleteMe, findsOneWidget);
      expect(_deleteAll, findsNothing);
    });
  });

  group('upsell', () {
    testWidgets('not Pro: «حذف» carries the gold lock and opens the Pro screen, no dialog, no request', (tester) async {
      final r = _Room(isPro: false);
      await r.open(tester);
      await _select(tester, 'رسالة 1');
      expect(find.byKey(const Key('menu-delete-locked')), findsOneWidget);
      await tester.tap(_delete);
      await tester.pumpAndSettle();
      expect(_deleteMe, findsNothing);
      expect(find.text('pro-screen'), findsOneWidget);
      expect(r.deleteRequests, 0);
    });

    testWidgets('not Pro: «مسح المحادثة» opens the Pro screen, no request', (tester) async {
      final r = _Room(isPro: false);
      await r.open(tester);
      await _openClear(tester);
      expect(find.text('pro-screen'), findsOneWidget);
      expect(r.deleteRequests, 0);
    });

    testWidgets('PRO_REQUIRED: reverted, the server message shows, the Pro state is read again', (tester) async {
      final r = _Room()
        ..deleteAnswer = const FakeResponse(403, {'error': 'حذف الرسائل ومسح المحادثة متاح لأعضاء Pro', 'code': 'PRO_REQUIRED'});
      await r.open(tester);
      final proReads = r.adapter.to('GET', '/api/pro').length;
      await _menuOn(tester, 'رسالة 1');
      await tester.tap(_deleteMe);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsOneWidget);
      expect(find.text('حذف الرسائل ومسح المحادثة متاح لأعضاء Pro'), findsOneWidget);
      expect(r.adapter.to('GET', '/api/pro').length, greaterThan(proReads));
    });

    testWidgets('PRO_REQUIRED on «حذف لدى الجميع»: the message and the quotes of it come back as they were',
        (tester) async {
      final r = _Room(messages: [msg(1), msg(2, mine: true), _quoting(3, 'm002', 'نص الأصل')])
        ..deleteAnswer = const FakeResponse(403, {'error': 'حذف الرسائل ومسح المحادثة متاح لأعضاء Pro', 'code': 'PRO_REQUIRED'});
      await r.open(tester);
      await _menuOn(tester, 'رسالة 2');
      await tester.tap(_deleteAll);
      await tester.pumpAndSettle();
      expect(r.deletes('m002'), hasLength(1));
      expect(find.text('رسالة 2'), findsOneWidget);
      expect(find.text('نص الأصل'), findsOneWidget);
      expect(find.text(deletedTrace), findsNothing);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages.firstWhere((m) => m.id == 'm003').replyTo!.snippet, 'نص الأصل');
      expect(saved.messages.firstWhere((m) => m.id == 'm002').deleted, isFalse);
    });
  });

  group('room', () {
    testWidgets('«حذف لدى الجميع» in the one dialog sends at once (no second confirm), then the trace for me',
        (tester) async {
      final r = _Room();
      await r.open(tester);
      await _select(tester, 'رسالة 2');
      await tester.tap(find.byKey(const Key('menu-delete')));
      await tester.pumpAndSettle();
      // The one dialog says what each choice does (as on the website)
      expect(find.text('يمكنك حذفها من عندك فقط، أو لديك ولدى الطرف الآخر.'), findsOneWidget);
      expect(r.deleteRequests, 0);
      await tester.tap(_deleteAll);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('delete-confirm')), findsNothing);
      expect((r.deletes('m002').single.data as Map)['scope'], 'everyone');
      expect(find.text('رسالة 2'), findsNothing);
      expect(find.byKey(const Key('chat-deleted-trace')), findsOneWidget);
      expect(find.text(deletedTrace), findsOneWidget);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages.last.deleted, isTrue);
      expect(saved.messages.last.body, deletedTrace);
    });

    testWidgets('«حذف لديّ»: gone at once, scope me; a refusal brings it back with the server message', (tester) async {
      final r = _Room(messages: [msg(1), msg(2, mine: true), _quoting(3, 'm001', 'نص الأصل')])
        ..deleteAnswer = const FakeResponse(403, {'error': 'لا يمكن حذف هذه الرسالة', 'code': 'NOT_ALLOWED'});
      await r.open(tester);
      await _menuOn(tester, 'رسالة 1');
      await tester.tap(_deleteMe);
      await tester.pumpAndSettle();
      expect((r.deletes('m001').single.data as Map)['scope'], 'me');
      expect(find.text('رسالة 1'), findsOneWidget);
      expect(find.text('لا يمكن حذف هذه الرسالة'), findsOneWidget);
      // The quote of it reads its own text again, on screen and in the device copy
      expect(find.text('نص الأصل'), findsOneWidget);
      expect(find.text(deletedTrace), findsNothing);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id), ['m001', 'm002', 'm003']);
      expect(saved.messages.last.replyTo!.snippet, 'نص الأصل');
    });

    testWidgets('«حذف لديّ» that works: the message leaves the screen and the device copy', (tester) async {
      final r = _Room();
      await r.open(tester);
      await _menuOn(tester, 'رسالة 1');
      await tester.tap(_deleteMe);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsNothing);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id), ['m002']);
    });

    testWidgets('«مسح المحادثة» → «مسح لدى الجميع»: the confirm text, then an empty chat', (tester) async {
      final r = _Room();
      await r.open(tester);
      await _openClear(tester);
      expect(find.byKey(const Key('clear-me')), findsOneWidget);
      await tester.tap(find.byKey(const Key('clear-everyone')));
      await tester.pumpAndSettle();
      expect(
        find.text('ستُمسح كل رسائل هذه المحادثة لديك ولدى الطرف الآخر. تبقى المحادثة مفتوحة ويمكنكما متابعة الكتابة.'),
        findsOneWidget,
      );
      expect(r.clears, isEmpty);
      await tester.tap(find.byKey(const Key('delete-confirm')));
      await tester.pumpAndSettle();
      expect((r.clears.single.data as Map)['scope'], 'everyone');
      expect(find.text('رسالة 1'), findsNothing);
      expect(find.text('رسالة 2'), findsNothing);
    });

    testWidgets('«مسح لديّ»: its own confirm text; a closed chat offers no «لدى الجميع»', (tester) async {
      final r = _Room(status: 'EXPIRED');
      await r.open(tester);
      await _openClear(tester);
      expect(find.byKey(const Key('clear-everyone')), findsNothing);
      await tester.tap(find.byKey(const Key('clear-me')));
      await tester.pumpAndSettle();
      expect(find.text('ستُمسح الرسائل من عندك فقط، ويبقى كل شيء لدى الطرف الآخر.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('delete-confirm')));
      await tester.pumpAndSettle();
      expect((r.clears.single.data as Map)['scope'], 'me');
      expect(find.text('رسالة 1'), findsNothing);
    });

    testWidgets('a failed clear brings the messages back, and a send on its way keeps its quote', (tester) async {
      final gate = Completer<void>();
      final r = _Room()..clearAnswer = const FakeResponse(400, {'error': 'تعذّر المسح', 'code': 'DISABLED'});
      await r.open(tester);
      addTearDown(() {
        if (!gate.isCompleted) gate.complete();
      });
      // A reply to message 1 that is still sending (kept through the clear, its quote rewritten meanwhile)
      r.adapter.hold('POST', '/api/chats/c1/messages', gate.future);
      await _select(tester, 'رسالة 1');
      await tester.tap(find.byKey(const Key('menu-reply')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'ردّي');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await _openClear(tester);
      await tester.tap(find.byKey(const Key('clear-me')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('delete-confirm')));
      await tester.pumpAndSettle();
      // Message 1 itself, and the pending reply's quote of it
      expect(find.text('رسالة 1'), findsNWidgets(2));
      expect(find.text('رسالة 2'), findsOneWidget);
      expect(find.text('ردّي'), findsOneWidget);
      expect(find.text(deletedTrace), findsNothing);
      expect(find.text('تعذّر المسح'), findsOneWidget);
    });

    testWidgets('a live `cleared` event empties the list; a live `deleted` shows the trace', (tester) async {
      final r = _Room(withLive: true, messages: [msg(1), msg(2, mine: true), msg(3)]);
      await r.open(tester);
      r.live!.controller.add(const ChatLiveEvent('deleted', {'messageId': 'm003'}));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 3'), findsNothing);
      expect(find.byKey(const Key('chat-deleted-trace')), findsOneWidget);
      r.live!.controller.add(ChatLiveEvent('cleared', {'before': chatT0.add(const Duration(minutes: 3)).toIso8601String()}));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsNothing);
      expect(find.text('رسالة 2'), findsNothing);
      expect(find.byKey(const Key('chat-deleted-trace')), findsNothing);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages, isEmpty);
    });

    testWidgets('a poll: deletedIds after reactionUpdates (no reactions on a trace); hiddenIds drop; unknown ids do nothing',
        (tester) async {
      final r = _Room(withLive: true, messages: [msg(1), msg(2, mine: true), msg(3)])
        ..deletedIds = ['m001', 'zz-not-loaded']
        ..hiddenIds = ['m003', 'zz-other']
        ..reactionUpdates = [
          {
            'messageId': 'm001',
            'reactions': [
              {'emoji': '❤️', 'mine': false},
            ],
          },
        ];
      await r.open(tester);
      // The live link connecting polls once
      expect(r.adapter.to('GET', '/api/chats/c1').where((q) => q.queryParameters.containsKey('after')), isNotEmpty);
      expect(find.byKey(const Key('chat-deleted-trace')), findsOneWidget);
      expect(find.byKey(const Key('chat-reactions-m001')), findsNothing);
      expect(find.text('رسالة 3'), findsNothing);
      expect(find.text('رسالة 2'), findsOneWidget);
    });

    testWidgets('the device copy goes through the server\'s clear point on the first load', (tester) async {
      final r = _Room(messages: [msg(5), msg(6)])..clearedBefore = chatT0.add(const Duration(minutes: 2)).toIso8601String();
      r.hasMore = true;
      await r.cache.write('u1', 'c1', cached([1, 2, 3, 4, 5, 6]));
      await r.open(tester);
      expect(find.text('رسالة 1'), findsNothing);
      expect(find.text('رسالة 2'), findsNothing);
      expect(find.text('رسالة 3'), findsOneWidget);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id), ['m003', 'm004', 'm005', 'm006']);
    });

    testWidgets('older messages kept from the device copy: one poll right away asks for deletions since the oldest',
        (tester) async {
      final r = _Room(messages: [msg(5), msg(6)])
        ..hasMore = true
        ..deletedIds = ['m002']
        ..hiddenIds = ['m003'];
      await r.cache.write('u1', 'c1', cached([1, 2, 3, 4, 5, 6]));
      await r.open(tester);
      final polls = r.adapter.to('GET', '/api/chats/c1').where((q) => q.queryParameters.containsKey('after')).toList();
      expect(polls, hasLength(1));
      expect(polls.single.queryParameters['reactionsSince'], chatT0.add(const Duration(minutes: 1)).toIso8601String());
      expect(find.text('رسالة 2'), findsNothing);
      expect(find.text('رسالة 3'), findsNothing);
      expect(find.text('رسالة 1'), findsOneWidget);
      final saved = (await r.cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id), ['m001', 'm002', 'm004', 'm005', 'm006']);
      expect(saved.messages[1].deleted, isTrue);
    });

    testWidgets('a trace of theirs: «إبلاغ عن الرسالة» and «حذف لديّ», no reply, reactions or copy', (tester) async {
      final r = _Room(messages: [
        {...msg(1), 'body': deletedTrace, 'deleted': true, 'kind': 'TEXT', 'media': null, 'replyTo': null, 'reactions': []},
        msg(2, mine: true),
      ]);
      await r.open(tester);
      expect(find.byKey(const Key('chat-deleted-trace')), findsOneWidget);
      await _select(tester, deletedTrace);
      expect(find.byKey(const Key('menu-reply')), findsNothing);
      expect(find.byKey(const Key('menu-copy')), findsNothing);
      expect(find.byKey(const Key('menu-react-❤️')), findsNothing);
      await tester.tap(find.byKey(const Key('selection-more')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-report')), findsOneWidget);
      // Out of the ⋮ menu (it opens at the top-left corner in Arabic)
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(_delete);
      await tester.pumpAndSettle();
      expect(_deleteMe, findsOneWidget);
      expect(_deleteAll, findsNothing);
    });

    testWidgets('leaving mid-request (delete and clear) does not crash', (tester) async {
      final gate = Completer<void>();
      final r = _Room()
        ..deleteAnswer = const FakeResponse(403, {'error': 'حذف الرسائل ومسح المحادثة متاح لأعضاء Pro', 'code': 'PRO_REQUIRED'});
      await r.open(tester);
      r.adapter
        ..hold('POST', '/api/chats/c1/messages/m001/delete', gate.future)
        ..hold('POST', '/api/chats/c1/clear', gate.future);
      await _menuOn(tester, 'رسالة 1');
      await tester.tap(_deleteMe);
      await tester.pump();
      await _openClear(tester);
      await tester.tap(find.byKey(const Key('clear-me')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('delete-confirm')));
      await tester.pump();
      await r.leave(tester);
      gate.complete();
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(tester.takeException(), isNull);
    });
  });

  group('cache shape', () {
    test('a trace survives the device copy', () {
      final m = ChatMessage.fromJson({
        'id': 'm1',
        'body': deletedTrace,
        'createdAt': '2026-11-10T10:00:00.000Z',
        'mine': false,
        'deleted': true,
      });
      final back = ChatCache.decode(jsonDecode(jsonEncode(ChatCache.encode(CachedChat(
        conversation: ChatSummary.fromJson(conv),
        messages: [m],
        hasMore: false,
      )))))!;
      expect(back.messages.single.deleted, isTrue);
    });
  });

}
