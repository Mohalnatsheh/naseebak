# WhatsApp-style chat — app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Flutter app's chat room and chats list the same WhatsApp-for-Android layout and gestures as the
finished website version, in Naseebak's colours, and fix the chat audit's app bugs B1 and B2. Hard cut in the next app
version: no switch, no server change.

**Architecture:**
- The engine in `chat_room_screen.dart` stays: send queue, nonces, Ably/polling, cache, reactions, delete/clear,
  report/end, voice recording. Only B1 (read marking) and B2 (failed send after leaving) touch it.
- Presentation moves out of the 2,877-line room into focused widgets: `wa_chat_header.dart` (header and ⋮ menu),
  `wa_selection.dart` (selection bar, reaction picker, delete choice, who reacted), `wa_composer.dart` (input pill,
  attach sheet, read-only footer, jump-to-newest), `emoji_panel.dart` + `emoji_data.dart`. The room keeps state and
  passes values and callbacks down.
- `chat_bubble.dart`, `reply_strip.dart` and `chats_screen.dart` are changed in place.

**Tech Stack:** Flutter (Dart 3), Riverpod, go_router, `image_picker`, `record`, `just_audio`; `flutter_test` with
the fake Dio adapter (`test/helpers/fake_api.dart`).

**Spec:** `docs/superpowers/specs/2026-11-13-whatsapp-style-chat-design.md` (owner-approved 2026-11-13). The website
reference is `src/components/chat/wa-*.tsx`, `emoji-panel.tsx`, `emoji-data.ts`, `wa-chat-logic.ts`. Audit:
`docs/qa/2026-11-13-chat-audit.md` in the main checkout (B1, B2, U3).

**Worktree:** `/Users/mohammadabudiab/Documents/EvoKey-Projects/naseebak-app-wa-chat`, branch
`feature/app-whatsapp-chat`. Run Flutter commands in `naseebak_app/`. Stage files by path, never `git add -A`. Every
commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Global Constraints

- **Owner decisions after the spec (binding):** my bubbles on the END side (left in RTL), `bubbleMine` with ink text;
  the partner's white on the start side. Reply swipe goes inward toward the centre. ONE paperclip in the pill whose
  sheet holds «المعرض» and «الكاميرا», no separate camera button. Emoji panel = the website's hand-picked set, no new
  package. Chips «الكل» / «غير مقروءة» / «المنتهية». Selection: one message, top action bar + floating reactions
  ❤️ 👍 😊 🤲, a tap on another bubble moves it, Android back clears it, the reaction pill shows who reacted. Ticks:
  ✓ sent and unread, navy ✓✓ read.
- **No server or API change.** Every request and field stays as today.
- **No switch.** The new chat replaces the old one in the app. Don't bump `pubspec.yaml` (release is a separate owner
  step).
- **Tokens:** colours from `AppColors`, text from `AppText` only; no raw `fontSize:` in feature code
  (`test/design_kit_test.dart`). New tokens use the website's names: `bubbleMine` `0xFFDFE9F4`, `bubbleMineQuote`
  `0xFFCDDBE9`, `chatSelect` `0x2422476A` (navy at 14 %), `chatChip` `0xEBFFFFFF` (white at 92 %), `safetyChip`
  `0xFFF9EDD9` (text stays `goldText`).
- **No opacity layers in animations** (`AlphaFade` or alpha in colours; QA A-L10). Every animation instant under
  `MediaQuery.disableAnimations` (`AppMotion.of`).
- **RTL:** `Directional` paddings and alignments; Western digits; counted nouns via `arabicCount()`
  (`core/localization/arabic_count.dart`); gendered copy via `forViewer`.
- **Sizes:** tap targets ≥ 44 px; the text field stays `AppText.body` (16 px).
- **Pro rules unchanged:** media, delete and clear follow `mediaButtonsMode` / `deleteModeOf`, both ANDed with
  `appPaymentsProvider` as today. Locked = greyed with the «Pro» tag, opens `/pro`; hidden where the member can't buy.
- **Kept as is:** the status-bar logic (`chatStatusBar`), the family steps, report «إبلاغ فقط» / «إبلاغ وإنهاء
  المحادثة», hold-to-record gestures and limits, `SecureArea`, `VoicePlayback` per room, drafts, `ChatCache` shape v2.
- **After any `await` in a State**, check `mounted` before `setState` / `ref` / `context` (app rule).
- **Before calling a task done:** `flutter analyze` (0 issues) and the task's tests. Full `flutter test` at the end of
  Tasks 4, 8 and 10.

## Review Focus

1. **A long-press on a photo or voice note selects it and nothing else.** No viewer, no playback; while a selection
   is open, a tap on a photo selects it instead of opening it. Pinned in Task 7.
2. **The selected message can change under the selection** (a live `deleted` or `cleared`, the chat closing on a
   poll). The bar recomputes or closes, never acts on a stale copy. Pinned in Task 7.
3. **Android back closes what is open before leaving:** the selection, then the emoji panel; recording keeps today's
   guard. Pinned in Tasks 7 and 8.
4. **A vertical scroll that starts on a bubble never replies, and an outward swipe never replies.** Pinned in Task 7.
5. **An emoji lands at the cursor, replaces a selection, and never passes the 2,000-character limit.** Pinned in
   Task 8.

---

### Task 1: B1 — mark read only while the chat is on top

**Files:**
- Create: `naseebak_app/lib/core/routing/route_observer.dart`
- Modify: `naseebak_app/lib/core/routing/router.dart:195` (GoRouter `observers:`)
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart` (`_markRead` 1072-1077, `_poll` 816,
  `didChangeDependencies` 954, `dispose` 344, `_load` 597)
- Modify: `naseebak_app/lib/features/chat/chat_format.dart` (pure helper)
- Modify: `naseebak_app/test/helpers/fake_api.dart` (`rtlApp`: `navigatorObservers: [appRouteObserver]`)
- Create: `naseebak_app/test/helpers/chat_test_room.dart` (moved from `chat_composer_test.dart`)
- Modify: `naseebak_app/test/chat_composer_test.dart` (imports the moved helper)
- Test: `naseebak_app/test/chat_read_on_top_test.dart`

**Interfaces:**
- Produces:
  - `final appRouteObserver = RouteObserver<ModalRoute<dynamic>>();` in `route_observer.dart`.
  - `bool readIsDue({required bool onTop, required bool foreground, required DateTime? newestPartnerAt, required DateTime? readUpTo})`
    in `chat_format.dart`: true only when on top, in the foreground, and the newest partner message is after `readUpTo`
    (or `readUpTo` is null).
  - `ChatTestRoom` (was `_Room`), `FakeLive`, `holdMic(WidgetTester)` (was `_hold`), `frames(WidgetTester, [int])`,
    `chatInput`, `chatMic` finders in `test/helpers/chat_test_room.dart`. Same fields and behaviour as today's `_Room`.

- [ ] **Step 1: Move the composer test's room helper.** Cut `FakeLive`, `_Room`, `_hold`, `_frames`, `_mic`, `_input`
  out of `chat_composer_test.dart` into `test/helpers/chat_test_room.dart` under the public names above; update the
  test file to use them. Run `flutter test test/chat_composer_test.dart`. Expected: PASS, same count as before.
- [ ] **Step 2: Write the failing tests** in `test/chat_read_on_top_test.dart`:

```dart
test('readIsDue: only on top, in front, and when the partner wrote after the last read', () {
  final t = DateTime.utc(2026, 11, 14, 10);
  expect(readIsDue(onTop: true, foreground: true, newestPartnerAt: t, readUpTo: null), isTrue);
  expect(readIsDue(onTop: false, foreground: true, newestPartnerAt: t, readUpTo: null), isFalse);
  expect(readIsDue(onTop: true, foreground: false, newestPartnerAt: t, readUpTo: null), isFalse);
  expect(readIsDue(onTop: true, foreground: true, newestPartnerAt: t, readUpTo: t), isFalse);
  expect(readIsDue(onTop: true, foreground: true, newestPartnerAt: null, readUpTo: null), isFalse);
});
```
  - `testWidgets('a page pushed over the chat: new partner messages are not marked read (B1)')`: `ChatTestRoom` with
    `pollInterval: 4 s`, open, note `adapter.to('POST', '/api/chats/c1/read').length` as `before`; push a
    `MaterialPageRoute` with an empty `Scaffold` on the room's navigator; add `msg(2)` to `r.messages`; pump 4 s
    twice. Expect the read count still `before`, and the GET poll did run (`adapter.to('GET', '/api/chats/c1')` grew).
  - `testWidgets('coming back to the chat marks the waiting messages read at once (B1)')`: continue as above, pop the
    route, pump a few frames (no poll interval). Expect exactly one new `POST /read`.
  - `testWidgets('a dialog over the chat pauses read marking too')`: open the ⋮ menu → «إبلاغ» sheet, deliver
    `msg(2)` by a poll, expect no new read; close the sheet, expect one.
- [ ] **Step 3: Run** `flutter test test/chat_read_on_top_test.dart`. Expected: FAIL (`readIsDue` undefined, extra reads).
- [ ] **Step 4: Implement.**
  - Register `appRouteObserver` in GoRouter `observers: [appRouteObserver]` and in `rtlApp`.
  - The room mixes in `RouteAware`; it caches `ModalRoute.of(context)` in `didChangeDependencies`, subscribes once,
    unsubscribes in `dispose`. `bool get _onTop => _route?.isCurrent ?? true`.
  - Keep `DateTime? _readUpTo`, set from the `upTo` sent once `markRead` succeeds.
  - `_markRead()` returns early unless `_onTop && !_background`.
  - After each poll, call `_markRead()` when `readIsDue(...)` is true. This replaces `if (fresh.any(!mine))`, so a
    failed or skipped read is retried on the next poll.
  - `didPopNext` calls `_markRead()` when due.
  - `didPushNext` does nothing else: polling continues for the unseen count.
- [ ] **Step 5: Run** `flutter test test/chat_read_on_top_test.dart test/chat_room_test.dart test/chat_composer_test.dart`.
  Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add naseebak_app/lib/core/routing/route_observer.dart naseebak_app/lib/core/routing/router.dart naseebak_app/lib/features/chat/chat_room_screen.dart naseebak_app/lib/features/chat/chat_format.dart naseebak_app/test/helpers/fake_api.dart naseebak_app/test/helpers/chat_test_room.dart naseebak_app/test/chat_composer_test.dart naseebak_app/test/chat_read_on_top_test.dart
git commit -m "App chat: mark read only while the chat is on top, again on return (audit B1)"
```

### Task 2: B2 — a text failing after the chat was left is kept as failed

**Files:**
- Modify: `naseebak_app/lib/features/chat/chat_cache.dart` (abstract `ChatCache`)
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart` (`_send` 1079-1140)
- Test: `naseebak_app/test/chat_room_test.dart` (group `QA fixes (A1)`), `naseebak_app/test/chat_cache_test.dart`

**Interfaces:**
- Produces: `Future<void> addFailed(String memberId, String chatId, ChatMessage failed, {ChatSummary? conversation})`
  as a concrete method on `ChatCache`. It reads the chat's copy and writes it back with `failed` added (replacing any
  item with the same `nonce`). With no copy, it writes one from `conversation` with `hasMore: true`, or does nothing
  when `conversation` is null.

- [ ] **Step 1: Write the failing tests.**
  - `chat_cache_test.dart`, `test('addFailed adds a failed text to the copy, once per nonce')`: a `MemoryChatCache`
    holding `cached([1])`. Call `addFailed` twice with the same nonce. Expect `read` to give 2 messages, the last
    `state == SendState.failed`, `body == 'نص'`, `maybeSent == true`.
  - `test('addFailed with no copy writes one from the conversation, or nothing without it')`.
  - `chat_room_test.dart`, `testWidgets('a text whose send fails after leaving the chat is kept as failed (B2)')`:
    - Hold `POST /api/chats/c1/messages` on a `Completer`, answering `FakeResponse.network()`.
    - Type «نص مهم», tap send, then leave the room (pump a `SizedBox`).
    - Complete the hold and pump.
    - Expect `cache.read('u1', 'c1')` to hold a failed «نص مهم» with `maybeSent: true`.
    - Reopen the room. Expect «نص مهم» on screen with its failed marker (`chat-failed-info` from Task 6; until then,
      find the text «إعادة الإرسال»).
  - `testWidgets('a failure after a sign-out writes nothing back')`: same flow, but sign out before completing. Expect
    `cache.read` to be null.
- [ ] **Step 2: Run** `flutter test test/chat_cache_test.dart test/chat_room_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `_send`, before the request, take the cache, `_memberId`, `_chat` and the `ProviderScope` container (already
    taken there).
  - In the `ApiException` catch, when `!mounted`, build the failed copy as the mounted path does. Call
    `addFailed(...)` only when `container.read(authControllerProvider).me?.id` still equals that member and
    `!_signedOut`. Then return.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** (`chat_cache.dart`, `chat_room_screen.dart`, both test files): "App chat: a text failing
  after leaving the chat is saved as failed (audit B2)".

### Task 3: Tokens and the bubble's new side and colours

**Files:**
- Modify: `naseebak_app/lib/core/theme/app_theme.dart:45-48` (`AppColors`)
- Modify: `naseebak_app/lib/features/chat/chat_bubble.dart` (`build` 60-110, `_meta` 199-235, quote colour)
- Modify: `naseebak_app/lib/features/chat/reply_strip.dart` (`QuoteInBubble` colours on my bubble)
- Modify: `naseebak_app/lib/features/chat/media_bubbles.dart` (`VoiceBubble` colour on my bubble is ink)
- Modify: `naseebak_app/lib/features/chat/chats_screen.dart` (list tick colour)
- Test: `naseebak_app/test/chat_look_test.dart` (group `bubbles`)

**Interfaces:**
- Produces: `AppColors.bubbleMine`, `bubbleMineQuote`, `chatSelect`, `chatChip`, `safetyChip` (values in Global
  Constraints). `AppColors.chatMine` now equals `bubbleMine`.

- [ ] **Step 1: Write the failing tests** in `chat_look_test.dart`:
  - `test('chat tokens match the website and pass contrast')`:
    - Each token equals its value from Global Constraints.
    - `contrast(AppColors.ink, AppColors.bubbleMine) >= 7`.
    - `contrast(AppColors.muted, AppColors.bubbleMine) >= 4.5`.
    - `contrast(AppColors.navy, AppColors.bubbleMine) >= 4.5`.
    - Use a local `contrast(a, b)` from `computeLuminance()`.
  - `testWidgets('my bubble sits on the end side (left in Arabic) in bubbleMine with ink text; theirs on the start side in white')`:
    `getCenter` of my text is left of the partner's, and the `BubblePainter` colours are `bubbleMine` / `chatTheirs`.
  - `testWidgets('ticks: ✓ grey while unread, ✓✓ navy once read')`: two of my messages, one with `readAt`. Find
    `Icons.done_rounded` with colour `AppColors.muted` and `Icons.done_all_rounded` with `AppColors.navy`. Semantic
    labels stay «أُرسلت» / «مقروءة».
- [ ] **Step 2: Run** `flutter test test/chat_look_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Bubble: `Align` mine → `AlignmentDirectional.centerEnd`, theirs → `centerStart`; the tail on the outer side of
    each.
  - Colours: mine `bubbleMine` with ink, failed mine stays `dangerBg`; read ticks `AppColors.navy`, sent ticks muted.
    On a photo's scrim the ticks stay white.
  - The quote block inside my bubble uses `bubbleMineQuote`.
  - The chats list's read tick turns `AppColors.navy`.
- [ ] **Step 4: Run** `flutter test test/chat_look_test.dart test/chat_media_polish_test.dart test/chat_media_view_test.dart`.
  Fix any assertion that checked the old side or the white text on my bubble; it now checks the new rule. Expected: PASS.
- [ ] **Step 5: Commit** (paths above): "App chat: WhatsApp layout tokens; my bubbles on the end side in pale navy".

### Task 4: Header, ⋮ menu order and the status strip

**Files:**
- Create: `naseebak_app/lib/features/chat/wa_chat_header.dart`
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart` (AppBar 2081-2185 replaced by `WaChatHeader`)
- Modify: `naseebak_app/lib/features/chat/chat_status_bar.dart` (`ChatStatusStrip`: white strip with a bottom
  `AppColors.line` border, under the header)
- Test: `naseebak_app/test/chat_wa_header_test.dart`

**Interfaces:**
- Produces:
  - `enum ChatMenuAction { match, extend, clear, report, end }`.
  - `List<ChatMenuAction> chatMenuActions({required bool canOpenMatch, required bool canExtend, required bool canSend, required DeleteMode deleteMode})`.
    Always in the order match, extend, clear, report, end. `match` when `canOpenMatch`, `extend` when `canExtend`,
    `clear` when `deleteMode != hidden`, `report` always, `end` when `canSend`.
  - `class WaChatHeader extends StatelessWidget implements PreferredSizeWidget` with:
    - `{required ChatSummary? chat, required Widget? status, required ({String text, bool urgent})? left, required DeleteMode deleteMode, required VoidCallback? onOpenMatch, required ValueChanged<ChatMenuAction> onMenu, double textScale = 1}`.
    - White bar, back arrow, `MemberAvatar` with the gold time arc (key `chat-time-arc` kept), then the name with
      `NameWithBadge` and `SealMark`, then `status`.
    - A tap on the avatar or name (key `chat-header`) calls `onOpenMatch`.
    - One ⋮ (tooltip «خيارات») whose first entry is a disabled label `left.text` (key `chat-menu-days`) while `left`
      is not null.
    - `report` and `end` are drawn in `AppColors.danger`. `clear` carries the gold lock in upsell (key `chat-clear`
      kept).

- [ ] **Step 1: Write the failing tests** in `chat_wa_header_test.dart`:
  - `test('menu order: match, extend, clear, report, end; each only where allowed')`. Cases:
    - all allowed → all five in that order;
    - `canSend: false`, `canExtend: false`, hidden delete → `[match, report]`;
    - `canOpenMatch: false` → no `match`.
  - `testWidgets('⋮ opens with the days left on top, not tappable, and the destructive entries last in red')`. Uses
    `ChatTestRoom`; the conversation's `expiresAt` is 5 days ahead. The first item's text is `chatTimeLeft(...)!.text`,
    the last two are «إبلاغ», «إنهاء المحادثة», and the colour of «إنهاء المحادثة» is `AppColors.danger`.
  - `testWidgets('the name opens the match page; typing replaces the activity label')`: reuse the assertions of
    `chat_look_test` «the header status line shows the activity label» and `chat_composer_test` typing, now against
    `WaChatHeader`.
- [ ] **Step 2: Run** `flutter test test/chat_wa_header_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement `WaChatHeader` and `chatMenuActions`.** The room passes `_statusLine(...)`, `left`,
  `_deleteMode()`, `_openMatch` (null when `matchHidden`) and maps `ChatMenuAction` to `_openMatch`, `_extend`,
  `_clearChat`, `_end(report: true)`, `_end()`.
- [ ] **Step 4: Run** `flutter test`. Tests that opened today's menu by `find.byTooltip('خيارات')` keep working.
  Expected: PASS.
- [ ] **Step 5: Commit** (paths above): "App chat: WhatsApp header and ⋮ menu order".

### Task 5: Message area — safety chip, unread strip, date chip, jump to newest

**Files:**
- Create: `naseebak_app/lib/features/chat/wa_composer.dart` (only `NewestButton` in this task)
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart` (`_safetyChip` 2349-2386, `_UnreadDivider`
  2829-2848, `_onScrollNotification` 959-978, the `chat-newest` button 2500-2510, `_load` unread fix)
- Modify: `naseebak_app/lib/features/chat/chat_format.dart`
- Test: `naseebak_app/test/chat_look_test.dart`, `naseebak_app/test/chat_room_test.dart`

**Interfaces:**
- Produces in `chat_format.dart`:
  - `String unreadStripLabel(int n)` = `arabicCount(n, one: 'رسالة غير مقروءة', two: 'رسالتان غير مقروءتين', few: 'رسائل غير مقروءة', many: 'رسالة غير مقروءة')`.
  - `int unreadCountFrom(List<ChatMessage> oldestFirst, String fromId)`: the partner's messages from `fromId` on.
  - `const dateChipHideAfter = Duration(seconds: 1)`.
- Produces: `NewestButton({required int unseen, required VoidCallback onPressed})` in `wa_composer.dart`:
  - a 44 px round white button with `Icons.keyboard_arrow_down_rounded`, key `chat-newest`;
  - a navy `CountBadge` (key `chat-newest-count`, «99+» over 99) while `unseen > 0`;
  - semantic label «الأحدث» or «الأحدث، N رسائل جديدة» via `arabicCount`.

- [ ] **Step 1: Write the failing tests.**
  - `test('unreadStripLabel: 1, 2, 3, 12')` → «رسالة غير مقروءة», «رسالتان غير مقروءتين», «3 رسائل غير مقروءة»,
    «12 رسالة غير مقروءة».
  - `test('unreadCountFrom counts only the partner\'s messages from the first unread on')`.
  - Change `chat_look_test` «رسائل جديدة» test: the strip (key `chat-unread-divider`) reads
    `unreadStripLabel(<unread at open>)`, spans the list's width (its width equals the list's), and sits above the
    first unread. The count does not change when another message arrives.
  - `testWidgets('the safety note: «محادثة خاصة · لا تشارك الأرقام أو الحسابات», feminine for her, in safetyChip')`.
    Key `chat-safety`; a tap still opens the safety info.
  - `testWidgets('the floating day hides 1 s after scrolling stops')`. Drag the list, end the drag, pump 900 ms: the
    `chat-sticky-day` chip is there. Pump 200 ms more: it is gone.
  - Change `chat_room_test` «opens from the device copy…»: tap `chat-newest`. Add: scrolled up, a poll brings 2
    partner messages, and `chat-newest-count` reads «2».
- [ ] **Step 2: Run** `flutter test test/chat_look_test.dart test/chat_room_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Safety chip: `safetyChip` fill, shield icon, `goldText`, gendered text as in the test.
  - Unread strip: full-width `chatChip` strip with a centred `AppText.label` navy text. Its count is fixed once with
    `_unreadFromId` (`_unreadAtOpen`).
  - Date chip: `ChatPill` on a `chatChip` fill; the hide timer uses `dateChipHideAfter`.
  - `NewestButton` replaces the tonal «الأحدث (N)» at the bottom end.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** (paths above): "App chat: safety chip, unread strip, fading date chip, round jump button".

### Task 6: Bubble extras — failed ⓘ, refusal note, who reacted, photo viewer title

**Files:**
- Modify: `naseebak_app/lib/features/chat/chat_bubble.dart` (`_failedActions` 316-350, `_reactions` 155-197)
- Create: `naseebak_app/lib/features/chat/wa_selection.dart` (only `showWhoReacted` in this task)
- Modify: `naseebak_app/lib/features/chat/media_bubbles.dart` (`PhotoViewer` app bar)
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart` (`ChatBubble(...)` call 2423-2441)
- Modify: `naseebak_app/test/helpers/chat_room_helpers.dart` (helper below)
- Test: `naseebak_app/test/chat_room_test.dart`, `chat_send_media_test.dart`, `chat_voice_test.dart`,
  `chat_composer_test.dart`, `chat_media_view_test.dart`

**Interfaces:**
- Produces:
  - `ChatBubble` gains `VoidCallback? onFamily` and `VoidCallback? onReactionsTap` (the latter replaces
    `onReactionTap`).
  - `ChatBubble` keeps `onRetry`, `onDelete` and `onOpenPro`.
  - `Future<bool> showWhoReacted(BuildContext context, {required List<ChatReaction> reactions, required String partnerName, required bool canRemove})`
    in `wa_selection.dart`:
    - a bottom sheet (key `who-reacted`) listing mine first as «أنت», theirs under `partnerName`;
    - «إزالة تفاعلي» (key `who-remove`) when `canRemove`;
    - returns true only when removal was tapped.
  - `Future<void> openFailed(WidgetTester tester)` in `chat_room_helpers.dart`: taps `chat-failed-info`, then settles.
- Failed message:
  - A red ⓘ `IconButton` beside the bubble on its inward side (key `chat-failed-info`, tooltip «لم تُرسل»).
  - It opens a sheet with `failed-retry` («إعادة المحاولة», or «تعديل الرسالة» when `filtered`) and
    `chat-failed-delete` «حذف».
  - `PRO_REQUIRED`: no retry; `chat-failed-pro` «عضوية Pro» stays under the bubble.
  - A `filtered` failure shows its server message as a gold note under the bubble (key `chat-refusal`: `safetyChip`
    fill, shield icon, `goldText`).
  - When `onFamily` is given, the note adds a «تعارف عائلي» button (key `chat-refusal-family`). The room passes
    `_openMatch` when the chat is open, `_family == FamilyStep.offer` and the match isn't hidden.
  - Other errors keep the red caption.

- [ ] **Step 1: Write the failing tests.**
  - `testWidgets('a failed text: ⓘ beside it; «إعادة المحاولة» resends with the same nonce; «حذف» removes it')`.
  - `testWidgets('a filtered text: the gold note with the server message; «تعديل الرسالة» puts it back in the box; «تعارف عائلي» opens the match page when the offer is open')`.
  - `testWidgets('the reaction pill opens who reacted; «إزالة تفاعلي» removes mine; theirs alone has no remove')`.
    Asserts the reaction POST body `{'emoji': null}`.
  - `testWidgets('the photo viewer names the sender and the day')`: title «أنت» or the partner's name, subtitle
    `chatDayLabel` + `formatTime`.
  - Change every test that finds «إعادة الإرسال» / «تعديل الرسالة» / `chat-failed-delete` directly: call
    `openFailed` first. In `chat_composer_test`, «tapping my chip removes it» goes through `who-remove`.
- [ ] **Step 2: Run** `flutter test test/chat_room_test.dart test/chat_send_media_test.dart test/chat_voice_test.dart test/chat_composer_test.dart test/chat_media_view_test.dart`.
  Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified in Interfaces. The room's `onReactionsTap` awaits `showWhoReacted` and calls
  `_react(m.id, null)` on true. `canRemove` is `_open && m.myReaction != null && !m.deleted`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** (paths above): "App chat: failed ⓘ, refusal note, who reacted, viewer title".

### Task 7: Selection mode and inward swipe

**Files:**
- Modify: `naseebak_app/lib/features/chat/wa_selection.dart` (bar, picker, delete choice)
- Modify: `naseebak_app/lib/features/chat/message_menu.dart`:
  - remove `showMessageMenu`, `MessageMenuSheet`, `MessageMenuChoice` and `_ReactionButton`;
  - keep `messageMenuEntries`, `showClearChatSheet`, `confirmDeleteSheet` and the confirm texts.
- Modify: `naseebak_app/lib/features/chat/reply_strip.dart` (`SwipeToReply` 145-224)
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart`:
  - `_openMenu` 1764-1786 becomes `_select`;
  - row building 2442-2475, `build`'s `PopScope` 2058-2067, `_deleteMessage` 1812.
- Test: `naseebak_app/test/chat_wa_selection_test.dart`; update `chat_composer_test.dart` (menu, reply, swipe
  groups) and `chat_delete_test.dart` (`_menuOn`, the «menu sheet is exported» test removed)

**Interfaces:**
- Produces in `message_menu.dart`:
  - `({bool react, bool reply, bool copy, bool delete, bool report}) selectionToolsFor(ChatMessage m, {required bool canInteract, required DeleteMode deleteMode, required bool open})`:
    - all false unless `m.state == SendState.sent`;
    - `react` and `reply` = `canInteract` from `messageMenuEntries`, `copy` = `canCopy`, `delete` = `deleteForMe`,
      `report` = `canReport`.
  - `ChatMessage? selectedMessageOf(List<ChatMessage> messages, String? id, {required bool canInteract, required DeleteMode deleteMode, required bool open})`:
    null when the id is missing, the message isn't sent, or no tool is true.
- Produces in `wa_selection.dart`:
  - `ChatSelectionBar` (`PreferredSizeWidget`): navy bar, white icons. Its parameters:
    `{required ({bool react, bool reply, bool copy, bool delete, bool report}) tools, required bool deleteLocked, required VoidCallback onClose, required VoidCallback onReply, required VoidCallback onCopy, required VoidCallback onDelete, required VoidCallback onReport}`.
    Keys and tooltips:
    - `selection-close` «إلغاء التحديد», then the text «1»;
    - `menu-reply` «رد», `menu-copy` «نسخ», `menu-delete` «حذف» (gold lock `menu-delete-locked` when
      `deleteLocked`);
    - `selection-more` «خيارات أخرى» → `menu-report` «إبلاغ عن الرسالة».
    Each tool shows only when its flag is true.
  - `ReactionPicker({required String? mine, required ValueChanged<String?> onPick})`: a white pill of
    `chatReactionEmoji` with keys `menu-react-$emoji`, 44 px each, mine ringed. Tapping mine gives `null`.
  - `Future<bool?> showDeleteChoice(BuildContext context, {required bool canEveryone})`: an `AlertDialog` titled
    «حذف الرسالة؟» with `menu-delete-everyone` «حذف لدى الجميع» (when `canEveryone`), `menu-delete-me` «حذف لديّ» and
    «إلغاء». It returns `true` for everyone, `false` for me and `null` for cancel.
- Produces in `reply_strip.dart`:
  - `double swipeInwardSign({required bool mine, required TextDirection direction})`: the screen-x sign of an inward
    drag. Mine in RTL → `+1`, theirs in RTL → `-1`, mirrored in LTR.
  - `SwipeToReply` gains `required bool mine` and replies only on an inward drag past `trigger` (56 px).
- Room behaviour:
  - `String? _selectedId`. A long-press on a sent bubble (text, photo or voice) selects it, with a haptic
    `selectionClick`, and closes the keyboard.
  - While a selection exists, a tap on any bubble selects that one instead of its own action (photo viewer, quote
    jump, voice play).
  - The row of the selected message is washed full-width in `AppColors.chatSelect`.
  - `ChatSelectionBar` replaces `WaChatHeader` while `selectedMessageOf(...)` is not null. When it turns null, `_selectedId`
    is cleared.
  - The `ReactionPicker` floats above the selected row, `CompositedTransformTarget` on the row and
    `CompositedTransformFollower` in the list's `Stack`. It shows only when `tools.react`.
  - Every action clears the selection, and so does a tap on the list background.
  - Delete: `deleteLocked` (upsell) → `/pro`. Otherwise `showDeleteChoice`, then today's `_deleteMessage` (its
    «لدى الجميع» confirm sheet stays).
  - `PopScope.canPop` = `!_voiceUnsent && _selectedId == null`. On a blocked pop: clear the selection first, else
    `_backWhileRecording()`. (Task 8 adds the emoji panel to both.)

- [ ] **Step 1: Write the failing tests** in `chat_wa_selection_test.dart` (`ChatTestRoom`):
  - `test('selectionToolsFor: a trace of theirs offers report and delete only; my sending message nothing; a closed chat no reply or react')`.
  - `test('swipeInwardSign: mine +1 and theirs -1 in RTL, mirrored in LTR')`.
  - `testWidgets('long-press selects: the bar with ✕ and «1», the row washed, four reactions above it')`.
  - `testWidgets('a tap on another bubble moves the selection; a tap on the background clears it')`.
  - `testWidgets('Android back clears the selection and stays in the chat')`: `await tester.binding.handlePopRoute()`.
    Then `selection-close` is gone and `chat-input` is still there.
  - `testWidgets('a long-press on a photo selects it; no viewer opens; while selecting, a tap on a photo selects it')`
    (Review Focus 1).
  - `testWidgets('a long-press on a voice note selects it and does not play')`. `FakeVoicePlayer` reports no `play`
    call.
  - `testWidgets('the selected message deleted for everyone by a live event: the bar keeps only report (theirs) or closes (mine)')`
    (Review Focus 2). Uses `FakeLive` `deleted`.
  - `testWidgets('the chat ends on a poll while selected: reply and reactions disappear from the bar')`.
  - `testWidgets('reply from the bar opens the strip; copy puts the text on the clipboard; ⋮ → «إبلاغ عن الرسالة» opens the report naming it')`.
  - `testWidgets('delete from the bar: the choice dialog; «حذف لديّ» sends scope me; not Pro opens /pro')`.
  - `testWidgets('swipe my bubble inward (right in Arabic) replies; outward does nothing; the partner\'s inward is left')`.
  - `testWidgets('a vertical drag starting on a bubble scrolls and never replies')` (Review Focus 4).
- [ ] **Step 2: Update the existing tests** that used the sheet:
  - `menu-reply`, `menu-copy`, `menu-react-*` and `menu-report` keep their keys. `menu-report` sits behind
    `selection-more`.
  - `menu-delete-me` / `menu-delete-everyone` are now behind `menu-delete`. Change `_menuOn` in `chat_delete_test` to
    long-press and then tap `menu-delete`. Absence tests check `menu-delete` findsNothing.
  - Replace «swipe a bubble towards the end side» with the inward rule.
  - Delete `test('the menu sheet is exported for the room')`.
- [ ] **Step 3: Run** `flutter test test/chat_wa_selection_test.dart test/chat_composer_test.dart test/chat_delete_test.dart`.
  Expected: FAIL.
- [ ] **Step 4: Implement** as specified. Remove the dead menu sheet code.
- [ ] **Step 5: Run** `flutter analyze` and the same tests. Expected: 0 issues, PASS.
- [ ] **Step 6: Commit** (paths above): "App chat: WhatsApp selection bar, floating reactions, inward swipe".

### Task 8: Composer — emoji panel, paperclip with gallery and camera, microphone hint, read-only bar

**Files:**
- Create: `naseebak_app/lib/features/chat/emoji_data.dart`, `naseebak_app/lib/features/chat/emoji_panel.dart`
- Modify: `naseebak_app/lib/features/chat/wa_composer.dart` (`WaComposerPill`, `showAttachSheet`,
  `WaReadOnlyFooter`)
- Modify: `naseebak_app/lib/features/chat/chat_media_picker.dart` (`chatCameraPickerProvider`)
- Modify: `naseebak_app/lib/features/chat/chat_room_screen.dart`:
  - `_footer` 2514-2596 and `_pill` 2598-2662 are replaced; `_roundButton` stays in the room (hold detector state);
  - `_MediaButton` moves to `wa_composer.dart`;
  - also `_pickPhoto` 1145, `_startVoice` 1348 and `_onHoldRelease` 1539.
- Modify: `naseebak_app/ios/Runner/Info.plist` (add `NSCameraUsageDescription` «لالتقاط صورة وإرسالها في المحادثة»)
- Modify: `naseebak_app/test/helpers/chat_room_helpers.dart`: `Future<void> pickFromGallery(WidgetTester)` taps
  `chat-attach`, then `attach-gallery`.
- Test: `naseebak_app/test/chat_wa_composer_test.dart`; update `chat_composer_test.dart`, `chat_send_media_test.dart`,
  `chat_voice_test.dart` (`chat-photo` → `pickFromGallery`)

**Interfaces:**
- Produces:
  - `const List<({String label, List<String> emoji})> emojiGroups` in `emoji_data.dart`. It is the website's
    `EMOJI_GROUPS`, copied verbatim in the same order:
    - «وجوه» 64, first «😀», last «😩»;
    - «إيماءات» 36, first «👍», last «🙇»;
    - «قلوب» 25, first «❤️», last «💫»;
    - «مناسبات» 40, first «🎉», last «🛍️»;
    - «طبيعة» 40, first «🌸», last «🕊️».
  - `EmojiPanel({required ValueChanged<String> onPick, required double height})` (key `emoji-panel`): group tabs
    `emoji-tab-$i` on top (44 px, the active one in navy on `navy` at 10 %), a grid of 44 px cells `emoji-$e` below.
  - `TextEditingValue insertAtCursor(TextEditingValue value, String insert, {int maxLength = 2000})`:
    - replaces the selection;
    - appends at the end when the selection is invalid (-1);
    - puts the cursor after the insert;
    - returns `value` unchanged when the result would pass `maxLength` (counted in characters, as `TextField`'s
      `maxLength`).
  - `enum AttachSource { gallery, camera }`.
  - `Future<AttachSource?> showAttachSheet(BuildContext context)` with `attach-gallery` «المعرض» and `attach-camera`
    «الكاميرا».
  - `final chatCameraPickerProvider = Provider<PhotoPicker>(...)`: same limits as the gallery picker,
    `ImageSource.camera`.
  - `WaComposerPill` with:
    - `{required TextEditingController controller, required FocusNode focusNode, required bool female, required MediaButtons media, required bool emojiOpen, required VoidCallback onToggleEmoji, required VoidCallback onAttach, required VoidCallback onOpenPro, required ValueChanged<String> onChanged}`;
    - a white pill, from the start: emoji button `chat-emoji` (tooltip «الرموز التعبيرية», or a keyboard icon
      «لوحة المفاتيح» while open), the field (`chat-input`, 1–6 lines, `maxLength` 2000, newline action), and
      paperclip `chat-attach` («إرفاق»);
    - when `media == locked`, a greyed paperclip with the «Pro» tag `chat-media-pro-tag` that calls `onOpenPro`; no
      paperclip when `hidden`.
  - `WaReadOnlyFooter({required String text})`: today's texts in a full-width white bar with a top border. The key
    stays the same as today's read-only text container, if any; else `chat-read-only`.
- Room behaviour:
  - `bool _emojiOpen`, added to `PopScope`: `canPop` also needs `!_emojiOpen`, and a blocked pop closes the panel
    after the selection and before the recording guard. Opening it unfocuses and hides the keyboard; the panel takes the last keyboard height (at
    least 260). Closing it focuses the field.
  - A pick calls `insertAtCursor` and then `_onTyped`.
  - The panel closes on send, on attach and on recording.
  - Paperclip → `showAttachSheet` → `_pickPhoto(camera: source == camera)`. A camera that can't open shows
    «تعذّر فتح الكاميرا».
  - U3: when the hold ended while the microphone prompt was up and permission came back granted, show
    `micAllowedHint = 'تم السماح بالميكروفون، اضغط مطولاً للتسجيل'`. Mic → send swap, hold-to-record, the locked
    bar (stop, cancel, send; no pause) and starters stay as today.

- [ ] **Step 1: Write the failing tests** in `chat_wa_composer_test.dart`:
  - `test('emojiGroups: the website\'s five groups, sizes and ends, no duplicates')`. Assert the counts and ends
    above, and `emojiGroups.expand((g) => g.emoji).toSet().length == 205`.
  - `test('insertAtCursor: at the cursor, over a selection, at the end with no cursor, never past 2000')` (Review
    Focus 5):
    - `('ab|c', '😊')` → `'ab😊c'`, cursor after the emoji;
    - selection «b» replaced;
    - selection -1 appends;
    - 1,999 characters + «😊» gives 2,000 (accepted); 2,000 characters + «😊» stays unchanged.
  - `testWidgets('the emoji button swaps the keyboard for the panel and back; a pick lands at the cursor')`.
  - `testWidgets('Android back with the panel open closes the panel, not the chat')` (Review Focus 3).
  - `testWidgets('the paperclip offers «المعرض» and «الكاميرا»; each picks from its source and shows the preview')`.
    Override both picker providers and count calls.
  - `testWidgets('not Pro who can buy: a greyed paperclip with «Pro» opens /pro; can\'t buy: no paperclip, send-only button')`.
  - `testWidgets('a camera that fails says «تعذّر فتح الكاميرا»')`.
  - In `chat_composer_test`, change «released while the microphone prompt is up: nothing said». After
    `answer.complete(true)`, `find.text(micAllowedHint)` finds one widget, and still nothing is uploaded.
  - `testWidgets('a closed chat: the read-only bar with today\'s text replaces the composer')`.
- [ ] **Step 2: Run** `flutter test test/chat_wa_composer_test.dart test/chat_composer_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. Replace `find.byKey(const Key('chat-photo'))` in the existing tests with
  `pickFromGallery`.
- [ ] **Step 4: Run** `flutter analyze` and `flutter test`. Expected: 0 issues, all PASS.
- [ ] **Step 5: Commit** (paths above, `Info.plist` included): "App chat: emoji panel, paperclip with gallery and
  camera, microphone hint, read-only bar".

### Task 9: Chats list — chips «الكل» / «غير مقروءة» / «المنتهية»

**Files:**
- Modify: `naseebak_app/lib/features/chat/chats_screen.dart` (TabController and tabs 33-138, `_tile` 176-270)
- Test: `naseebak_app/test/chats_list_test.dart` (group `active and ended tabs` rewritten as `chips`)

**Interfaces:**
- Produces in `chats_screen.dart`:
  - `enum ChatsChip { all, unread, ended }`.
  - `List<ChatSummary> chatsForChip(List<ChatSummary> chats, ChatsChip chip)`: `all` = `isActiveChat`, `unread` =
    active with `unread > 0`, `ended` = not active. Order kept.
  - `String unreadChipLabel(int chats)`: «غير مقروءة» or «غير مقروءة N». N counts chats, not messages, as the website.
- Behaviour:
  - A white `AppBar` titled «المحادثات», then a `Wrap` of three chips, keys `chats-chip-all`, `chats-chip-unread`,
    `chats-chip-ended`. Each is 44 px tall; the selected one is navy with white text, the others `chatChip` with ink.
  - Back on the tab (`TickerMode` turns on), the list returns to «الكل».
  - Empty texts:
    - «لا توجد محادثات نشطة» with today's body;
    - «لا توجد رسائل غير مقروءة» with no body;
    - «لا توجد محادثات منتهية» with today's body.
  - Rows:
    - the unread badge only on active rows;
    - ended rows dimmed with `AlphaFade` 0.7 and their status pill;
    - the days-left line only when `chatTimeLeft(...)!.urgent`;
    - the preview with my ✓/✓✓ (navy when read, from Task 3).

- [ ] **Step 1: Write the failing tests** (replace the tab tests):
  - `test('chatsForChip and unreadChipLabel')`.
  - `testWidgets('opens on «الكل» with only the chats she can still write in')`.
  - `testWidgets('«غير مقروءة 1» lists the active chat with unread only')`.
  - `testWidgets('«المنتهية» lists ended, expired and read-only chats, dimmed, with no unread badge')`.
  - `testWidgets('each chip has its own empty message')`.
  - `testWidgets('coming back to Chats opens on «الكل» again')`.
  - `testWidgets('the days-left line shows only in the last 3 days')`.
- [ ] **Step 2: Run** `flutter test test/chats_list_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. Remove the `TabController` and the `SingleTickerProviderStateMixin`.
- [ ] **Step 4: Run** `flutter test test/chats_list_test.dart`. Expected: PASS.
- [ ] **Step 5: Commit** (paths above): "App chats list: WhatsApp chips «الكل» / «غير مقروءة» / «المنتهية»".

### Task 10: Docs and the final check

**Files:**
- Modify: `naseebak_app/CLAUDE.md`:
  - the «Modern chat» section becomes the WhatsApp layout: sides and tokens, selection bar, inward swipe, emoji panel,
    paperclip with gallery and camera, chips, B1 read-on-top via `appRouteObserver`, B2 `ChatCache.addFailed`, the
    U3 hint;
  - the «Chat on the phone» lines that describe the old menu or tabs;
  - in «Before you change anything», this chat needs a new app version, and old apps keep their chat.
- Modify: `docs/reference/design-system.md` (the app names of the five tokens, next to the website's)

- [ ] **Step 1: Update the two docs** to match what Tasks 1–9 built (no new rules).
- [ ] **Step 2: Run** in `naseebak_app/`: `flutter analyze`. Expected: «No issues found!».
- [ ] **Step 3: Run** `flutter test`. Expected: «All tests passed!».
- [ ] **Step 4: Run** `grep -rn "showMessageMenu\|MessageMenuSheet\|chat-photo'" naseebak_app/lib naseebak_app/test`.
  Expected: no output.
- [ ] **Step 5: Commit** (both docs): "Docs: WhatsApp-style chat in the app".
- [ ] **Step 6: Hand over to the controller** for the simulator walk, which this plan doesn't run:
  - Start the dev server: `pnpm dev -p 3020` in the repo root with `.env.development.local`, DB `naseeb_push`.
  - Run the app: `flutter run -d 47766427-F331-40CB-B8FC-C2BE7E97CF0E --dart-define=API_BASE_URL=http://localhost:3020`.
  - Sign in as `0777000001` and `0777000002` (code `111111`) and walk:
    - sides and ticks, header ⋮ order, chips;
    - long-press bar and reactions, inward swipe;
    - emoji panel, paperclip → gallery (camera fails on the simulator with the snack);
    - hold-to-record;
    - B1: open «صفحة التوافق» while the other account writes; no ✓✓ until back;
    - B2: send with the server stopped and leave; the failed text is there on return.
