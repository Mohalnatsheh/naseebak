# Better cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New shared cards respect both people's age ranges (with a 5-card safety net) and go first to people seen today, each behind its own switch.

**Architecture:** Two pure, db-free helpers (`ageRangesFit` in `score.ts`; `todayFirstOrder` and `pickNewCards` in `auto-suggest.ts`) wired into `generate` after its existing ranking. Two new `system_settings` keys read by `getCycleFlags`, shown in Admin → Settings.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Zod v4.

**Spec:** `docs/superpowers/specs/2026-11-27-better-cards-design.md`

## Global Constraints

- Switch keys `respect_age_range` and `suggest_today_first`, default `"false"`, effective only with `new_suggestions_flow` (i.e. `mutualSuggestions`).
- `AGE_SAFETY_OPEN = 5`. Today = seen in the last 24 h (`lastActiveAt`). Group threshold = `PREFERRED_SCORE` (70).
- Both switches off ⇒ `generate` output identical to today (existing tests must pass unchanged).
- Server only; no change to API shapes, app, feed or second-chance / reveal paths.
- `pnpm lint` 0 problems; `npx tsc --noEmit`; `npx vitest run`; `pnpm build`.

## Review Focus

1. A member with no `prefAgeMin`/`prefAgeMax` (open range) must fit everyone on that side.
2. A candidate with no `dateOfBirth` when the member set a bound fails (same as the age «شرط أساسي»).
3. A member already holding 5+ open cards gets no out-of-range card at all.
4. `lastActiveAt` null counts as not seen today (never first).
5. Both switches on together: age split first, today-first order inside each part.

---

### Task 1: Switches

**Files:** Modify `src/lib/settings.ts`, `src/app/api/admin/settings/new-cycle/route.ts`, `src/components/admin/new-cycle-settings-card.tsx`. Test: `src/__tests__/lib/settings-cycle-flags.test.ts` (create).

**Produces:** `CycleFlags.respectAgeRange?: boolean`, `CycleFlags.todayFirst?: boolean`.

- [ ] Test: `getCycleFlags` with both keys `"true"` and flow on → both true; with `new_suggestions_flow` off → both false; defaults → both false.
- [ ] Run, expect FAIL.
- [ ] Add DEFAULTS entries (with a dated comment), read the keys in `getCycleFlags`, gate by `mutualSuggestions`. Route: GET returns `respectAgeRange`, `todayFirst`; PATCH schema `z.boolean().optional()` for both, `setSetting`. Card: two rows after `activeThreeDays`, added to `Key`, `quickOff` and the needs-simultaneous list, English copy.
- [ ] Run, expect PASS. Commit.

### Task 2: `ageRangesFit`

**Files:** Modify `src/lib/matching/score.ts`. Test: `src/__tests__/matching/age-range-fit.test.ts` (create).

**Produces:** `export function ageRangesFit(a: UserForScoring, b: UserForScoring): boolean` (each person's age inside the other's range; empty bound open; missing age fails a set bound; missing profile → false).

- [ ] Tests: inside both → true; she 25 wants 28–35, he 24 → false; he wants 20–30, she 32 → false; open ranges → true; set bound + no DOB → false; one bound only respected.
- [ ] Run FAIL → implement with the existing `getAge` → PASS. Commit.

### Task 3: `generate` wiring

**Files:** Modify `src/lib/matching/auto-suggest.ts` (`scoringSelect` gains `lastActiveAt: true`; constants; helpers; `generate`). Comment in `src/lib/admin/members-suggest-reason.ts` (no logic change: it only counts when the member has 0 open cards, where the safety net lets every candidate through). Test: `src/__tests__/matching/better-cards.test.ts` (create; same db-mock pattern as `auto-suggest.test.ts`).

**Consumes:** Task 1 flags, Task 2 `ageRangesFit`.
**Produces:**
- `export const AGE_SAFETY_OPEN = 5`
- `export function todayFirstOrder<T extends { score: number }>(list: T[], seenToday: (t: T) => boolean): T[]` — stable; groups (≥70 & today), (≥70), (<70 & today), rest.
- `export function pickNewCards<T>(fit: T[], outside: T[], limit: number, openNow: number): T[]` — `fit.slice(0, limit)`, then outside up to `min(limit − taken, AGE_SAFETY_OPEN − openNow − taken)` (never negative).

- [ ] Tests for the helpers: ordering groups and stability; `pickNewCards` with openNow 0/3/5/8, limit smaller than fit, empty fit.
- [ ] Tests on `autoSuggestForUser` with mocked db: `respectAgeRange` on → out-of-range candidate skipped when the member already has 5 open; used to fill when open is 0 and no in-range exists; `todayFirst` on → a 72-score today candidate created before an 80-score seen 2 days ago when limit is 1; both off → same candidate set as before.
- [ ] Run FAIL → wire into `generate`: after `orderForSlots`/`free`, apply `todayFirstOrder` when `flags.todayFirst`; when `flags.respectAgeRange`, split `free` by `ageRangesFit(user, r.candidate)` and `top = pickNewCards(fit, outside, limit, MAX_OPEN_SUGGESTIONS − limit)`; otherwise `top = free.slice(0, limit)` as now. `openNow` is only meaningful with `creditOnInterest`; without it pass 0.
- [ ] Run PASS, plus `npx vitest run src/__tests__/matching src/__tests__/suggestions`. Commit.

### Task 4: Full check and production read-only estimate

- [ ] `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` all pass.
- [ ] Read-only SQL on production: active Jordanian members (seen 3 days) whose open «جديدة» is under 5 and who have no in-range candidate (count by gender) — the members the safety net serves.
- [ ] Update `CLAUDE.md` (switches line) and commit.
