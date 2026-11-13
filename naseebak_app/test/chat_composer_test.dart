import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/chat/chat_room_screen.dart' show composerHintGap, micAllowedHint, micRefusedText;
import 'package:naseebak_app/features/chat/hold_to_record.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/voice_recorder.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/chat_test_room.dart';
import 'helpers/fake_api.dart';

TextField _field(WidgetTester tester) => tester.widget<TextField>(chatInput);

void main() {
  group('composer', () {
    testWidgets('one round button: mic while empty, send with text; emoji and paperclip sit inside the white pill',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      expect(chatMic, findsOneWidget);
      expect(find.byKey(const Key('chat-send')), findsNothing);
      final pill = find.byKey(const Key('chat-pill'));
      final field = tester.getRect(pill);
      for (final k in ['chat-attach', 'chat-emoji']) {
        expect(field.contains(tester.getRect(find.byKey(Key(k))).center), isTrue, reason: k);
      }
      expect(((tester.widget<Container>(pill).decoration as BoxDecoration).color), Colors.white);
      // From the start (right in Arabic): emoji, the text, the paperclip; the round mic outside it
      final emoji = tester.getCenter(find.byKey(const Key('chat-emoji'))).dx;
      final text = tester.getCenter(chatInput).dx;
      final clip = tester.getCenter(find.byKey(const Key('chat-attach'))).dx;
      expect(emoji > text && text > clip, isTrue);
      expect(field.contains(tester.getCenter(chatMic)), isFalse);
      expect(_field(tester).style?.fontSize, 16);
      expect(_field(tester).maxLines, 6);
      expect(_field(tester).maxLength, 2000);
      await tester.enterText(chatInput, 'السلام عليكم');
      await tester.pump();
      expect(chatMic, findsNothing);
      expect(find.byKey(const Key('chat-send')), findsOneWidget);
      expect(tester.getSize(find.byKey(const Key('chat-send'))).width, greaterThanOrEqualTo(44));
      await tester.enterText(chatInput, '  ');
      await tester.pump();
      expect(chatMic, findsOneWidget);
    });
  });

  group('composer on an iPhone (simulator QA D1, D2)', () {
    testWidgets('the hint starts a little after the cursor edge, so its first letter is never under the cursor',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.tap(chatInput);
      await tester.pump();
      final field = tester.getRect(find.descendant(of: chatInput, matching: find.byType(EditableText)));
      final hint = tester.getRect(find.byKey(const Key('chat-input-hint')));
      // Arabic: the cursor of an empty field stands at the right edge
      expect(field.right - hint.right, greaterThanOrEqualTo(composerHintGap));
      expect(find.text('اكتبي رسالتكِ…'), findsOneWidget);
      await tester.enterText(chatInput, 'س');
      await tester.pump();
      await r.leave(tester);
    });

    testWidgets('the home-indicator inset sits under the composer only while the keyboard is closed', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      tester.view.padding = const FakeViewPadding(bottom: 34);
      tester.view.viewPadding = const FakeViewPadding(bottom: 34);
      addTearDown(tester.view.reset);
      final r = ChatTestRoom();
      await r.open(tester);
      final row = find.byKey(const ValueKey('composer-row'));
      expect(tester.getRect(row).bottom, 844 - 34);
      // The keyboard comes up while the view still reports a bottom padding: no empty strip above it
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pump();
      await tester.pump();
      expect(tester.getRect(row).bottom, 844 - 300);
      tester.view.viewInsets = FakeViewPadding.zero;
      await tester.pump();
      await tester.pump();
      expect(tester.getRect(row).bottom, 844 - 34);
      await r.leave(tester);
    });
  });

  group('hold to record', () {
    testWidgets('hold, then release after 1.5 s: one voice note goes up', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      expect(r.rec.started, isTrue);
      expect(find.byKey(const Key('voice-hold-bar')), findsOneWidget);
      expect(find.text('اسحبي للإلغاء'), findsOneWidget);
      // The chevron points the way to slide (towards the start edge, the right in Arabic), and the hint has its own
      // lane beside the level bars (QA A-M03)
      expect(tester.widget<Icon>(find.byKey(const Key('voice-slide-chevron'))).icon, Icons.chevron_right_rounded);
      // Chevrons mirror themselves in Arabic: drawn left to right, this one really points right (towards cancel)
      expect(tester.widget<Icon>(find.byKey(const Key('voice-slide-chevron'))).textDirection, TextDirection.ltr);
      // The hint and the bars fade through their colours, never an opacity layer (QA A-L10)
      expect(find.descendant(of: find.byKey(const Key('voice-hold-bar')), matching: find.byType(Opacity)), findsNothing);
      final lane = tester.getRect(find.byKey(const Key('voice-slide-lane')));
      final bars = tester.getRect(find.byKey(const Key('voice-level')));
      expect(lane.overlaps(bars), isFalse);
      expect(find.byKey(const Key('voice-lock-hint')), findsOneWidget);
      r.rec.now = const Duration(milliseconds: 1500);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump();
      // The live level bars follow the microphone
      expect(find.byKey(const Key('voice-level')), findsOneWidget);
      await g.up();
      await frames(tester);
      expect(r.uploads, hasLength(1));
      expect(Map.fromEntries((r.uploads.single.data as FormData).fields)['durationSec'], '2');
      expect(find.byKey(const Key('voice-hold-bar')), findsNothing);
      await r.leave(tester);
    });

    testWidgets('released under 1 s: dropped with «الرسالة قصيرة جداً», the file deleted, nothing sent',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(milliseconds: 600);
      final file = r.rec.file!;
      await g.up();
      await frames(tester);
      expect(find.text(holdTooShortText), findsOneWidget);
      expect(r.uploads, isEmpty);
      expect(r.rec.cancelled, isTrue);
      expect(file.existsSync(), isFalse);
      expect(chatInput, findsOneWidget);
      await r.leave(tester);
    });

    testWidgets('slide towards the start edge (right in Arabic) cancels: nothing sent, even on release',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 4);
      await g.moveBy(const Offset(60, 0));
      await tester.pump();
      await g.moveBy(const Offset(60, 0));
      await tester.pump();
      expect(r.rec.cancelled, isTrue);
      expect(find.byKey(const Key('voice-hold-bar')), findsNothing);
      await g.up();
      await frames(tester);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the slide direction follows the language: towards the end edge never cancels', (tester) async {
      expect(holdSlideFor(const Offset(120, 0), TextDirection.rtl), HoldSlide.cancel);
      expect(holdSlideFor(const Offset(-120, 0), TextDirection.rtl), HoldSlide.none);
      expect(holdSlideFor(const Offset(-120, 0), TextDirection.ltr), HoldSlide.cancel);
      expect(holdSlideFor(const Offset(0, -90), TextDirection.rtl), HoldSlide.lock);
      expect(holdReleaseSends(const Offset(20, -30)), isTrue);
      expect(holdReleaseSends(const Offset(-90, 0)), isFalse);
    });

    testWidgets('slide up locks: release sends nothing; the bar has stop, cancel and send', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 3);
      await g.moveBy(const Offset(0, -50));
      await tester.pump();
      await g.moveBy(const Offset(0, -50));
      await tester.pump();
      expect(find.byKey(const Key('voice-stop')), findsOneWidget);
      expect(find.byKey(const Key('voice-cancel')), findsOneWidget);
      expect(find.byKey(const Key('voice-send')), findsOneWidget);
      await g.up();
      await frames(tester);
      expect(r.uploads, isEmpty);
      expect(r.rec.stopped, isFalse, reason: 'still recording hands-free');
      // Stop: waits for «إرسال»
      await tester.tap(find.byKey(const Key('voice-stop')));
      await frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await tester.tap(find.byKey(const Key('voice-send')));
      await frames(tester);
      expect(r.uploads, hasLength(1));
      await r.leave(tester);
    });

    testWidgets('the pointer is cancelled mid-hold (a call, a system gesture): it stops and waits, never sends',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 5);
      await g.cancel();
      await frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(r.rec.cancelled, isFalse);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      await tester.pump(const Duration(seconds: 10));
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('a second finger on the mic mid-hold: it stops and waits; lifting both sends nothing',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 5);
      final second = await tester.startGesture(tester.getCenter(chatMic) + const Offset(4, 4), pointer: 7);
      await frames(tester);
      expect(r.rec.stopped, isTrue);
      await second.up();
      await g.up();
      await frames(tester);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the finger wanders off the button (no cancel, no lock) and lets go: it stops and waits',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 5);
      // Towards the end edge and down: neither cancel nor lock
      await g.moveBy(const Offset(-70, 40));
      await tester.pump();
      await g.up();
      await frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the app goes to the background mid-hold: it stops and waits; the later release sends nothing',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 6);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await g.up();
      await frames(tester);
      expect(r.rec.stopped, isTrue);
      expect(find.text('توقف التسجيل'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('held to the 3-minute limit: it stops and waits; the release sends nothing', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = maxVoiceDuration;
      await tester.pump(const Duration(milliseconds: 300));
      await frames(tester);
      expect(find.text('بلغ التسجيل الحد الأقصى'), findsOneWidget);
      await g.up();
      await frames(tester);
      expect(r.uploads, isEmpty);
      await tester.tap(find.byKey(const Key('voice-send')));
      await frames(tester);
      expect(r.uploads, hasLength(1));
      await r.leave(tester);
    });

    testWidgets('let go during the microphone prompt: nothing records and nothing is sent', (tester) async {
      final r = ChatTestRoom();
      final answer = Completer<bool>();
      r.permission = () => answer.future;
      await r.open(tester);
      final g = await holdMic(tester);
      await g.up();
      await tester.pump();
      answer.complete(true);
      await frames(tester);
      expect(r.rec.started, isFalse);
      expect(r.rec.disposed, isTrue);
      expect(r.uploads, isEmpty);
      expect(chatInput, findsOneWidget);
      await r.leave(tester);
    });

    testWidgets('leaving the chat mid-hold: the microphone is released, nothing sent', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(seconds: 3);
      final file = r.rec.file!;
      await r.leave(tester);
      await g.up();
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(r.rec.cancelled, isTrue);
      expect(file.existsSync(), isFalse);
      expect(r.uploads, isEmpty);
    });
  });

  group('reply', () {
    testWidgets('long-press → «رد»: the strip shows the quote; the send carries replyToId and the bubble the quote',
        (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-reply')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('chat-reply-strip')), matching: find.text('عمر')), findsOneWidget);
      await tester.enterText(chatInput, 'نعم');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(r.sends.single['replyToId'], 'm001');
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
      expect(find.byKey(const Key('chat-quote-m001')), findsOneWidget);
    });

    testWidgets('✕ drops the reply: the message goes without replyToId', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-reply')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-reply-close')));
      await tester.pump();
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
      await tester.enterText(chatInput, 'نعم');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(r.sends.single.containsKey('replyToId'), isFalse);
    });

    testWidgets('swipe the partner\'s bubble inward (left in Arabic) to reply; outward does nothing', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.drag(find.text('رسالة 1'), const Offset(90, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
      await tester.drag(find.text('رسالة 1'), const Offset(-90, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsOneWidget);
    });

    testWidgets('a photo reply carries replyToId too', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.drag(find.text('رسالة 1'), const Offset(-90, 0));
      await tester.pumpAndSettle();
      await pickFromGallery(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('photo-preview-send')));
      await tester.pumpAndSettle();
      expect(Map.fromEntries((r.uploads.single.data as FormData).fields)['replyToId'], 'm001');
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    });

    testWidgets('tapping a quote scrolls to the original and tints it for a moment', (tester) async {
      final r = ChatTestRoom(messages: [
        for (var n = 1; n <= 60; n++) {...msg(n), 'readAt': '2026-10-30T12:00:00.000Z'},
        {
          ...msg(61, mine: true),
          'body': 'جوابي',
          'replyTo': {'id': 'm001', 'mine': false, 'kind': 'TEXT', 'snippet': 'نص الاقتباس'},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 1'), findsNothing);
      await tester.tap(find.byKey(const Key('chat-quote-m001')));
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 30));
      }
      expect(find.text('رسالة 1'), findsOneWidget);
      final tint = tester.widget<AnimatedContainer>(
        find.ancestor(of: find.text('رسالة 1'), matching: find.byType(AnimatedContainer)).first,
      );
      expect((tint.decoration as BoxDecoration?)?.color, isNot(Colors.transparent));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
    });

    testWidgets('a reply from the server shows its quote (the old field body stays the text)', (tester) async {
      final r = ChatTestRoom(messages: [
        msg(1),
        {
          ...msg(2),
          'replyTo': {'id': 'm001', 'mine': true, 'kind': 'IMAGE', 'snippet': '📷 صورة'},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      expect(find.text('رسالة 2'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('chat-quote-m001')), matching: find.text('أنت')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('chat-quote-m001')), matching: find.text('📷 صورة')), findsOneWidget);
    });
  });

  group('selection and reactions', () {
    testWidgets('a reaction shows at once and goes to the server; tapping my chip removes it', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-react-🤲')), findsOneWidget);
      await tester.tap(find.byKey(const Key('menu-react-❤️')));
      await tester.pumpAndSettle();
      final calls = r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction');
      expect((calls.single.data as Map)['emoji'], '❤️');
      expect(find.byKey(const Key('chat-reactions-m001')), findsOneWidget);
      await tester.tap(find.byKey(const Key('chat-reactions-m001')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('who-remove')));
      await tester.pumpAndSettle();
      final after = r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction');
      expect(after, hasLength(2));
      expect((after.last.data as Map)['emoji'], isNull);
      expect(find.byKey(const Key('chat-reactions-m001')), findsNothing);
    });

    testWidgets('the reaction pill opens who reacted; «إزالة تفاعلي» removes mine; theirs alone has no remove',
        (tester) async {
      final r = ChatTestRoom(messages: [
        {
          ...msg(1),
          'reactions': [
            {'emoji': '😊', 'mine': false},
          ],
        },
        msg(2),
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-reactions-m001')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('who-reacted')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('who-reacted')), matching: find.text('عمر')), findsOneWidget);
      expect(find.byKey(const Key('who-remove')), findsNothing);
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('who-reacted')), findsNothing);
      expect(r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction'), isEmpty);

      // Mine too: «أنت» comes first, and removing sends `{emoji: null}`
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-react-❤️')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('chat-reactions-m001')));
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byKey(const Key('who-reacted')), matching: find.text('أنت')), findsOneWidget);
      await tester.tap(find.byKey(const Key('who-remove')));
      await tester.pumpAndSettle();
      final calls = r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction');
      expect(calls.last.data, {'emoji': null});
      expect(find.byKey(const Key('who-reacted')), findsNothing);
    });

    testWidgets('a refused reaction goes back with the server\'s message', (tester) async {
      final r = ChatTestRoom();
      r.adapter.on('POST', '/api/chats/c1/messages/m001/reaction', const FakeResponse(429, {'error': 'تمهّل قليلاً'}));
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-react-👍')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reactions-m001')), findsNothing);
      expect(find.text('تمهّل قليلاً'), findsOneWidget);
    });

    testWidgets('«نسخ» copies the text; «إبلاغ عن الرسالة» opens the report with that message named', (tester) async {
      final r = ChatTestRoom();
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-copy')));
      await tester.pumpAndSettle();
      expect(copied, 'رسالة 1');
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('selection-more')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-report')));
      await tester.pumpAndSettle();
      expect(find.text('إبلاغ عن الرسالة'), findsOneWidget);
      // The message is shown as a quote (its id goes with the report); the details start empty
      final quote = find.byKey(const Key('report-message'));
      expect(find.descendant(of: quote, matching: find.text('رسالة 1')), findsOneWidget);
      final details = tester.widgetList<TextField>(find.byType(TextField)).last;
      expect(details.controller!.text, isEmpty);
    });

    testWidgets('my own message: no «إبلاغ»; a voice note: no «نسخ»', (tester) async {
      final r = ChatTestRoom(messages: [
        {...msg(1, mine: true)},
        {
          ...msg(2),
          'body': 'رسالة صوتية',
          'kind': 'VOICE',
          'media': {'url': '/api/chats/c1/media/m002', 'type': 'audio/mp4', 'durationSec': 3},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('selection-more')), findsNothing);
      expect(find.byKey(const Key('menu-copy')), findsOneWidget);
      await tester.tap(find.byKey(const Key('selection-close')));
      await tester.pumpAndSettle();
      await tester.longPress(find.byKey(const Key('voice-waveform')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-copy')), findsNothing);
      expect(find.byKey(const Key('selection-more')), findsOneWidget);
    });

    testWidgets('an ended chat: no reply, no reactions, no swipe; copy and report stay', (tester) async {
      final r = ChatTestRoom(status: 'ENDED');
      await r.open(tester);
      await tester.pumpAndSettle();
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-reply')), findsNothing);
      expect(find.byKey(const Key('menu-react-❤️')), findsNothing);
      expect(find.byKey(const Key('menu-copy')), findsOneWidget);
      expect(find.byKey(const Key('selection-more')), findsOneWidget);
    });
  });

  group('typing', () {
    testWidgets('the poll says he is typing: «يكتب الآن…» under the name for 5 s', (tester) async {
      final r = ChatTestRoom(partnerTyping: true);
      await r.open(tester);
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      // The viewer is a woman: her partner «يكتب»
      expect(find.text('يكتب الآن…'), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
      expect(find.byKey(const Key('chat-typing')), findsNothing);
    });

    testWidgets('never in an ended chat', (tester) async {
      final r = ChatTestRoom(status: 'ENDED', partnerTyping: true);
      await r.open(tester);
      expect(find.byKey(const Key('chat-typing')), findsNothing);
    });

    testWidgets('my typing is sent at most every 3 s', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.enterText(chatInput, 'ا');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.enterText(chatInput, 'اه');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.enterText(chatInput, 'اهل');
      await tester.pump();
      expect(r.adapter.to('POST', '/api/chats/c1/typing'), hasLength(1));
    });

    testWidgets('live: his typing shows with no fetch, mine is ignored; a live reaction updates the bubble',
        (tester) async {
      final r = ChatTestRoom();
      r.live = FakeLive(fakeClient(r.adapter));
      await r.open(tester);
      final gets = r.adapter.to('GET', '/api/chats/c1').length;
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'u1'}));
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsNothing);
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'p1'}));
      // Delivered on the next microtask, drawn on the frame after
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      r.live!.controller.add(const ChatLiveEvent('reaction', {
        'messageId': 'm001',
        'reactions': [
          {'emoji': '😊', 'userId': 'p1'},
        ],
      }));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-reactions-m001')), findsOneWidget);
      expect(r.adapter.to('GET', '/api/chats/c1').length, gets);
      await tester.pump(const Duration(seconds: 6));
      await r.leave(tester);
    });
  });

  group('starters', () {
    const starters = ['ما خططك للسنوات القادمة؟', 'كيف تحب أن تقضي يوم الجمعة؟'];

    testWidgets('shown while I haven\'t written; a tap fills the box to edit, nothing is sent', (tester) async {
      final r = ChatTestRoom(starters: starters);
      await r.open(tester);
      expect(find.byKey(const Key('chat-starters')), findsOneWidget);
      await tester.tap(find.text(starters.first));
      await tester.pump();
      expect(tester.widget<TextField>(chatInput).controller!.text, starters.first);
      expect(r.sends, isEmpty);
      // While the box has text, the chips step aside
      expect(find.byKey(const Key('chat-starters')), findsNothing);
      await tester.enterText(chatInput, '${starters.first} وما رأيك؟');
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(r.sends.single['body'], '${starters.first} وما رأيك؟');
      expect(find.byKey(const Key('chat-starters')), findsNothing);
    });

    testWidgets('none once I have written', (tester) async {
      final r = ChatTestRoom(starters: starters, messages: [msg(1, mine: true)]);
      await r.open(tester);
      expect(find.byKey(const Key('chat-starters')), findsNothing);
    });
  });

  group('photo preview', () {
    testWidgets('«إلغاء» on the preview: nothing uploads and the picked copy is deleted', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await pickFromGallery(tester);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('photo-preview-send')), findsOneWidget);
      expect(r.uploads, isEmpty);
      await tester.tap(find.byKey(const Key('photo-preview-cancel')));
      await tester.pumpAndSettle();
      expect(r.uploads, isEmpty);
      expect(r.picked!.existsSync(), isFalse);
    });

    testWidgets('leaving the chat while the preview is open sends nothing', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await pickFromGallery(tester);
      await tester.pumpAndSettle();
      await r.leave(tester);
      expect(tester.takeException(), isNull);
      expect(r.uploads, isEmpty);
    });
  });

  group('unread on open', () {
    testWidgets('«رسائل جديدة» is scrolled into view when the chat opens on many unread messages', (tester) async {
      final r = ChatTestRoom(messages: [
        for (var n = 1; n <= 20; n++) {...msg(n), 'readAt': '2026-10-30T12:00:00.000Z'},
        for (var n = 21; n <= 60; n++) msg(n),
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      final divider = find.byKey(const Key('chat-unread-divider'));
      expect(divider, findsOneWidget);
      final list = tester.getRect(find.byType(ListView).first);
      final rect = tester.getRect(divider);
      expect(rect.top, greaterThanOrEqualTo(list.top));
      expect(rect.bottom, lessThanOrEqualTo(list.bottom));
      expect(find.text('رسالة 21'), findsOneWidget);
    });
  });

  group('review polish (Task 8b)', () {
    testWidgets('released while the microphone is still starting: «الرسالة قصيرة جداً», nothing kept or sent',
        (tester) async {
      final r = ChatTestRoom()..startGate = Completer<void>();
      await r.open(tester);
      final g = await holdMic(tester);
      // The recorder hasn't started yet (a slow microphone)
      expect(r.rec.started, isFalse);
      await g.up();
      await frames(tester);
      expect(find.text(holdTooShortText), findsOneWidget);
      r.startGate!.complete();
      await frames(tester);
      expect(r.rec.cancelled, isTrue);
      expect(r.uploads, isEmpty);
      expect(find.byKey(const Key('voice-hold-bar')), findsNothing);
      await r.leave(tester);
    });

    testWidgets('a blocked microphone answers while the mic is held: letting go keeps the reason on screen',
        (tester) async {
      final r = ChatTestRoom();
      r.permission = () async => false;
      await r.open(tester);
      final g = await holdMic(tester);
      await frames(tester);
      expect(find.text(micRefusedText), findsOneWidget);
      await g.up();
      await frames(tester);
      // Not replaced by «الرسالة قصيرة جداً»: the refusal and its «الإعدادات» stay
      expect(find.text(holdTooShortText), findsNothing);
      expect(find.text(micRefusedText), findsOneWidget);
      expect(find.text('الإعدادات'), findsOneWidget);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('a first «لا» to the microphone during a hold still says why (QA A2-L5)', (tester) async {
      final r = ChatTestRoom();
      final answer = Completer<bool>();
      r.permission = () => answer.future;
      await r.open(tester);
      final g = await holdMic(tester);
      await g.up();
      await tester.pump();
      answer.complete(false);
      await frames(tester);
      expect(find.text(micRefusedText), findsOneWidget);
      expect(r.rec.started, isFalse);
      await r.leave(tester);
    });

    testWidgets('released while the microphone prompt is up: «الرسالة قصيرة جداً» never said; once allowed, how to record (U3)',
        (tester) async {
      final r = ChatTestRoom();
      final answer = Completer<bool>();
      r.permission = () => answer.future;
      await r.open(tester);
      final g = await holdMic(tester);
      await g.up();
      await frames(tester);
      expect(find.text(holdTooShortText), findsNothing);
      expect(find.textContaining('تم السماح بالميكروفون'), findsNothing);
      answer.complete(true);
      await frames(tester);
      // The member (سارة) is a woman: the feminine command, as on the website
      expect(find.text(micAllowedHint(true)), findsOneWidget);
      expect(micAllowedHint(true), 'تم السماح بالميكروفون، اضغطي مطولاً للتسجيل');
      expect(micAllowedHint(false), 'تم السماح بالميكروفون، اضغط' ' مطولاً للتسجيل');
      expect(r.rec.started, isFalse);
      expect(r.uploads, isEmpty);
      await r.leave(tester);
    });

    testWidgets('the reactions chip and a quote are at least 44 px tall to tap', (tester) async {
      final r = ChatTestRoom(messages: [
        {
          ...msg(1),
          'reactions': [
            {'emoji': '❤️', 'mine': true},
          ],
        },
        {
          ...msg(2),
          'replyTo': {'id': 'm001', 'mine': false, 'kind': 'TEXT', 'snippet': 'رسالة 1'},
        },
      ]);
      await r.open(tester);
      await tester.pumpAndSettle();
      final chip = find.byKey(const Key('chat-reactions-m001'));
      final tapArea = find.ancestor(of: chip, matching: find.byType(GestureDetector)).first;
      expect(tester.getSize(tapArea).height, greaterThanOrEqualTo(44));
      expect(tester.getSize(find.byKey(const Key('chat-quote-m001'))).height, greaterThanOrEqualTo(44));
    });

    testWidgets('a swipe past the reply point that the system cancels does not reply', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await tester.startGesture(tester.getCenter(find.text('رسالة 1')));
      for (var i = 0; i < 6; i++) {
        await g.moveBy(const Offset(-15, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      await g.cancel();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    });

    testWidgets('a live «typing» that arrives after their message is not shown again', (tester) async {
      final r = ChatTestRoom();
      r.live = FakeLive(fakeClient(r.adapter));
      await r.open(tester);
      r.live!.controller.add(const ChatLiveEvent('message', {'id': 'm002', 'senderId': 'p1'}));
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'p1'}));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsNothing);
      // A real new signal a moment later shows
      await tester.pump(const Duration(seconds: 2));
      r.live!.controller.add(const ChatLiveEvent('typing', {'userId': 'p1'}));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('chat-typing')), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
      await r.leave(tester);
    });

    testWidgets('«إبلاغ عن الرسالة» sends the reported message id with the report', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('selection-more')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-report')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-submit')));
      await tester.pumpAndSettle();
      final report = (r.adapter.to('POST', '/api/chats/c1/end').single.data as Map)['report'] as Map;
      expect(report['reason'], 'HARASSMENT');
      expect(report['messageId'], 'm001');
      expect(report.containsKey('details'), isFalse);
    });

    testWidgets('«إبلاغ فقط» files the report with end:false; the chat stays open (A-M02)', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.longPress(find.text('رسالة 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('selection-more')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-report')));
      await tester.pumpAndSettle();
      // The other choice states what it does besides the report
      expect(find.textContaining('ويُحظر الطرف الآخر ويُغلق التوافق'), findsOneWidget);
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-only')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-only')));
      await tester.pumpAndSettle();
      final body = r.adapter.to('POST', '/api/chats/c1/end').single.data as Map;
      expect(body['end'], isFalse);
      expect((body['report'] as Map)['messageId'], 'm001');
      expect(find.text('تم إرسال البلاغ، وسيراجعه فريق نصيبك.'), findsOneWidget);
      expect(find.byKey(const Key('chat-input')), findsOneWidget);
    });

    testWidgets('the chat menu «إبلاغ» (no message) sends no message id', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      await tester.tap(find.byTooltip('خيارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إبلاغ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إزعاج أو تحرش'));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('report-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('report-submit')));
      await tester.pumpAndSettle();
      final report = (r.adapter.to('POST', '/api/chats/c1/end').single.data as Map)['report'] as Map;
      expect(report.containsKey('messageId'), isFalse);
    });

    testWidgets('polling: reaction changes on older messages come back with the next poll (reactionsSince)',
        (tester) async {
      final r = ChatTestRoom(
        pollInterval: const Duration(seconds: 4),
        messages: [
          for (var n = 1; n <= 40; n++)
            {
              ...msg(n),
              'readAt': '2026-10-30T12:00:00.000Z',
              if (n == 10)
                'reactions': [
                  {'emoji': '😊', 'mine': false},
                ],
            },
        ],
      )..polledAt = '2026-11-10T10:00:00.000Z';
      await r.open(tester);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reactions-m010')), findsNothing, reason: 'off screen');
      // The partner reacts to message 30 and takes back their reaction on message 10 (outside ?after=)
      r.reactionUpdates = [
        {
          'messageId': 'm030',
          'reactions': [
            {'emoji': '👍', 'mine': false},
          ],
        },
        {'messageId': 'm010', 'reactions': []},
      ];
      await tester.pump(const Duration(seconds: 4));
      await tester.pump();
      final poll = r.adapter.to('GET', '/api/chats/c1').last;
      // The last answer's polledAt, less a few seconds (nothing missed in between)
      expect(poll.queryParameters['reactionsSince'], '2026-11-10T09:59:55.000Z');
      expect(find.byKey(const Key('chat-reactions-m030')), findsOneWidget);
      await tester.dragUntilVisible(
        find.text('رسالة 10'),
        find.byType(ListView).first,
        const Offset(0, 300),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-reactions-m010')), findsNothing);
      await r.leave(tester);
    });

    testWidgets('my voice note keeps its waveform when the server copy replaces the sending bubble', (tester) async {
      final r = ChatTestRoom();
      await r.open(tester);
      final g = await holdMic(tester);
      r.rec.now = const Duration(milliseconds: 1500);
      await tester.pump(const Duration(milliseconds: 300));
      await g.up();
      await frames(tester);
      final nonce = Map.fromEntries((r.uploads.single.data as FormData).fields)['clientNonce'];
      final painter = tester
          .widgetList<CustomPaint>(find.byType(CustomPaint))
          .map((c) => c.painter)
          .whereType<VoiceWaveformPainter>()
          .single;
      expect(painter.bars, voiceWaveform('local-$nonce', 2));
      await r.leave(tester);
    });
  });
}
