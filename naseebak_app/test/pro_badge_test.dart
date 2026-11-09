import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/push/push_permission.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/home/home_screen.dart';
import 'package:naseebak_app/features/pro/pro_badge.dart';
import 'package:naseebak_app/features/chat/chats_screen.dart';

import 'helpers/fake_api.dart';

void main() {
  FeedItem feed({required bool pro}) => FeedItem.fromJson({
        'kind': 'mutual',
        'id': 's1',
        'compatibilityScore': 72,
        'reason': '',
        if (pro) 'isPro': true,
        'candidate': {'id': 'c1', 'firstName': 'أحمد', 'age': 33},
      });

  Widget card(FeedItem item) => rtlApp(Scaffold(
        body: SingleChildScrollView(
          child: SuggestionCard(
            item: item,
            tab: FeedTab.newTab,
            candidateFemale: false,
            onInterested: () {},
            onDecline: () {},
          ),
        ),
      ));

  testWidgets('a feed card shows the badge only for a Pro candidate', (tester) async {
    await tester.pumpWidget(card(feed(pro: true)));
    expect(find.byType(ProBadge), findsOneWidget);
    expect(find.text('Pro'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'عضو Pro'), findsOneWidget);
    await tester.pumpWidget(card(feed(pro: false)));
    expect(find.byType(ProBadge), findsNothing);
  });

  testWidgets('sign-out clears the image cache', (tester) async {
    final cache = PaintingBinding.instance.imageCache;
    cache.putIfAbsent('k', () => _Stub(), onError: (e, s) {});
    expect(cache.containsKey('k'), isTrue);
    final adapter = FakeAdapter();
    final container = ProviderContainer(overrides: [
      ...await testOverrides(adapter, store: MemoryTokenStore('t1')),
      chatCacheProvider.overrideWithValue(MemoryChatCache()),
    ]);
    addTearDown(container.dispose);
    container.read(authControllerProvider.notifier).handleUnauthorized();
    await tester.pump(const Duration(milliseconds: 50));
    expect(cache.containsKey('k'), isFalse);
  });

  testWidgets('the chats list shows the badge for partnerIsPro only', (tester) async {
    Map<String, dynamic> chat(String id, String name, bool pro) => {
          'id': id,
          'matchId': 'x$id',
          'partner': {'id': 'p$id', 'firstName': name, if (pro) 'isPro': true},
          'status': 'ACTIVE',
          'expiresAt': '2099-01-01T00:00:00.000Z',
          'unread': 0,
        };
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/chats', FakeResponse(200, {
        'conversations': [chat('c1', 'عمر', true), chat('c2', 'خالد', false)],
      }));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const ChatsScreen())));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.text('عمر'), findsOneWidget);
    expect(find.text('خالد'), findsOneWidget);
    expect(find.byType(ProBadge), findsOneWidget);
    expect(find.descendant(of: find.widgetWithText(ListTile, 'عمر'), matching: find.byType(ProBadge)), findsOneWidget);
  });

  testWidgets('the chat room header shows the badge for partnerIsPro', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('POST', '/api/chats/c1/read', const FakeResponse(200, {'ok': true}))
      ..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'x'}))
      ..on('GET', '/api/chats/c1', const FakeResponse(200, {
        'conversation': {
          'id': 'c1',
          'matchId': 'x1',
          'partner': {'id': 'p1', 'firstName': 'عمر', 'isPro': true},
          'status': 'ACTIVE',
          'expiresAt': '2099-01-01T00:00:00.000Z',
        },
        'messages': [],
        'hasMore': false,
        'chatEnabled': true,
      }));
    final container = ProviderContainer(overrides: [
      ...await testOverrides(adapter, store: MemoryTokenStore('t1')),
      chatCacheProvider.overrideWithValue(MemoryChatCache()),
    ]);
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(const ChatRoomScreen(chatId: 'c1', pollInterval: Duration(hours: 1))),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.byType(ProBadge), findsOneWidget);
  });

  testWidgets('the home greeting uses the on-dark badge for a Pro member', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}, 'pro': {'isPro': true}}))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}))
      ..on('GET', '/api/suggestions/feed', const FakeResponse(200, {'items': [], 'page': 1, 'totalPages': 1}));
    final overrides = await testOverrides(adapter, store: MemoryTokenStore('t1'));
    await tester.pumpWidget(ProviderScope(
      overrides: [...overrides, pushAllowedProvider.overrideWith((ref) async => true)],
      child: rtlApp(const HomeScreen()),
    ));
    await tester.pumpAndSettle();
    final badge = tester.widget<ProBadge>(find.byType(ProBadge));
    expect(badge.onDark, isTrue);
  });
}

class _Stub extends ImageStreamCompleter {}
