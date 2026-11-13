// WhatsApp-style composer (Task 8): a white pill with the emoji button, the text field and ONE paperclip (its sheet
// holds «المعرض» and «الكاميرا»), the round navy mic / send outside it, the emoji panel in the keyboard's place, and
// the read-only bar of a closed chat.
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/emoji_data.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart' show cameraAccessDeniedCode, cameraBlockedText, cameraFailedText, emojiHandover, emojiPanelHeight;
import 'package:naseebak_app/features/chat/emoji_panel.dart';

import 'helpers/chat_test_room.dart';

final _emojiButton = find.byKey(const Key('chat-emoji'));
final _panel = find.byKey(const Key('emoji-panel'));
final _attach = find.byKey(const Key('chat-attach'));

TextField _field(WidgetTester tester) => tester.widget<TextField>(chatInput);

void main() {
  test('emojiGroups: the website\'s five groups, sizes and ends, no duplicates', () {
    expect(emojiGroups.map((g) => g.label), ['وجوه', 'إيماءات', 'قلوب', 'مناسبات', 'طبيعة']);
    expect(emojiGroups.map((g) => g.emoji.length), [64, 36, 25, 40, 40]);
    expect([for (final g in emojiGroups) (g.emoji.first, g.emoji.last)], [
      ('😀', '😩'),
      ('👍', '🙇'),
      ('❤️', '💫'),
      ('🎉', '🛍️'),
      ('🌸', '🕊️'),
    ]);
    expect(emojiGroups.expand((g) => g.emoji).toSet().length, 205);
  });

  test('insertAtCursor: at the cursor, over a selection, at the end with no cursor, never past 2000', () {
    final atCursor = insertAtCursor(const TextEditingValue(text: 'abc', selection: TextSelection.collapsed(offset: 2)), '😊');
    expect(atCursor.text, 'ab😊c');
    expect(atCursor.selection, TextSelection.collapsed(offset: 2 + '😊'.length));

    final over = insertAtCursor(const TextEditingValue(text: 'abc', selection: TextSelection(baseOffset: 1, extentOffset: 2)), '😊');
    expect(over.text, 'a😊c');
    expect(over.selection, TextSelection.collapsed(offset: 1 + '😊'.length));

    final none = insertAtCursor(const TextEditingValue(text: 'abc'), '😊');
    expect(none.text, 'abc😊');
    expect(none.selection, TextSelection.collapsed(offset: 'abc😊'.length));

    final almost = TextEditingValue(text: 'a' * 1999);
    final full = insertAtCursor(almost, '😊');
    expect(full.text.characters.length, 2000);
    final over2000 = TextEditingValue(text: 'a' * 2000);
    expect(insertAtCursor(over2000, '😊'), same(over2000));
  });

  testWidgets('the emoji button swaps the keyboard for the panel and back; a pick lands at the cursor', (tester) async {
    final r = ChatTestRoom();
    await r.open(tester);
    await tester.tap(chatInput);
    await tester.enterText(chatInput, 'ab');
    await tester.pump();
    final controller = _field(tester).controller!;
    controller.selection = const TextSelection.collapsed(offset: 1);
    expect(_field(tester).focusNode!.hasFocus, isTrue);
    expect(find.byTooltip('الرموز التعبيرية'), findsOneWidget);

    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    expect(_panel, findsOneWidget);
    expect(_field(tester).focusNode!.hasFocus, isFalse);
    expect(find.byTooltip('لوحة المفاتيح'), findsOneWidget);
    // No keyboard to measure yet: at least 260
    expect(tester.getSize(_panel).height, 260);

    await tester.tap(find.byKey(const Key('emoji-😊')));
    await tester.pump();
    expect(controller.text, 'a😊b');
    // The pick never takes the focus (the keyboard would come back and close the panel)
    expect(_field(tester).focusNode!.hasFocus, isFalse);
    expect(_panel, findsOneWidget);

    await tester.tap(find.byKey(const Key('emoji-tab-2')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('emoji-❤️')));
    await tester.pump();
    expect(controller.text, 'a😊❤️b');
    // Typing goes out like a keystroke
    expect(r.adapter.to('POST', '/api/chats/c1/typing'), isNotEmpty);

    // The tabs fit one line on a phone
    final tabs = [for (var i = 0; i < emojiGroups.length; i++) tester.getRect(find.byKey(Key('emoji-tab-$i')))];
    expect(tabs.map((t) => t.top).toSet(), hasLength(1));
    for (final t in tabs) {
      expect(t.height, greaterThanOrEqualTo(44));
    }

    await tester.tap(_emojiButton);
    // Its room is held for the keyboard on its way up (none comes in a test: it goes after the handover time)
    await tester.pump(emojiHandover);
    await tester.pumpAndSettle();
    expect(_panel, findsNothing);
    expect(_field(tester).focusNode!.hasFocus, isTrue);
    await r.leave(tester);
  });

  testWidgets('a tap on the field with the panel open closes the panel and takes the focus', (tester) async {
    final r = ChatTestRoom();
    await r.open(tester);
    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    expect(_panel, findsOneWidget);
    await tester.tap(chatInput);
    await tester.pump(emojiHandover);
    await tester.pumpAndSettle();
    expect(_panel, findsNothing);
    expect(_field(tester).focusNode!.hasFocus, isTrue);
    await r.leave(tester);
  });

  testWidgets('swapping keyboard and panel both ways: the composer stays put; no home-indicator inset under the panel',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(bottom: 34);
    tester.view.viewPadding = const FakeViewPadding(bottom: 34);
    addTearDown(tester.view.reset);
    final r = ChatTestRoom();
    await r.open(tester);
    final row = find.byKey(const ValueKey('composer-row'));
    Future<void> inset(double px) async {
      tester.view.viewInsets = FakeViewPadding(bottom: px);
      await tester.pump();
      await tester.pump();
    }

    await tester.tap(chatInput);
    await inset(300);
    expect(tester.getRect(row).bottom, 844 - 300);
    // The panel opens while the keyboard is still up, then fills the room the keyboard leaves frame by frame
    await tester.tap(_emojiButton);
    await tester.pump();
    for (final px in <double>[300, 220, 90, 0]) {
      await inset(px);
      expect(tester.getRect(row).bottom, 844 - 300, reason: 'keyboard at $px');
    }
    expect(_panel, findsOneWidget);
    expect(tester.getSize(find.byKey(const Key('emoji-room'))).height, 300);
    // Back to the keyboard: the panel's room goes only as the keyboard rises
    await tester.tap(_emojiButton);
    await tester.pump();
    for (final px in <double>[0, 120, 260]) {
      await inset(px);
      expect(tester.getRect(row).bottom, 844 - 300, reason: 'keyboard at $px');
    }
    await inset(300);
    expect(find.byKey(const Key('emoji-room')), findsNothing);
    expect(tester.getRect(row).bottom, 844 - 300);
    expect(_field(tester).focusNode!.hasFocus, isTrue);
    await r.leave(tester);
  });

  testWidgets('the panel takes the full keyboard height (not the last animation step) and closes on send', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final r = ChatTestRoom();
    await r.open(tester);
    // The keyboard closing reports its inset frame by frame: the panel takes its full height, not the last step
    for (final px in <double>[320, 200, 40, 0]) {
      tester.view.viewInsets = FakeViewPadding(bottom: px);
      await tester.pump();
    }
    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    expect(tester.getSize(_panel).height, 320);
    await tester.tap(find.byKey(const Key('emoji-😀')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pumpAndSettle();
    expect(r.sends.single['body'], '😀');
    expect(_panel, findsNothing);
    await r.leave(tester);
  });

  test('emojiPanelHeight: at least 260, at most 45 % of the screen', () {
    expect(emojiPanelHeight(keyboard: 0, screen: 844), 260);
    expect(emojiPanelHeight(keyboard: 320, screen: 844), 320);
    expect(emojiPanelHeight(keyboard: 400, screen: 600), 270);
  });

  testWidgets('the emoji tabs never shrink their labels: at large text they scroll on one line', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(size: Size(320, 640), textScaler: TextScaler.linear(2)),
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: EmojiPanel(onPick: (_) {}, height: 280)),
        ),
      ),
    ));
    expect(tester.takeException(), isNull);
    for (var i = 0; i < emojiGroups.length; i++) {
      final text = tester.widget<Text>(find.descendant(of: find.byKey(Key('emoji-tab-$i')), matching: find.byType(Text)));
      expect(text.style!.fontSize, greaterThanOrEqualTo(12));
    }
    expect(find.byType(FittedBox), findsNothing);
    expect(find.byKey(const Key('emoji-tabs')), findsOneWidget);
    final tabs = [for (var i = 0; i < emojiGroups.length; i++) tester.getRect(find.byKey(Key('emoji-tab-$i')))];
    expect(tabs.map((t) => t.top).toSet(), hasLength(1));
  });

  testWidgets('Android back with the panel open closes the panel, not the chat', (tester) async {
    final r = ChatTestRoom()..withBack = true;
    await r.open(tester);
    await tester.pumpAndSettle();
    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    expect(_panel, findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(_panel, findsNothing);
    expect(chatInput, findsOneWidget);
    expect(find.text('chats-list'), findsNothing);
    // The next back leaves
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('chats-list'), findsOneWidget);
  });

  testWidgets('the header back arrow leaves the chat even with the emoji panel open', (tester) async {
    final r = ChatTestRoom()..withBack = true;
    await r.open(tester);
    await tester.pumpAndSettle();
    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    expect(_panel, findsOneWidget);
    await tester.tap(find.byKey(const Key('chat-back')));
    await tester.pumpAndSettle();
    expect(find.text('chats-list'), findsOneWidget);
    expect(_panel, findsNothing);
  });

  testWidgets('the paperclip offers «المعرض» and «الكاميرا»; each picks from its source and shows the preview',
      (tester) async {
    final r = ChatTestRoom();
    await r.open(tester);
    expect(find.byKey(const Key('chat-photo')), findsNothing);
    expect(find.byTooltip('إرفاق'), findsOneWidget);
    await tester.tap(_attach);
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('attach-gallery')), matching: find.text('المعرض')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('attach-camera')), matching: find.text('الكاميرا')), findsOneWidget);
    await tester.tap(find.byKey(const Key('attach-gallery')));
    await tester.pumpAndSettle();
    expect((r.picks, r.cameraPicks), (1, 0));
    expect(find.byKey(const Key('photo-preview-send')), findsOneWidget);
    await tester.tap(find.byKey(const Key('photo-preview-cancel')));
    await tester.pumpAndSettle();

    await tester.tap(_attach);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attach-camera')));
    await tester.pumpAndSettle();
    expect((r.picks, r.cameraPicks), (1, 1));
    await tester.tap(find.byKey(const Key('photo-preview-send')));
    await tester.pumpAndSettle();
    expect(r.uploads, hasLength(1));
  });

  testWidgets('the paperclip closes the emoji panel', (tester) async {
    final r = ChatTestRoom();
    await r.open(tester);
    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    await tester.tap(_attach);
    await tester.pumpAndSettle();
    expect(_panel, findsNothing);
    expect(find.byKey(const Key('attach-gallery')), findsOneWidget);
  });

  testWidgets('not Pro who can buy: a greyed paperclip with «Pro» opens /pro', (tester) async {
    final r = ChatTestRoom()
      ..withRouter = true
      ..isPro = false;
    await r.open(tester);
    await tester.pumpAndSettle();
    expect(_attach, findsOneWidget);
    expect(find.byKey(const Key('chat-media-pro-tag')), findsOneWidget);
    expect(find.byKey(const Key('chat-mic-pro-tag')), findsOneWidget);
    await tester.tap(_attach);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('attach-gallery')), findsNothing);
    expect(find.text('pro-screen'), findsOneWidget);
    expect(r.picks, 0);
  });

  testWidgets('not Pro who can\'t buy: no paperclip, send-only button', (tester) async {
    final r = ChatTestRoom()
      ..isPro = false
      ..canBuy = false;
    await r.open(tester);
    await tester.pumpAndSettle();
    expect(_attach, findsNothing);
    expect(find.byKey(const Key('chat-media-pro-tag')), findsNothing);
    expect(chatMic, findsNothing);
    expect(find.byKey(const Key('chat-send')), findsOneWidget);
    // The emoji button stays
    expect(_emojiButton, findsOneWidget);
  });

  testWidgets('a camera that fails says «تعذّر فتح الكاميرا»', (tester) async {
    final r = ChatTestRoom()..cameraFails = true;
    await r.open(tester);
    await tester.tap(_attach);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attach-camera')));
    await tester.pumpAndSettle();
    expect(r.cameraPicks, 1);
    expect(find.text('تعذّر فتح الكاميرا'), findsOneWidget);
    expect(r.uploads, isEmpty);
  });

  testWidgets('a refused camera (iOS camera_access_denied) offers the phone\'s settings, like the microphone',
      (tester) async {
    final r = ChatTestRoom()..cameraError = PlatformException(code: cameraAccessDeniedCode);
    await r.open(tester);
    await tester.tap(_attach);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attach-camera')));
    await tester.pumpAndSettle();
    expect(r.cameraPicks, 1);
    expect(find.text(cameraBlockedText), findsOneWidget);
    expect(find.text(cameraFailedText), findsNothing);
    await tester.tap(find.text('الإعدادات'));
    await tester.pumpAndSettle();
    expect(r.settingsOpened, 1);
    expect(r.uploads, isEmpty);
  });

  testWidgets('another camera error keeps «تعذّر فتح الكاميرا» with no settings action', (tester) async {
    final r = ChatTestRoom()..cameraError = PlatformException(code: 'no_available_camera');
    await r.open(tester);
    await tester.tap(_attach);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attach-camera')));
    await tester.pumpAndSettle();
    expect(find.text(cameraFailedText), findsOneWidget);
    expect(find.text('الإعدادات'), findsNothing);
  });

  testWidgets('recording closes the emoji panel', (tester) async {
    final r = ChatTestRoom();
    await r.open(tester);
    await tester.tap(_emojiButton);
    await tester.pumpAndSettle();
    await tester.tap(chatMic);
    await frames(tester);
    expect(r.rec.started, isTrue);
    expect(_panel, findsNothing);
    await r.leave(tester);
  });

  testWidgets('a closed chat: the read-only bar with today\'s text replaces the composer', (tester) async {
    final r = ChatTestRoom(status: 'EXPIRED');
    await r.open(tester);
    final bar = find.byKey(const Key('chat-read-only'));
    expect(bar, findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('انتهت مدة المحادثة.')), findsOneWidget);
    expect(chatInput, findsNothing);
    expect(_emojiButton, findsNothing);
    expect(_attach, findsNothing);
    expect(chatMic, findsNothing);
    // Full width
    expect(tester.getSize(bar).width, tester.view.physicalSize.width / tester.view.devicePixelRatio);
  });

  testWidgets('the emoji panel alone: tabs switch the grid, cells are 44 px and announce their tap', (tester) async {
    final picked = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Align(alignment: Alignment.bottomCenter, child: EmojiPanel(onPick: picked.add, height: 280))),
      ),
    ));
    expect(find.byKey(const Key('emoji-😀')), findsOneWidget);
    expect(find.byKey(const Key('emoji-👍')), findsNothing);
    final cell = tester.getSize(find.byKey(const Key('emoji-😀')));
    expect(cell.width, greaterThanOrEqualTo(44));
    expect(cell.height, greaterThanOrEqualTo(44));
    await tester.tap(find.byKey(const Key('emoji-tab-1')));
    await tester.pump();
    expect(find.byKey(const Key('emoji-👍')), findsOneWidget);
    final handle = tester.ensureSemantics();
    final node = tester.getSemantics(find.byKey(const Key('emoji-👍')));
    expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
    handle.dispose();
    await tester.tap(find.byKey(const Key('emoji-👍')));
    expect(picked, ['👍']);
  });
}
