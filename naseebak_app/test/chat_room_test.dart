import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/analytics/analytics.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/review/store_review.dart';
import 'package:naseebak_app/core/storage/picker_files.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_drafts.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/fake_api.dart';

/// The room inside a router with a match page, signed in as u1
Future<void> _openRouted(WidgetTester tester, FakeAdapter adapter) async {
  adapter
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
    ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
    ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}));
  final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
  final container = ProviderContainer(overrides: [...overrides, chatCacheProvider.overrideWithValue(MemoryChatCache())]);
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
      GoRoute(path: '/matches/:id', builder: (_, _) => const Scaffold(body: Text('match-page'))),
    ],
  );
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
}

void main() {
  group('chat cache', () {
    test('keeps only the newest confirmed messages and says older ones exist', () {
      final many = cached(List.generate(130, (i) => i + 1));
      final encoded = ChatCache.encode(many);
      final back = ChatCache.decode(encoded)!;
      expect(back.messages.length, ChatCache.keep);
      expect(back.messages.first.id, 'm031');
      expect(back.messages.last.id, 'm130');
      expect(back.hasMore, isTrue);
      expect(back.conversation.partnerName, 'عمر');
    });

    test('an unknown or broken file is ignored', () {
      expect(ChatCache.decode({'v': 2}), isNull);
      expect(ChatCache.decode('x'), isNull);
    });
  });

  group('chat room', () {
    testWidgets('opens from the device copy, then merges the newest page', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached(List.generate(40, (i) => i + 1), hasMore: true));
      // The server's newest 30 overlap the copy (11..40) and add 41, 42
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 13), hasMore: true)));
      await openRoom(tester, adapter, cache);
      await tester.pump();
      expect(find.text('رسالة 40'), findsOneWidget); // from the cache, before the network
      await tester.pumpAndSettle();
      // Opened on 30 unread messages: «رسائل جديدة» is brought into view; «الأحدث» goes back down
      expect(find.byKey(const Key('chat-unread-divider')), findsOneWidget);
      await tester.tap(find.byKey(const Key('chat-newest')));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 42'), findsOneWidget);
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id).take(2), ['m001', 'm002']); // older cached messages kept
      expect(saved.messages.last.id, 'm042');
      expect(saved.messages.length, 42);
    });

    testWidgets('reduced motion: «الأحدث» jumps at once', (tester) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached(List.generate(40, (i) => i + 1), hasMore: true));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 13), hasMore: true)));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-newest')), findsOneWidget);
      final list = tester.widget<ListView>(find.byType(ListView).first);
      expect(list.controller!.offset, greaterThan(0));
      await tester.tap(find.byKey(const Key('chat-newest')));
      await tester.pump();
      // No scroll animation: already at the newest after one frame
      expect(list.controller!.offset, 0);
    });

    testWidgets('scrolled up, a poll brings 2 partner messages: the jump button counts 2', (tester) async {
      var extra = false;
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (r) => FakeResponse(200, {
              ...page([]),
              'messages': [
                for (var n = 1; n <= 30; n++) msg(n, readAt: chatT0),
                if (extra && r.queryParameters.containsKey('after')) ...[msg(31), msg(32)],
              ],
            });
      await openRoom(tester, adapter, MemoryChatCache(), pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 900));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-newest')), findsOneWidget);
      expect(find.byKey(const Key('chat-newest-count')), findsNothing);
      final sem = tester.getSemantics(find.byKey(const Key('chat-newest')));
      expect(sem.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      extra = true;
      await tester.pump(const Duration(seconds: 4));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byKey(const Key('chat-newest-count')), matching: find.text('2')), findsOneWidget);
    });

    testWidgets('more than a page arrived meanwhile: starts again from the newest page', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached(List.generate(10, (i) => i + 1)));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 51), hasMore: true)));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.first.id, 'm051'); // no hole between 10 and 51
      expect(saved.hasMore, isTrue);
    });

    testWidgets('a chat that is no longer mine is removed from the device', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([1, 2, 3]));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', const FakeResponse(404, {'error': 'غير موجود'}));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      expect(await cache.read('u1', 'c1'), isNull);
      expect(find.text('رسالة 1'), findsNothing);
      // A retry can't bring it back: the way to the chats list instead (QA A-L12)
      expect(find.byKey(const Key('chat-gone')), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsNothing);
    });

    testWidgets('offline with a device copy: the copy stays on screen', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([1, 2, 3]));
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', const FakeResponse.network());
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 3'), findsOneWidget);
    });

    testWidgets('older messages load with the exact cursor (time + id)', (tester) async {
      final cache = MemoryChatCache();
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (r) => r.queryParameters.containsKey('before')
            ? FakeResponse(200, page(List.generate(30, (i) => i + 1)))
            : FakeResponse(200, page(List.generate(30, (i) => i + 31), hasMore: true));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 4000));
      await tester.pumpAndSettle();
      final older = adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('before')).first;
      expect(older.queryParameters['beforeId'], 'm031');
      // The older page is above what's on screen: scroll up to its first message
      await tester.drag(find.byType(ListView), const Offset(0, 4000));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsOneWidget);
      expect(adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('before')), hasLength(1));
    });

    testWidgets('a read tick on a message already on screen updates and is kept', (tester) async {
      final cache = MemoryChatCache();
      DateTime? readAt;
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (_) => FakeResponse(200, {
              ...page([]),
              'messages': [msg(1), msg(2, mine: true, readAt: readAt)],
            });
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.done_rounded), findsOneWidget);
      // The partner reads it: the next poll brings the same message with its read time
      readAt = chatT0.add(const Duration(minutes: 5));
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.done_all_rounded), findsOneWidget);
      expect(find.byIcon(Icons.done_rounded), findsNothing);
      expect(find.text('رسالة 2'), findsOneWidget);
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.map((m) => m.id), ['m001', 'm002']);
      expect(saved.messages.last.readAt, isNotNull);
      // While it was unread the poll asked from my unread message, so its tick could come back
      final polls = adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('after'));
      expect(polls.first.queryParameters['after'], chatT0.add(const Duration(minutes: 2)).toIso8601String());
    });

    testWidgets('first load offline, a later poll recovers: older messages can still load', (tester) async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([]));
      var online = false;
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (r) => !online
            ? const FakeResponse.network()
            : r.queryParameters.containsKey('before')
                ? FakeResponse(200, page(List.generate(30, (i) => i + 1)))
                : FakeResponse(200, page(List.generate(30, (i) => i + 31), hasMore: true));
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      online = true;
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 60'), findsOneWidget);
      expect((await cache.read('u1', 'c1'))!.hasMore, isTrue);
      await tester.drag(find.byType(ListView), const Offset(0, 4000));
      await tester.pumpAndSettle();
      expect(adapter.to('GET', '/api/chats/c1').where((r) => r.queryParameters.containsKey('before')), isNotEmpty);
    });

    testWidgets('a send with no answer that the server saved: the failed bubble goes on the next poll', (tester) async {
      final cache = MemoryChatCache();
      Map<String, dynamic>? saved;
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse.network())
        ..handlers['GET /api/chats/c1'] = (_) => FakeResponse(200, {
              ...page([1, 2]),
              'messages': [msg(1), msg(2), ?saved],
            });
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'السلام عليكم');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);
      // The request did reach the server: its copy comes with the next poll
      saved = {
        'id': 'm900',
        'body': 'السلام عليكم',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'mine': true,
        'readAt': null,
      };
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('السلام عليكم'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
      final retried = adapter.to('POST', '/api/chats/c1/messages');
      expect(retried, hasLength(1));
      expect((retried.single.data as Map)['clientNonce'], isNotNull);
    });

    testWidgets('a chat that can no longer change has no live link', (tester) async {
      final cache = MemoryChatCache();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'conversation': {...conv, 'status': 'ENDED'}}));
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('انتهت هذه المحادثة.'), findsOneWidget);
      await tester.pump(const Duration(seconds: 30));
      expect(adapter.to('GET', '/api/chats/ably-token'), isEmpty);
      // Not every 4 s: only the first load in 30 s
      expect(adapter.to('GET', '/api/chats/c1'), hasLength(1));
    });

    test('sign-out wipes every chat kept on the device', () async {
      final cache = MemoryChatCache();
      await cache.write('u1', 'c1', cached([1]));
      final adapter = FakeAdapter()
        ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
        ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}));
      final c = ProviderContainer(
        overrides: [...await testOverrides(adapter, store: MemoryTokenStore('t1')), chatCacheProvider.overrideWithValue(cache)],
      );
      addTearDown(c.dispose);
      c.read(authControllerProvider);
      for (var i = 0; i < 50 && !c.read(authControllerProvider).isSignedIn; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      await c.read(authControllerProvider.notifier).logout();
      expect(cache.data, isEmpty);
    });
  });

  group('keyboard and the chats list', () {
    testWidgets('a tap outside the input closes the keyboard', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-input')));
      await tester.pump();
      expect(tester.testTextInput.isVisible, isTrue);
      await tester.tapAt(const Offset(200, 200));
      await tester.pump();
      expect(tester.testTextInput.isVisible, isFalse);
    });

    testWidgets('an empty room speaks to her in the feminine', (tester) async {
      // meJson is a woman
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.text('ابدئي المحادثة بالسلام'), findsOneWidget);
      expect(find.text('اكتبي رسالتكِ…'), findsOneWidget);
    });

    testWidgets('an empty room that was ended invites nobody to start it', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([]), 'conversation': {...conv, 'status': 'ENDED'}}));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.text('ابدئي المحادثة بالسلام'), findsNothing);
      expect(find.text('لا توجد رسائل في هذه المحادثة'), findsOneWidget);
    });

    testWidgets('«إبلاغ» says that sending the report also ends the chat', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إبلاغ').last);
      await tester.pumpAndSettle();
      expect(find.textContaining('تنتهي المحادثة للطرفين'), findsOneWidget);
      expect(find.text('إبلاغ وإنهاء المحادثة'), findsOneWidget);
      expect(find.text('إبلاغ فقط'), findsOneWidget);
    });

    test('«open» for a report is the server\'s: ACTIVE, not expired, no block (review A2 minor 2)', () {
      ChatSummary c(Map<String, dynamic> over) => ChatSummary.fromJson({...conv, ...over});
      expect(chatOpenForReport(c({})), isTrue);
      expect(chatOpenForReport(c({'status': 'ENDED'})), isFalse);
      expect(chatOpenForReport(c({'expiresAt': '2020-01-01T00:00:00.000Z'})), isFalse);
      expect(chatOpenForReport(c({'blocked': true})), isFalse);
      expect(chatOpenForReport(null), isFalse);
    });

    test('a closed chat offers «إبلاغ وحظر», and its snack never says the chat was ended (minor 7)', () {
      final closed = reportSheetCopy(open: false);
      expect(closed.submitLabel, 'إبلاغ وحظر');
      expect(closed.submitConsequence, isNot(contains('تنتهي المحادثة')));
      expect(reportDoneText(report: true, end: true, open: false), 'تم الإبلاغ والحظر');
      expect(reportDoneText(report: true, end: true, open: true), 'تم إنهاء المحادثة والإبلاغ');
      expect(reportDoneText(report: true, end: false, open: true), contains('تم إرسال البلاغ'));
      expect(reportDoneText(report: false, end: true, open: true), 'تم إنهاء المحادثة');
    });

    testWidgets('tapping send keeps the keyboard open for the next message', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])))
        ..on('POST', '/api/chats/c1/messages', FakeResponse(201, {
          'message': {'id': 'm901', 'body': 'السلام عليكم', 'createdAt': DateTime.utc(2026, 10, 30, 12).toIso8601String(), 'mine': true, 'readAt': null},
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-input')));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('chat-input')), 'السلام عليكم');
      await tester.tap(find.byKey(const Key('chat-send')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(tester.testTextInput.isVisible, isTrue);
    });

    testWidgets('a sent message reloads the chats list (its last message and order)', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])))
        ..on('GET', '/api/chats', const FakeResponse(200, {'conversations': []}))
        ..on('POST', '/api/chats/c1/messages', FakeResponse(201, {
          'message': {'id': 'm900', 'body': 'السلام عليكم', 'createdAt': DateTime.utc(2026, 10, 30, 12).toIso8601String(), 'mine': true, 'readAt': null},
        }));
      final c = await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      // The Chats tab has its list loaded and kept alive
      final sub = c.listen(chatListProvider, (_, _) {});
      addTearDown(sub.close);
      await tester.pump(const Duration(milliseconds: 50));
      final before = adapter.to('GET', '/api/chats').length;
      expect(before, 1);
      await tester.enterText(find.byKey(const Key('chat-input')), 'السلام عليكم');
      await tester.tap(find.byKey(const Key('chat-send')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(adapter.to('GET', '/api/chats').length, greaterThan(before));
    });
  });

  group('message length: the server\'s 1000 (audit M2)', () {
    testWidgets('the box stops at 1000 and counts down from 900', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      final input = find.byKey(const Key('chat-input'));
      expect(tester.widget<TextField>(input).maxLength, chatMessageMaxLength);
      expect(chatMessageMaxLength, 1000);
      await tester.enterText(input, 'ا' * 899);
      await tester.pump();
      expect(find.textContaining('/1000'), findsNothing);
      await tester.enterText(input, 'ا' * 950);
      await tester.pump();
      expect(find.text('950/1000'), findsOneWidget);
    });

    testWidgets('the countdown counts like sending does (UTF-16, trimmed): emoji count double (review minor 5)',
        (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      final input = find.byKey(const Key('chat-input'));
      await tester.enterText(input, '😊' * 475);
      await tester.pump();
      expect(find.text('950/1000'), findsOneWidget);
      await tester.enterText(input, '${'😊' * 600}   ');
      await tester.pump();
      expect(find.text('1200/1000'), findsOneWidget);
    });

    testWidgets('longer than the server takes (emoji count double there): not sent, a plain line says so',
        (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), '😊' * 600);
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/chats/c1/messages'), isEmpty);
      expect(find.text(chatTooLongText), findsOneWidget);
      // Kept to shorten
      expect(tester.widget<TextField>(find.byKey(const Key('chat-input'))).controller!.text, '😊' * 600);
    });

    testWidgets('the server\'s «طويلة جداً» shows as a plain error, never the contact-sharing note', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])))
        ..on('POST', '/api/chats/c1/messages',
            const FakeResponse(422, {'error': 'الرسالة طويلة جداً (الحد 1000 حرف).', 'code': 'FILTERED'}));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'رسالة');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-refusal')), findsNothing);
      expect(find.text('الرسالة طويلة جداً (الحد 1000 حرف).'), findsOneWidget);
    });
  });

  group('QA fixes (A1): failed sends, drafts, direction', () {
    testWidgets('a failed message stays at its own time, under newer messages only while sending', (tester) async {
      final cache = MemoryChatCache();
      var later = false;
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse(422, {'error': 'لا يمكن إرسال أرقام', 'code': 'FILTERED'}))
        ..handlers['GET /api/chats/c1'] = (_) => FakeResponse(200, {
              ...page([1]),
              'messages': [
                msg(1),
                if (later)
                  {'id': 'm999', 'body': 'رد جديد', 'createdAt': DateTime.now().toUtc().add(const Duration(minutes: 1)).toIso8601String(), 'mine': false},
              ],
            });
      await openRoom(tester, adapter, cache, pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'رقمي 0790000000');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-refusal')), findsOneWidget);
      later = true;
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      // Newest at the bottom: the newer reply sits under the refused message
      final refusedY = tester.getCenter(find.text('رقمي 0790000000')).dy;
      final replyY = tester.getCenter(find.text('رد جديد')).dy;
      expect(replyY, greaterThan(refusedY));

      // «حذف»: the refused message leaves the phone (screen and device copy)
      await openFailed(tester);
      await tester.tap(find.byKey(const Key('chat-failed-delete')));
      await tester.pumpAndSettle();
      expect(find.text('رقمي 0790000000'), findsNothing);
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.any((m) => m.state == SendState.failed), isFalse);
    });

    testWidgets('a failed text: ⓘ beside it; «إعادة المحاولة» resends with the same nonce; «حذف» removes it',
        (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse.network())
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'اختبار');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      final info = find.byKey(const Key('chat-failed-info'));
      expect(info, findsOneWidget);
      expect(find.text('إعادة الإرسال'), findsNothing, reason: 'the actions live in the ⓘ sheet');
      // On the bubble's inward side: before it, in reading order (to the right of my bubble at the end side)
      expect(tester.getCenter(info).dx, greaterThan(tester.getCenter(find.text('اختبار')).dx));
      expect(tester.getSize(info).height, greaterThanOrEqualTo(44));
      await openFailed(tester);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
      await tester.tap(find.byKey(const Key('failed-retry')));
      await tester.pumpAndSettle();
      final posts = adapter.to('POST', '/api/chats/c1/messages');
      expect(posts, hasLength(2));
      expect((posts[1].data as Map)['clientNonce'], (posts[0].data as Map)['clientNonce']);
      await openFailed(tester);
      await tester.tap(find.byKey(const Key('chat-failed-delete')));
      await tester.pumpAndSettle();
      expect(find.text('اختبار'), findsNothing);
      expect(info, findsNothing);
    });

    testWidgets(
        'a filtered text: the gold note with the server message; «تعديل الرسالة» puts it back in the box; «تعارف عائلي» opens the match page when the offer is open',
        (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse(422, {'error': 'لا يمكن إرسال أرقام', 'code': 'FILTERED'}))
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'bothWrote': true}))
        ..on('GET', '/api/matches/x1/intro', const FakeResponse(200, {
          'flags': {'introRequests': true, 'chat': true},
          'family': {'status': 'none'},
          'chat': {'status': 'open'},
        }));
      await _openRouted(tester, adapter);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'رقمي 0790000000');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      final note = find.byKey(const Key('chat-refusal'));
      expect(find.descendant(of: note, matching: find.text('لا يمكن إرسال أرقام')), findsOneWidget);
      expect(find.descendant(of: note, matching: find.byIcon(Icons.shield_outlined)), findsOneWidget);
      // The offer is open: the note carries the family button, which opens the match page
      await tester.tap(find.byKey(const Key('chat-refusal-family')));
      await tester.pumpAndSettle();
      expect(find.text('match-page'), findsOneWidget);
      // Back in the chat, «تعديل الرسالة» puts the text in the box and sends nothing
      Navigator.of(tester.element(find.text('match-page'))).pop();
      await tester.pumpAndSettle();
      await openFailed(tester);
      await tester.tap(find.byKey(const Key('failed-retry')));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byKey(const Key('chat-input'))).controller!.text, 'رقمي 0790000000');
      expect(adapter.to('POST', '/api/chats/c1/messages'), hasLength(1), reason: 'editing sends nothing');

    });

    testWidgets('a filtered text without an open family offer shows the note alone', (tester) async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse(422, {'error': 'لا يمكن إرسال أرقام', 'code': 'FILTERED'}))
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'رقمي 0790000000');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-refusal')), findsOneWidget);
      expect(find.byKey(const Key('chat-refusal-family')), findsNothing);
    });

    testWidgets('a text that failed offline is still there (with its retry) after leaving and coming back',
        (tester) async {
      final cache = MemoryChatCache();
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse.network())
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])));
      final container = await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'اختبار');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: rtlApp(const ChatRoomScreen(chatId: 'c1', pollInterval: Duration(hours: 1))),
      ));
      await tester.pumpAndSettle();
      expect(find.text('اختبار'), findsOneWidget);
      expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    });

    /// Types «نص مهم», sends it on a held request (answered offline) and leaves the room before the answer
    Future<(ProviderContainer, Completer<void>)> sendThenLeave(WidgetTester tester, MemoryChatCache cache) async {
      final release = Completer<void>();
      final adapter = FakeAdapter()
        ..on('POST', '/api/chats/c1/messages', const FakeResponse.network())
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])))
        ..hold('POST', '/api/chats/c1/messages', release.future);
      final container =
          await openRoom(tester, adapter, cache, extra: [
        pickerFilesCleanerProvider.overrideWithValue(() async {}),
        chatDraftsProvider.overrideWithValue(MemoryChatDrafts()),
      ]);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'نص مهم');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pump();
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
      await tester.pump();
      return (container, release);
    }

    testWidgets('a text whose send fails after leaving the chat is kept as failed (B2)', (tester) async {
      final cache = MemoryChatCache();
      final (container, release) = await sendThenLeave(tester, cache);
      release.complete();
      await tester.pumpAndSettle();
      final saved = (await cache.read('u1', 'c1'))!;
      final failed = saved.messages.singleWhere((m) => m.state == SendState.failed);
      expect(failed.body, 'نص مهم');
      expect(failed.maybeSent, isTrue);
      expect(saved.messages.first.id, 'm001', reason: 'the copy keeps what it had');

      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: rtlApp(const ChatRoomScreen(chatId: 'c1', pollInterval: Duration(hours: 1))),
      ));
      await tester.pumpAndSettle();
      expect(find.text('نص مهم'), findsOneWidget);
      expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
    });

    testWidgets('a failed text reopened from the device is not taken for an earlier identical one (B10)',
        (tester) async {
      final cache = MemoryChatCache();
      final earlier = {...msg(1, mine: true), 'body': 'نص'};
      await cache.write(
          'u1',
          'c1',
          CachedChat(
            conversation: ChatSummary.fromJson(conv),
            messages: [
              ChatMessage.fromJson(earlier),
              ChatMessage(
                id: 'local-n1',
                body: 'نص',
                createdAt: chatT0.add(const Duration(minutes: 1, seconds: 30)),
                mine: true,
                state: SendState.failed,
                nonce: 'n1',
                maybeSent: true,
              ),
            ],
            hasMore: false,
          ));
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([]), 'messages': [earlier]}));
      await openRoom(tester, adapter, cache);
      await tester.pumpAndSettle();
      expect(find.text('نص'), findsNWidgets(2));
      expect(find.byKey(const Key('chat-failed-info')), findsOneWidget);
      final saved = (await cache.read('u1', 'c1'))!;
      expect(saved.messages.where((m) => m.state == SendState.failed).single.nonce, 'n1');
    });

    testWidgets('a failure after a sign-out writes nothing back', (tester) async {
      final cache = MemoryChatCache();
      final (container, release) = await sendThenLeave(tester, cache);
      container.read(authControllerProvider.notifier).handleUnauthorized();
      for (var i = 0; i < 20 && container.read(authControllerProvider).isSignedIn; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(container.read(authControllerProvider).isSignedIn, isFalse);
      release.complete();
      await tester.pumpAndSettle();
      expect(await cache.read('u1', 'c1'), isNull);
    });

    testWidgets('what was typed stays per chat (back, app killed); sending clears it; sign-out wipes drafts',
        (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])))
        ..on('POST', '/api/chats/c1/messages', FakeResponse(200, {'message': {...msg(50, mine: true), 'body': 'نص محفوظ'}}));
      final drafts = MemoryChatDrafts();
      final container = await openRoom(tester, adapter, MemoryChatCache(), extra: [chatDraftsProvider.overrideWithValue(drafts)]);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'نص محفوظ');
      // The app goes to the background (Android may kill it there)
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();
      expect(drafts.data['u1/c1'], 'نص محفوظ');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: rtlApp(const ChatRoomScreen(chatId: 'c1', pollInterval: Duration(hours: 1))),
      ));
      await tester.pumpAndSettle();
      final input = tester.widget<TextField>(find.byKey(const Key('chat-input')));
      expect(input.controller!.text, 'نص محفوظ');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      await tester.pump();
      expect(drafts.data['u1/c1'], isNull);
    });

    testWidgets('a forced sign-out with a chat open and text typed keeps no draft and asks no rating', (tester) async {
      final drafts = MemoryChatDrafts();
      final fake = _Review();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([]), 'messages': [msg(1, mine: true), msg(2)]}));
      final container = await openRoom(tester, adapter, MemoryChatCache(), extra: [
        chatDraftsProvider.overrideWithValue(drafts),
        pickerFilesCleanerProvider.overrideWithValue(() async {}),
        storeReviewProvider.overrideWith((ref) => StoreReview(ref.watch(sharedPreferencesProvider), AppAnalytics(false), review: fake)),
      ]);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('chat-input')), 'رقم سري');
      // A 401: the session goes, then the router removes the chat
      container.read(authControllerProvider.notifier).handleUnauthorized();
      for (var i = 0; i < 20 && container.read(authControllerProvider).isSignedIn; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(container.read(authControllerProvider).isSignedIn, isFalse);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
      await tester.pump(const Duration(seconds: 1));
      expect(drafts.data, isEmpty);
      expect(fake.requests, 0);
    });

    testWidgets('leaving a chat just ended asks no rating', (tester) async {
      final fake = _Review();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([]), 'messages': [msg(1, mine: true), msg(2)]}))
        ..on('POST', '/api/chats/c1/end', const FakeResponse(200, {'ok': true}));
      final container = await openRoom(tester, adapter, MemoryChatCache(), extra: [
        storeReviewProvider.overrideWith((ref) => StoreReview(ref.watch(sharedPreferencesProvider), AppAnalytics(false), review: fake)),
      ]);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إنهاء المحادثة').last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'إنهاء'));
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/chats/c1/end'), hasLength(1));
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
      await tester.pump(const Duration(seconds: 1));
      expect(fake.requests, 0);
    });

    testWidgets('leaving a chat after «إبلاغ فقط» asks no rating (B17, audit M3)', (tester) async {
      final fake = _Review();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([]), 'messages': [msg(1, mine: true), msg(2)]}))
        ..on('POST', '/api/chats/c1/end', const FakeResponse(200, {'ok': true}));
      final container = await openRoom(tester, adapter, MemoryChatCache(), extra: [
        storeReviewProvider.overrideWith((ref) => StoreReview(ref.watch(sharedPreferencesProvider), AppAnalytics(false), review: fake)),
      ]);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إبلاغ').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-only')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-only')));
      await tester.pumpAndSettle();
      expect((adapter.to('POST', '/api/chats/c1/end').single.data as Map)['end'], isFalse);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
      await tester.pump(const Duration(seconds: 1));
      expect(fake.requests, 0);
    });

    testWidgets('a report that fails to send reopens the sheet with the details kept (audit M4)', (tester) async {
      var status = 503;
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])))
        ..handlers['POST /api/chats/c1/end'] = (_) => FakeResponse(status, const {'error': 'تعذّر الاتصال'});
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إبلاغ').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.enterText(find.widgetWithText(TextField, 'تفاصيل (اختياري)'), 'كلام مسيء متكرر');
      await tester.ensureVisible(find.byKey(const Key('report-only')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-only')));
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/chats/c1/end'), hasLength(1));
      // Back, with what was written
      expect(find.byKey(const Key('report-only')), findsOneWidget);
      expect(find.text('كلام مسيء متكرر'), findsOneWidget);
      expect(find.text('تعذّر الاتصال'), findsOneWidget);

      status = 200;
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-only')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-only')));
      await tester.pumpAndSettle();
      final sent = adapter.to('POST', '/api/chats/c1/end');
      expect(sent, hasLength(2));
      expect(((sent.last.data as Map)['report'] as Map)['details'], 'كلام مسيء متكرر');
      expect(find.byKey(const Key('report-only')), findsNothing);
    });

    testWidgets('«تمديد 7 أيام» is sent once on a double tap, its button off while it runs (audit M5)', (tester) async {
      final soon = DateTime.now().toUtc().add(const Duration(days: 2)).toIso8601String();
      final release = Completer<void>();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
          ...page([1]),
          'conversation': {...conv, 'expiresAt': soon, 'canExtend': true},
        }))
        ..on('POST', '/api/chats/c1/extend', const FakeResponse(200, {'ok': true}))
        ..hold('POST', '/api/chats/c1/extend', release.future);
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      await tester.tap(find.text('تمديد 7 أيام'));
      await tester.pump();
      final button = find.ancestor(of: find.text('تمديد 7 أيام'), matching: find.byType(TextButton));
      expect(tester.widget<TextButton>(button).onPressed, isNull);
      await tester.tap(find.text('تمديد 7 أيام'), warnIfMissed: false);
      await tester.pump();
      // The ⋮ menu's «تمديد» waits too
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      final menuExtend = find.textContaining('تمديد').last;
      await tester.tap(menuExtend);
      await tester.pumpAndSettle();
      release.complete();
      await tester.pumpAndSettle();
      expect(adapter.to('POST', '/api/chats/c1/extend'), hasLength(1));
    });

    testWidgets('an ended chat has no «لحمايتك» line over «للقراءة فقط»', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'conversation': {...conv, 'status': 'ENDED'}}));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-safety')), findsNothing);
      expect(find.text('انتهت هذه المحادثة.'), findsOneWidget);
    });

    testWidgets('each message in its own direction: a number or English reads left to right', (tester) async {
      expect(messageDirection('07 9 12 34 567'), TextDirection.ltr);
      expect(messageDirection('Hello، كيف الحال'), TextDirection.ltr);
      expect(messageDirection('السلام عليكم hello'), TextDirection.rtl);
      expect(messageDirection('٠٧٩ ١٢٣'), TextDirection.ltr);
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
              ...page([1]),
              'messages': [msg(1), {...msg(2), 'body': '07 9 12 34 567'}],
            }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(tester.widget<Text>(find.text('07 9 12 34 567')).textDirection, TextDirection.ltr);
      expect(tester.widget<Text>(find.text('رسالة 1')).textDirection, TextDirection.rtl);
    });

    testWidgets('the store rating sheet waits for a real conversation and asks as the chat is left', (tester) async {
      final fake = _Review();
      Future<void> visit(List<Map<String, dynamic>> messages) async {
        final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, {...page([]), 'messages': messages}));
        final container = await openRoom(tester, adapter, MemoryChatCache(), extra: [
          storeReviewProvider.overrideWith((ref) => StoreReview(ref.watch(sharedPreferencesProvider), AppAnalytics(false), review: fake)),
        ]);
        await tester.pumpAndSettle();
        await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SizedBox()));
        await tester.pump(const Duration(seconds: 1));
      }

      // Only my first message: not yet
      await visit([msg(1, mine: true)]);
      expect(fake.requests, 0);
      // The other side replied: asked once
      await visit([msg(1, mine: true), msg(2)]);
      expect(fake.requests, 1);
    });
  });
}

class _Review implements InAppReview {
  int requests = 0;
  @override
  Future<bool> isAvailable() async => true;
  @override
  Future<void> requestReview() async => requests++;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
