# Pro chat delete — design

Date: 2026-11-11
Status: approved in brainstorming, awaiting plan
Owner decision captured: yes (see "Decisions")

## Intent and why

Pro members want to tidy a match chat the way they can in Telegram/WhatsApp:
remove a single message, or clear the whole conversation, either just from
their own view or from both sides. Today the only way to make a chat go away
is to end the match or let it expire — both destroy the match itself. This
feature lets a member clean up history **without closing the chat or the
match**: after a delete, the same conversation stays open and both people can
keep talking on it.

It is a paid perk. It is visible to everyone so free members discover it, but
only a Pro member can actually use it — a non-Pro who taps a delete action
gets a "this is a Pro feature" prompt (the same upsell pattern as the greyed
chat-media buttons).

"Delete" never means a real wipe. The message row and its text are always
kept in the database so the admin panel and the reporting flow are unchanged.
Delete only hides content from members.

## Goals

- Four actions, all Pro-gated:
  1. **Delete message — for me**: the message vanishes from the actor's view
     only. No trace shown to the actor. The partner's view is untouched.
  2. **Delete message — for everyone**: the message is hidden from both
     members; a small "تم حذف الرسالة" trace is shown in its place to both
     (WhatsApp-style, per single message).
  3. **Clear chat — for me**: the actor's whole view of the conversation goes
     empty. The partner keeps their full history.
  4. **Clear chat — for everyone**: both members see a completely empty
     conversation, with **no** traces — as if nothing had been said.
- The conversation and the match stay open and usable after any of these.
  New messages sent afterwards appear normally for both sides.
- All four are offered on both the website dashboard chat and the Flutter app
  chat. The entry points are visible to every member; tapping one as a
  non-Pro shows the Pro upsell instead of acting.
- Silent: no push and no bell notification for any delete. The partner's open
  chat updates live (over the existing Ably channel); a partner who is not
  looking sees the change the next time they open or poll the chat.
- No time window: a Pro member can delete a message or clear the chat no
  matter how old the content is.
- A message deleted "for everyone" is **still reportable** by the recipient:
  the report flow keeps working against that message id, and the admin keeps
  the real text.
- Behind a new system switch, default off (see "Switch").
- Additive schema only; admin views, reports, and the legacy flow untouched.

## Non-goals

- Not editing messages — delete only.
- Not changing how a chat is ended, blocked, expired, or extended.
- Not changing the admin chat view: admins keep seeing everything, including
  deleted content, exactly as today (the `[admin-chat-view]` log stays).
- Not giving free members any delete ability (not even "for me").
- Not a per-message "delete for everyone" time limit.
- Not bulk/selection UI beyond "clear whole chat" (single-message delete acts
  on one message at a time; no multi-select in v1).

## Anti-goals (these would make it a failure even if it "works")

- The partner ever seeing a message the actor deleted "for everyone" — on any
  app version, through any field (`body`, media, reply snippet, last-message
  preview in the chat list, push text).
- A delete leaking as a notification ("so-and-so deleted a message").
- A delete that silently ends/closes the chat or match.
- Losing evidence: a deleted message becoming invisible to the admin panel or
  unreportable by the recipient.
- An **older app version** showing deleted content because it doesn't know the
  new fields. The server must present deleted content as the placeholder/empty
  state to every client, old and new, on every load. (Accepted exception: an
  old app with the chat already open shows it until the chat is reopened.)

## Decisions (owner)

- Telegram-style "for me" vs "for everyone", on both single messages and the
  whole chat. All four Pro-only.
- Single-message "for everyone" leaves a "تم حذف الرسالة" trace. Whole-chat
  "for everyone" leaves an empty chat, no traces.
- Silent (no push/bell). No time window. Still reportable. New switch, default
  off. Entry points visible to all members; non-Pro tap → Pro upsell.
- **Delete message for everyone: own messages only** (WhatsApp). On the
  partner's messages a Pro member can only "delete for me".
- **Clear chat for everyone stays as designed** (both sides' messages, empty
  chat for both). The partner keeps the whole-chat report (the existing report
  with no `messageId`). Admin sees every cleared message, tagged. Accepted as
  enough.
- **Rollout doesn't wait for the app:** the switch can go on once the
  website and server are ready. An older app with the chat already open keeps
  showing a deleted message until the chat is reopened. Accepted. The new app
  version adds live updates.
- **Hidden where Pro can't be bought:** the entry points show only where the
  member can buy Pro or is Pro (`canBuy || isPro`, and in the app also
  `appPaymentsProvider`, same as the Pro media buttons). So no delete options
  in Lebanon until sales open, and none for test or review accounts.
- **Admin shows deleted or not:** every message in the admin chat view says
  whether it was deleted, how, and by whom.

## Constraints (from the platform)

- Live site with real members: additive, behind a switch, old apps keep
  working. API changes must not break old app versions.
- **Needs a new app version** (new buttons, new API actions, new placeholder
  rendering). Old apps: no delete buttons, and they must still render deleted
  content as the placeholder/empty state because the **server** supplies that,
  not the client.
- Pro gating follows the existing pattern: ability follows `isPro()`; the
  surfaced entry points / upsell follow the chat-media convention (shown where
  the viewer `canBuy`, otherwise still visible but the prompt explains it is a
  Pro feature). The sellable side is additionally gated by `pro_enabled` /
  `purchasesAvailable` the way the rest of Pro is; `isPro()` itself never reads
  the switch, so an existing subscriber keeps the ability even if `pro_enabled`
  is later turned off — matching how Pro media already behaves.
- Chat realtime: only the server publishes to Ably `chat:<id>`; browsers get
  subscribe-only tokens. Delete events must be published server-side, and the
  no-Ably polling path (the chat GET) must also convey deletions.
- Arabic RTL, Western digits, gendered copy, design-system tokens and the
  "one banner slot" rules apply to any new UI and copy.
- Raw-hex / forbidden-palette / <12px guard test and the automatic-messages /
  Lebanese-dialect guard tests must stay green (no new automatic notice is
  expected, since the feature is silent — confirm none is added).
- Every schema change additive; `prisma db push` must not hit a data-loss
  prompt (no new unique constraint on existing large tables).

## Shape of the solution (left to the builder, with the fixed points marked)

The builder owns the mechanism; these points are fixed by the decisions above.

### Data model (additive)

Represent four hide semantics without ever deleting rows or text. Suggested
shape (builder may refine the exact columns/table names):

- **Message deleted for everyone**: a nullable marker on `Message`
  (e.g. `deletedForEveryoneAt`, and optionally `deletedById`). Row and `body`
  stay. Shown to both members as the trace.
- **Message hidden for one member ("for me")**: a per-(message, member) row
  (e.g. a `MessageHide { messageId, userId }` join table). Keep it a plain,
  non-unique-migration-safe addition, or add the unique the safe way.
- **Chat cleared for one member ("for me")**: a per-(conversation, member)
  timestamp (e.g. a `ConversationClear { conversationId, userId, clearedAt }`
  row). That member hides every message created at/before `clearedAt`; later
  messages show normally. A second clear moves the timestamp forward.
- **Chat cleared for everyone**: a conversation-level timestamp
  (e.g. `Conversation.clearedForEveryoneAt`). Both members hide every message
  at/before it, with no traces; later messages show normally.

The admin read path ignores all of these and keeps showing everything
(owner, confirmed: the chat still appears in admin after any delete). The
admin chat view (`src/app/api/admin/chats/[id]/messages/route.ts`) has its own
query, separate from the member path, so it stays complete. **My call:** the
admin view marks each affected message ("deleted for everyone by X",
"hidden by X", "before X's clear") so an admin reading a report can see what
was removed and by whom.

The member media route `GET /api/chats/[id]/media/[messageId]` must refuse a
member a message that is deleted for everyone or hidden from them (or before
their clear point), even with a known id. Admins keep access.

### Server

- New Pro-gated actions on the chat API. Natural fit: routes under
  `/api/chats/[id]/...` (e.g. a message delete action taking a `scope` of
  `me` | `everyone`, and a clear-chat action taking the same `scope`). The
  app plan should pin exact route shapes; keep them additive so old apps are
  unaffected.
- Authorization: actor must be a member of the chat and `isPro()`. Reject
  non-Pro with a clear, app-handled error the client turns into the upsell.
  Deleting is allowed in an ACTIVE chat; decide and document behaviour for an
  ended/expired/blocked chat (recommended: still allow "for me" clean-up;
  "for everyone" only while not blocked — builder to settle and record, since
  it is minor and does not change what gets built conceptually).
- **Applying the hides when listing messages** (the chat GET / `toMessage`
  path and the chat-list last-message preview):
  - For the requesting member, drop messages they hid "for me" and messages
    before their "clear for me" timestamp and before the conversation's
    "clear for everyone" timestamp.
  - For a message deleted "for everyone", return it to **both** members with
    its content replaced: `body` → the "تم حذف الرسالة" trace text, media
    stripped, reply snippet neutralised, kind flagged so new clients render a
    disabled/greyed trace bubble (no reactions, no reply, no report-as-content
    confusion — but see reporting below). Old apps simply show the trace text.
  - The last-message preview in the chat list must respect the same hiding, so
    a deleted/cleared message never leaks there.
- Realtime: publish a delete/clear event on `chat:<id>` so an open partner
  updates live. The polling GET must also reflect the current hidden state
  (and, if the poll uses an `after` cursor, make sure a delete of an older
  message is still conveyed — e.g. a lightweight "deletions since" signal or
  a version bump, builder to choose).
- **Reporting a deleted-for-everyone message**: the recipient can still report
  it. Since the row and text are retained, the report route keeps accepting
  that `messageId`; ensure the client can reach "report" on a trace bubble and
  the server does not refuse a `messageId` just because it is flagged deleted.
- No new automatic notification. Confirm `notify()`/SMS are not touched, so
  the automatic-messages and Lebanese-dialect guard tests need no new entries.

### Website (dashboard chat)

- Add the delete entry points to the message bubble menu and a "clear chat"
  action in the chat header/menu, each offering "for me" / "for everyone".
- Visible to all members; non-Pro tap → Pro upsell (reuse the existing Pro
  offer/greyed pattern used for chat media; link to `/dashboard/pro`).
- Render the "تم حذف الرسالة" trace bubble (deleted-for-everyone) and the
  empty-chat state after a clear. Live-update via the existing Ably path.
- Confirm destructive actions with the project's `Dialog`/`DropdownMenu`
  (never `window.confirm`). "Clear for everyone" gets a clear confirm.
- All copy Arabic RTL, gendered where it addresses the member, design-system
  tokens, one banner slot untouched.

### Flutter app (new version)

- Same four actions in the chat screen (message long-press menu + chat menu),
  visible to all, non-Pro → Pro upsell sheet.
- Render the trace bubble and empty state from the server fields; old versions
  keep working because the server already hands them the placeholder/empty
  content.
- This ships as a new app version; note it in `naseebak_app/CLAUDE.md` and the
  "what needs an app version" list. The website ships first/independently as
  usual; the API stays back-compatible so old apps are safe.

### Switch

- New `system_settings` flag, default off (proposed name `chat_delete_enabled`;
  builder/owner to confirm the exact key). Wire it through `src/lib/settings.ts`
  (30s cache) and expose a toggle in Admin → Settings. While off, the server
  refuses the delete actions and the clients hide the entry points (or treat as
  non-available), so the feature is dark until turned on in production.

## Settled after the builder check (my calls, owner to check)

- **Hides are applied in SQL**, inside the member message queries, never
  filtered in memory after them, so paging (`take: limit + 1`, `hasMore`)
  stays correct.
- **Counts follow what each member sees:** unread counts and badges
  (`/api/me/counts`, chat list), the overnight unread-message SMS
  (`/api/cron/unread-sms`) and `nudgeQuietChats` ignore messages the member
  can no longer see. A clear never leaves a badge or an SMS pointing at
  nothing. Mechanism (plan): a message that leaves someone's view is stamped
  read for them, so these jobs need no change. Side effect: hiding the
  partner's unread message "for me" shows them ✓✓ on it.
- **Chat rules stay on the real history:** `bothWrote` (the family offer) and
  the conversation starters read all messages. A clear doesn't bring back the
  starters or hold back the family offer again.
- **Chat-list preview is per member:** each side's last-message line follows
  that member's own view.
- **Reply quotes:** any message quoting a deleted-for-everyone or hidden
  message shows the neutral trace in its quote, never the original text.
- **"For me" on my other devices:** updates on the next load or poll, not
  live (Ably `chat:<id>` is shared by both members, with no per-member
  channel).
- **Hides persist** if the switch is turned off or the member's Pro ends.
  Turning the switch off only stops new deletes.
- **Old apps:** a deleted-for-everyone message keeps `kind: TEXT` in old
  responses with the trace as `body` and media removed, so 1.0.x–1.2.x show
  plain text.
- **Ended / expired chats:** "for me" (message and clear) stays allowed for
  clean-up. "For everyone" only in an ACTIVE chat with no block.

## What's explicitly left to the builder

- Exact column/table names and whether to add indexes (keep `db push`
  data-loss-safe).
- Exact API route shapes and the realtime event payload, pinned during
  planning (website + app agree on them).
- Behaviour of each action in a non-ACTIVE (ended/expired/blocked) chat —
  pick sensible, safe defaults and document them.
- Exact Arabic wording of the trace, the clear-confirm dialog, and the Pro
  upsell line (follow existing Pro-upsell tone).
- Whether "clear for everyone" should also be blocked after a block (likely
  yes) — settle and record.

## Verification intent

- Unit tests (vitest, DB mocked per project convention) for each hide path:
  for-me vs for-everyone, message vs whole-chat, that the partner's view and
  the admin view are correct, that deleted content never leaks via body / media
  / reply snippet / last-message preview / (old-app) response, and that a Pro
  gate rejects non-Pro.
- A test proving a deleted-for-everyone message stays reportable and the admin
  still sees the original text.
- `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` green,
  including a production build (client pages import chat types).
- Manual: a real-flow check that the chat stays open and both can keep talking
  after each delete.
