import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/chat_test_room.dart';

/// B1: the partner's messages are marked read only while the chat is the screen on top (and in front), and again
/// as soon as it comes back on top.
void main() {
  test('readIsDue: only on top, in front, and when the partner wrote after the last read', () {
    final t = DateTime.utc(2026, 11, 14, 10);
    expect(readIsDue(onTop: true, foreground: true, newestPartnerAt: t, readUpTo: null), isTrue);
    expect(readIsDue(onTop: false, foreground: true, newestPartnerAt: t, readUpTo: null), isFalse);
    expect(readIsDue(onTop: true, foreground: false, newestPartnerAt: t, readUpTo: null), isFalse);
    expect(readIsDue(onTop: true, foreground: true, newestPartnerAt: t, readUpTo: t), isFalse);
    expect(readIsDue(onTop: true, foreground: true, newestPartnerAt: null, readUpTo: null), isFalse);
  });

  const every = Duration(seconds: 4);
  List<RequestOptions> reads(ChatTestRoom r) => r.adapter.to('POST', '/api/chats/c1/read');
  List<RequestOptions> gets(ChatTestRoom r) => r.adapter.to('GET', '/api/chats/c1');
  NavigatorState nav(WidgetTester tester) => tester.state<NavigatorState>(find.byType(Navigator));

  /// The room open with a page pushed over it, and the partner's msg(2) delivered by two polls meanwhile
  Future<int> coveredWhileTheyWrite(WidgetTester tester, ChatTestRoom r) async {
    await r.open(tester);
    final before = reads(r).length;
    final polls = gets(r).length;
    nav(tester).push(MaterialPageRoute<void>(builder: (_) => const Scaffold()));
    await frames(tester, 20);
    r.messages.add(msg(2));
    await tester.pump(every);
    await tester.pump(every);
    await frames(tester);
    expect(gets(r).length, greaterThan(polls), reason: 'polling goes on under the page (the unseen count)');
    expect(reads(r).length, before, reason: 'nothing is marked read while the chat is covered');
    return before;
  }

  testWidgets('a page pushed over the chat: new partner messages are not marked read (B1)', (tester) async {
    final r = ChatTestRoom(pollInterval: every);
    await coveredWhileTheyWrite(tester, r);
    await r.leave(tester);
  });

  testWidgets('coming back to the chat marks the waiting messages read at once (B1)', (tester) async {
    final r = ChatTestRoom(pollInterval: every);
    final before = await coveredWhileTheyWrite(tester, r);
    nav(tester).pop();
    await frames(tester, 20);
    expect(reads(r).length, before + 1);
    expect((reads(r).last.data as Map)['upTo'], msg(2)['createdAt']);
    await r.leave(tester);
  });

  testWidgets('a dialog over the chat pauses read marking too', (tester) async {
    final r = ChatTestRoom(pollInterval: every);
    await r.open(tester);
    final before = reads(r).length;
    await tester.tap(find.byTooltip('خيارات'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إبلاغ'));
    await frames(tester, 20);
    expect(find.text('إبلاغ فقط'), findsOneWidget);
    r.messages.add(msg(2));
    await tester.pump(every);
    await tester.pump(every);
    await frames(tester);
    expect(find.text('رسالة 2'), findsOneWidget, reason: 'the poll delivered it under the sheet');
    expect(reads(r).length, before);
    nav(tester).pop();
    await frames(tester, 20);
    expect(reads(r).length, before + 1);
    await r.leave(tester);
  });
}
