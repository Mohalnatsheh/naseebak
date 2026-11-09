# Modern Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WhatsApp-style chat on the website and in app 1.1.0: a new look, a mic/send composer with hold-to-record, reply, reactions, a typing indicator, conversation starters, a long-press menu, and better photo and voice handling. Every privacy rule stays as it is.

**Architecture:**
- **Server:** a few additive pieces: `Message.replyToId`, a `MessageReaction` table, an in-memory typing state (plus an Ably `typing` event), and starters as code constants.
- **Website:** rebuild the chat components under `src/components/chat/`.
- **App:** rebuild the chat widgets under `naseebak_app/lib/features/chat/`.
- **Old app 1.0.x:** ignores all new fields.

**Tech Stack:** Next.js 16, Prisma 7, Ably, Vitest, Tailwind v4 / shadcn; Flutter, Riverpod, just_audio, record.

**Spec:** `docs/superpowers/specs/2026-11-10-modern-chat-design.md` (owner decisions, 2026-11-10). This plan runs after QA fix waves W1, W2 and A1 on branch `feature/pro-qa`.

## Global Constraints
- **Schema:**
  - Additive only.
  - `MessageReaction` is a new table with `@@unique([messageId, userId])`.
  - `Message.replyToId String?` is indexed, with no FK cascade surprises: use `onDelete: SetNull`.
- **Reactions:** exactly `❤️`, `👍`, `😊`, `🤲`; one per member per message; tapping the same one again removes it. None in a chat that is not ACTIVE or is blocked. No push and no unread count.
- **Typing:**
  - The client sends at most one `POST /api/chats/[id]/typing` per 3 s.
  - The server keeps it in memory (one PM2 process) and shows it for 5 s.
  - With Ably, the server publishes `typing` on `chat:<id>`. Without Ably, the chat GET returns `partnerTyping`.
  - Never shown in an ended or blocked chat.
  - Copy: «يكتب الآن…» / «تكتب الآن…» via `forPartner()`.
- **Reply:**
  - Same conversation only, validated on the server.
  - The API returns `replyTo: { id, mine, kind, snippet }`. The snippet is built on the server from the stored, already-filtered text: at most 80 chars, or «📷 صورة» / «🎤 رسالة صوتية».
  - Reply text goes through the full filter.
- **Starters:** a fixed gendered list in a db-free module, `src/lib/chat/starters.ts`, shared as JSON with the app via `GET /api/chats/[id]` → `starters` only while I have sent nothing. Starters are sent like any message, through the filter.
- **Voice (hold to record):**
  - Release to send; slide towards the start edge to cancel («اسحب للإلغاء»); slide up to lock.
  - It stops at 180 s, or when the app goes to the background, and waits for send or cancel. Under 1 s it is discarded with «الرسالة قصيرة جداً».
  - Website: pointer events.
- **Look:**
  - Brand tokens only: bubbles in navy (mine) and white (theirs).
  - A soft pattern background: an SVG or PNG tile, a light brand pattern, no faces.
  - Tails on the first bubble of a run.
  - The time and ticks inside the bubble; `dir="auto"` (website) and a text direction taken from the first strong character (app).
  - Sticky date chips, and a «رسائل جديدة» divider.
  - One status bar, picked by priority: expiry, then family step, then the push chip.
- **Long-press / hover menu:** «رد», reactions, «نسخ» (text only), «إبلاغ عن الرسالة». No delete for everyone.
- **Media:**
  - A black full-screen photo viewer with zoom and swipe, and no download.
  - Voice: a scrubbable waveform drawn from the duration, speed 1/1.5/2×, and an unplayed dot (local).
  - App: a photo preview with «إرسال» / «إلغاء» before upload.
- **Rules carried over:**
  - From CLAUDE.md and the app CLAUDE.md: gendered copy, Western digits, ≥44 px targets, ≥16 px inputs, no hardcoded colours, Dialog, LoadError, SecureArea, mounted after await, heroTag null.
  - Ably: only the server publishes.

## Review Focus
1. **A reply to a message from another conversation, or to a deleted one.** Expect 400 or a null `replyTo`, and no leak of the other chat's text. *Test: Task 1.*
2. **Reactions or typing in an ENDED or blocked chat, or from a stranger.** Expect them refused and nothing broadcast. *Test: Task 1.*
3. **Hold-to-record: the pointer leaves the button, a second finger, or the tab is hidden mid-hold.** Expect it to stop and wait, or cancel; never a silent send. *Test: Tasks 3 and 6.*
4. **Old app 1.0.x reading messages with `replyTo` and `reactions`.** Expect the text still shown and nothing to break. *Test: Task 1, a JSON shape assertion that keeps the old fields.*
5. **A starter chip with the contact filter.** Expect the starter texts to pass the filter, and an edited starter to be filtered. *Test: Task 1.*

---

### Task 1: Server: reply, reactions, typing, starters
**Files:**
- **Schema:** `prisma/schema.prisma` (`Message.replyToId` plus its relation, model `MessageReaction`).
- **Chat code:** `src/lib/chat/service.ts` (send with `replyToId`, payload `replyTo` and `reactions`, `partnerTyping`), `src/lib/chat/reactions.ts`, `src/lib/chat/typing.ts`, `src/lib/chat/starters.ts`.
- **Routes:** `src/app/api/chats/[id]/messages/route.ts` (accepts `replyToId`), `src/app/api/chats/[id]/messages/[messageId]/reaction/route.ts`, `src/app/api/chats/[id]/typing/route.ts`.
- **Tests:** `src/__tests__/chat/modern.test.ts`.

**Interfaces (produces):**
- `ChatMessage` gains `replyTo: {id, mine, kind, snippet} | null` and `reactions: {emoji, mine}[]`.
- Chat GET gains `partnerTyping: boolean` and `starters: string[]`.
- Ably events: `reaction` `{messageId, reactions}` and `typing` `{userId}`.
- Reaction route: `{emoji: "❤️"|"👍"|"😊"|"🤲"|null}` returns `{reactions}`.

- [ ] **Step 1: failing tests** (all Review Focus items 1, 2, 4, 5, plus the toggle rule and the one-per-member rule).
- [ ] **Step 2:** run the tests; expect FAIL.
- [ ] **Step 3:** implement, then `db:push` + `db:generate`.
- [ ] **Step 4:** run the tests, then full vitest, tsc and lint; expect PASS.
- [ ] **Step 5:** commit «Chat: reply, reactions, typing, starters (server)».

### Task 2: Website: look and layout
**Files:** `src/components/chat/*` (chat-room, message-bubble, chat-list, the new chat-background asset), `src/app/(ar)/dashboard/chats/**`.
- New bubbles and tails, the background, the header with status line and badge, the single priority status bar, sticky date chips, the unread divider, `dir="auto"`.
- The chats list gets «النشطة» / «المنتهية» tabs; desktop gets two panes (list + room) at ≥1024 px.
- Tests: bubble grouping (tails and times), the status-bar priority and the tabs.
- QA: screenshots at 390 / 1280.

### Task 3: Website: composer, hold-to-record, reply, reactions, menu, starters, typing
**Files:** `src/components/chat/chat-composer.tsx`, `media-buttons.tsx`, `voice-recorder.ts`, a new `message-menu.tsx`, `reply-strip.tsx`, `starter-chips.tsx`, `use-typing.ts`.
- **Composer:** a pill composer with the photo button inside; one mic/send button.
- **Hold-to-record:** pointer events with slide-to-cancel and slide-up-to-lock; it stops at 180 s or when the tab is hidden, and waits.
- **Reply:** by hover/long-press menu, with a quote strip; tapping the quote scrolls to the original.
- **Reactions:** chips.
- **Menu:** «نسخ» and «إبلاغ».
- **Starters:** shown while I have sent nothing.
- **Typing:** sent with a 3 s throttle; the status line shows it.
- Tests for each, including Review Focus 3.

### Task 4: Website: media and resilience
**Files:** `media-bubble.tsx`, a new `photo-viewer.tsx`, `voice-bubble`.
- **Photos:** a black viewer with zoom and swipe across the chat's photos; the time over the photo.
- **Voice:** a waveform from `durationSec`, seek, speed, and an unplayed dot (localStorage, wrapped in try/catch).
- **Reliability:** a send queue (a refused bubble stays with retry); an offline banner with auto-retry; older messages load automatically at the top. Polling pauses in hidden tabs and uses `?after=` — only if not already done in W2.
- Tests.

### Task 5: App: look and layout
**Files:** `naseebak_app/lib/features/chat/chat_room_screen.dart`, `chat_bubble.dart`, `chats_screen.dart`, a new `chat_background.dart`.
- The same look as Task 2: tails, background, a text direction per bubble, sticky date chips, the unread divider, and one priority status bar. The header shows typing or the activity label.
- Keep `SecureArea`. Keep jank low: avoid a per-bubble `ClipRRect` and shadows, and use `RepaintBoundary` on media.
- Widget tests.

### Task 6: App: composer, hold-to-record, reply, reactions, menu, starters, typing, photo preview
**Files:** `chat_room_screen.dart`, `voice_recorder.dart`, new `message_menu.dart`, `reply_strip.dart`, `starter_chips.dart`, `photo_preview_screen.dart`, and `chat_models.dart` (`replyTo`, `reactions`, `partnerTyping`, `starters`; send with `replyToId`; reaction and typing calls).
- **Hold-to-record:** a `GestureDetector` long-press with slide-to-cancel and slide-up-to-lock, plus haptics. It stops at 180 s or on background and waits.
- **Reply:** swipe a bubble (RTL-aware) or use the long-press bottom sheet (رد · reactions · نسخ · إبلاغ).
- **Photos:** a preview before upload.
- **Typing:** sent with a 3 s throttle.
- Tests include Review Focus 3 (lifecycle and pointer leave).

### Task 7: App: media polish
**Files:** `media_bubbles.dart`, `voice_playback.dart`.
- The time on photos; a full-screen viewer with swipe across the chat's photos; a voice waveform with seek, speed and an unplayed dot (SharedPreferences, cleared on sign-out).
- Tests.

### Task 8: Docs, full check and device QA
- **Docs:** `CLAUDE.md` (the chat section: the new fields and the typing endpoint), `naseebak_app/CLAUDE.md`, and `docs/reference/matches-and-safety.md`.
- **Full check:** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`; `flutter analyze && flutter test`.
- **Device QA:** two members on the website (390 / 1280) and on the iOS Simulator and Android emulator. Test: reply, reactions, typing (polling), starters, hold-to-record including cancel and lock, the photo preview and viewer, voice speed. Screenshots go to the QA folder.
