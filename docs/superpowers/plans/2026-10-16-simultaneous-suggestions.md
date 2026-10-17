# Simultaneous Suggestions Implementation Plan

> **Historical document.** It records a decision or plan at the time it was written. The live behaviour has changed since. The current rules (as of 2026-10-17) are in `CLAUDE.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both people see the same suggestion and decide independently; a match only when both say مهتم; dealbreakers as hard filters; a "why" line on every card — behind `new_suggestions_flow`.

**Architecture:** Additive columns on `Suggestion` (`flow`, per-side decisions) and `Profile.dealbreakers`. Pure helpers (`passesDealbreakers`, `suggestionReason`) plus a small service `src/lib/suggestions/mutual.ts` (decide, feed, expiry) used by thin API routes. The suggestions page renders a new two-tab client component when the API says `mutualView`.

**Tech Stack:** Next.js 16, Prisma 7 (`db push`, no migrations folder), Vitest with hoisted `db` mocks, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-16-simultaneous-suggestions-design.md`

## Global Constraints

- Schema additive only; new enums `SuggestionFlow { LEGACY MUTUAL }`, `SuggestionDecision { INTERESTED DECLINED }`; `Suggestion.flow @default(LEGACY)`; `Profile.dealbreakers String[] @default([])`.
- Setting `new_suggestions_flow` default `"false"`; effective flag `CycleFlags.mutualSuggestions = introRequests && new_suggestions_flow === "true"`.
- MUTUAL expiry: `createdAt + 14 days` (`MUTUAL_SUGGESTION_DAYS = 14`).
- Weekly cap `WEEKLY_FREE_SUGGESTIONS` (3) counts rows on either side in the last 7 days.
- Dealbreaker keys: `age, city, education, maritalStatus, religiosity, smokingStatus, hijab, beard, children`; missing value fails.
- Brand tokens only (no blue-/gray-/… classes), Arabic RTL, ChevronRight = السابق.
- Flag off → behaviour identical to today.

## Review Focus

- Both users tap مهتم at the same moment → exactly one match + one pair of MATCH notifications (test: decide race — second `updateMany` to ACCEPTED returns 0, `createMutualMatch` called once).
- User A declined, user B said yes → B's feed still shows the card in "waiting" and the response contains no decision/status of A (test in feed task).
- A user decides twice / decides on an expired row → 404, no state change (tests in decide task).
- A blocked pair's open MUTUAL suggestion → hidden from feed and decide refuses (tests).
- Legacy like/reject endpoints called on a MUTUAL row → 404 (route guard `flow: "LEGACY"`).

---

### Task 1: Schema + setting + flags

**Files:** Modify `prisma/schema.prisma`, `src/lib/settings.ts`, `src/app/api/admin/settings/new-cycle/route.ts`, admin settings page card, `src/contexts/dashboard-context.tsx` (flag default).

**Produces:** `CycleFlags.mutualSuggestions: boolean`; Prisma fields above.

- [ ] Add enums/fields; `pnpm db:push && pnpm db:generate` against local `naseeb`.
- [ ] `DEFAULTS.new_suggestions_flow = "false"`; extend `getCycleFlags()`; admin route GET/PUT accepts `mutualSuggestions`; admin card gets a third switch with one-sentence explanation and an amber warning when on without intro requests.
- [ ] Update existing tests that assert `getCycleFlags` shape; `npx vitest run` passes; commit `feat(db): additive schema and switch for simultaneous suggestions`.

### Task 2: Dealbreakers + reasons (pure)

**Files:** Modify `src/lib/matching/score.ts`; create `src/lib/matching/reasons.ts`; tests `src/__tests__/matching/dealbreakers.test.ts`, `src/__tests__/matching/reasons.test.ts`.

**Produces:**
- `DEALBREAKER_KEYS` (readonly tuple), `type DealbreakerKey`, `DEALBREAKER_LABELS: Record<DealbreakerKey,string>` (Arabic).
- `passesDealbreakers(owner: ProfileForScoring & {dealbreakers?: string[]}, other: ProfileForScoring, otherGender: string): boolean`
- `mutuallyAcceptable(a: UserForScoring, b: UserForScoring): boolean`
- `suggestionReason(viewer: UserForScoring, other: UserForScoring): string`

Tests (assertions):
- no dealbreakers → true; `age` dealbreaker with range 25–30 and other aged 35 → false; other without `dateOfBirth` → false; `smokingStatus` marked but pref empty → true; `hijab` ignored for male other; `children` + `no_children` + childrenCount 2 → false; `mutuallyAcceptable` false when only B's dealbreaker fails.
- reason for male viewer whose age+city prefs met by female → contains "توافق" and "العمر" and "المدينة" and "تبحث "; female viewer → "تبحثين"; ≤3 labels; personality vectors identical → contains "متقاربة"; nothing matched, same city → mentions المدينة نفسها; nothing at all → "اقترحناه لتوافق ملفيكما بشكل عام".

- [ ] Write tests, see them fail, implement, see them pass, commit `feat(matching): dealbreakers and suggestion reasons`.

### Task 3: Mutual suggestion service

**Files:** Create `src/lib/suggestions/mutual.ts`; test `src/__tests__/suggestions/mutual.test.ts`.

**Consumes:** `createMutualMatch` (`src/lib/intro/match.ts`).
**Produces:**
- `MUTUAL_SUGGESTION_DAYS = 14`
- `decideSuggestion({ suggestionId, userId, interested }): Promise<{ match: boolean; matchId?: string }>` — throws `SuggestionError("NOT_FOUND")` for unknown/foreign/legacy/expired/closed/blocked/already-decided.
- `expireMutualSuggestions(userId): Promise<void>`
- `openMutualWhere(userId)` Prisma where-clause for "I still have to decide" (used by auto-suggest and the page total).

Algorithm of `decideSuggestion`: load row; side = recipient|candidate; guard checks; `updateMany({ where: { id, status: PENDING, flow: MUTUAL, [side]Decision: null, expiresAt > now }, data: {decision, decidedAt} })` count 0 → NOT_FOUND; re-read; if both INTERESTED → `updateMany(status PENDING→ACCEPTED)` and only on count 1 call `createMutualMatch` (female/male from genders); if both decided and any DECLINED → status REJECTED.

Tests: foreign user → NOT_FOUND; legacy row → NOT_FOUND; expired → NOT_FOUND; blocked → NOT_FOUND; second decision (updateMany count 0) → NOT_FOUND; first yes → `{match:false}`, no match created, no notification; both yes → match created once with correct female/male; race (ACCEPTED updateMany count 0) → createMutualMatch not called, returns `{match:true}`; decline after other's yes → status REJECTED, nothing notified.

- [ ] TDD as above; commit `feat(suggestions): simultaneous decision service`.

### Task 4: Feed + routes

**Files:** Create `src/lib/suggestions/feed.ts`, `src/app/api/suggestions/feed/route.ts`, `src/app/api/suggestions/[id]/decide/route.ts`, `src/app/api/profile/dealbreakers/route.ts`; modify `src/app/api/suggestions/route.ts` (add `mutualView`, total of tab-1 items when on), `src/app/api/suggestions/[id]/like/route.ts` + `reject` (guard `flow: "LEGACY"`); test `src/__tests__/suggestions/feed.test.ts`.

**Produces:** `getSuggestionFeed(userId, tab: "new"|"waiting", page): Promise<{ items: FeedItem[]; page; totalPages; total }>`, `FeedItem = { kind: "mutual"|"legacy_suggestion"|"legacy_interest"|"legacy_sent"; id; compatibilityScore; reason; createdAt; candidate: CandidateCard }`, `hasOpenMutual(userId): Promise<boolean>`.

Feed tests: undecided MUTUAL row where I'm candidate appears in `new` with `candidate` = recipient; my INTERESTED row appears in `waiting` regardless of other side DECLINED, and the item JSON has no `status`/`*Decision` keys; my DECLINED row appears nowhere; blocked partner hidden; legacy pending recipient row + unanswered received like appear in `new` with their kinds.

- [ ] TDD feed; implement routes (requireUser, zod v4 body `{interested: z.boolean()}`, dealbreakers body `{keys: z.array(z.enum(DEALBREAKER_KEYS))}`); commit `feat(suggestions): feed, decide and dealbreaker APIs`.

### Task 5: Creating MUTUAL suggestions

**Files:** Modify `src/lib/matching/auto-suggest.ts`, `src/app/api/admin/suggestions/generate/route.ts`, `src/app/api/admin/suggestions/route.ts`; extend `src/__tests__/matching/auto-suggest.test.ts`.

Flag on: pending check uses `openMutualWhere` + legacy pending; weekly counts on either side for user and candidates (`groupBy` by recipientId and candidateId); `mutuallyAcceptable` filter; rows `flow: "MUTUAL"`, `expiresAt`; `notifyMany([user, ...candidates])` type SUGGESTION url `/dashboard/suggestions`. Flag off: unchanged.

Tests: flag on → createMany data has `flow: "MUTUAL"` and `expiresAt`; candidate failing user's dealbreaker excluded; candidate at weekly cap excluded; both sides notified; flag off → no `flow` key (legacy unchanged).

- [ ] TDD; commit `feat(matching): create simultaneous suggestions with dealbreakers`.

### Task 6: Two-tab UI

**Files:** Create `src/components/suggestions/candidate-details.tsx` (move `InfoRow`, `Section`, `CandidateDetails` out of the page, unchanged), `src/components/suggestions/mutual-suggestions-view.tsx`, `src/components/suggestions/dealbreakers-card.tsx`; modify `src/app/(ar)/dashboard/suggestions/page.tsx` (import moved components; when first `/api/suggestions` response has `mutualView`, render `<MutualSuggestionsView />` instead of the 3 tabs).

UI: tabs "اقتراحات جديدة" / "بانتظار الطرف الآخر" with counts; card = name, VerifiedBadge, age/city/education/job chips, score ring, a `bg-primary/5` box "لماذا هذا الاقتراح" + reason, expandable `CandidateDetails`, buttons مهتم (primary) / لا (outline). After مهتم: toast-like inline message "تم تسجيل اهتمامك. سنخبرك إذا كان الاهتمام متبادلاً." or on match a success banner linking `/dashboard/matches`. Waiting cards show amber badge "بانتظار الطرف الآخر" and a note that it closes on its own if there's no match. Dealbreakers card (collapsible) lists filled-in preferences with `Switch`. Keep block/report menu behaviour from the legacy cards. RTL pagination.

- [ ] Build; `npx tsc --noEmit` clean; commit `feat(suggestions): two-tab simultaneous suggestions page`.

### Task 7: Docs + verification

- [ ] Update CLAUDE.md (matching workflow, switch, dealbreakers) and the cycle spec's phase-4 line.
- [ ] `npx vitest run` and `npx tsc --noEmit` green.
- [ ] Browser: turn on switches locally, seed a MUTUAL suggestion between 0777000001/0777000002 (via auto-suggest), log in as each with OTP 111111, A says مهتم → A sees waiting, B still sees new; B says مهتم → match on /dashboard/matches for both; second pair: one says لا, other's card stays "waiting".
- [ ] Commit `docs: simultaneous suggestions`.
