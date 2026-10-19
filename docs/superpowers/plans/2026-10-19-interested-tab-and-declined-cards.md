# «مهتمون بك» tab and honest declined cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members see who already said «مهتم» to them in their own tab, and a member who said «مهتم» sees when the other side said «لا».

**Architecture:** The feed (`src/lib/suggestions/feed.ts`) grows a third tab `interested` (open cards where the other side already said «مهتم», always tagged) and the `waiting` tab marks rows the other side declined (`declined: true`, kept until the window ends, no refund). The «مهتم» notice «شخص أبدى اهتمامه بك» replaces the neutral waiting nudge, once per Amman day. No schema change: everything is derived from the existing decisions.

**Tech Stack:** Next.js 16, Prisma, Vitest.

**Spec (owner decisions, 2026-10-19):**
1. A declined «مهتم» shows «لم يحصل توافق» on the member's waiting card (no refund, no push).
2. New tab «مهتمون بك»: cards where the other side already said «مهتم». «مهتم» there costs 1 credit as usual and is an instant match; «لا» quietly closes it.
3. «شخص أبدى اهتمامه بك» is sent on every «مهتم» to an undecided person, at most once per Amman day (push + SMS fallback), linking to the new tab.
4. Secrecy copy changes: a «لا» is seen only by someone who had already said «مهتم»; nobody else learns it.

## Global Constraints

- Live site: additive, no schema change, switch-gated behaviour unchanged for legacy mode.
- The feed never serializes the other side's decision or the row status; only the derived `likedYou` / `declined` flags.
- Western digits, `forViewer` for gendered copy, no forbidden colours.

## Review Focus

- A card the other side declined must never appear in `new` or `interested` (REJECTED rows are only read by the waiting tab).
- At 0 credits the `interested` tab still shows full cards with «مهتم» disabled.
- A hidden-from-candidate row where the recipient said «مهتم» is revealed and lands in the candidate's `interested` tab (not `new`).
- The dashboard "to decide" count (`countNewItems`) includes the `interested` tab.
- The cron 2-day reminder keeps its own daily dedupe and isn't affected.

---

### Task 1: Feed tabs and flags
**Files:** Modify `src/lib/suggestions/feed-types.ts`, `src/lib/suggestions/feed.ts`; Test `src/__tests__/suggestions/feed.test.ts`.
**Produces:** `FeedTab = "new" | "interested" | "waiting"`; `OpenFeedItem.likedYou?: true` (interested tab), `OpenFeedItem.declined?: true` (waiting tab); `countNewItems(userId)` = new + interested totals.
- [ ] Tests: `interested` tab lists mutual rows where the other side said INTERESTED (both sides of the row) with `likedYou: true`, and legacy interests; `new` tab excludes them; `waiting` tab marks REJECTED rows with the other's DECLINED as `declined: true` and PENDING ones not; nothing serializes decisions/status.
- [ ] Implement; run `npx vitest run src/__tests__/suggestions/feed.test.ts`.

### Task 2: Interest notice
**Files:** Modify `src/lib/suggestions/mutual.ts`; Test `src/__tests__/suggestions/mutual.test.ts`.
**Produces:** `notifyInterestShown(userId, suggestionId, now)` — title «شخص أبدى اهتمامه بك», gendered body, url `/dashboard/suggestions?tab=interested`, `sms: "interest"`, once per Amman day; used by both the decide path (replacing `notifyWaitingDecision`) and the hidden-reveal path.
- [ ] Tests: a «مهتم» on an undecided visible card notifies the other side with that title; a second «مهتم» the same day doesn't; a «لا» never does.
- [ ] Implement; run `npx vitest run src/__tests__/suggestions`.

### Task 3: Suggestions view
**Files:** Modify `src/components/suggestions/mutual-suggestions-view.tsx`, `src/app/(ar)/dashboard/suggestions/page.tsx` (read `?tab=`).
- [ ] Three tabs (جديدة / مهتمون بك / بالانتظار), `?tab=interested` opens the tab; interested cards always show the «أبدى/أبدت اهتمامه/ا بك» badge and the hint that «مهتم» is an instant match (1 credit); waiting cards with `declined` show «لم يحصل توافق» (muted tone, no «مهتم» hint); empty states; totals move between tabs on decide; header/toast copy per spec item 4.

### Task 4: Copy elsewhere
**Files:** `src/components/shared/onboarding-guide.tsx`, `src/components/dashboard/next-step-card.tsx`, `src/components/landing/content.ts`, `src/app/(ar)/faq/faq-data.ts`, `src/app/(ar)/terms/terms-view.tsx`, `CLAUDE.md`, `docs/platform-flow.html` (flow 07).
- [ ] Replace «لا نُطلع أحداً على قرار «لا»» with the new rule; terms/FAQ say interest is shown and a «لا» is seen only by someone who said «مهتم».

### Task 5: Verify
- [ ] `npx vitest run`, `tsc --noEmit`, `pnpm lint`, `pnpm build`; phone screenshots of the three tabs and a declined card; deploy after the owner's OK.
