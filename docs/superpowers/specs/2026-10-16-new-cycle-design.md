# New user cycle — design

Date: 2026-10-16 · Status: agreed in chat with the product owner, building phases 1–3 first.

## Why

The current cycle is too hard for users and too heavy for admins:

- A suggestion needs two separate approvals (recipient accepts, then the other side answers an "interest"), spread over 3 tabs.
- A credit is spent the moment a suggestion *arrives*, so a new user can run out before seeing any result.
- Every match waits on an admin to call both families and arrange the visit.
- Profile edits wait on admin review.

The new cycle lets users reach a real introduction on their own, charges only when something real happens, and removes daily admin work.

## The agreed cycle

```
Sign up → 3 free credits
  → weekly automatic suggestions (free)
  → both sides tap "مهتم" → mutual match (photos + details revealed)      [phase 4]
  → after a match, two buttons:
      طلب تعارف عائلي (1 credit)  → other side accepts → guardian contacts shared
      طلب محادثة قبل الزيارة (1 credit) → other side accepts → in-app chat (14 days, +7 once)
                                         → "ننتقل لتعارف عائلي" inside the chat (free)
  → families arrange the visit themselves
  → automatic follow-up ~7 days after the family introduction                [phase 6]
```

## Goals

1. Two request types on every mutual match: family introduction and chat.
2. Credits are the only payment. New users get 3. Sending a request costs 1, paid by the sender, never refunded (declined, ignored or expired).
3. A nice, RTL, brand-coloured chat inside Naseebak, delivered in real time through Ably, stored in our Postgres.
4. Notifications handled consistently: one helper, preferences respected, the right link on every notification, no spam from chat.
5. An admin panel that stays simple: on/off switches with plain explanations, and a read-only overview of introductions.
6. Nothing breaks for the ~200 live users.

## Non-goals (for phases 1–3)

- Changing how suggestions are decided (simultaneous decision, two tabs, dealbreakers, "why" reasons) — phase 4, see `2026-10-16-simultaneous-suggestions-design.md` (switch `new_suggestions_flow`).
- Removing admin review of profile edits / automatic report hiding — phase 5.
- Post-introduction follow-up — phase 6.
- Images, voice notes or files in chat.
- Admins reading private messages.

## Anti-goals (failure even if it works)

- Any existing user loses credits, a pending suggestion, an interest, a match or a visit in progress.
- A guardian phone number is shown to another family without that user's consent.
- Contact details leak through the chat (phone numbers, links, social handles).
- Chat floods users with notifications.
- The Ably secret key reaches a browser, or a browser can publish directly to Ably.

## Constraints

- Live site, ~200 users. Every schema change is additive: new tables, new nullable or defaulted columns, new enum values. No drops or renames. Back up production before every deploy.
- Every new behaviour sits behind a `SystemSetting` switch that defaults to **off**, so deploying the code changes nothing until an admin turns it on (takes effect within 30s via the settings cache).
- Existing stack only: Next.js 16, Prisma 7 + `@prisma/adapter-pg`, NextAuth 5, shadcn/ui, Tailwind v4 brand tokens (no hard-coded Tailwind colour classes, see CLAUDE.md), OneSignal for push. New dependency: `ably`.
- Names Arabic-only, RTL pagination rules, brand colours as in CLAUDE.md.

## Feature switches

| Key | Default | When on |
|---|---|---|
| `intro_requests_enabled` | `false` | Match cards show the two request buttons. Credits switch to per-request: suggestions stop costing credits and are capped at 3 per rolling 7 days. New matches no longer auto-create an admin `VisitRequest`. |
| `chat_enabled` | `false` | The chat request button, chat pages and chat APIs work. Requires `intro_requests_enabled`. |

When both are off, the site behaves exactly as today.

## Data model (all additive)

```prisma
enum IntroRequestType   { FAMILY CHAT }
enum IntroRequestStatus { PENDING ACCEPTED DECLINED EXPIRED CANCELLED }
enum ConversationStatus { ACTIVE ENDED EXPIRED }

model IntroRequest {
  id          String   @id @default(cuid())
  matchId     String   -> MutualMatch (cascade)
  type        IntroRequestType
  senderId    String   -> User
  receiverId  String   -> User
  status      IntroRequestStatus @default(PENDING)
  expiresAt   DateTime            // createdAt + 7 days
  respondedAt DateTime?
  createdAt / updatedAt
  @@index([matchId]) @@index([receiverId, status])
}

model Conversation {
  id         String  @id @default(cuid())
  matchId    String  @unique -> MutualMatch (cascade)
  status     ConversationStatus @default(ACTIVE)
  expiresAt  DateTime            // opened + 14 days
  extended   Boolean @default(false)   // +7 days, once
  endedById  String?
  endedAt    DateTime?
  messages   Message[]
  createdAt / updatedAt
}

model Message {
  id             String @id @default(cuid())
  conversationId String -> Conversation (cascade)
  senderId       String -> User
  body           String  // max 1000 chars
  readAt         DateTime?
  createdAt      DateTime @default(now())
  @@index([conversationId, createdAt])
}
```

Other additive changes:

- `ParentInfo.shareConsentAt DateTime?` — consent to share the guardian contact with the other family after an accepted family introduction.
- `NotificationType` gains `INTRO_REQUEST` and `CHAT`.
- `NotificationPreference` gains `introRequests Boolean @default(true)` and `chatMessages Boolean @default(true)`.
- Registration grants 3 credits when `intro_requests_enabled` is on (see builder's calls).

Rules enforced in code: at most one PENDING request per match per type; a FAMILY request can't be sent once a family introduction is ACCEPTED on that match; a CHAT request can't be sent while a conversation exists for the match.

## Request rules

- Only the two people in a mutual match can send or answer, and neither may have blocked the other.
- Sending: atomic `reserveCredits(sender, 1)`; if it fails → 402 with "رصيدك غير كافٍ" and a link to payments. Credit is never refunded.
- Before sending, the user confirms a dialog: "سيتم خصم رصيد واحد. لا يُسترجع الرصيد في حال عدم القبول."
- FAMILY request: sender must have guardian info saved and consent given. The receiver, when accepting, must also have guardian info and give consent in the accept dialog. On acceptance both sides see the other's guardian name, relationship and phone (with `tel:` and WhatsApp links).
- CHAT request: on acceptance a `Conversation` opens for 14 days.
- Requests expire after 7 days unanswered (checked lazily on read; no cron needed).
- Moving from chat to family introduction sends a FAMILY request without charging a credit (the chat already paid for the match).
- Accepting a request is free.

## Chat

- Text only, max 1000 characters, rate-limited (50 per day, 1 per second per user).
- Server-side filter before saving (pure function, unit-tested): phone numbers in Western or Arabic-Indic digits (7+ digits, spaces/dashes allowed), URLs, `wa.me`, emails, `@handles`, and social-app keywords in Arabic and English, plus a small offensive-word list. Blocked messages are not saved; the sender sees why.
- 14 days, extendable once by 7 days by either person in the last 3 days. Expired chats become read-only. Either side can end the chat at any time ("إنهاء المحادثة"), which is final; ending + "إبلاغ" creates a Report and blocks the other person.
- Real time: the server saves the message, then publishes to Ably channel `chat:<conversationId>`. Browsers get a token from `/api/chats/ably-token` with **subscribe-only** capability on their own active conversations. Without `ABLY_API_KEY` (local dev) the page polls every 4 seconds.
- Read receipts via `Message.readAt`, marked when the recipient has the chat open.
- Guardian read-only access: deferred (not in phases 1–3).

## Notifications

One helper `notify()` in `src/lib/notify.ts` replaces direct `db.notification.create` + push in new code:

- Stores the in-app notification with `metadata.url` so every notification opens the right page.
- Sends push only if the user's preference for that type is on (SYSTEM always).
- A shared `src/lib/notification-links.ts` maps type → default URL and is used by the notifications page; `metadata.url` wins when present.

| Event | Who | Type | Link |
|---|---|---|---|
| Family/chat request received | receiver | INTRO_REQUEST | `/dashboard/matches?match=<id>` |
| Request accepted | sender | INTRO_REQUEST | family → matches card, chat → `/dashboard/chats/<id>` |
| Request declined | sender | INTRO_REQUEST | matches card (worded gently: "لم يتم قبول الطلب حالياً") |
| Chat expires in 2 days | both | CHAT | the chat |
| Chat ended by the other side | other | CHAT | chats list |
| New chat message | recipient | push only (no in-app row) | the chat; throttled to 1 push per conversation per 3 minutes |
| Credits reach 0 after sending | sender | PAYMENT | payments |

The dashboard shows an unread-chat badge on "المحادثات" (polled with the existing 30s unread poll).

Also fix while here: `PATCH /api/notifications/[id]/read` must check ownership; the Stripe webhook must not add credits twice for the same payment.

## Admin panel

Kept easy:

- Settings → a new "New user cycle" card: two switches with one plain sentence each, and a warning when chat is turned on without intro requests.
- New page "Introductions": counts (pending / accepted / declined, chats active), and a table of recent requests (users, type, status, dates). No message content is ever shown to admins.

## Existing users (no breakage)

- Pending suggestions and interests keep working exactly as today.
- Existing matches get the two buttons when the switch is on.
- Matches whose admin visit is FAMILIES_CONTACTED or SCHEDULED keep the current visit banner; the family button is hidden there (admin is handling it). Chat is still allowed. Matches with a visit still REQUESTED show the new buttons; when a family introduction is accepted, that legacy visit request is closed as CANCELLED with a note. COMPLETED visits keep their feedback button.
- Credits: a one-time, idempotent script tops every user below 3 credits up to 3 and sends a SYSTEM notification explaining the new rules. Paid balances are untouched.
- Guardian consent: existing users with guardian info see a one-time card on the dashboard and inside the family-request dialogs asking for consent. Without consent nothing is shared.

## Builder's calls (not discussed with the product owner)

- Turning a switch off later stops *new* requests and new messages only. Accepted results stay visible: guardian contacts remain shown and existing chats become read-only. Nothing paid for disappears.
- Free credits follow the switch: registration grants 3 when `intro_requests_enabled` is on, 2 (today's value) when off. The schema default is left unchanged. The top-up script (`scripts/new-cycle-migrate.mjs`) is run by hand right after an admin turns the switch on; its notice describes the new rules, so it must not run before.
- Packages keep their sizes and prices (3/5/10 credits for 3/4/7 JOD). Existing balances, bought or free, become request credits. Wording on the payments page and in notifications says "رصيد" instead of "اقتراحات".
- A declined request is final for that type on that match (no paying to ask again). An expired (unanswered) request can be sent again, paid. An ended chat can't be reopened. The free chat→family move is allowed while the chat is active or expired, once.
- No scheduler is assumed. Request and chat expiry are applied lazily on any read, and the "2 days left" warning is checked whenever either person loads their counts (polled every 30s while on the dashboard), their chat list, or the chat.

- Requests expire after 7 days; chat expiry warning at 2 days; push throttle 3 minutes; 50 messages/day.
- Suggestions capped at 3 per rolling 7 days when per-request credits are on.
- Admins can't read chats.
- Guardian read-only chat access is deferred.
- In-app chat notification rows are not created per message (push + badge only) to avoid flooding the notifications page.
