# Admin panel for the new user cycle — design

Date: 2026-10-16 · Branch: `feature/admin-new-cycle` (from `feature/new-cycle`)

## Why

The new user cycle (per-request credits, family/chat introduction requests, in-app chat, simultaneous
suggestions) ships behind admin switches. The admin panel still describes the legacy flow: the
dashboard counts identity verifications, nobody can see a user's requests or chats, credit balances
change with no history, and the suggestions table can't tell a shared (MUTUAL) suggestion from a
legacy one. Admins need to see the new cycle working, and support needs to answer "where did my
credits go?".

## Constraints

- Live site, ~200 users. Schema changes **additive only** (new nullable column, new table, new enum).
- Everything must keep working with all switches off. New-cycle sections appear only when
  `intro_requests_enabled` is on (or, on per-user pages, when the user actually has new-cycle data).
- **Admins never see chat message content** — only dates, status and message counts.
- Colours: brand tokens only (`primary`, `secondary`, `accent`, `destructive`, `muted`;
  `emerald/green` success, `amber` pending). No `blue/indigo/pink/purple/red/gray` classes in the
  files we touch.
- Do not touch `src/app/(ar)/dashboard/profile/**` (another session owns it).

## Goals (priority order)

1. **Dashboard** — when `intro_requests_enabled` is on, a "New user cycle" section:
   - Intro requests: sent / accepted / declined / expired, split family vs chat. A PENDING request
     past `expiresAt` counts as expired (requests expire lazily).
   - Active chats (ACTIVE and not past `expiresAt`).
   - Credits spent on requests this week (from the credit ledger, so it counts from this release on).
   - Revenue this week (completed payments) next to the existing total revenue.
   - Funnel (all-time, users with role USER): registered → profile ≥ 50% (`calculateCompleteness`,
     `SUGGESTIONS_MIN_COMPLETENESS`) → got ≥ 1 suggestion (either side) → ≥ 1 mutual match → ≥ 1
     accepted introduction request (either type, either side). Count and % of registered.
   - "Verified Users" / "Pending Verifications" tiles get a "Legacy" tag.
   - Forbidden colour classes replaced with brand tokens.
2. **User detail** — new sections:
   - Introduction requests (sent and received): type, other person, status (effective), sent,
     responded, expires.
   - Chats: other person, status (effective), started, expires, extended, ended (by whom, when),
     message count (total, by this user, by the other). No content.
   - Suggestion decisions: the existing Suggestions table gains Flow, this user's decision and the
     other side's decision for shared suggestions, and shows Expired when past `expiresAt`.
   - Credit history (goal 3).
3. **Credit ledger** — new model `CreditLedger { id, userId, delta, balanceAfter?, reason, refId?,
   adminId?, note?, createdAt }`, enum `CreditReason { REGISTRATION, PURCHASE, REQUEST, SUGGESTION,
   ADMIN_ADJUST, MIGRATION_GIFT, REFUND, REFERRAL }`. `SUGGESTION` is my addition: legacy mode still
   charges 1 credit per suggestion received and that must show up too. Written at every place
   `matchCredits` changes:
   - registration (`api/auth/register`) → REGISTRATION
   - Stripe webhook → PURCHASE (refId = payment id), inside the existing transaction
   - intro request (`lib/intro/requests.ts`) → REQUEST −1 (refId = request id), inside the transaction
   - legacy suggestions: auto-suggest (one net row per run) and admin Generate → SUGGESTION
   - admin users PATCH → ADMIN_ADJUST (delta = new − old, adminId)
   - admin payment refund → REFUND (actual amount taken, refId = payment id, adminId)
   - referral reward (`api/profile`) → REFERRAL for both people (refId = referral id)
   - `scripts/new-cycle-migrate.mjs` → MIGRATION_GIFT per topped-up user
   Ledger writes outside a transaction are best-effort (a failed history row is logged, never fails
   the user's action). History before this release is not reconstructed; the page says so.
4. **Reports** — new nullable `Report.conversationId`; `endConversation` sets it when a user reports
   from the chat. The admin reports list shows a "From chat" badge with the conversation's metadata
   (started, status, ended by, message counts) and a link to the reporter's Chats section. For older
   reports, if the two users have a conversation, show "Had a chat" with the same metadata.
5. **Suggestions page** — Flow column (Shared / Legacy); shared rows label the two people
   "Person A / Person B" and show each person's decision; a PENDING row past `expiresAt` shows
   "Expired" (the status filter treats it the same way); the Generate tab explains, for the current
   switch state, the weekly cap (3 per rolling 7 days, counted on either side for shared), the
   dealbreaker filter, 14-day expiry, and that legacy mode charges 1 credit per suggestion.
6. **Sidebar** — when `intro_requests_enabled` is on, Identity Review, Visit Requests and Profile
   Requests move into a "Legacy" group, collapsed by default (open when the current page is in it).
   The layout (server component) reads the flag and passes it down.

## Non-goals

- Reading or moderating chat messages.
- Backfilling the ledger from old payments/suggestions.
- Changing user-facing pages.
- Charts/graphs — numbers and a simple bar funnel are enough.

## Builder's calls

- New endpoint `GET /api/admin/users/[id]/cycle` returns intro requests, chats and ledger for one user
  (keeps the existing user payload unchanged).
- Pure helpers (effective statuses, funnel maths, ledger delta) live in `src/lib/admin/cycle-stats.ts`
  and are unit-tested; Prisma access stays in the routes.
- Ledger helper `recordCredit()` in `src/lib/credits.ts`.
