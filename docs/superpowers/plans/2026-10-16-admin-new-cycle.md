# Admin panel for the new user cycle — Implementation Plan

> **Historical document.** It records a decision or plan at the time it was written. The live behaviour has changed since. The current rules (as of 2026-10-17) are in `CLAUDE.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can see the new user cycle working (dashboard numbers + funnel, per-user requests/chats/decisions/credit history, chat-origin reports, shared suggestions) without breaking the legacy flow.

**Architecture:** Pure helpers in `src/lib/admin/cycle-stats.ts` (unit-tested), Prisma queries in admin routes, client pages stay `"use client"` + `fetch`. A new `CreditLedger` table is written by `recordCredit()` in `src/lib/credits.ts` at every `matchCredits` change.

**Tech Stack:** Next.js 16, Prisma 7 (adapter-pg), Vitest, Tailwind v4 tokens, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-16-admin-new-cycle-design.md`

## Global Constraints

- Schema additive only: new enum `CreditReason`, new model `CreditLedger`, new nullable `Report.conversationId`.
- With `intro_requests_enabled` off, admin pages render exactly the legacy information (new sections hidden or empty).
- Never select `Message.body` in any admin route.
- No `blue-|indigo-|pink-|purple-|red-|gray-|slate-|violet-|rose-|sky-|cyan-|orange-` classes in files touched.
- Effective status: `PENDING` and `expiresAt < now` ⇒ `EXPIRED` (intro requests, MUTUAL suggestions); conversation `ACTIVE` and `expiresAt < now` ⇒ `EXPIRED`.

## Review Focus

- Ledger write fails (e.g. table missing before `db push`) → the user's action still succeeds (best-effort writes outside transactions).
- Admin sets credits to the same value → no ledger row (delta 0 is skipped).
- Funnel with 0 registered users → percentages show 0, no `NaN`.
- Suggestion filter "EXPIRED"/"PENDING" must treat lazily-expired MUTUAL rows correctly.
- Report from a user pair with no chat → no chat badge, no crash.

---

### Task 1: Pure helpers

**Files:** Create `src/lib/admin/cycle-stats.ts`; Test `src/__tests__/admin/cycle-stats.test.ts`

**Produces:**
- `effectiveRequestStatus(s: {status: string; expiresAt: Date | string | null}, now?: Date): string`
- `effectiveConversationStatus(c: {status: string; expiresAt: Date | string}, now?: Date): string`
- `summarizeIntroRequests(rows: {type: "FAMILY"|"CHAT"; status: string; expiresAt: Date}[], now?): Record<"FAMILY"|"CHAT"|"ALL", {sent; pending; accepted; declined; expired; cancelled}>`
- `buildFunnel(counts: {registered; profileReady; gotSuggestions; matched; introAccepted}): {key; label; count; pct}[]` (pct of registered, 0 when registered is 0)

- [ ] Tests: expired pending counts as expired; accepted stays accepted; ALL = FAMILY + CHAT; funnel pct with registered 0 → 0; labels "Registered", "Profile ≥ 50%", "Got suggestions", "Mutual match", "Introduction accepted".
- [ ] Implement, run `npx vitest run src/__tests__/admin`, commit.

### Task 2: Credit ledger

**Files:** `prisma/schema.prisma`, `src/lib/credits.ts`, register, webhook, intro requests, auto-suggest, admin generate, admin users PATCH, admin refund, `api/profile` referral, `scripts/new-cycle-migrate.mjs`; Test `src/__tests__/credits-ledger.test.ts`; update the `@/lib/credits` mock in `src/__tests__/intro/requests.test.ts` and `auto-suggest.test.ts` if they mock it.

**Produces:** `recordCredit(entry: {userId: string; delta: number; reason: CreditReason; refId?: string; adminId?: string; note?: string}, client?: Pick<typeof db,"creditLedger">): Promise<void>` — skips delta 0; when no client is passed, catches and logs errors.

- [ ] Tests: delta 0 → no create; error without client → resolves; with client → error propagates.
- [ ] Schema: `CreditLedger(id, userId→User cascade, delta Int, reason CreditReason, refId String?, adminId String?, note String?, createdAt)`, `@@index([userId, createdAt])`, `@@index([reason, createdAt])`, map `credit_ledger`. `pnpm db:push && pnpm db:generate`.
- [ ] Wire every writer (spec §3). Migrate script writes rows with `createMany` in the same `$transaction`.
- [ ] vitest + tsc, commit.

### Task 3: Dashboard

**Files:** `src/app/api/admin/stats/route.ts`, `src/app/(en)/admin/page.tsx`

- [ ] API adds `flags` (getCycleFlags), `revenueThisWeek`, and when `flags.introRequests`: `cycle: { intro: summarizeIntroRequests(...), activeChats, creditsSpentThisWeek (−sum REQUEST deltas, 7 days), funnel: buildFunnel(...) }`. Profile ≥ 50% via `calculateCompleteness(...).total >= SUGGESTIONS_MIN_COMPLETENESS` over USER rows.
- [ ] Page: brand-token tiles, "Legacy" tag on verification tiles, "New user cycle" section with request table (family/chat/all), active chats, credits spent, revenue this week, funnel bars.
- [ ] Browser check, commit.

### Task 4: User detail

**Files:** Create `src/app/api/admin/users/[id]/cycle/route.ts`; modify `src/app/api/admin/suggestions/user/[userId]/route.ts`, `src/app/(en)/admin/users/[id]/page.tsx`

- [ ] `GET /cycle` → `{ introRequests: [{id,type,direction:"sent"|"received",other,status(effective),createdAt,respondedAt,expiresAt}], chats: [{id,other,status(effective),createdAt,expiresAt,extended,endedBy:"user"|"other"|null,endedAt,messages:{total,byUser,byOther}}], ledger: [...last 100] }`. Messages via `message.groupBy({by:["conversationId","senderId"], _count})`.
- [ ] Suggestions route selects `flow, expiresAt, recipientDecision, candidateDecision`.
- [ ] Page: sections "Introduction requests", "Chats" (id `chats`), "Credit history", suggestion tables gain Flow + decisions + effective status; colour tokens.
- [ ] Browser check, commit.

### Task 5: Reports from chat

**Files:** schema (`Report.conversationId String?`), `src/lib/chat/service.ts`, `src/__tests__/chat/service.test.ts`, `src/app/api/admin/reports/route.ts`, `src/app/(en)/admin/reports/page.tsx`

- [ ] Test: endConversation with report → upsert create/update contain `conversationId`.
- [ ] API attaches `chat: {id, fromChat, status, createdAt, endedAt, endedByReporter, messages:{total}} | null` (by `conversationId`, else the pair's match conversation).
- [ ] Page: "From chat"/"Had a chat" badge + metadata + link `/admin/users/{reporterId}#chats`.
- [ ] Commit.

### Task 6: Suggestions page

**Files:** `src/app/api/admin/suggestions/route.ts`, `src/app/(en)/admin/suggestions/page.tsx`

- [ ] API: select flow/expiresAt/decisions; status filter EXPIRED ⇒ `OR[{status:EXPIRED},{status:PENDING,expiresAt:{lt:now}}]`, PENDING ⇒ `status PENDING AND (expiresAt null OR ≥ now)`; return `flags`.
- [ ] Page: Flow column, "A"/"B" tags + decisions for shared rows, effective status, Generate explanation per flags; colour tokens.
- [ ] Commit.

### Task 7: Sidebar legacy group

**Files:** `src/app/(en)/admin/layout.tsx`, `src/components/shared/admin-sidebar.tsx`

- [ ] Layout passes `legacyGrouped={flags.introRequests}`; sidebar renders Identity Review, Visit Requests, Profile Requests under a collapsible "Legacy" button (open if pathname inside).
- [ ] Browser check both switch states, commit.

### Task 8: Verify

- [ ] `npx vitest run`, `npx tsc --noEmit` clean; browser pass as admin with switches on and off; update CLAUDE.md Admin Panel section; commit.
