# Credit on Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind one new switch `credit_on_match`, make the mutual match the only paid moment (1 credit from each person, charged when the match opens), let "مهتم" carry a chat/family preference that opens immediately, and replace the weekly suggestion cap with 5 open suggestions at a ≥ 50 score, best first.

**Architecture:** A new flag `CycleFlags.creditOnMatch` (needs `mutualSuggestions`). Suggestion rules change inside `auto-suggest.ts` via flag-aware helpers. Matches get additive "waiting for credit" columns; a new module `src/lib/intro/match-open.ts` owns charging and opening (one transaction, claim-then-charge), and applies the outcome by creating auto-accepted `IntroRequest` rows (+ `Conversation` for chat) so `getMatchIntroState` and the match page keep one source of truth. Credit-added hooks and the daily scheduler retry waiting matches; flag off opens waiting matches free.

**Tech Stack:** Next.js 16 route handlers, Prisma 7 (`@prisma/adapter-pg`, Postgres 17), zod/v4, Vitest with mocked db (`vi.hoisted` + `vi.mock("@/lib/db")`), shadcn/ui, `notify()`.

**Spec:** `docs/superpowers/specs/2026-10-16-credit-on-match-design.md` (owner request: `docs/cycle-v2-prompt.md`).

## Global Constraints

- Live site (~200 users): schema changes additive only — new enum `IntroPreference`, new enum value `CreditReason.MATCH`, new nullable columns. No renames, drops or type changes. Show the generated SQL to the owner before it is applied outside local Docker.
- Switch key `credit_on_match`, default `"false"`; `creditOnMatch = mutualSuggestions && credit_on_match === "true"`. **Flag off ⇒ identical behaviour to today**; every existing test stays green unmodified unless it asserted on a moved constant.
- `MAX_OPEN_SUGGESTIONS = 5`; minimum score `50` when the flag is on, `30` when off — **50 is provisional** until the owner OKs it on real data (`scripts/score-distribution.ts`).
- Credits: `reserveCredits` + `recordCredit` (reason `MATCH`) for every change; never refund `REQUEST` credits spent before the switch.
- Notifications only via `notify()` / `notifyMany()`; exactly one per person per event; a one-sided decision in the MUTUAL flow is never notified or exposed.
- Waiting match: nobody charged, nothing revealed; quiet close after 14 days (final for the pair); one day-10 reminder per match to whoever lacks credit.
- Guardian contact for matches opened under the flag: per-match consent only (`MutualMatch.femaleGuardianShareAt` / `maleGuardianShareAt`), plus global consent still present.
- Copy: Arabic, Western digits, feminine imperative for women (see `src/components/dashboard/next-step-card.tsx`), brand tokens only (CLAUDE.md colour rules).
- No git push, no deploy.

## Review Focus

1. **Double charge / no charge under concurrency** — both people tap "مهتم" at the same instant, or a top-up webhook and the scheduler both try to open the same waiting match: each person is charged exactly once and the match opens once. Pinned in Task 4 (`openMatch claims once under concurrent callers`) and Task 6.
2. **Leak of a one-sided decision** — the "مهتم" dialog, the 0-credit refusal, top-up timing and notifications must not let A infer B's decision. Pinned in Task 3 (`a decision sends no notification`) and Task 2 (top-up after a decision only affects the decider's own feed).
3. **Rollback** — switch turned off with waiting matches and auto-opened chats in flight: waiting matches open free, open chats/family intros keep working, request buttons behave as today. Pinned in Task 6 (`flag off opens waiting matches free`).
4. **Guardian contact shown without per-match consent** — a CHAT chooser with old global consent in a mixed match. Pinned in Task 5 (`mixed: CHAT side's guardian hidden until per-match share`).
5. **User with credit 1 saying "مهتم" on 5 suggestions** — the first match takes the credit, the rest wait, and later top-ups open them in order of `awaitingCreditSince`. Pinned in Task 6 (`top-up opens oldest waiting match first`).

---

### Task 1: Schema, flag and admin switch

**Files:**
- Modify: `prisma/schema.prisma` (enum `CreditReason`, new enum, `Suggestion`, `MutualMatch`)
- Modify: `src/lib/settings.ts` (`CycleFlags`, `getCycleFlags`, DEFAULTS)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts` (schema + PATCH)
- Modify: `src/app/(en)/admin/settings/page.tsx` (switch row + explanation)
- Modify: `src/app/(en)/admin/users/[id]/page.tsx:116` (`creditReasonLabel.MATCH = "Match"`)
- Create: `docs/superpowers/plans/2026-10-16-credit-on-match.sql` (generated SQL for the owner)
- Test: `src/__tests__/lib/cycle-flags.test.ts`

**Interfaces:**
- Produces: `CycleFlags.creditOnMatch: boolean`; Prisma: `IntroPreference { CHAT FAMILY }`, `CreditReason.MATCH`, `Suggestion.recipientIntroPreference?`, `Suggestion.candidateIntroPreference?`, `MutualMatch.awaitingCreditSince? openedAt? closedUnpaidAt? creditReminderSentAt? femaleGuardianShareAt? maleGuardianShareAt?` (all `DateTime?` except the preferences).

- [ ] **Step 1: Write the failing test** `cycle-flags.test.ts`: mock `getSetting`; assert `creditOnMatch` is `true` only for `{intro:"true", mutual:"true", credit_on_match:"true"}`; `false` when `new_suggestions_flow` is `"false"` even if `credit_on_match` is `"true"`; default (no rows) `false`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/lib/cycle-flags.test.ts` → FAIL (`creditOnMatch` undefined).
- [ ] **Step 3: Implement** the flag in `getCycleFlags()` (add `getSetting("credit_on_match")` to the `Promise.all`), DEFAULTS `credit_on_match: "false"`, admin PATCH schema `creditOnMatch: z.boolean().optional()` → `setSetting("credit_on_match", …)`. Admin Settings row: title "Credit on match", text "Suggestions are free and unlimited (5 open at a time). 'Interested' needs 1 credit; each person pays 1 credit only when the match opens. Requests become free. Needs Shared suggestions on. Turning it off opens waiting matches for free."
- [ ] **Step 4: Edit the schema** (additive only), then `./node_modules/.bin/prisma generate` and write the SQL: `./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > docs/superpowers/plans/2026-10-16-credit-on-match.sql` (against local Docker DB `postgresql://naseeb:naseeb@localhost:5433/naseeb`). Expected SQL contains only `CREATE TYPE`, `ALTER TYPE … ADD VALUE`, `ALTER TABLE … ADD COLUMN` — no `DROP`, no `ALTER COLUMN … TYPE`.
- [ ] **Step 5: Run** the test → PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 6: Commit** `git add prisma/schema.prisma src/lib/settings.ts src/app/api/admin/settings/new-cycle/route.ts "src/app/(en)/admin/settings/page.tsx" "src/app/(en)/admin/users/[id]/page.tsx" src/__tests__/lib/cycle-flags.test.ts docs/superpowers/plans/2026-10-16-credit-on-match.sql && git commit -m "feat(cycle): credit_on_match switch and additive schema"`

### Task 2: Suggestions — open cap, score, ordering, top-up triggers

**Files:**
- Modify: `src/lib/matching/auto-suggest.ts` (constants, `generate`, `autoSuggestWithReason`, popular guard)
- Modify: `src/app/api/admin/suggestions/generate/route.ts`
- Modify: `src/lib/cron/suggestions.ts` (`runWeeklySuggestions` eligibility)
- Modify: `src/lib/suggestions/mutual.ts` (`expireMutualSuggestions` → top-up both sides when rows expired)
- Modify: `src/app/api/suggestions/route.ts:124`, `src/lib/suggestions/feed.ts:155-200` (ordering)
- Modify: `src/components/suggestions/mutual-suggestions-view.tsx` (empty states)
- Test: `src/__tests__/matching/auto-suggest.test.ts`, `src/__tests__/suggestions/feed.test.ts`, `src/__tests__/cron/suggestions.test.ts`

**Interfaces:**
- Produces (in `auto-suggest.ts`): `export const MAX_OPEN_SUGGESTIONS = 5`; `export function minSuggestionScore(flags: CycleFlags): number` (50 if `creditOnMatch`, else 30); `export async function openSuggestionCount(userId: string): Promise<number>` (MUTUAL open rows on either side + LEGACY PENDING as recipient); `export async function openCounts(userIds: string[]): Promise<Map<string, number>>`.
- `SuggestEmptyReason` unchanged; flag on never returns `weekly_cap`; `nextSuggestionsAtFor` returns `null` when flag on.
- Consumed by Task 3: `autoSuggestForUser(userId)` (existing) is called after a decision.

- [ ] **Step 1: Write failing tests** in `auto-suggest.test.ts` (flag on via mocked `getCycleFlags`):
  - `tops up to 5 when 0 open` → creates 5 given 7 qualifying candidates;
  - `tops up 2 when 3 open`; `creates nothing and reason "pending" when 5 open`;
  - `drops candidates below 50` (scores 49/50 → only 50 kept) and `keeps ≥30 when flag off` (flag off: 30 kept, weekly cap still enforced — existing tests unchanged);
  - `skips a candidate who already has 5 open` (popular guard);
  - `no weekly_cap and nextSuggestionsAt null when flag on`;
  - `admin generate uses the same min score and open cap` (in `api/matching.test.ts` or a new `admin-generate-cap.test.ts`).
  In `feed.test.ts`: `orders by compatibilityScore desc then createdAt desc when flag on` (assert `orderBy` passed to `findMany` is `[{ compatibilityScore: "desc" }, { createdAt: "desc" }]`), unchanged `{ createdAt: "desc" }` when off. In `cron/suggestions.test.ts`: `runWeeklySuggestions selects users with < 5 open when flag on`.
- [ ] **Step 2: Run** those files → FAIL.
- [ ] **Step 3: Implement.** In `generate`: when `creditOnMatch`, `limit = MAX_OPEN_SUGGESTIONS - await openSuggestionCount(userId)`; `limit <= 0 → outcome(0,"pending")`; skip the weekly block; filter `score >= minSuggestionScore(flags)`; replace the weekly busy guard with `openCounts(...) < MAX_OPEN_SUGGESTIONS`. Flag off: today's code path untouched. `expireMutualSuggestions`: when it expired ≥ 1 row and the flag is on, fire-and-forget `autoSuggestForUser` for both sides (import lazily to avoid a cycle). Ordering via a small `suggestionOrder(flags)` helper exported from `feed.ts`.
- [ ] **Step 4: Run** tests → PASS; full `npx vitest run` green.
- [ ] **Step 5: Commit** `feat(suggestions): open cap 5, min score helper, score ordering behind credit_on_match`

### Task 3: "مهتم" with credit gate and intro preference

**Files:**
- Modify: `src/lib/suggestions/mutual.ts` (`decideSuggestion`)
- Modify: `src/app/api/suggestions/[id]/decide/route.ts` (zod body)
- Modify: `src/app/api/suggestions/[id]/like/route.ts`, `src/app/api/interests/[id]/accept/route.ts` (credit gate when flag on)
- Modify: `src/lib/intro/errors.ts` (codes `NO_CREDITS` exists? reuse; add `PREFERENCE_REQUIRED` if missing; `CONSENT_REQUIRED` exists)
- Test: `src/__tests__/suggestions/mutual.test.ts`

**Interfaces:**
- `decideSuggestion(args: { suggestionId: string; userId: string; interested: boolean; introPreference?: "CHAT" | "FAMILY"; guardianConsent?: boolean }): Promise<{ match: boolean; matchId?: string }>` — return shape unchanged (never reveals waiting/opened to the caller beyond `match`).
- Route body: `z.object({ interested: z.boolean(), introPreference: z.enum(["CHAT","FAMILY"]).optional(), guardianConsent: z.boolean().optional() })`.
- Consumes Task 1 columns; calls Task 4 `createMutualMatch` (unchanged signature) and Task 2 `autoSuggestForUser`.

- [ ] **Step 1: Write failing tests** (flag on): `"مهتم" with 0 credits throws NO_CREDITS and records nothing`; `"لا" with 0 credits is recorded`; `"مهتم" without introPreference throws PREFERENCE_REQUIRED`; `CHAT preference refused when chat flag is off`; `FAMILY without guardian throws GUARDIAN_REQUIRED`; `FAMILY with guardianConsent:false and no prior consent throws CONSENT_REQUIRED`; `FAMILY with guardianConsent:true sets ParentInfo.shareConsentAt and stores FAMILY on my side`; `preference stored on recipientIntroPreference / candidateIntroPreference`; `a decision sends no notification` (notify mock not called on a single decision); `tops up the decider's suggestions after a decision` (autoSuggestForUser called with decider id only). Flag off: existing tests unchanged; `introPreference ignored when flag off`. Legacy like/accept: `like refused with NO_CREDITS when flag on and balance 0`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/suggestions/mutual.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Checks run before the claim `updateMany`; preference written in the same `updateMany` data; consent via existing `setGuardianConsent(userId)` from `intro/requests.ts`. Top-up: `autoSuggestForUser(userId).catch(log)` after the decision, not awaited.
- [ ] **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(suggestions): interested needs a credit and carries chat/family preference`

### Task 4: Match opening and charging (`match-open.ts`)

**Files:**
- Create: `src/lib/intro/match-open.ts`
- Modify: `src/lib/intro/match.ts` (`createMutualMatch` flag-on path)
- Modify: `src/lib/credits.ts` (header comment; nothing else)
- Test: `src/__tests__/intro/match-open.test.ts`

**Interfaces (produced, used by Tasks 5–7):**
- `export async function openMatch(matchId: string, opts?: { free?: boolean }): Promise<"opened" | "waiting" | "already" | "closed">` — in one `db.$transaction`: claim with `mutualMatch.updateMany({ where: { id, awaitingCreditSince: { not: null }, closedUnpaidAt: null }, data: { awaitingCreditSince: null, openedAt: now } })`; if `count === 0` → `"already"`/`"closed"`; unless `free`, `reserveCredits(femaleId,1,tx)` and `reserveCredits(maleId,1,tx)` — if either fails, throw a sentinel to roll back → `"waiting"`; then `recordCredit({reason:"MATCH", refId: matchId, delta:-1}, tx)` ×2; then `applyIntroOutcome(tx, match)`; notifications after commit.
- `export async function applyIntroOutcome(tx, match): Promise<"CHAT" | "FAMILY" | "NONE">` — reads the match's suggestion preferences: both CHAT (and chat flag on) → create `IntroRequest{type:CHAT,status:ACCEPTED,senderId:femaleId,receiverId:maleId,respondedAt:now,expiresAt:now}` + `Conversation{expiresAt: now + CHAT_TTL_DAYS}`; both FAMILY or mixed → `IntroRequest{type:FAMILY,status:ACCEPTED,…}` and set `femaleGuardianShareAt` / `maleGuardianShareAt` for each side that chose FAMILY; any null → `"NONE"`.
- `export async function tryOpenWaitingMatchesFor(userId: string): Promise<number>` — waiting matches of the user ordered by `awaitingCreditSince asc`, `openMatch` each, stops when a call returns `"waiting"` because *this* user is out of credit.
- `export async function notifyMatchOutcome(matchId: string, outcome, waitingFor?: string[]): Promise<void>` — the texts from the spec, one `notify` per person.
- `createMutualMatch` (flag on): create the row with `awaitingCreditSince: now`, then `openMatch(id)`; on `"waiting"` send the two waiting notifications (to each side lacking credit: "لديك توافق متبادل! اشحن رصيدك لفتحه" → `/dashboard/payments`; to the other: "لديك توافق متبادل، بانتظار إكمال الطرف الآخر"). Flag off: unchanged.

- [ ] **Step 1: Write failing tests:** `opens and charges both when both have credit` (two `reserveCredits` calls with tx, two `recordCredit` MATCH, `openedAt` set); `waits and charges nobody when one has 0` (transaction rolled back, no `recordCredit`); `openMatch claims once under concurrent callers` (second `updateMany` returns count 0 → `"already"`, no extra reserve); `CHAT+CHAT creates ACCEPTED CHAT request and a Conversation`; `FAMILY+FAMILY creates ACCEPTED FAMILY request and both guardian share stamps`; `mixed creates FAMILY, stamps only the FAMILY side, and tells the CHAT side "الطرف الآخر فضّل التعارف العائلي"`; `null preference creates nothing (request buttons)`; `CHAT+CHAT with chat flag off falls back to NONE`; `free:true opens without charging`; `notifications: one per person per outcome, conversation url for CHAT, match url for FAMILY`; `waiting: payer told "بانتظار إكمال الطرف الآخر", the other "اشحن رصيدك لفتحه"`; `createMutualMatch flag off unchanged` (existing).
- [ ] **Step 2: Run** `npx vitest run src/__tests__/intro/match-open.test.ts` → FAIL.
- [ ] **Step 3: Implement** as specified above. Concurrency comes from the conditional claim; the rollback sentinel is a local `class StillWaiting extends Error`.
- [ ] **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(matches): charge both people when a match opens; immediate chat/family outcome`

### Task 5: Intro state, per-match guardian, free requests, hidden waiting matches

**Files:**
- Modify: `src/lib/intro/requests.ts` (`getMatchIntroState`, `sendIntroRequest`, header comment)
- Modify: `src/lib/matches/state.ts` (`MatchClosure` + `"waiting" | "closed_unpaid"`, `describeMatch`, `loadMatchStates`)
- Modify: `src/app/api/matches/route.ts`, `src/app/api/matches/[id]/photos/route.ts`
- Create: `src/app/api/matches/[id]/guardian-share/route.ts` (POST: stamp my per-match share; requires guardian + global consent)
- Test: `src/__tests__/intro/requests.test.ts`, `src/__tests__/lib/match-state.test.ts`, `src/__tests__/api/match-safety-routes.test.ts`

**Interfaces:**
- `IntroState` gains `waiting?: { me: boolean; other: boolean }` (who lacks credit, computed live from balances) and `outcome?: "CHAT" | "FAMILY"`; `family.contacts` for flag-opened matches (`openedAt` set or created under flag) only when partner's per-match share stamp is set **and** partner's global consent exists; `myGuardian.sharedForMatch: boolean` + `askShare: boolean` (true for the CHAT side of a mixed outcome without a stamp).
- `sendIntroRequest`: when `creditOnMatch`, no `reserveCredits` / `recordCredit` / exhausted notice.
- Matches list: waiting matches returned with `closed: "waiting"` and no profile details or photos; `closed_unpaid` excluded from the list and from `actionableMatches`.

- [ ] **Step 1: Write failing tests:** `free intro request when flag on (no reserveCredits, no ledger)`; `paid as today when flag off`; `waiting match: intro state has waiting flags and no contacts`; `mixed: CHAT side's guardian hidden until per-match share`; `guardian-share route stamps only my side and requires consent`; `photos 403 for waiting match, 404 for closed_unpaid`; `matches list hides details for waiting and drops closed_unpaid`; `chat→family move still free after an auto-opened chat` (existing rule keyed on `match.conversation`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(matches): waiting state, per-match guardian share, free requests under credit_on_match`

### Task 6: Credit-added hooks, rollback, scheduler task

**Files:**
- Modify: `src/app/api/payments/webhook/route.ts` (after `recordCredit` PURCHASE → `tryOpenWaitingMatchesFor(userId)`)
- Modify: `src/app/api/admin/users/[id]/route.ts` (positive credit adjust → same), `src/lib/referral.ts` (grant → same)
- Create: `src/lib/cron/match-credit.ts`; Modify: `src/lib/cron/daily.ts` (register task `matchCredit`)
- Modify: `src/lib/matches/state.ts` `loadMatchStates` (lazy rollback / lazy close)
- Test: `src/__tests__/cron/match-credit.test.ts`, `src/__tests__/intro/match-open.test.ts`

**Interfaces:**
- `export async function runMatchCreditJobs(now = new Date()): Promise<{ opened: number; reminded: number; closed: number; freeOpened: number }>` — flag off: `openMatch(id, { free: true })` for every waiting match (`freeOpened`); flag on: retry `openMatch` for all waiting (covers balances changed elsewhere), day-10 reminder via claim on `creditReminderSentAt` to whoever lacks credit ("باقي 4 أيام لفتح توافقك — اشحن رصيدك"), close at 14 days via `updateMany({ awaitingCreditSince: { lte: now-14d }, closedUnpaidAt: null }, { closedUnpaidAt: now })`, no notifications on close.
- Lazy path: `loadMatchStates` calls the same close/rollback for the viewer's matches.

- [ ] **Step 1: Write failing tests:** `top-up opens oldest waiting match first`; `top-up keeps waiting when the other side has 0 and notifies that side once`; `flag off opens waiting matches free`; `day-10 reminder sent once to the side without credit`; `14-day close charges nobody and sends nothing`; `closed_unpaid pair is never suggested again` (auto-suggest exclusion via existing match row — assert candidate excluded); `webhook calls tryOpenWaitingMatchesFor after a purchase`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(matches): reopen on top-up, rollback opens free, day-10 reminder and 14-day quiet close`

### Task 7: UI and copy

**Files:**
- Create: `src/components/suggestions/interest-dialog.tsx` (choices "محادثة هنا أولاً" / "تعارف عائلي مباشرة", consent checkbox + guardian link when missing, low-balance hint "كل توافق يستخدم رصيداً واحداً — رصيدك N", chat choice hidden when `counts.flags.chat` is false)
- Modify: `src/components/suggestions/mutual-suggestions-view.tsx` (button disabled at 0 credits with "اشحن رصيدك للمتابعة" → `/dashboard/payments`; opens the dialog; empty states per Task 2)
- Modify: `src/app/(ar)/dashboard/matches/page.tsx`, `src/components/intro/match-intro-panel.tsx` (waiting card both sides; mixed share prompt calling `/api/matches/[id]/guardian-share`; "مجاني" on request buttons when flag on)
- Modify: `src/components/dashboard/next-step-card.tsx`, `src/app/api/me/counts/route.ts` (`waitingForMyCredit` count → "اشحن رصيدك لفتح توافقك")
- Modify copy (flag-aware): `src/app/(ar)/dashboard/payments/page.tsx`, `src/components/intro/intro-confirm-dialog.tsx`, `src/components/shared/onboarding-guide.tsx`, `src/components/landing/content.ts`, `src/app/(ar)/faq/faq-data.ts` — "الرصيد يُستخدم عند التوافق المتبادل فقط، والطلبات والمحادثة مجانية."
- Add `CycleFlags.creditOnMatch` to `/api/me/counts` `flags` and the dashboard context type.
- Test: `src/__tests__/components/interest-dialog.test.tsx`

- [ ] **Step 1: Write failing tests:** `interest dialog requires a choice`; `FAMILY without consent shows the checkbox and blocks submit until ticked`; `chat option hidden when chat flag off`; `button disabled with recharge link at 0 credits`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npx pnpm@10.24.0 lint` 0 errors.
- [ ] **Step 5: Commit** `feat(ui): interest dialog, waiting match cards, credit-on-match copy`

### Task 8: Docs

**Files:** `CLAUDE.md` (Critical Domain Rules: credits per-request → credit on match when flag on; "No credit gate on matches" qualified; Matching Algorithm score ≥ 30 / 50 and open cap; Empty suggestions; new "Credit on match" section; Notification texts), header comments of `src/lib/credits.ts`, `src/lib/intro/requests.ts`, `src/lib/matching/auto-suggest.ts`, `src/lib/intro/match-open.ts`.

- [ ] **Step 1:** Edit; **Step 2:** `git commit -m "docs: credit on match rules"`

### Task 9: Verification

- [ ] **Step 1:** `npx tsc --noEmit -p .` clean; `npx pnpm@10.24.0 lint` 0 errors; `npx vitest run` all green.
- [ ] **Step 2:** Rebuild Docker from a clean `git archive` of HEAD (see CLAUDE.md Docker note); set `credit_on_match=true` via Admin → Settings.
- [ ] **Step 3:** Walkthrough with seeded pair هديل (0777000001) / يزن (0777000002) via scripted sessions + browser:
  a) both "مهتم"+CHAT → chat open, 1 credit each in the ledger (MATCH);
  b) new pair both FAMILY → contacts shown both sides;
  c) mixed → FAMILY, CHAT side sees the share prompt, contacts appear after accepting;
  d) set one user's credits to 0 (admin −adjust) → both "مهتم" → waiting cards, correct notifications; admin +1 → match opens, both charged once;
  e) a 0-credit user: "مهتم" disabled, API returns NO_CREDITS;
  f) turn the flag off → a waiting match opens free; existing chat still works.
- [ ] **Step 4:** Report to the owner: generated SQL (Task 1 file), results, and what could not be verified (OneSignal delivery, Stripe webhook on a real host — simulated via admin adjust, real-data score distribution).
