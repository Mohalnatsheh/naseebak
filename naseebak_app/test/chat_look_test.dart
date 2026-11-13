import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/localization/digits.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/chat_status_bar.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/fake_api.dart';

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

  group('unread strip', () {
    test('unreadStripLabel: 1, 2, 3, 12', () {
      expect(unreadStripLabel(1), 'رسالة غير مقروءة');
      expect(unreadStripLabel(2), 'رسالتان غير مقروءتين');
      expect(unreadStripLabel(3), '3 رسائل غير مقروءة');
      expect(unreadStripLabel(12), '12 رسالة غير مقروءة');
    });

    test('unreadCountFrom counts only the partner\'s messages from the first unread on', () {
      final oldestFirst = [
        m('a', day),
        m('b', day.add(const Duration(minutes: 1))),
        m('c', day.add(const Duration(minutes: 2)), mine: true),
        m('d', day.add(const Duration(minutes: 3))),
        m('e', day.add(const Duration(minutes: 4))),
      ];
      expect(unreadCountFrom(oldestFirst, 'b'), 3);
      expect(unreadCountFrom(oldestFirst, 'd'), 2);
      expect(unreadCountFrom(oldestFirst, 'zzz'), 0);
    });

    test('the date chip hides 1 s after scrolling stops', () {
      expect(dateChipHideAfter, const Duration(seconds: 1));
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

    test('the family offer waits until both have written; a request already made shows (X3 minor 3)', () {
      expect(chatStatusBar(open: true, left: far, family: FamilyStep.offer, bothWrote: false), ChatBar.none);
      expect(chatStatusBar(open: true, left: far, family: FamilyStep.offer, bothWrote: false, pushOff: true), ChatBar.push);
      expect(chatStatusBar(open: true, left: far, family: FamilyStep.offer, bothWrote: true), ChatBar.family);
      expect(chatStatusBar(open: true, left: far, family: FamilyStep.pendingReceived, bothWrote: false), ChatBar.family);
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
    test('chat tokens match the website and pass contrast', () {
      double contrast(Color a, Color b) {
        final l1 = a.computeLuminance(), l2 = b.computeLuminance();
        final hi = l1 > l2 ? l1 : l2, lo = l1 > l2 ? l2 : l1;
        return (hi + 0.05) / (lo + 0.05);
      }

      expect(AppColors.bubbleMine, const Color(0xFFDFE9F4));
      expect(AppColors.bubbleMineQuote, const Color(0xFFCDDBE9));
      expect(AppColors.chatSelect, const Color(0x2422476A));
      expect(AppColors.chatChip, const Color(0xEBFFFFFF));
      expect(AppColors.safetyChip, const Color(0xFFF9EDD9));
      expect(AppColors.chatMine, AppColors.bubbleMine);
      expect(contrast(AppColors.ink, AppColors.bubbleMine), greaterThanOrEqualTo(7));
      expect(contrast(AppColors.muted, AppColors.bubbleMine), greaterThanOrEqualTo(4.5));
      expect(contrast(AppColors.navy, AppColors.bubbleMine), greaterThanOrEqualTo(4.5));
    });

    testWidgets('my bubble sits on the end side (left in Arabic) in bubbleMine with ink text; theirs on the start side in white',
        (tester) async {
      final t = DateTime(2026, 11, 10, 14, 5);
      await tester.pumpWidget(rtlApp(Scaffold(
        body: Column(children: [
          ChatBubble(message: ChatMessage(id: '1', body: 'رسالتي', createdAt: t, mine: true)),
          ChatBubble(message: ChatMessage(id: '2', body: 'رسالتها', createdAt: t, mine: false)),
        ]),
      )));
      expect(tester.getCenter(find.text('رسالتي')).dx, lessThan(tester.getCenter(find.text('رسالتها')).dx));
      final colors = [
        for (final p in tester.widgetList<CustomPaint>(find.byType(CustomPaint)))
          if (p.painter is BubblePainter) (p.painter! as BubblePainter).color,
      ];
      expect(colors, [AppColors.bubbleMine, AppColors.chatTheirs]);
      expect(tester.widget<Text>(find.text('رسالتي')).style!.color, AppColors.ink);
    });

    testWidgets('ticks: ✓ grey while unread, ✓✓ navy once read', (tester) async {
      final t = DateTime(2026, 11, 10, 14, 5);
      await tester.pumpWidget(rtlApp(Scaffold(
        body: Column(children: [
          ChatBubble(message: ChatMessage(id: '1', body: 'a', createdAt: t, mine: true)),
          ChatBubble(message: ChatMessage(id: '2', body: 'b', createdAt: t, mine: true, readAt: t)),
        ]),
      )));
      expect(tester.widget<Icon>(find.byIcon(Icons.done_rounded)).color, AppColors.muted);
      expect(tester.widget<Icon>(find.byIcon(Icons.done_all_rounded)).color, AppColors.navy);
      expect(find.bySemanticsLabel('أُرسلت'), findsOneWidget);
      expect(find.bySemanticsLabel('مقروءة'), findsOneWidget);
    });
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
    testWidgets('the unread strip spans the list, reads the count at open and sits above the first unread',
        (tester) async {
      var extra = false;
      final adapter = FakeAdapter()
        ..handlers['GET /api/chats/c1'] = (r) => FakeResponse(200, {
              ...page([]),
              'messages': [
                msg(1, readAt: DateTime.utc(2026, 10, 30, 11)),
                msg(2, mine: true),
                msg(3),
                msg(4),
                if (extra && r.queryParameters.containsKey('after')) msg(5),
              ],
            });
      await openRoom(tester, adapter, MemoryChatCache(), pollInterval: const Duration(seconds: 4));
      await tester.pumpAndSettle();
      final strip = find.byKey(const Key('chat-unread-divider'));
      expect(strip, findsOneWidget);
      expect(find.text(unreadStripLabel(2)), findsOneWidget);
      expect(tester.getSize(strip).width, tester.getSize(find.byType(ListView)).width);
      final y = tester.getCenter(strip).dy;
      expect(y, lessThan(tester.getCenter(find.text('رسالة 3')).dy));
      expect(y, greaterThan(tester.getCenter(find.text('رسالة 2')).dy));
      extra = true;
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('رسالة 5'), findsOneWidget);
      expect(find.text(unreadStripLabel(2)), findsOneWidget, reason: 'fixed at open');
    });

    testWidgets('the safety note reads «محادثة خاصة · لا تشارك الأرقام أو الحسابات» (feminine for her: the test member), in safetyChip',
        (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page([1, 2])));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      final chip = find.byKey(const Key('chat-safety'));
      expect(chip, findsOneWidget);
      expect(find.descendant(of: chip, matching: find.text('محادثة خاصة · لا تشاركي الأرقام أو الحسابات')), findsOneWidget);
      final fill = tester.widget<Material>(find.ancestor(of: chip, matching: find.byType(Material)).first);
      expect(fill.color, AppColors.safetyChip);
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
    });

    testWidgets('the floating day hides 1 s after scrolling stops', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, page(List.generate(30, (i) => i + 1))));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      final gesture = await tester.startGesture(tester.getCenter(find.byType(ListView)));
      await gesture.moveBy(const Offset(0, 300));
      await tester.pump(const Duration(milliseconds: 300));
      await gesture.up();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 900));
      expect(find.byKey(const Key('chat-sticky-day')), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const Key('chat-sticky-day')), findsNothing);
    });

    testWidgets('one bar: the family step shows while the chat is far from its end', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'bothWrote': true}))
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

    testWidgets('the family offer waits until both have written: the server counts the whole chat (X3 minor 3)',
        (tester) async {
      Map<String, dynamic> intro() => {
            'flags': {'introRequests': true, 'chat': true},
            'family': {'status': 'none'},
            'chat': {'status': 'open'},
          };
      // Only the partner's message is loaded and the server says I haven't written: no offer yet
      var adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'bothWrote': false}))
        ..on('GET', '/api/matches/x1/intro', FakeResponse(200, intro()));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-bar-family')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());

      // The same page, but my messages are older than it: the server's count shows the offer
      adapter = FakeAdapter()
        ..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'bothWrote': true}))
        ..on('GET', '/api/matches/x1/intro', FakeResponse(200, intro()));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-bar-family')), findsOneWidget);
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
          'bothWrote': true,
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

    testWidgets('the sticky chip names the day of the topmost row on screen', (tester) async {
      // One message a day for 30 days: every row is a different day
      final days = {
        ...page([]),
        'messages': [
          for (var n = 1; n <= 30; n++)
            {...msg(n), 'createdAt': chatT0.add(Duration(days: n)).toIso8601String()},
        ],
      };
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, days));
      await openRoom(tester, adapter, MemoryChatCache());
      await tester.pumpAndSettle();
      final gesture = await tester.startGesture(tester.getCenter(find.byType(ListView)));
      await gesture.moveBy(const Offset(0, 250));
      await tester.pump(const Duration(milliseconds: 100));
      await gesture.moveBy(const Offset(0, 1));
      await tester.pump(const Duration(milliseconds: 100));
      final listTop = tester.getRect(find.byType(ListView)).top;
      // The topmost bubble still showing below the list's top edge: its row is the one crossing that edge
      ChatMessage? top;
      var topY = double.infinity;
      for (final e in tester.elementList(find.byType(ChatBubble))) {
        final box = e.renderObject! as RenderBox;
        final bottom = box.localToGlobal(Offset(0, box.size.height)).dy;
        if (bottom > listTop + 8 && bottom < topY) {
          topY = bottom;
          top = (e.widget as ChatBubble).message;
        }
      }
      expect(top, isNotNull);
      final chip = find.byKey(const Key('chat-sticky-day'));
      expect(find.descendant(of: chip, matching: find.text(chatDayLabel(top!.createdAt))), findsOneWidget);
      await gesture.up();
      await tester.pumpAndSettle(const Duration(seconds: 2));
    });

    testWidgets('the family bar follows a request that arrives while the chat is open (checked about once a minute)',
        (tester) async {
      var family = 'none';
      final adapter = FakeAdapter()..on('GET', '/api/chats/c1', FakeResponse(200, {...page([1]), 'bothWrote': true}));
      adapter.handlers['GET /api/matches/x1/intro'] = (_) => FakeResponse(200, {
            'flags': {'introRequests': true, 'chat': true},
            'family': {'status': family},
            'chat': {'status': 'open'},
          });
      await openRoom(tester, adapter, MemoryChatCache(), pollInterval: const Duration(seconds: 4));
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('تعارف عائلي'), findsOneWidget);
      family = 'pending_received';
      await tester.pump(const Duration(seconds: 30));
      expect(find.text('تعارف عائلي'), findsOneWidget, reason: 'not re-read on every poll');
      await tester.pump(const Duration(seconds: 35));
      expect(find.textContaining('طلب تعارف عائلي'), findsOneWidget);
      // About one read a minute, not one per 4 s poll
      expect(adapter.to('GET', '/api/matches/x1/intro').length, lessThanOrEqualTo(3));
      await tester.pumpWidget(const SizedBox());
    });
  });
}
