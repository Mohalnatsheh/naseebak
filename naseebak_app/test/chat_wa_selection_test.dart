// WhatsApp-style selection (Task 7): a long-press selects one message, the top bar replaces the header (✕, «1»,
// reply, copy, delete, ⋮ → report), the four reactions float above it; a tap on another bubble moves it, Android back
// clears it. The reply swipe goes inward (towards the middle of the screen).
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/chat/media_bubbles.dart';
import 'package:naseebak_app/features/chat/message_menu.dart';
import 'package:naseebak_app/features/chat/reply_strip.dart';
import 'package:naseebak_app/features/chat/wa_chat_header.dart';

import 'helpers/chat_room_helpers.dart';
import 'helpers/chat_test_room.dart';
import 'helpers/fake_api.dart';

/// Never finishes loading (enough for the photo's tap target)
class _PendingImage extends ImageProvider<_PendingImage> {
  const _PendingImage();
  @override
  Future<_PendingImage> obtainKey(ImageConfiguration configuration) => SynchronousFuture(this);
  @override
  ImageStreamCompleter loadImage(_PendingImage key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(Completer<ImageInfo>().future);
}

final _close = find.byKey(const Key('selection-close'));

ChatMessage _m(String id, {bool mine = false, bool deleted = false, SendState state = SendState.sent}) => ChatMessage(
      id: id,
      body: deleted ? deletedTrace : 'نص $id',
      createdAt: chatT0,
      mine: mine,
      state: state,
      deleted: deleted,
    );

/// The row tint behind [bubble]
Color? _wash(WidgetTester tester, Finder bubble) {
  final box = tester.widget<AnimatedContainer>(find.ancestor(of: bubble, matching: find.byType(AnimatedContainer)).first);
  return (box.decoration as BoxDecoration?)?.color;
}

Map<String, dynamic> _photo(int n) => {
      ...msg(n),
      'body': '📷 صورة',
      'kind': 'IMAGE',
      'media': {'url': '/api/chats/c1/media/m${n.toString().padLeft(3, '0')}', 'type': 'image/jpeg', 'width': 800, 'height': 600},
    };

Map<String, dynamic> _voice(int n) => {
      ...msg(n),
      'body': 'رسالة صوتية',
      'kind': 'VOICE',
      'media': {'url': '/api/chats/c1/media/m${n.toString().padLeft(3, '0')}', 'type': 'audio/mp4', 'durationSec': 3},
    };

void main() {
  test('selectionToolsFor: a trace of theirs offers report and delete only; my sending message nothing; a closed chat no reply or react',
      () {
    final trace = selectionToolsFor(_m('a', deleted: true), canInteract: true, deleteMode: DeleteMode.use, open: true);
    expect(trace, (react: false, reply: false, copy: false, delete: true, report: true));
    final sending =
        selectionToolsFor(_m('b', mine: true, state: SendState.sending), canInteract: true, deleteMode: DeleteMode.use, open: true);
    expect(sending, (react: false, reply: false, copy: false, delete: false, report: false));
    final closed = selectionToolsFor(_m('c'), canInteract: false, deleteMode: DeleteMode.hidden, open: false);
    expect(closed, (react: false, reply: false, copy: true, delete: false, report: true));
    final open = selectionToolsFor(_m('d', mine: true), canInteract: true, deleteMode: DeleteMode.upsell, open: true);
    expect(open, (react: true, reply: true, copy: true, delete: true, report: false));

    // The selected message as it is now: gone, sending, or nothing left to do → null
    final list = [_m('a'), _m('b', mine: true, deleted: true), _m('c', mine: true, state: SendState.failed)];
    expect(selectedMessageOf(list, 'a', canInteract: true, deleteMode: DeleteMode.hidden, open: true)?.id, 'a');
    expect(selectedMessageOf(list, 'zz', canInteract: true, deleteMode: DeleteMode.hidden, open: true), isNull);
    expect(selectedMessageOf(list, null, canInteract: true, deleteMode: DeleteMode.hidden, open: true), isNull);
    expect(selectedMessageOf(list, 'b', canInteract: true, deleteMode: DeleteMode.hidden, open: true), isNull);
    expect(selectedMessageOf(list, 'b', canInteract: true, deleteMode: DeleteMode.use, open: true)?.id, 'b');
    expect(selectedMessageOf(list, 'c', canInteract: true, deleteMode: DeleteMode.use, open: true), isNull);
  });

  test('swipeInwardSign: mine +1 and theirs -1 in RTL, mirrored in LTR', () {
    expect(swipeInwardSign(mine: true, direction: TextDirection.rtl), 1);
    expect(swipeInwardSign(mine: false, direction: TextDirection.rtl), -1);
    expect(swipeInwardSign(mine: true, direction: TextDirection.ltr), -1);
    expect(swipeInwardSign(mine: false, direction: TextDirection.ltr), 1);
  });

  testWidgets('long-press selects: the bar with ✕ and «1», the row washed, four reactions above it', (tester) async {
    final r = ChatTestRoom();
    await r.open(tester);
    expect(find.byType(WaChatHeader), findsOneWidget);
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(find.byTooltip('إلغاء التحديد'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('chat-selection-bar')), matching: find.text('1')), findsOneWidget);
    expect(find.byType(WaChatHeader), findsNothing);
    expect(_wash(tester, find.text('رسالة 1')), AppColors.chatSelect);
    for (final e in chatReactionEmoji) {
      expect(find.byKey(Key('menu-react-$e')), findsOneWidget);
    }
    // The picker sits above the selected bubble
    expect(
      tester.getBottomLeft(find.byKey(const Key('menu-react-❤️'))).dy,
      lessThanOrEqualTo(tester.getTopLeft(find.text('رسالة 1')).dy),
    );
    // ✕ ends it
    await tester.tap(_close);
    await tester.pumpAndSettle();
    expect(_close, findsNothing);
    expect(find.byType(WaChatHeader), findsOneWidget);
    expect(_wash(tester, find.text('رسالة 1')), isNot(AppColors.chatSelect));
  });

  testWidgets('a tap on another bubble moves the selection; a tap on the background clears it', (tester) async {
    final r = ChatTestRoom(messages: [msg(1), msg(2, mine: true)]);
    await r.open(tester);
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('رسالة 2'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(_wash(tester, find.text('رسالة 2')), AppColors.chatSelect);
    expect(_wash(tester, find.text('رسالة 1')), isNot(AppColors.chatSelect));
    // The selected one again: cleared
    await tester.tap(find.text('رسالة 2'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(_close, findsNothing);
    // The background
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    final list = tester.getRect(find.byType(ListView));
    await tester.tapAt(Offset(list.center.dx, list.top + 40));
    await tester.pumpAndSettle();
    expect(_close, findsNothing);
    expect(r.adapter.to('POST', '/api/chats/c1/messages/m001/reaction'), isEmpty);
  });

  testWidgets('Android back clears the selection and stays in the chat; the next back leaves', (tester) async {
    final r = ChatTestRoom()..withBack = true;
    await r.open(tester);
    await tester.pumpAndSettle();
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(_close, findsNothing);
    expect(chatInput, findsOneWidget);
    expect(find.text('chats-list'), findsNothing);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('chats-list'), findsOneWidget);
    expect(chatInput, findsNothing);
  });

  testWidgets('selected with a voice note unsent: the first back clears the selection, the second asks about the note',
      (tester) async {
    final r = ChatTestRoom()..withBack = true;
    await r.open(tester);
    await tester.pumpAndSettle();
    // A tap records hands-free (the locked bar)
    await tester.tap(chatMic);
    await frames(tester);
    expect(r.rec.started, isTrue);
    await tester.longPress(find.text('رسالة 1'));
    await frames(tester, 20);
    expect(_close, findsOneWidget);
    await tester.binding.handlePopRoute();
    await frames(tester, 20);
    expect(_close, findsNothing);
    expect(find.text('حذف الرسالة الصوتية؟'), findsNothing);
    await tester.binding.handlePopRoute();
    await frames(tester, 20);
    expect(find.text('حذف الرسالة الصوتية؟'), findsOneWidget);
    expect(find.text('chats-list'), findsNothing);
    expect(r.rec.cancelled, isFalse);
    await r.leave(tester);
  });

  testWidgets('while selecting, a tap with a little sideways jitter (≤ 10 px) moves the selection and never replies',
      (tester) async {
    final r = ChatTestRoom(messages: [msg(1), msg(2, mine: true)]);
    await r.open(tester);
    await tester.longPress(find.text('رسالة 2'));
    await tester.pumpAndSettle();
    // The partner's bubble: inward is left in Arabic
    final g = await tester.startGesture(tester.getCenter(find.text('رسالة 1')));
    await g.moveBy(const Offset(-5, 0));
    await tester.pump(const Duration(milliseconds: 16));
    await g.moveBy(const Offset(-5, 0));
    await tester.pump(const Duration(milliseconds: 16));
    await g.up();
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(_wash(tester, find.text('رسالة 1')), AppColors.chatSelect);
    expect(_wash(tester, find.text('رسالة 2')), isNot(AppColors.chatSelect));
    expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
  });

  testWidgets('a long-press on a photo selects it; no viewer opens; while selecting, a tap on a photo selects it',
      (tester) async {
    final r = ChatTestRoom(messages: [_photo(1), msg(2)])..image = (_, _) => const _PendingImage();
    await r.open(tester);
    await tester.pumpAndSettle();
    expect(find.byType(PhotoBubble), findsOneWidget);
    await tester.longPress(find.byType(PhotoBubble));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(_wash(tester, find.byType(PhotoBubble)), AppColors.chatSelect);
    // Move to the text, then tap the photo: selected again, still no viewer
    await tester.tap(find.text('رسالة 2'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(_wash(tester, find.text('رسالة 2')), AppColors.chatSelect);
    await tester.tap(find.byType(PhotoBubble), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(_wash(tester, find.byType(PhotoBubble)), AppColors.chatSelect);
    expect(_close, findsOneWidget);
  });

  testWidgets('a long-press on a voice note selects it and does not play', (tester) async {
    final r = ChatTestRoom(messages: [msg(1), _voice(2)]);
    await r.open(tester);
    await tester.pumpAndSettle();
    // On the play button itself (no tooltip may take the long-press)
    await tester.longPress(find.byIcon(Icons.play_arrow_rounded));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(_wash(tester, find.byKey(const Key('voice-waveform'))), AppColors.chatSelect);
    expect(r.players.fold<int>(0, (n, p) => n + p.plays), 0);
    // While selecting, a tap on the play button selects instead of playing (the text above is selected first: the
    // picker then floats above it, clear of the voice note)
    await tester.tap(_close);
    await tester.pumpAndSettle();
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.play_arrow_rounded), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(_wash(tester, find.byKey(const Key('voice-waveform'))), AppColors.chatSelect);
    expect(r.players.fold<int>(0, (n, p) => n + p.plays), 0);
    // And on the waveform
    await tester.tap(_close);
    await tester.pumpAndSettle();
    await tester.longPress(find.byKey(const Key('voice-waveform')));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(r.players.fold<int>(0, (n, p) => n + p.plays), 0);
  });

  testWidgets('the selected message deleted for everyone by a live event: the bar keeps only report (theirs) or closes (mine)',
      (tester) async {
    // Without Pro's delete (the switch off): a trace of mine leaves nothing to do
    final r = ChatTestRoom(messages: [msg(1), msg(2, mine: true)])..deleteEnabled = false;
    r.live = FakeLive(fakeClient(r.adapter));
    await r.open(tester);
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('menu-reply')), findsOneWidget);
    r.live!.controller.add(const ChatLiveEvent('deleted', {'messageId': 'm001'}));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(find.byKey(const Key('menu-reply')), findsNothing);
    expect(find.byKey(const Key('menu-copy')), findsNothing);
    expect(find.byKey(const Key('menu-react-❤️')), findsNothing);
    expect(find.byKey(const Key('menu-delete')), findsNothing);
    expect(find.byKey(const Key('selection-more')), findsOneWidget);

    // A long-press on another bubble while selecting moves the selection too
    await tester.longPress(find.text('رسالة 2'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('menu-copy')), findsOneWidget);
    r.live!.controller.add(const ChatLiveEvent('deleted', {'messageId': 'm002'}));
    await tester.pumpAndSettle();
    expect(_close, findsNothing);
    expect(find.byType(WaChatHeader), findsOneWidget);
    // Nothing comes back by itself once the id is gone
    await tester.pump(const Duration(seconds: 1));
    expect(_close, findsNothing);
  });

  testWidgets('the chat ends on a poll while selected: reply and reactions disappear from the bar', (tester) async {
    final r = ChatTestRoom(pollInterval: const Duration(seconds: 4));
    await r.open(tester);
    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('menu-reply')), findsOneWidget);
    r.status = 'ENDED';
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(_close, findsOneWidget);
    expect(find.byKey(const Key('menu-reply')), findsNothing);
    expect(find.byKey(const Key('menu-react-❤️')), findsNothing);
    expect(find.byKey(const Key('menu-copy')), findsOneWidget);
    expect(find.byKey(const Key('selection-more')), findsOneWidget);
    await r.leave(tester);
  });

  testWidgets('reply from the bar opens the strip; copy puts the text on the clipboard; ⋮ → «إبلاغ عن الرسالة» opens the report naming it',
      (tester) async {
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
    await tester.tap(find.byKey(const Key('menu-reply')));
    await tester.pumpAndSettle();
    expect(_close, findsNothing);
    expect(find.byKey(const Key('chat-reply-strip')), findsOneWidget);
    await tester.tap(find.byKey(const Key('chat-reply-close')));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-copy')));
    await tester.pumpAndSettle();
    expect(copied, 'رسالة 1');
    expect(_close, findsNothing);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('رسالة 1'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('menu-report')), findsNothing);
    await tester.tap(find.byKey(const Key('selection-more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-report')));
    await tester.pumpAndSettle();
    final quote = find.byKey(const Key('report-message'));
    expect(find.descendant(of: quote, matching: find.text('رسالة 1')), findsOneWidget);
  });

  testWidgets('swipe my bubble inward (right in Arabic) replies; outward does nothing; the partner\'s inward is left',
      (tester) async {
    final r = ChatTestRoom(messages: [msg(1), msg(2, mine: true)]);
    await r.open(tester);
    await tester.drag(find.text('رسالة 2'), const Offset(-90, 0));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    await tester.drag(find.text('رسالة 2'), const Offset(90, 0));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('chat-reply-strip')), matching: find.text('أنت')), findsOneWidget);
    await tester.tap(find.byKey(const Key('chat-reply-close')));
    await tester.pumpAndSettle();
    await tester.drag(find.text('رسالة 1'), const Offset(90, 0));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    await tester.drag(find.text('رسالة 1'), const Offset(-90, 0));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('chat-reply-strip')), matching: find.text('عمر')), findsOneWidget);
  });

  testWidgets('a vertical drag starting on a bubble scrolls and never replies', (tester) async {
    final r = ChatTestRoom(messages: [for (var n = 1; n <= 40; n++) msg(n, mine: n.isEven, readAt: chatT0)]);
    await r.open(tester);
    await tester.pumpAndSettle();
    final start = tester.getCenter(find.text('رسالة 39'));
    ScrollPosition position() =>
        tester.state<ScrollableState>(find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first).position;
    expect(position().pixels, 0);
    final g = await tester.startGesture(start);
    // A little sideways jitter first (inward for the partner's bubble), then mostly down
    await g.moveBy(const Offset(-8, 0));
    await tester.pump(const Duration(milliseconds: 16));
    for (var i = 0; i < 10; i++) {
      await g.moveBy(const Offset(-6, 30));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    expect(position().pixels, greaterThan(100));
  });

  testWidgets('dragging the voice waveform inward seeks and never replies', (tester) async {
    final r = ChatTestRoom(messages: [msg(1), _voice(2)]);
    await r.open(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.play_arrow_rounded));
    await tester.pumpAndSettle();
    final player = r.players.single;
    // The partner's note: inward is left in Arabic
    await tester.drag(find.byKey(const Key('voice-waveform')), const Offset(-90, 0));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-reply-strip')), findsNothing);
    expect(player.seeks, isNotEmpty);
    await r.leave(tester);
  });
}
