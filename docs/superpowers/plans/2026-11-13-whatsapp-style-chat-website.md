# WhatsApp-style chat — website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the website chat (chat room and chats list) the WhatsApp-for-Android layout and gestures in Naseebak's
colours, behind the switch `chat_whatsapp_layout`. With the switch off, today's chat is unchanged.

**Architecture:**
- The room's engine moves out of `chat-room.tsx` into a hook, `useChatRoom`. It covers loading, polling, Ably,
  sending, reactions, delete, read and dialogs state.
- Today's JSX moves verbatim into `ClassicChatRoom`.
- A new `WaChatRoom` renders the same model in the new layout. `ChatRoom` picks one from a React context that the
  chats layout fills from the switch.
- The chats list gets the same split: `useChatList` + `ClassicChatList` + `WaChatList`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (oklch tokens in `src/app/globals.css`), shadcn/ui, lucide-react,
Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-whatsapp-style-chat-design.md` (approved 2026-11-13). The app half of the
spec gets its own plan later, on the branch that holds the queued app work.

**Worktree:** `/Users/mohammadabudiab/Documents/EvoKey-Projects/naseebak-wa-chat`, branch `feature/whatsapp-chat`.
Stage files by path, never `git add -A`.

## Global Constraints

- **Switch:** `chat_whatsapp_layout`, default `"false"`, Admin → Settings. Off = today's chat exactly: same
  components, same DOM.
- **No API or schema change.** Every server answer stays as it is.
- **Colours:** design-system tokens only. `src/__tests__/components/design-guards.test.ts` must stay green: no raw
  hex, no `blue-` / `gray-` / `slate-` etc., no text under 12 px (`text-caption` is the smallest).
- **RTL:** logical properties only (`ms-`/`me-`/`start-`/`end-`). Western digits. Counted nouns via `arabicCount()`.
  Gendered copy via `forViewer`/`forPartner` or the existing `female` flags.
- **Sizes:** tap targets ≥ 44 px (`min-h-11`/`size-11`), text inputs ≥ 16 px on phones (`text-base`). Reduced
  motion makes every animation instant (`motion-reduce:`).
- **Old Safari:** no regex lookbehind, no named groups, no `findLast`/`findLastIndex` in client code. Extend the
  guard test from `13c49e2` to cover both.
- **Imports:** client components never import a runtime value from a module that imports `@/lib/db`. Use
  `import type`, or db-free modules.
- **No top-level `const` named** `short`, `long`, `int`, `float`, `char`, `byte`.
- **Kept as is:** the safety note, the report entries, the filter's refusal note with the family button, the
  status-bar logic (`chatStatusBar`) and the read-only footer texts.
- **Before calling a task done:** `pnpm lint && npx tsc --noEmit && npx vitest run` in the worktree. `pnpm build` at
  the end of Tasks 2, 8 and 10.

## Review Focus

1. **A vertical scroll that starts on a bubble must never reply.** A swipe counts only when horizontal movement wins.
   Pinned in Task 4 (`swipeReplyStep`).
2. **A long press on a photo or voice note selects it.** It must not also open the viewer or start playback (the
   click after the press is swallowed). Pinned in Task 5.
3. **The selected message can change under the selection.** It can be deleted for everyone by a live event, or the
   chat can end or be blocked. The action bar must recompute or close, never act on a stale message. Pinned in Task 6.
4. **Switch off must render exactly today's chat.** A refactor slip in the engine would hit every member at once.
   Pinned in Task 2: the existing chat tests run unchanged against `ClassicChatRoom`.
5. **A member who can't use Pro media sees no paperclip or camera.** Where Pro can be bought, both open the offer. A
   test account or a non-selling country gets neither. Pinned in Task 7.

---

### Task 1: The switch and the layout context

**Files:**
- Modify: `src/lib/settings.ts` (DEFAULTS, plus a getter next to `getChatDeleteEnabled`)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts` (GET field, POST schema, `setSetting`, log line as for
  `chat_delete_enabled`)
- Modify: `src/components/admin/new-cycle-settings-card.tsx` (one toggle, English label "WhatsApp-style chat (website)")
- Create: `src/components/chat/chat-layout-context.tsx` (client, db-free)
- Modify: `src/app/(ar)/dashboard/chats/layout.tsx` (async; reads the setting and passes it on)
- Modify: `src/components/chat/chats-shell.tsx` (takes `layout`, provides the context)
- Test: `src/__tests__/chat/wa-layout-switch.test.tsx`

**Interfaces:**
- Produces:
  - `getChatWhatsappLayout(): Promise<boolean>` in `src/lib/settings.ts`.
  - `type ChatLayout = "classic" | "wa"`.
  - `ChatLayoutProvider({ layout, children })`.
  - `useChatLayout(): ChatLayout`, defaulting to `"classic"` with no provider. All in `chat-layout-context.tsx`.
  - `ChatsShell({ layout, children }: { layout: ChatLayout; children })`.
- Admin API: the GET returns `chatWhatsappLayout: boolean`, and the POST accepts `chatWhatsappLayout?: boolean`.

- [ ] **Step 1: Write the failing tests** in `wa-layout-switch.test.tsx`:
  - `getChatWhatsappLayout` resolves `false` with no row, and `true` for `"true"`. Mock `@/lib/db` the way
    `src/__tests__/intro/requests.test.ts` does.
  - Rendering a consumer of `useChatLayout()` with no provider gives `"classic"`; inside
    `<ChatLayoutProvider layout="wa">` it gives `"wa"`.
  - The admin route's GET includes `chatWhatsappLayout: false` by default. A POST with `{ chatWhatsappLayout: true }`
    calls `setSetting("chat_whatsapp_layout", "true")`. Follow the existing new-cycle route test, if any, for the
    mocking.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/chat/wa-layout-switch.test.tsx`. Expected: FAIL (missing exports).
- [ ] **Step 3: Implement.**
  - Add `chat_whatsapp_layout: "false"` to DEFAULTS, with a one-line comment: WhatsApp-style chat layout on the
    website (2026-11-13), off = today's chat.
  - Add the getter, then the route and the admin card toggle.
  - In `layout.tsx`: `const layout = (await getChatWhatsappLayout()) ? "wa" : "classic"`, then
    `<ChatsShell layout={layout}>`.
  - `ChatsShell` wraps its whole output in `ChatLayoutProvider`.
- [ ] **Step 4: Run** the test file, then the lint, tsc and vitest gate. Expected: PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/settings.ts src/app/api/admin/settings/new-cycle/route.ts src/components/admin/new-cycle-settings-card.tsx src/components/chat/chat-layout-context.tsx "src/app/(ar)/dashboard/chats/layout.tsx" src/components/chat/chats-shell.tsx src/__tests__/chat/wa-layout-switch.test.tsx
  git commit -m "Chat: switch chat_whatsapp_layout and the layout context (off by default)"
  ```

### Task 2: Move the room's engine into `useChatRoom` (no visible change)

**Files:**
- Create: `src/components/chat/use-chat-room.ts`. It holds the hook, `requestLatest`, `requestIntro`,
  `fetchProBits`, `instantCheck`, `tempMessageId`, `uploadName`, `localUrl`, `useMobileViewport` and `useOnline`,
  moved verbatim from `chat-room.tsx:74-958` and `:1377-1425`.
- Create: `src/components/chat/classic-chat-room.tsx`. Today's JSX (`chat-room.tsx:849-1373`, the three early returns
  included) moves verbatim, reading from the model.
- Modify: `src/components/chat/chat-room.tsx`. It becomes about 15 lines:
  `const model = useChatRoom(conversationId); return useChatLayout() === "wa" ? <WaChatRoom model={model} /> : <ClassicChatRoom model={model} />;`.
  Until Task 8, `WaChatRoom` is a stub that renders `ClassicChatRoom`.
- Modify: `src/__tests__/components/design-guards.test.ts`, or the lookbehind guard added in `13c49e2` (find it with
  `grep -rn "lookbehind" src/__tests__`).
- Test: the existing `src/__tests__/chat/*.test.tsx`, unchanged.

**Interfaces:**
- Produces: `useChatRoom(conversationId: string): ChatRoomModel`, and the type `ChatRoomModel`, exported from
  `use-chat-room.ts`.
- `ChatRoomModel` holds every value and handler today's JSX reads, under the names it uses today:
  - State: `conversation`, `messages`, `notFound`, `loadError`, `hasMore`, `loadingOlder`, `online`, `mode`,
    `viewport`, `scroller`, `composer`, `optionsButton`, `returnFocus`.
  - Derived: `left`, `open`, `canSend`, `endable`, `familyStep`, `statusBar`, `activity`, `typingLabel`,
    `startersShown`, `starters`, `closedFamily`, `mediaMode`, `composerMedia`, `messageActions`, `viewerPhotos`,
    `activeRowId`, `familyOpenUntil`, `family`, `familyFree`, `intro`, `deleteMode`, `myGender`, `country`.
  - UI state and setters: `refusal`, `composerError`, `replyTo`, `highlightId`, `unreadFromId`, `away`, `unseen`,
    `viewerId`, `busy`, `endDialog`, `extendConfirm`, `familyDialog`, `offerOpen`, `reportMessage`, `pushChip`,
    `chatDelete`, plus each setter the JSX calls.
  - Actions: `send`, `sendMedia`, `fetchLatest`, `loadOlder`, `onScroll`, `extend`, `end`, `requestFamily`,
    `typing`, `wake`, `setActiveRow`.
- Two additions for Task 8: `jumpToNewest(): void` (the button's current onClick) and `markSeenNow(): void`.

- [ ] **Step 1: Extend the guard test.** It must fail on `\.findLast\(` and `\.findLastIndex\(` in files under
  `src/components` and `src/app/(ar)`, the same way it fails on lookbehind.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/design-guards.test.ts`. Expected: FAIL, listing
  `chat-room.tsx:376` and `delete-dialogs.tsx:146`.
- [ ] **Step 3: Replace both `findLast` calls with a reverse `for` loop,** with the same result.
- [ ] **Step 4: Move the code.** No logic change: cut, paste, rename references to `model.x`. Keep comments.
- [ ] **Step 5: Run** the full gate and `pnpm build`. Expected: PASS. Every test under `src/__tests__/chat/` passes
  unedited.
- [ ] **Step 6: Commit.**
  ```bash
  git add src/components/chat/use-chat-room.ts src/components/chat/classic-chat-room.tsx src/components/chat/chat-room.tsx src/components/chat/delete-dialogs.tsx src/__tests__/components/design-guards.test.ts
  git commit -m "Chat: room engine in useChatRoom, today's view in ClassicChatRoom; no findLast (iOS 15.0–15.3)"
  ```

### Task 3: Design tokens for the new chat

**Files:**
- Modify: `src/app/globals.css`. Light values in the `:root` block next to `--sand` (line 28), dark values in the dark
  block (line 80), and `--color-*` mappings in `@theme` (next to line 124).
- Modify: `docs/reference/design-system.md` (one line per token, with the same names the app will use).
- Test: `src/__tests__/components/design-foundations.test.tsx` (add to it).

**Interfaces:** Produces these Tailwind colours:

| Token | Use | Light value |
|---|---|---|
| `bubble-mine` | my bubble | ≈ `primary` at 12 % on white, `oklch(0.93 0.018 249)` |
| `bubble-mine-quote` | quote block in my bubble | one step darker, `oklch(0.885 0.025 249)` |
| `chat-select` | selected row wash | `primary` at 14 % alpha |
| `chat-chip` | date chip and unread strip | `card` at 92 %, as today's pill |
| `safety-chip` | safety note | pale gold, `oklch(0.95 0.03 80)`; text stays `accent-ink` |

Dark values keep ink text readable: mine `oklch(0.32 0.04 249)`, quote `oklch(0.27 0.04 249)`.

- [ ] **Step 1: Write the failing test.** Each of the five `--…` custom properties is defined in both the light and
  the dark block of `globals.css`, and has a `--color-…` mapping.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Add the tokens and the doc lines.**
- [ ] **Step 4: Run the gate.** Expected: PASS.
- [ ] **Step 5: Commit** `globals.css`, `design-system.md` and the test file: "Design: chat tokens bubble-mine, chat-select, safety-chip".

### Task 4: Gesture and copy rules (pure, db-free)

**Files:**
- Create: `src/components/chat/wa-chat-logic.ts`
- Test: `src/__tests__/chat/wa-chat-logic.test.ts`

**Interfaces:** Produces:
- `SWIPE_REPLY_PX = 64`.
- `swipeReplyStep({ dx, dy, rtl, mine }): "none" | "track" | "reply"`.
  - `dx` is horizontal movement in px, positive to the right. A swipe goes toward the inside of the screen: for my
    messages that is toward the end side, for the partner's toward the start side, mirrored by `rtl`.
  - `"none"` when `|dy| > |dx|`, or when the movement is outward.
  - `"track"` while the inward movement is under `SWIPE_REPLY_PX`; `"reply"` at or past it.
- `enterSends({ coarsePointer, shiftKey, composing }): boolean`. False on a coarse pointer, with Shift, or while
  composing (IME).
- `unreadStripLabel(n: number): string`, using `arabicCount(n, { one: "رسالة غير مقروءة", two: "رسالتان غير مقروءتين", few: "رسائل غير مقروءة", many: "رسالة غير مقروءة" })`.
- `selectionTools(m: UiMessage, a: MessageActions): { react; reply; copy; delete; report }`. Booleans, derived from
  `menuItemsForActions`: `delete` = `deleteMe || deleteEveryone`.

- [ ] **Step 1: Write the failing tests.**
  - `swipeReplyStep`:
    - in rtl, for a partner bubble (start side), `{dx:-70, dy:5}` gives `"reply"` and `{dx:-30, dy:2}` gives
      `"track"`;
    - `{dx:-70, dy:80}` gives `"none"` (Review Focus 1);
    - an outward drag gives `"none"`;
    - the mirrored cases for `mine` and for `rtl:false`.
  - `enterSends`: `{coarse:true}` → false; `{coarse:false}` → true; `shiftKey` → false; `composing` → false.
  - `unreadStripLabel`: 1, 2 and 7 give the three forms above.
  - `selectionTools`:
    - a deleted-for-everyone partner message gives `react:false, reply:false, copy:false, report:true`;
    - my pending message gives everything false;
    - with `canInteract:false`, `react` and `reply` are false and `copy` stays true.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** both files: "Chat: WhatsApp-style gesture and copy rules".

### Task 5: The WhatsApp-style bubble

**Files:**
- Create: `src/components/chat/wa-message-bubble.tsx`
- Test: `src/__tests__/chat/wa-message-bubble.test.tsx`

**Interfaces:**
- Consumes: `UiMessage`, `MessageActions`, `BubbleQuote`, `PhotoBubble`, `VoiceBubble`, `groupReactions`,
  `DELETED_TRACE`, `timeLabel`, `swipeReplyStep`, `RowTabContext`, `rowAfterKey` (keep today's roving focus).
- Produces:
  ```ts
  WaMessageBubble(props: {
    message: UiMessage; tail: boolean; partnerName: string; actions?: MessageActions;
    selected: boolean; highlighted: boolean; rowActive?: boolean; onRowFocus?: (id: string) => void;
    onSelect: (m: UiMessage) => void;      // long press, right-click, the hover chevron, Enter/ContextMenu on the row
    onRetry: () => void; onDismissFailed: () => void;
    onReactionsTap: (m: UiMessage) => void; // the reaction pill
  })
  ```

Look (from the spec):
- **Bubble colour:** mine `bg-bubble-mine text-foreground`, the partner's `bg-card`.
- **Tail and spacing:** a tail on `tail` only; `mt-2` for a new run, `mt-0.5` inside a run.
- **Time and ticks:** inside, at the bottom end, `text-caption text-muted-foreground`. One `Check` = sent,
  `CheckCheck` muted = not read, `CheckCheck text-primary` = read. A photo keeps the dark scrim.
- **Selection:** `selected` gives a full-row `bg-chat-select`.
- **Reactions:** one white pill at the bottom start edge with the emoji, plus a count when greater than 1. Tapping it
  calls `onReactionsTap`.
- **Deleted:** `Ban` icon, then italic muted `DELETED_TRACE`.
- **Failed:** a `CircleAlert` button `text-destructive` (size-11 hit area) beside the bubble. It opens a small
  `DropdownMenu` with «إعادة المحاولة» → `onRetry` and «حذف» → `onDismissFailed`.
- **Long press:** 450 ms, 10 px slop as today, `navigator.vibrate?.(10)`, then calls `onSelect`. The next click is
  swallowed. Right-click calls `onSelect`.
- **Desktop hover:** a chevron at the bubble's top end corner (`pointer-coarse:hidden`) calls `onSelect`, and a reply
  arrow (`Reply`) beside the bubble calls `actions.onReply`.
- **Voice notes and photos:** reuse today's `VoiceBubble` (waveform seek, 1×/1.5×/2×, unplayed dot) and
  `PhotoBubble` + `PhotoViewer` (swipe, pinch), which already match the spec. One change: the voice speed starts at
  the last speed used in this tab (a module-level `lastVoiceSpeed` in `voice-wave.ts`, set by `nextVoiceSpeed`'s
  caller). Add a test for it to `chat-media-polish.test.ts`.
- **Swipe (touch only, `pointerType !== "mouse"`):** translate the bubble with `swipeReplyStep`. At `"reply"` show
  the reply icon, and on release call `actions.onReply`, then spring back. Disabled when `!actions?.canInteract`.

- [ ] **Step 1: Write the failing tests.**
  - Mine renders with class `bg-bubble-mine`, the partner's with `bg-card`.
  - A read message of mine shows the label «تمت القراءة».
  - A deleted one shows `DELETED_TRACE` and no reaction pill.
  - A failed one shows a button named «لم تُرسل». Its menu has «إعادة المحاولة» and «حذف», calling `onRetry` and
    `onDismissFailed`.
  - With fake timers, a `pointerdown` (pointerType touch) held 450 ms on a photo bubble calls `onSelect` once. The
    `click` that follows does not call `actions.onOpenPhoto` (Review Focus 2).
  - The same press moved 15 px before 450 ms calls nothing.
  - `contextmenu` calls `onSelect`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** both files: "Chat: WhatsApp-style message bubble".

### Task 6: Selection mode, reactions pill and the delete choice

**Files:**
- Create: `src/components/chat/wa-selection.tsx`. It holds `WaSelectionBar` and `WaReactionPicker`.
- Modify: `src/components/chat/delete-dialogs.tsx`:
  - add `requestDeleteChoice(m)` to `useChatDelete`;
  - add a `DeleteMessageChoiceDialog` next to `ClearChatDialog`, built the same way.
- Test: `src/__tests__/chat/wa-selection.test.tsx`, and add to `src/__tests__/chat/chat-delete-ui.test.tsx`.

**Interfaces:**
- Consumes: `selectionTools` (Task 4), `REACTION_EMOJI`, `copyText` from `message-menu.tsx`, and `MessageActions`.
- Produces:
  - `WaSelectionBar({ message, actions, onClose, onDelete }: { message: UiMessage; actions: MessageActions; onClose: () => void; onDelete: (m: UiMessage) => void })`.
    - A full-height replacement of the top bar, in `bg-primary text-primary-foreground`.
    - From the start side: ✕ «إلغاء التحديد», the count «1», then icon buttons (size-11, each with an `aria-label`):
      «رد», «نسخ», «حذف», and ⋮ with «إبلاغ عن الرسالة».
    - Each shows only when `selectionTools` allows it. Every action also calls `onClose`.
  - `WaReactionPicker({ message, actions, onPicked })`: a white pill with the four `REACTION_EMOJI` (size-11 each,
    my current one ringed). It sits above the selected bubble and calls `actions.onReact`, then `onPicked`.
  - `requestDeleteChoice(m: UiMessage): void` on `useChatDelete`'s return:
    - `upsell`: the offer, as today.
    - `use`, when `m.mine && canEveryone && !m.deleted`: a dialog «حذف الرسالة؟» with «حذف لدى الجميع» (destructive),
      «حذف لديّ», and «إلغاء».
    - `use`, otherwise: the same dialog with «حذف لديّ» and «إلغاء» only.
    - Choosing runs `deleteMessage(m, scope)` with no second confirm.
- The room (Task 8) keeps `selectedId: string | null`. It recomputes the message from `messages` on every render and
  clears the selection when the message is gone, has `pending`, or `selectionTools` is all false (Review Focus 3).
  Escape, the ✕, a tap on the list background or a route change also clear it.

- [ ] **Step 1: Write the failing tests.**
  - `WaSelectionBar` for my text message with `deleteMode:"use"` shows «رد», «نسخ», «حذف», and no «إبلاغ عن الرسالة»
    under ⋮.
  - For the partner's deleted message it shows only ⋮ → «إبلاغ عن الرسالة» and «حذف».
  - «نسخ» calls `navigator.clipboard.writeText` with the body, and then `onClose`.
  - `WaReactionPicker` tap «🤲» calls `onReact(m, "🤲")`.
  - `requestDeleteChoice`:
    - on my message in an open chat, the dialog offers both choices, and «حذف لدى الجميع» POSTs `scope:"everyone"`
      once with no second dialog;
    - on the partner's message it offers only «حذف لديّ»;
    - in `upsell` it opens the offer.
  - A helper `selectedMessage(messages, selectedId)` exported from `wa-selection.tsx`:
    - it returns null when the id is gone, or when the message became deleted-for-everyone from the partner's side
      and the viewer can't interact;
    - otherwise it returns the current object, not a stale one.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS. The existing `chat-delete-ui.test.tsx` cases still pass.
- [ ] **Step 5: Commit** the four files: "Chat: selection bar, reaction picker and one delete choice".

### Task 7: The WhatsApp-style composer

**Files:**
- Create: `src/components/chat/use-hold-to-record.ts`. The mic's press, slide-cancel, lock, Enter and Esc handling
  moves out of `chat-composer.tsx` verbatim, so both composers share it.
- Modify: `src/components/chat/chat-composer.tsx`. It uses the hook; nothing visible changes.
- Create: `src/components/chat/wa-composer.tsx`.
- Create: `src/components/chat/emoji-panel.tsx`, lazy-loaded with `next/dynamic`, plus `src/components/chat/emoji-data.ts`.
- Test: `src/__tests__/chat/wa-composer.test.tsx`. `hold-to-record.test.tsx` and `composer-send-error.test.tsx` must
  pass unedited.

**Interfaces:**
- Consumes: `ComposerMedia`, `MediaMode`, `useVoiceRecording`, `holdGesture`, `holdReleaseSends`, `ReplyQuote`,
  `quoteAuthor`, `enterSends`, `ProLock`, `ChatComposerHandle`.
- Produces: `WaComposer`, a `forwardRef<ChatComposerHandle, …>` with exactly `ChatComposer`'s props, so the room
  swaps one for the other.
- Produces: `useHoldToRecord(media, { female, onError })`, returning what the classic composer's mic button needs
  today. Name it by what you extract, and keep it the one source for both composers.
- Produces: `EMOJI_GROUPS: { label: string; emoji: string[] }[]`. About 200 common emoji in 5 groups (وجوه, إيماءات,
  قلوب, مناسبات, طبيعة), Arabic labels, no library.

Layout (spec "Input bar"):
- **Reply strip:** above the text, inside one white rounded card, with a coloured start bar, `quoteAuthor`, one line,
  and ✕.
- **Pill contents:** emoji toggle (`Smile`), then the auto-growing textarea (`text-base`, max about 6 lines), then
  paperclip, then camera.
- **Round button:** outside the pill, size-11+, `bg-primary`. Mic when empty (hold to record via the hook), `Send`
  when there is text.
- **Emoji:**
  - the toggle swaps the keyboard for `EmojiPanel` on phones (blur the textarea; the panel fills the keyboard's height,
    about 280 px);
  - on desktop it opens a popover;
  - a picked emoji is inserted at the cursor.
- **Paperclip and camera** follow `media?.mode`:
  - `"enabled"`: the paperclip opens a two-item `DropdownMenu`, «المعرض» (`accept="image/*"`) and «الكاميرا»
    (`accept="image/*" capture="environment"`). The camera button is the camera input directly, shown only on
    `pointer: coarse`.
  - `"locked"`: both call `media.onLocked()`.
  - `media` undefined: neither renders (Review Focus 5).
- **Enter:** `enterSends({ coarsePointer: matchMedia("(pointer: coarse)").matches, shiftKey, composing })`.
- **First press after the microphone prompt (audit U3):** if starting the recorder took more than 600 ms and the press
  then ended early, show «تم السماح بالميكروفون، اضغط مطولاً للتسجيل» (female: «اضغطي»). Show it in the composer's
  error line for 4 s.
- **Locked recording bar:** delete, timer and waveform, and send. No pause.
- **Starters:** the starter chips show above the card, as today.

- [ ] **Step 1: Write the failing tests.**
  - With `media` undefined, there is no button named «إرفاق» and none named «الكاميرا».
  - With `mode:"locked"`, clicking «إرفاق» calls `onLocked`.
  - With `mode:"enabled"`, «إرفاق» opens «المعرض» and «الكاميرا».
  - With `(pointer: coarse)` mocked true, Enter in the textarea adds a newline and does not call `onSend`. With it
    false, Enter calls `onSend("…")` once.
  - With text typed, the round button is «إرسال»; empty, it is «تسجيل رسالة صوتية».
  - `fill()` and `focus()` work through the ref.
  - Picking an emoji from the panel inserts it at the cursor position.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Extract `useHoldToRecord`, and run the two classic composer tests.** Expected: PASS.
- [ ] **Step 4: Implement `WaComposer`, `EmojiPanel` and the data file.**
- [ ] **Step 5: Run the gate.** Expected: PASS.
- [ ] **Step 6: Commit** the six files: "Chat: WhatsApp-style composer with emoji panel and attach sheet".

### Task 8: `WaChatRoom`, the new room view

**Files:**
- Create: `src/components/chat/wa-chat-room.tsx`. Replace the Task 2 stub.
- Test: `src/__tests__/chat/wa-chat-room.test.tsx`

**Interfaces:**
- Consumes: `ChatRoomModel` (Task 2), `WaMessageBubble` (5), `WaSelectionBar`, `WaReactionPicker`,
  `requestDeleteChoice`, `selectedMessage` (6), `WaComposer` (7), `unreadStripLabel` (4), and today's
  `ChatStatusBar`, `PhotoViewer`, `EndChatDialog`, `IntroConfirmDialog`, `ConfirmActionDialog`, `ProOfferDialog` and
  `chatDelete.dialogs`.
- Produces: `WaChatRoom({ model }: { model: ChatRoomModel })`.

Layout (spec "Chat screen"):
- **Shell:** the same as today: full screen on phones via `model.viewport`, the card on md+.
- **Top bar:** `bg-card`. It holds:
  - back (lg:hidden);
  - `TimeArcButton` with `MemberAvatar`, as today;
  - the name with the seal, Pro badge and verified badge, as today;
  - a subtitle line: `typingLabel`, else `activity`, else today's closed text;
  - the live dot when `mode === "live"`;
  - ⋮ with, in order: the label «متبقي N أيام على المحادثة» (open only), «صفحة التوافق», «تمديد 7 أيام» (when
    `canExtend`), «مسح المحادثة» (per `deleteMode`), a separator, «إبلاغ» (destructive) and «إنهاء المحادثة»
    (`endable`, destructive). The handlers are today's.
  - The avatar and name link to the match page unless `matchHidden`.
- **Selection:** while a message is selected, `WaSelectionBar` replaces the top bar, and `WaReactionPicker` floats
  above the selected bubble when `selectionTools(...).react` is true.
- **Under the bar:** the offline line, then `ChatStatusBar`, both unchanged.
- **Message area:** `bg-sand` (the existing `majlis` class may stay). Contents:
  - The safety note as a centred `bg-safety-chip text-accent-ink` chip with `ShieldCheck`, today's gendered text.
  - The «تحميل رسائل أقدم» button and the empty states, as today.
  - Days from `groupByDay`. The date chip is `bg-chat-chip`, sticky, and fades out 1 s after scrolling stops
    (`opacity` transition, instant with reduced motion). It shows again on scroll.
  - The unread divider is a full-width `bg-chat-chip` strip with `unreadStripLabel(n)`. `n` is the number of partner
    messages from `unreadFromId` on. It keeps `data-unread-divider` so the open-at-divider effect still works.
  - Rows use `WaMessageBubble`, with `onSelect` setting `selectedId`. `onDismissFailed` removes the local failed item
    and revokes its blob URL; add that handler to the model as `dismissFailed(id: string)`.
  - The refusal note is unchanged.
  - The jump button: round `bg-card`, `ChevronDown`, `bg-primary` count badge. The count comes from `model.unseen`. On
    open, the model sets `seenUpTo` to the newest message before the divider (audit B22). Do it in `useChatRoom`, and
    add a unit test there.
- **Bottom:** `WaComposer` when `canSend`, else today's read-only footer in a full-width `bg-card` bar.
- **Dialogs:** all mounted as in `ClassicChatRoom`.

- [ ] **Step 1: Write the failing tests.** Render `WaChatRoom` with a fixture model (a small `makeModel()` helper in
  the test file) and check:
  - the subtitle shows «يكتب الآن…» when `typingLabel` is set;
  - the ⋮ menu items appear in the order above;
  - two partner messages after `unreadFromId` show «رسالتان غير مقروءتين»;
  - a long press on a bubble shows the selection bar (button «إلغاء التحديد»);
  - while selected, re-rendering with that message deleted for everyone, and `canInteract:false`, removes the
    selection bar (Review Focus 3);
  - with `canSend:false` and `status:"ENDED"`, `endedChatNote` shows and the composer doesn't;
  - the safety note is present.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate and `pnpm build`.** Expected: PASS.
- [ ] **Step 5: Commit** `wa-chat-room.tsx`, `use-chat-room.ts`, `chat-room.tsx` and the test: "Chat: WhatsApp-style room view behind chat_whatsapp_layout".

### Task 9: The chats list

**Files:**
- Create: `src/components/chat/use-chat-list.ts`. It holds the loading, reload triggers and data from
  `chat-list.tsx:27-…`, moved verbatim.
- Create: `src/components/chat/classic-chat-list.tsx` (today's JSX) and `src/components/chat/wa-chat-list.tsx`.
- Modify: `src/components/chat/chat-list.tsx`. `ChatList({ compact, activeId })` picks a view by `useChatLayout()`.
- Test: `src/__tests__/chat/wa-chat-list.test.tsx`. Existing list tests pass unedited.

**Interfaces:**
- Produces: `useChatList(): { chats: ChatSummary[] | null; loadFailed: boolean; reload: () => void }`.
- Produces: `WaChatList({ compact, activeId, data })`.

Layout (spec "Chats list"):
- **Title:** «المحادثات», with no search and no ⋮.
- **Chips** (`flex flex-wrap gap-2`, never `overflow-x-auto`):
  - «الكل»: active chats (`isActiveChat`).
  - «غير مقروءة»: active chats with `unread > 0`, and the count in the chip when greater than 0.
  - «المنتهية»: the rest.
- **Rows:**
  - `MemberAvatar` with the time arc;
  - the name with the Pro badge;
  - the end side: `listTimeLabel` (in `text-primary` when unread), and the unread count in a round `bg-primary`
    badge;
  - the second line: my ✓/✓✓ and the last message, or «صورة» / «رسالة صوتية» / `DELETED_TRACE`;
  - when `daysLeft <= EXPIRY_SOON_DAYS`, a third line «باقي N أيام» in `text-destructive`;
  - ended rows muted, with no badge.
- **Empty state:** an ended or expired chat with no messages shows «لا توجد رسائل», not «ابدأ المحادثة» (audit U11).
- **Failures:** a failed first load shows `LoadError`, as today.

- [ ] **Step 1: Write the failing tests** with three fixture chats (active with unread 2, active read, ended):
  - «الكل» shows two rows;
  - «غير مقروءة 1» shows one;
  - «المنتهية» shows one, without a badge;
  - a chat with 2 days left shows «باقي يومان»;
  - an ended chat with no messages doesn't say «ابدأ المحادثة».
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate.** Expected: PASS.
- [ ] **Step 5: Commit** the five files and the test: "Chat: WhatsApp-style chats list".

### Task 10: Real-flow check and docs

**Files:**
- Modify: `CLAUDE.md`. A switch line in the overview, next to `chat_delete_enabled`, and one line under "After a
  match".
- Modify: `src/components/chat/chats-shell.tsx:49`. «والمحادثة نصية» → «رسائلك خاصة، والمحادثة محدودة المدة.» (audit U11).

- [ ] **Step 1: Run** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: all pass, lint at
  0 problems.
- [ ] **Step 2: Start a production build on port 3030.** Follow CLAUDE.md "Real-flow QA", with
  `chat_whatsapp_layout = 'true'` in the local `system_settings`. Walk a chat between `0777000001` and `0777000002`
  (code `111111`):
  - send, reply by swipe (phone emulation) and by hover arrow;
  - react from the selection picker;
  - copy;
  - delete for me and for everyone (as Pro, which is local);
  - record a voice note, send a photo, try the camera input;
  - end and report.

  Check the chats list chips and badges. Screenshot each screen at 390×844 and 1280×800.
- [ ] **Step 3: Set the switch to `'false'` and reload.** The chat must look exactly as before. Compare the
  screenshots with `main`.
- [ ] **Step 4: Open the chat in WebKit (Playwright `webkit`) at phone size.** No console errors; sending works.
- [ ] **Step 5: Commit** `CLAUDE.md` and `chats-shell.tsx`: "Docs: chat_whatsapp_layout switch; chats placeholder copy".
- [ ] **Step 6: Report to the owner** with the screenshots. Deploying and turning the switch on in production are the
  owner's decisions (CLAUDE.md: ask before each deploy).
