import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/wa_chat_header.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/chat_test_room.dart';

void main() {
  group('chatMenuActions', () {
    test('menu order: match, extend, clear, report, end; each only where allowed', () {
      expect(
        chatMenuActions(canOpenMatch: true, canExtend: true, canSend: true, deleteMode: DeleteMode.use),
        [ChatMenuAction.match, ChatMenuAction.extend, ChatMenuAction.clear, ChatMenuAction.report, ChatMenuAction.end],
      );
      expect(
        chatMenuActions(canOpenMatch: true, canExtend: false, canSend: false, deleteMode: DeleteMode.hidden),
        [ChatMenuAction.match, ChatMenuAction.report],
      );
      expect(
        chatMenuActions(canOpenMatch: false, canExtend: true, canSend: true, deleteMode: DeleteMode.upsell),
        [ChatMenuAction.extend, ChatMenuAction.clear, ChatMenuAction.report, ChatMenuAction.end],
      );
    });
  });

  group('WaChatHeader', () {
    testWidgets('⋮ opens with the days left on top, not tappable, and the destructive entries last in red',
        (tester) async {
      final r = ChatTestRoom(expiresAt: DateTime.now().add(const Duration(days: 5, hours: 2)));
      await r.open(tester);
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      final days = tester.widget<PopupMenuItem<dynamic>>(find.byKey(const Key('chat-menu-days')));
      expect(days.enabled, isFalse);
      expect(find.descendant(of: find.byKey(const Key('chat-menu-days')), matching: find.text(chatTimeLeft(DateTime.now().add(const Duration(days: 5, hours: 2)))!.text)), findsOneWidget);
      // Order top to bottom: days, match, clear, report, end
      double y(String t) => tester.getTopLeft(find.text(t)).dy;
      expect(y('صفحة التوافق'), lessThan(y('مسح المحادثة')));
      expect(y('مسح المحادثة'), lessThan(y('إبلاغ')));
      expect(y('إبلاغ'), lessThan(y('إنهاء المحادثة')));
      expect(tester.widget<Text>(find.text('إنهاء المحادثة')).style?.color, AppColors.danger);
      expect(tester.widget<Text>(find.text('إبلاغ')).style?.color, AppColors.danger);
      await r.leave(tester);
    });

    testWidgets('the name opens the match page; the status replaces nothing else', (tester) async {
      var opened = 0;
      final chat = ChatSummary.fromJson(conv);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          appBar: WaChatHeader(
            chat: chat,
            status: const Text('يكتب الآن…', key: Key('chat-typing')),
            left: null,
            deleteMode: DeleteMode.hidden,
            onOpenMatch: () => opened++,
            onMenu: (_) {},
          ),
        ),
      ));
      expect(find.text('يكتب الآن…'), findsOneWidget);
      expect(find.byKey(const Key('chat-menu-days')), findsNothing);
      await tester.tap(find.byKey(const Key('chat-header')));
      expect(opened, 1);
    });

    testWidgets('typing replaces the activity label in the room', (tester) async {
      final r = ChatTestRoom(partnerTyping: true);
      await r.open(tester);
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      expect(find.byKey(const Key('chat-status-line')), findsNothing);
      await r.leave(tester);
    });
  });
}
