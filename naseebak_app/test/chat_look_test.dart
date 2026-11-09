import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/localization/digits.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_status_bar.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';

import 'chat_room_test.dart' show conv, msg, openRoom, page;
import 'helpers/fake_api.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';

ChatMessage m(String id, DateTime at, {bool mine = false, DateTime? readAt, SendState state = SendState.sent}) =>
    ChatMessage(id: id, body: id, createdAt: at, mine: mine, readAt: readAt, state: state);

void main() {
  final day = DateTime(2026, 11, 10, 9);

  group('runs and tails', () {
    test('a tail only on the first bubble of a run; tight gaps inside a run', () {
      // newest first, as the chat draws it: a, b (mine), c, d (theirs)
      final items = [
        m('d', day.add(const Duration(minutes: 40))),
        m('c', day.add(const Duration(minutes: 30))),
        m('b', day.add(const Duration(minutes: 2)), mine: true),
        m('a', day, mine: true),
      ];
      final l = [for (var i = 0; i < items.length; i++) chatRowLayout(items, i)];
      expect([for (final x in l) x.tail], [false, true, false, true]);
      expect([for (final x in l) x.tightTop], [true, false, true, false]);
      expect(l[3].daySeparator, isTrue);
      expect(l[2].daySeparator, isFalse);
    });

    test('a long pause does not break a run (times are on every bubble); a new day does', () {
      final items = [
        m('c', DateTime(2026, 11, 11, 8), mine: true),
        m('b', day.add(const Duration(hours: 3)), mine: true),
        m('a', day, mine: true),
      ];
      expect(chatRowLayout(items, 1).tail, isFalse);
      expect(chatRowLayout(items, 0).tail, isTrue);
      expect(chatRowLayout(items, 0).daySeparator, isTrue);
    });

    test('the unread divider starts a new run', () {
      final items = [
        m('b', day.add(const Duration(minutes: 1))),
        m('a', day),
      ];
      final b = chatRowLayout(items, 0, unreadFromId: 'b');
      expect(b.unreadDivider, isTrue);
      expect(b.tail, isTrue);
      expect(chatRowLayout(items, 1, unreadFromId: 'b').unreadDivider, isFalse);
    });
  });

  group('first unread', () {
    test('the oldest of their unread messages after my last one', () {
      final oldestFirst = [
        m('a', day),
        m('b', day.add(const Duration(minutes: 1)), mine: true),
        m('c', day.add(const Duration(minutes: 2))),
        m('d', day.add(const Duration(minutes: 3))),
      ];
      expect(firstUnreadId(oldestFirst), 'c');
    });

    test('nothing unread, or everything of theirs already read: no divider', () {
      expect(firstUnreadId([m('a', day, readAt: day)]), isNull);
      expect(firstUnreadId([m('a', day, mine: true)]), isNull);
      expect(firstUnreadId(const []), isNull);
    });
  });

  group('one status bar, by priority', () {
    const soon = (text: 'تبقّى يومان', urgent: true);
    const far = (text: 'تبقّى 12 يوماً', urgent: false);

    test('1: expiry soon beats everything only when the chat can be extended', () {
      expect(
        chatStatusBar(open: true, left: soon, canExtend: true, family: FamilyStep.offer, pushOff: true),
        ChatBar.expiry,
      );
    });

    test('2: a family offer or an incoming request beats an expiry that cannot be extended', () {
      expect(chatStatusBar(open: true, left: soon, family: FamilyStep.offer, pushOff: true), ChatBar.family);
      expect(chatStatusBar(open: true, left: soon, family: FamilyStep.pendingReceived), ChatBar.family);
    });

    test('3: the expiry (no action) beats a family step with nothing to do, and the push chip', () {
      expect(chatStatusBar(open: true, left: soon, family: FamilyStep.pendingSent, pushOff: true), ChatBar.expiryInfo);
      expect(chatStatusBar(open: true, left: soon, family: FamilyStep.accepted), ChatBar.expiryInfo);
      expect(chatStatusBar(open: true, left: soon, pushOff: true), ChatBar.expiryInfo);
    });

    test('far from the end: the family step, then the push chip', () {
      expect(chatStatusBar(open: true, left: far, canExtend: true, family: FamilyStep.offer, pushOff: true), ChatBar.family);
      expect(chatStatusBar(open: true, left: far, family: FamilyStep.pendingSent, pushOff: true), ChatBar.family);
      expect(chatStatusBar(open: true, left: far, family: null, pushOff: true), ChatBar.push);
      expect(chatStatusBar(open: true, left: far, family: null, pushOff: false), ChatBar.none);
    });

    test('a dismissed push chip stays away; a closed chat shows no bar', () {
      expect(chatStatusBar(open: true, left: far, pushOff: true, pushDismissed: true), ChatBar.none);
      expect(chatStatusBar(open: false, left: soon, canExtend: true, family: FamilyStep.offer, pushOff: true), ChatBar.none);
    });

    test('family step from the intro state: offered only while requests are on and nothing closed it', () {
      expect(familyStepOf('none', introRequests: true), FamilyStep.offer);
      expect(familyStepOf('none', introRequests: false), isNull);
      expect(familyStepOf('none', introRequests: true, closed: 'NOT_A_MATCH'), isNull);
      expect(familyStepOf('pending_sent', introRequests: true), FamilyStep.pendingSent);
      expect(familyStepOf('pending_received', introRequests: true), FamilyStep.pendingReceived);
      expect(familyStepOf('accepted', introRequests: true), FamilyStep.accepted);
      expect(familyStepOf('declined', introRequests: true), isNull);
    });
  });

  group('bubbles', () {
    testWidgets('the time on every bubble, ticks only on mine', (tester) async {
      final t = DateTime(2026, 11, 10, 14, 5);
      await tester.pumpWidget(rtlApp(Scaffold(
        body: Column(children: [
          ChatBubble(message: ChatMessage(id: '1', body: 'السلام عليكم', createdAt: t, mine: true)),
          ChatBubble(message: ChatMessage(id: '2', body: 'وعليكم السلام', createdAt: t, mine: false), tail: false),
          ChatBubble(message: ChatMessage(id: '3', body: 'كيف الحال', createdAt: t, mine: false), tail: true),
        ]),
      )));
      expect(find.text(formatTime(t)), findsNWidgets(3));
      expect(find.byIcon(Icons.done_rounded), findsOneWidget);
    });

    testWidgets('a photo carries its time over the picture and paints in its own layer', (tester) async {
      final t = DateTime(2026, 11, 10, 14, 5);
      final photo = ChatMessage(
        id: 'p',
        body: '📷 صورة',
        createdAt: t,
        mine: false,
        kind: MessageKind.image,
      );
      await tester.pumpWidget(rtlApp(Scaffold(body: ChatBubble(message: photo))));
      expect(find.byKey(const Key('chat-photo-time')), findsOneWidget);
      expect(find.text(formatTime(t)), findsOneWidget);
      expect(
        find.ancestor(of: find.byType(PhotoBubble), matching: find.byType(RepaintBoundary)),
        findsWidgets,
      );
    });
  });

  group('chat room', () {
    testWidgets('«رسائل جديدة» sits above the first message that was unread on opening', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
          ...page([]),
          'messages': [
            msg(1, readAt: DateTime.utc(2026, 10, 30, 11)),
            msg(2, mine: true),
            msg(3),
            msg(4),
          ],
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.text('رسائل جديدة'), findsOneWidget);
      final divider = tester.getCenter(find.text('رسائل جديدة')).dy;
      expect(divider, lessThan(tester.getCenter(find.text('رسالة 3')).dy));
      expect(divider, greaterThan(tester.getCenter(find.text('رسالة 2')).dy));
    });

    testWidgets('one bar: the family step shows while the chat is far from its end', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, page([1])))
        ..on('GET', '/api/matches/x1/intro', const FakeResponse(200, {
          'flags': {'introRequests': true, 'chat': true},
          'family': {'status': 'none'},
          'chat': {'status': 'open'},
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-bar-family')), findsOneWidget);
      expect(find.byKey(const Key('chat-bar-expiry')), findsNothing);
    });

    testWidgets('one bar: expiry soon (extendable) wins over the family step', (tester) async {
      final soon = DateTime.now().toUtc().add(const Duration(days: 2)).toIso8601String();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
          ...page([1]),
          'conversation': {...conv, 'expiresAt': soon, 'canExtend': true},
        }))
        ..on('GET', '/api/matches/x1/intro', const FakeResponse(200, {
          'flags': {'introRequests': true, 'chat': true},
          'family': {'status': 'none'},
          'chat': {'status': 'open'},
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-bar-expiry')), findsOneWidget);
      expect(find.byKey(const Key('chat-bar-family')), findsNothing);
      expect(find.text('تمديد 7 أيام'), findsOneWidget);
    });

    testWidgets('the last days with no extension left: the family offer shows, with the days left inline',
        (tester) async {
      final soon = DateTime.now().toUtc().add(const Duration(days: 1, hours: 12)).toIso8601String();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
          ...page([1]),
          'conversation': {...conv, 'expiresAt': soon, 'canExtend': false},
        }))
        ..on('GET', '/api/matches/x1/intro', const FakeResponse(200, {
          'flags': {'introRequests': true, 'chat': true},
          'family': {'status': 'none'},
          'chat': {'status': 'open'},
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-bar-family')), findsOneWidget);
      expect(find.byKey(const Key('chat-bar-expiry')), findsNothing);
      expect(find.text('تعارف عائلي'), findsOneWidget);
      expect(find.textContaining('تبقّى يومان'), findsOneWidget);
    });

    testWidgets('the last days, no extension, nothing to do on the family side: the expiry line with no action',
        (tester) async {
      final soon = DateTime.now().toUtc().add(const Duration(days: 1, hours: 12)).toIso8601String();
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
          ...page([1]),
          'conversation': {...conv, 'expiresAt': soon, 'canExtend': false},
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-bar-expiry-info')), findsOneWidget);
      expect(find.text('تمديد 7 أيام'), findsNothing);
    });

    testWidgets('the header status line shows the activity label when the server sends one', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {
          ...page([1]),
          'conversation': {
            ...conv,
            'partner': {'id': 'p1', 'firstName': 'عمر', 'activityLabel': 'نشط اليوم'},
          },
        }));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-status-line')), findsOneWidget);
      expect(find.text('نشط اليوم'), findsOneWidget);
    });

    testWidgets('the day stays at the top while scrolling', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 1))));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      final gesture = await tester.startGesture(tester.getCenter(find.byType(ListView)));
      await gesture.moveBy(const Offset(0, 300));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const Key('chat-sticky-day')), findsOneWidget);
      await gesture.up();
      await tester.pumpAndSettle(const Duration(seconds: 2));
    });
  });
}
