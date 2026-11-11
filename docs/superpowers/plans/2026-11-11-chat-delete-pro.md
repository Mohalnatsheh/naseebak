# Pro Chat Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro members can delete one message or clear a whole chat, "for me" or "for everyone", without closing the chat; admins keep seeing everything, tagged.

**Architecture:** Nothing is ever erased. Four additive markers (a per-message `deletedAt`, a per-member `MessageHide` row, a per-member `ConversationClear` cutoff, a conversation-level `clearedAt` cutoff) are applied in SQL on every member read path and ignored by the admin path. A message that leaves someone's view is stamped read for them, so unread counts, the unread SMS and chat nudges need no change. Live updates ride two new Ably events; polling clients get the same through new GET fields.

**Tech Stack:** Next.js 16 route handlers, Prisma 7 (Postgres), Zod v4 (`zod/v4`), Vitest (DB mocked with `vi.hoisted()` + `vi.mock("@/lib/db")`), React 19 + shadcn `DropdownMenu`/`Dialog`, Flutter (Riverpod, Dio, `flutter test` with the fake Dio adapter).

**Spec:** `docs/superpowers/specs/2026-11-11-chat-delete-pro-design.md`

## Global Constraints

- Work in a separate worktree: `git worktree add ../naseebak-chat-delete -b feature/chat-delete feature/fcm-push` (that branch = the deployed `2595f3f` + docs). Stage files by path, never `git add -A`.
- Schema changes are additive only. No new unique constraint on an existing table (new tables may have composite ids).
- New switch `chat_delete_enabled`, default `"false"`. Off: the server refuses delete/clear (`DISABLED`) and GET sends `deleteEnabled: false`, so clients show nothing. Existing hides stay applied while off.
- Pro check is `isPro(userId)` at action time (it never reads `pro_enabled`). Non-Pro → `IntroError("PRO_REQUIRED", "حذف الرسائل ومسح المحادثة متاح لأعضاء Pro")`.
- Entry points show only when `deleteEnabled && (isPro || canBuy)`; in the app also `&& appPaymentsProvider`. Non-Pro tap → Pro upsell (link `/dashboard/pro`, app `/pro`).
- "Delete for everyone" only on the actor's own messages. "For everyone" (message and clear) only in an ACTIVE chat with no block (`assertCanSend`). "For me" works in any chat the member can read (`loadForUser(…, { readOnly: true })`).
- Silent: no `notify()`, no SMS, no bell row for any delete.
- No time window.
- Exact copy:
  - trace: `تم حذف الرسالة`
  - menu: `حذف لديّ`, `حذف لدى الجميع`
  - header: `مسح المحادثة`, then `مسح لديّ` / `مسح لدى الجميع`
  - confirm, message for everyone: `ستُحذف الرسالة لديك ولدى الطرف الآخر، ويظهر مكانها «تم حذف الرسالة».`
  - confirm, clear for me: `ستُمسح الرسائل من عندك فقط، ويبقى كل شيء لدى الطرف الآخر.`
  - confirm, clear for everyone: `ستُمسح كل رسائل هذه المحادثة لديك ولدى الطرف الآخر. تبقى المحادثة مفتوحة ويمكنكما متابعة الكتابة.`
- Old clients: a deleted-for-everyone message is sent as `kind: "TEXT"`, `body: "تم حذف الرسالة"`, `media: null`, `replyTo: null`, `reactions: []`, plus the additive `deleted: true`.
- Website rules: Western digits, RTL, design tokens only (guard test), text ≥ 12 px, tap targets ≥ 44 px, `Dialog`/`DropdownMenu` (never `window.confirm`). Client components never import runtime values from modules that import `@/lib/db`.
- App rules: `AppText`/`AppColors` tokens, `mounted` check after every `await`, `flutter analyze` 0 issues.
- Done means `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` green and, in `naseebak_app/`, `flutter analyze && flutter test` green.

## Review Focus

1. **Old app, fresh load after delete for everyone:** the original text appears nowhere: not in `body`, not in another message's `replyTo.snippet`, not in the chat-list `lastMessage`. → Task 3 tests `old-client shape`, `reply quote of deleted`, `list preview of deleted`.
2. **Paging across a clear point:** with 40 pre-clear and 5 post-clear messages, the first page has 5 messages and `hasMore: false`, and a `before` page returns nothing. → Task 3 test `paging stops at the clear point`.
3. **Partner writes right after "clear for everyone":** a message created after `clearedAt` shows for both. → Task 3 test `message after the clear shows`.
4. **Direct API calls bypassing the UI:** non-Pro, switch off, someone else's message for everyone, a message from another chat, "for everyone" after a block: each refused with no write. → Task 4 tests.
5. **Evidence:** a deleted-for-everyone partner message can still be reported (`endConversation` with its `messageId`). Its media answers 404 to both members and 200 to an admin. → Task 5 tests.

---

### Task 1: Schema and switch

**Files:**
- Modify: `prisma/schema.prisma` (models `Message`, `Conversation`, `User` back-relations; new `MessageHide`, `ConversationClear`)
- Modify: `src/lib/settings.ts` (default + getter)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts`, `src/components/admin/new-cycle-settings-card.tsx`
- Test: `src/__tests__/admin/new-cycle-settings.test.ts`, `src/__tests__/admin/new-cycle-settings-card.test.tsx`

**Interfaces:**
- Produces:
  - `Message.deletedAt DateTime?` (deleted for everyone; always by the sender)
  - `Message.hides MessageHide[]`
  - `Conversation.clearedAt DateTime?`, `Conversation.clearedById String?` (cleared for everyone)
  - `Conversation.clears ConversationClear[]`
  - `model MessageHide { messageId, userId, createdAt @default(now()); @@id([messageId, userId]); @@index([userId, createdAt]); @@map("message_hides") }` (cascade on both relations)
  - `model ConversationClear { conversationId, userId, clearedAt; @@id([conversationId, userId]); @@map("conversation_clears") }` (cascade on both relations)
  - `getChatDeleteEnabled(): Promise<boolean>` in `src/lib/settings.ts`
  - Admin settings body field `chatDeleteEnabled?: boolean`; the GET returns `chatDeleteEnabled`

- [ ] **Step 1: Write failing tests.** In `new-cycle-settings.test.ts`: `it("reads and saves chat_delete_enabled")`. A GET with the setting `"true"` returns `chatDeleteEnabled: true`. A POST `{ chatDeleteEnabled: true }` calls `setSetting("chat_delete_enabled", "true")`. In the card test: `it("shows the Pro chat delete switch")`. The label `Pro: delete messages and clear chats` is present and toggles `chatDeleteEnabled`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/admin/new-cycle-settings` and expect FAIL.
- [ ] **Step 3: Implement.** Add the schema, `chat_delete_enabled: "false"` with a one-line comment, `getChatDeleteEnabled()`, the route field (log the change like `pro_enabled`), and the card switch with the hint `Off by default. Members' existing deletions stay hidden when off.`
- [ ] **Step 4: Schema.** Run `DATABASE_URL=postgresql://$(whoami)@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate`. Expect no data-loss prompt.
- [ ] **Step 5: Run** the tests and `npx tsc --noEmit`, and expect PASS.
- [ ] **Step 6: Commit.** `git add prisma/schema.prisma src/lib/settings.ts src/app/api/admin/settings/new-cycle/route.ts src/components/admin/new-cycle-settings-card.tsx src/__tests__/admin/new-cycle-settings.test.ts src/__tests__/admin/new-cycle-settings-card.test.tsx`, then `git commit -m "Chat delete: schema (deletedAt, hides, clears) and chat_delete_enabled switch"`.

### Task 2: Visibility rules (db-free)

**Files:**
- Create: `src/lib/chat/visibility.ts` (no `@/lib/db` import; clients may import it)
- Test: `src/__tests__/chat/visibility.test.ts`

**Interfaces:**
- Produces:
  - `export const DELETED_TRACE = "تم حذف الرسالة";`
  - `export function viewerCutoff(chatClearedAt: Date | null, myClearAt: Date | null): Date | null`: the later of the two, or null.
  - `export function visibleMessageWhere(conversationId: string, userId: string, cutoff: Date | null): Prisma.MessageWhereInput` (import Prisma types only, `import type`). Returns `{ conversationId, hides: { none: { userId } }, ...(cutoff && { createdAt: { gt: cutoff } }) }`. Callers combine it with cursors as `{ AND: [visible, cursor] }`.
  - `export function hiddenForViewer(m: { createdAt: Date; hides?: { userId: string }[] }, userId: string, cutoff: Date | null): boolean`
  - `export type DeleteScope = "me" | "everyone";` and `export function isDeleteScope(v: unknown): v is DeleteScope`
  - `export function deleteEntryMode(a: { deleteEnabled: boolean; isPro: boolean; canBuy: boolean }): "use" | "upsell" | null`: `"use"` if enabled and Pro, `"upsell"` if enabled and `canBuy`, else null.

- [ ] **Step 1: Write failing tests:**
  - `viewerCutoff(null, null) === null`
  - `viewerCutoff(a, b)` returns the later date, either order
  - `visibleMessageWhere("c", "u", null)` deep-equals `{ conversationId: "c", hides: { none: { userId: "u" } } }`
  - with a cutoff it adds `createdAt: { gt: cutoff }`
  - `hiddenForViewer` is true for a hide by that user and for `createdAt` equal to the cutoff, false for a hide by the other user
  - `deleteEntryMode` gives these four rows:

    | deleteEnabled | isPro | canBuy | result |
    |---|---|---|---|
    | false | true | true | null |
    | true | true | false | "use" |
    | true | false | true | "upsell" |
    | true | false | false | null |
- [ ] **Step 2: Run** `npx vitest run src/__tests__/chat/visibility.test.ts` and expect FAIL.
- [ ] **Step 3: Implement** `src/lib/chat/visibility.ts`.
- [ ] **Step 4: Run** the test again and expect PASS.
- [ ] **Step 5: Commit.** `git add src/lib/chat/visibility.ts src/__tests__/chat/visibility.test.ts`, then `git commit -m "Chat delete: visibility rules"`.

### Task 3: Member read paths apply the hides

**Files:**
- Modify: `src/lib/chat/service.ts`: `messageInclude` → `messageIncludeFor(userId)`, `MessageRow`, `ChatMessage`, `toMessage`, `toReplyQuote`, `summarise` (preview body), `listConversations`, `getConversation`
- Modify: `src/app/api/chats/[id]/route.ts` (add `deleteEnabled`)
- Test: `src/__tests__/chat/delete-read.test.ts` (new; same mocking as `src/__tests__/chat/service.test.ts`)

**Interfaces:**
- Consumes: Task 2 (`viewerCutoff`, `visibleMessageWhere`, `hiddenForViewer`, `DELETED_TRACE`), Task 1 fields.
- Produces:
  - `ChatMessage.deleted?: boolean` (true only for deleted-for-everyone)
  - Chat GET additive fields:
    - `deleteEnabled: boolean`
    - `clearedBefore: string | null`: my effective cutoff, always sent
    - on polls with `reactionsSince`: `deletedIds?: string[]` (messages with `deletedAt >= reactionsSince`) and `hiddenIds?: string[]` (my `MessageHide.createdAt >= reactionsSince`)
  - `messageIncludeFor(userId)` adds:
    - `hides: { where: { userId }, select: { userId: true } }`
    - `replyTo.select`: `deletedAt`, `createdAt`, `hides: { where: { userId }, select: { userId: true } }`

- [ ] **Step 1: Write failing tests** in `delete-read.test.ts`:
  - `old-client shape`: a row with `deletedAt` set, `kind: "IMAGE"` and reactions becomes `{ body: "تم حذف الرسالة", kind: "TEXT", media: null, replyTo: null, reactions: [], deleted: true }`.
  - `reply quote of deleted`: a message replying to a deleted-for-everyone message (or one hidden for the viewer, or one at/before the cutoff) has `replyTo.snippet === "تم حذف الرسالة"` and `replyTo.kind === "TEXT"`.
  - `page query uses visibility`: `db.message.findMany` is called with `where.AND[0]` equal to `visibleMessageWhere(id, userId, cutoff)`, where the cutoff comes from `conversation.clearedAt` and `db.conversationClear.findUnique`.
  - `paging stops at the clear point`: the mock returns only post-cutoff rows, so `hasMore` is false.
  - `message after the clear shows`: a row with `createdAt > clearedAt` comes back normally.
  - `list preview of deleted`: in `listConversations`, a newest message with `deletedAt` previews `"تم حذف الرسالة"`; a newest visible message at/before my cutoff gives `lastMessage: null`.
  - `poll returns deletedIds/hiddenIds`: a GET with `after` + `reactionsSince` returns `deletedIds` and `hiddenIds` from the queries filtered on `deletedAt >= since` and `MessageHide { userId, createdAt >= since }`.
  - `bothWrote ignores hides`: `sentByMe` and `sentByPartner` counts keep `where: { conversationId, senderId }` with no visibility filter.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/chat/delete-read.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.**
  - In `getConversation`, load `db.conversationClear.findUnique({ where: { conversationId_userId: { conversationId: id, userId } } })` beside `loadForUser`, then wrap both page queries as `{ AND: [visibleMessageWhere(...), cursorWhere] }`.
  - In `listConversations`, load the member's clears in one `findMany({ where: { userId } })`. The nested `messages` include gets `where: { hides: { none: { userId } } }` and selects `deletedAt`. A preview at/before the cutoff becomes `null`.
  - `toMessage` and `summarise` present a deleted message with the trace. `toReplyQuote` returns a trace quote when the quoted row is deleted or `hiddenForViewer`.
  - The route adds `deleteEnabled: await getChatDeleteEnabled()`.
- [ ] **Step 4: Run** the new test plus `npx vitest run src/__tests__/chat` (existing chat tests stay green; update their `findMany` `where` expectations only for the new `AND` wrapper) and expect PASS.
- [ ] **Step 5: Commit.** `git add src/lib/chat/service.ts "src/app/api/chats/[id]/route.ts" src/__tests__/chat/delete-read.test.ts` plus any adjusted chat test files, then `git commit -m "Chat delete: member reads hide deleted and cleared messages"`.

### Task 4: Delete and clear actions

**Files:**
- Create: `src/lib/chat/delete.ts`
- Create: `src/app/api/chats/[id]/messages/[messageId]/delete/route.ts`, `src/app/api/chats/[id]/clear/route.ts`
- Modify: `src/lib/ably.ts` (`ChatEventName` adds `"deleted" | "cleared"`)
- Test: `src/__tests__/chat/delete-actions.test.ts`

**Interfaces:**
- Consumes: Task 1 (`getChatDeleteEnabled`, the models), Task 2 (`DeleteScope`), `assertCanSend` / `loadForUser`-style checks from `service.ts` (export a `loadChatForMember(id, userId)` read-only loader if `loadForUser` isn't exported), `isPro`, `clearChatBell`, `publishChatEvent`.
- Produces:
  - `export async function deleteMessage(a: { conversationId: string; messageId: string; userId: string; scope: DeleteScope }): Promise<{ ok: true }>`
  - `export async function clearChat(a: { conversationId: string; userId: string; scope: DeleteScope }): Promise<{ clearedBefore: string }>`
  - `POST /api/chats/{id}/messages/{messageId}/delete` with body `{ scope: "me" | "everyone" }` → `{ ok: true }`
  - `POST /api/chats/{id}/clear` with body `{ scope }` → `{ clearedBefore }`
  - Errors go through `introErrorResponse`.
  - Ably `deleted` event data `{ messageId }`; `cleared` event data `{ before: string }`.

- [ ] **Step 1: Write failing tests** in `delete-actions.test.ts`:
  - **Switch off:** `DISABLED`, no write.
  - **Not Pro:** `PRO_REQUIRED` with message `حذف الرسائل ومسح المحادثة متاح لأعضاء Pro`, no write.
  - **Message for everyone, mine, open chat:** `message.updateMany` with `where: { id, senderId: userId, deletedAt: null }` and `data: { deletedAt }`. An unread copy is stamped read (`updateMany` `readAt: null` → now). `publishChatEvent(id, "deleted", { messageId })` fires.
  - **Message for everyone, partner's message:** `NOT_ALLOWED`. In a blocked or ended chat it is refused too (via `assertCanSend`).
  - **Message for everyone, already deleted:** `{ ok: true }` with no second event.
  - **Message for me:** `messageHide.createMany({ data: [{ messageId, userId }], skipDuplicates: true })`. A partner message that was unread is stamped read. No Ably event. Allowed in an ENDED chat.
  - **Message from another chat:** `NOT_FOUND`.
  - **Clear for me:** `conversationClear.upsert` sets `clearedAt = now`. The partner's unread messages at/before now are stamped read and `clearChatBell(userId, id)` is called. No event.
  - **Clear for everyone:** `conversation.update` sets `{ clearedAt: now, clearedById: userId }`. All unread messages at/before now are stamped read. `publishChatEvent(id, "cleared", { before })` fires. Refused after a block.
  - **No notices:** no `notify` call in any case (mock `@/lib/notify` and assert `not.toHaveBeenCalled`).
  - **Route:** a bad scope gives 400. Signed out gives 401 (`requireUser`).
- [ ] **Step 2: Run** `npx vitest run src/__tests__/chat/delete-actions.test.ts` and expect FAIL.
- [ ] **Step 3: Implement** `delete.ts` and the two routes (Zod `z.object({ scope: z.enum(["me", "everyone"]) })`), plus the `ChatEventName` union.
- [ ] **Step 4: Run** the test again and expect PASS.
- [ ] **Step 5: Commit.** `git add src/lib/chat/delete.ts src/lib/ably.ts "src/app/api/chats/[id]/messages/[messageId]/delete/route.ts" "src/app/api/chats/[id]/clear/route.ts" src/__tests__/chat/delete-actions.test.ts`, then `git commit -m "Chat delete: Pro delete-message and clear-chat actions"`.

### Task 5: Media and reports respect deletion

**Files:**
- Modify: `src/app/api/chats/[id]/media/[messageId]/route.ts`
- Test: `src/__tests__/chat/media.test.ts` (add cases), `src/__tests__/chat/delete-actions.test.ts` (report case)

**Interfaces:**
- Consumes: Task 2 `hiddenForViewer`, `viewerCutoff`.

- [ ] **Step 1: Write failing tests:**
  - `media of a deleted message is 404 for both members`
  - `media hidden for me / before my clear is 404 for me, 200 for the partner`
  - `admin still gets 200 for a deleted message's media`
  - `a deleted-for-everyone partner message can still be reported`: `endConversation({ report: { reason, messageId }, end: false })` files the report with that `messageId`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/chat/media.test.ts src/__tests__/chat/delete-actions.test.ts` and expect FAIL on the media cases. The report case may already pass; keep it as a pin.
- [ ] **Step 3: Implement.** Select `deletedAt` and `hides` for the member, and the conversation `clearedAt` plus the member's `ConversationClear`. For a member (not admin) who can't see the message, return the route's existing `notFound()`.
- [ ] **Step 4: Run** the tests again and expect PASS.
- [ ] **Step 5: Commit.** `git add "src/app/api/chats/[id]/media/[messageId]/route.ts" src/__tests__/chat/media.test.ts src/__tests__/chat/delete-actions.test.ts`, then `git commit -m "Chat delete: deleted media stays private, deleted messages stay reportable"`.

### Task 6: Admin sees what was deleted

**Files:**
- Modify: `src/app/api/admin/chats/[id]/messages/route.ts`, `src/app/(en)/admin/chats/[id]/page.tsx`
- Test: `src/__tests__/admin/chat-messages.test.ts`

**Interfaces:**
- Produces:
  - Per message: `deletion: { forEveryone: boolean; hiddenBy: string[]; clearedForEveryone: boolean; beforeClearOf: string[] }` (user ids).
  - On `chat`: `clearedAt`, `clearedById`, `clears: { userId: string; clearedAt: string }[]`.
  - Original `body` and `media` unchanged.

- [ ] **Step 1: Write failing tests:**
  - A deleted message keeps its real `body` and has `deletion.forEveryone: true`.
  - A hide by the female shows `hiddenBy: [femaleId]`.
  - A message at/before `chat.clearedAt` has `clearedForEveryone: true`.
  - A message at/before the male's clear has `beforeClearOf: [maleId]`.
  - An untouched message has all four fields false or empty.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/admin/chat-messages.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.** Select `deletedAt` and `hides`, the conversation's `clearedAt`/`clearedById`, and `clears`. Render small tags on the admin page under each message:
  - `Deleted for everyone by sender`
  - `Hidden by <first name>`
  - `Cleared for everyone by <first name>`
  - `Before <first name>'s clear`

  Use the `muted` tokens and the existing people lookup.
- [ ] **Step 4: Run** the test again and expect PASS.
- [ ] **Step 5: Commit.** `git add "src/app/api/admin/chats/[id]/messages/route.ts" "src/app/(en)/admin/chats/[id]/page.tsx" src/__tests__/admin/chat-messages.test.ts`, then `git commit -m "Chat delete: admin chat view tags deleted, hidden and cleared messages"`.

### Task 7: Website chat UI

**Files:**
- Modify: `src/components/chat/chat-interactions.ts` (pure helpers)
- Modify: `src/components/chat/message-menu.tsx`, `src/components/chat/message-bubble.tsx`, `src/components/chat/use-chat-channel.ts`, `src/components/chat/chat-room.tsx`
- Create: `src/components/chat/delete-dialogs.tsx` (confirm dialog + Pro upsell dialog)
- Test: `src/__tests__/chat/chat-interactions.test.ts`, `src/__tests__/chat/message-bubble.test.tsx`, `src/__tests__/chat/chat-delete-ui.test.tsx` (new)

**Interfaces:**
- Consumes: Task 2 `deleteEntryMode`, `DELETED_TRACE` (db-free import), Task 3 GET fields, Task 4 routes and events.
- Produces, in `chat-interactions.ts`:
  - `applyDeletions<T extends UiMessage>(list: T[], ids: readonly string[]): T[]`: matching messages become `{ ...m, deleted: true, body: DELETED_TRACE, kind: "TEXT", media: null, replyTo: null, reactions: [] }`, and any message quoting them gets a trace quote.
  - `dropHidden<T extends UiMessage>(list: T[], ids: readonly string[], clearedBefore: string | null): T[]`: removes those ids and every sent message with `createdAt <= clearedBefore` (pending local sends stay).
- `UiMessage` gains `deleted?: boolean`.

- [ ] **Step 1: Write failing tests:**
  - **Helpers:**
    - `applyDeletions` replaces body, media, reactions and quote, and fixes quotes pointing at the id.
    - `dropHidden` keeps pending messages and messages after the cutoff.
  - **Bubble:** a `deleted` message renders `تم حذف الرسالة` in the muted trace style, with no reactions, no reply swipe, and no media.
  - **Menu, mode "use":**
    - my message shows `حذف لديّ` and `حذف لدى الجميع`
    - the partner's message shows only `حذف لديّ`
    - a trace bubble of the partner's still shows `إبلاغ عن الرسالة` and `حذف لديّ`
  - **Menu, mode "upsell":** the same entries; selecting one opens the upsell dialog (link to `/dashboard/pro`) and sends no request.
  - **Menu, mode null:** no delete entries.
  - **Header:** `مسح المحادثة` opens a choice `مسح لديّ` / `مسح لدى الجميع`. Each needs its confirm text from Global Constraints before it POSTs `/api/chats/{id}/clear`. `مسح لدى الجميع` is absent when the chat can't send (closed or blocked).
  - **Live:** a `deleted` event applies `applyDeletions`; a `cleared` event applies `dropHidden([], before)`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/chat` and expect the new cases FAIL.
- [ ] **Step 3: Implement.**
  - In `chat-room.tsx`, compute `mode = deleteEntryMode({ deleteEnabled, isPro: myPro, canBuy: !!pro?.canBuy })`.
  - Every GET answer applies `dropHidden(…, hiddenIds ?? [], clearedBefore)` then `applyDeletions(…, deletedIds ?? [])`.
  - `use-chat-channel.ts` adds `onDeleted({ messageId })` and `onCleared({ before })`.
  - After my own action, apply the same change optimistically. Revert and show `toast.error` with the server message on failure. `PRO_REQUIRED` opens the upsell and reloads the Pro state as media does.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/chat` and expect PASS; then `pnpm lint` and expect 0 problems.
- [ ] **Step 5: Commit.** `git add src/components/chat/chat-interactions.ts src/components/chat/message-menu.tsx src/components/chat/message-bubble.tsx src/components/chat/use-chat-channel.ts src/components/chat/chat-room.tsx src/components/chat/delete-dialogs.tsx src/__tests__/chat/chat-interactions.test.ts src/__tests__/chat/message-bubble.test.tsx src/__tests__/chat/chat-delete-ui.test.tsx`, then `git commit -m "Chat delete: website menu, header clear, trace bubble, live updates"`.

### Task 8: Flutter app (new app version)

**Files:**
- Modify: `naseebak_app/lib/features/chat/chat_models.dart`:
  - `ChatMessage.deleted`
  - `ChatPage.deleteEnabled`, `clearedBefore`, `deletedIds`, `hiddenIds`
  - `ChatRepository.deleteMessage`, `clearChat`
  - pure `applyDeletions` / `dropHidden` mirroring Task 7
- Modify: `naseebak_app/lib/features/chat/message_menu.dart` (new choices `MenuDeleteForMe`, `MenuDeleteForEveryone`), `chat_bubble.dart` (trace bubble), `chat_room_screen.dart` (apply on load/poll/live; header `مسح المحادثة`; confirm sheets; upsell → `/pro`)
- Test: `naseebak_app/test/chat_delete_test.dart` (new), `naseebak_app/test/chat_modern_models_test.dart` (parse)

**Interfaces:**
- Consumes: Task 3 GET fields, Task 4 routes and events (`deleted`, `cleared` arriving as `ChatLiveEvent.name`).
- Produces:
  - `Future<void> deleteMessage(String chatId, String messageId, {required bool forEveryone})`
  - `Future<DateTime?> clearChat(String chatId, {required bool forEveryone})`
  - Entry mode: `deleteEnabled && appPayments && (isPro || canBuy)`; Pro uses, otherwise upsell.

- [ ] **Step 1: Write failing tests** in `chat_delete_test.dart`:
  - **Parsing:** `deleted`, `deleteEnabled`, `clearedBefore`, `deletedIds`, `hiddenIds`, with older-server JSON missing them giving defaults false/null/empty.
  - **Helpers:** `applyDeletions` / `dropHidden` behave as in Task 7.
  - **Menu entries:**
    - Pro on my message: `حذف لديّ`, `حذف لدى الجميع`
    - partner's message: `حذف لديّ` only
    - `appPayments` false: none
  - **Upsell:** a non-Pro tap pushes `/pro` with no request (fake adapter records none).
  - **Room:**
    - a `cleared` live event empties the list
    - the confirm sheet text for `مسح لدى الجميع` matches Global Constraints
    - leaving mid-request doesn't crash (`FakeAdapter.hold` pattern from `test/leave_mid_request_test.dart`)
- [ ] **Step 2: Run** `cd naseebak_app && flutter test test/chat_delete_test.dart` and expect FAIL.
- [ ] **Step 3: Implement.** `ChatCache` needs no version bump: the cached list goes through `dropHidden` / `applyDeletions` on the first GET.
- [ ] **Step 4: Run** `flutter analyze && flutter test` and expect 0 issues, all green.
- [ ] **Step 5: Commit.** `git add` the listed `naseebak_app/` files, then `git commit -m "App: Pro delete message / clear chat, trace bubble, live updates"`. Do not bump `pubspec.yaml`: the release build is a separate owner step.

### Task 9: Docs and full verification

**Files:**
- Modify: `CLAUDE.md`:
  - switch line for `chat_delete_enabled`
  - "Modern chat" bullet: delete/clear, own-only "for everyone", silent, read-stamping
  - "What needs an app version": delete buttons in the app
- Modify: `naseebak_app/CLAUDE.md` (menu: replace "No delete." with the delete entries; the API list gets the two routes), `docs/reference/matches-and-safety.md` (evidence: admin tags, reportable), spec status line → `implemented`.

- [ ] **Step 1: Update** the docs above. Keep each addition to one or two lines in the style already there.
- [ ] **Step 2: Run** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` and expect all green and the build succeeds.
- [ ] **Step 3: Run** `cd naseebak_app && flutter analyze && flutter test` and expect 0 issues, all pass.
- [ ] **Step 4: Real-flow check (production build, local).**
  - Start the app with the "Real-flow QA" commands in `CLAUDE.md` and turn `chat_delete_enabled` on in Admin → Settings.
  - Make test account `0777000001` Pro through the mock Pro checkout, with `0777000002` as the partner.
  - Do each of the four actions and confirm:
    - the chat stays open and both can keep writing
    - the partner's screen updates
    - the partner's unread badge clears
    - the admin chat view shows the tags
    - a non-Pro tap shows the upsell
- [ ] **Step 5: Commit.** `git add CLAUDE.md naseebak_app/CLAUDE.md docs/reference/matches-and-safety.md docs/superpowers/specs/2026-11-11-chat-delete-pro-design.md`, then `git commit -m "Docs: Pro chat delete"`.
- [ ] **Step 6: Stop.** Deploying (`naseebak-deploy --db-push` after checking the diff with `prisma migrate diff`), turning the switch on, and the app store build each need the owner's go-ahead.
