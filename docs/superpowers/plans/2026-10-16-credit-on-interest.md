# Credit on Interest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind one new switch `credit_on_interest`, make "مهتم" the only paid action (1 credit, taken when tapped), let it carry a chat/family preference that a mutual match opens straight into, and replace the weekly suggestion cap with 5 open suggestions at a ≥ 50 score, best first. Matches, requests and chat become free.

**Architecture:** New flag `CycleFlags.creditOnInterest` (needs `mutualSuggestions`). Suggestion rules change inside `auto-suggest.ts` via flag-aware helpers. `decideSuggestion` charges inside the same transaction as the decision claim. `createMutualMatch` (flag on) stamps `openedAt` and applies the outcome through a new `src/lib/intro/outcome.ts`, which creates auto-accepted `IntroRequest` rows (+ `Conversation` for chat) so `getMatchIntroState` keeps one source of truth.

**Tech Stack:** Next.js 16 route handlers, Prisma 7 (`@prisma/adapter-pg`, Postgres 17), zod/v4, Vitest with mocked db (`vi.hoisted` + `vi.mock("@/lib/db")`, `$transaction` as `fn => fn(db)`), shadcn/ui, `notify()`.

**Spec:** `docs/superpowers/specs/2026-10-16-credit-on-interest-design.md` (owner request: `docs/cycle-v2-prompt.md`).

## Global Constraints

- Live site (~200 users): schema changes additive only — new enum `IntroPreference { CHAT FAMILY }`, new enum value `CreditReason.INTEREST`, new nullable columns `Suggestion.recipientIntroPreference`, `Suggestion.candidateIntroPreference`, `MutualMatch.openedAt`, `MutualMatch.femaleGuardianShareAt`, `MutualMatch.maleGuardianShareAt`. No renames, drops or type changes. Generated SQL saved for the owner.
- Switch key `credit_on_interest`, default `"false"`; `creditOnInterest = mutualSuggestions && credit_on_interest === "true"`. **Flag off ⇒ identical behaviour to today**; existing tests stay green.
- `MAX_OPEN_SUGGESTIONS = 5`; minimum score 50 when the flag is on, 30 when off (50 provisional).
- "مهتم" = 1 credit, ledger reason `INTEREST`, charged in the same transaction as the decision claim; never refunded; "لا" free; match free; intro requests free when the flag is on.
- Notifications only via `notify()` / `notifyMany()`; exactly one per person per event; a one-sided decision is never notified or exposed.
- Guardian contact for matches with `openedAt` set: shown only when that side has a per-match share stamp **and** global consent.
- Copy: Arabic, Western digits, feminine imperative for women, brand tokens only (CLAUDE.md).
- No git push, no deploy.

## Review Focus

1. **Double charge** — double tap / two tabs / retry on "مهتم": one decision, one credit. Pinned in Task 3 (`charges once when the claim is lost`).
2. **Charge without a decision** — expired, blocked, already decided or partner unavailable: nothing charged. Pinned in Task 3 (`no charge when the decision is refused`).
3. **Leak of a one-sided decision** — no notification on a single decision; top-up only affects the decider; no refunds. Pinned in Task 3 (`a decision sends no notification`).
4. **Guardian contact without per-match consent** — CHAT chooser with old global consent in a mixed match. Pinned in Task 5 (`mixed: CHAT side's guardian hidden until per-match share`).
5. **Rollback** — flag off with open chats / auto-accepted family intros: they keep working, "مهتم" free again, requests paid again. Pinned in Task 3 and Task 5 flag-off tests.

---

### Task 1: Schema, flag and admin switch

**Files:**
- Modify: `prisma/schema.prisma`; `src/lib/settings.ts` (`CycleFlags`, `getCycleFlags`, DEFAULTS); `src/app/api/admin/settings/new-cycle/route.ts`; `src/app/(en)/admin/settings/page.tsx`; `src/app/(en)/admin/users/[id]/page.tsx:116` (`creditReasonLabel.INTEREST = "Interest"`)
- Create: `docs/superpowers/plans/2026-10-16-credit-on-interest.sql`
- Test: `src/__tests__/lib/cycle-flags.test.ts`

**Interfaces:** Produces `CycleFlags.creditOnInterest: boolean` and the schema items in Global Constraints.

- [ ] **Step 1: Failing test** `cycle-flags.test.ts`: mock `getSetting`; `creditOnInterest` true only for intro/mutual/credit_on_interest all `"true"`; false when `new_suggestions_flow` is `"false"`; default false.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/lib/cycle-flags.test.ts` → FAIL.
- [ ] **Step 3: Implement** flag (`getSetting("credit_on_interest")`), DEFAULTS `credit_on_interest: "false"`, admin PATCH `creditOnInterest: z.boolean().optional()` → `setSetting("credit_on_interest", …)` and GET returns it. Settings row in the "New user cycle" card, same style, disabled unless Shared suggestions is on: title "Credit on interest", text "Suggestions are free (5 open at a time, score ≥ 50, best first). Each 'Interested' costs the user 1 credit; matches, requests and chat are free. A mutual match opens straight into chat or family introduction. Needs Shared suggestions on."
- [ ] **Step 4: Schema** additive edits → `./node_modules/.bin/prisma generate` → SQL via `prisma migrate diff` from the local Docker DB (`postgresql://naseeb:naseeb@localhost:5433/naseeb`) to the schema, `--script` → the `.sql` file. Expected: only `CREATE TYPE`, `ALTER TYPE … ADD VALUE`, `ALTER TABLE … ADD COLUMN`. Apply nothing.
- [ ] **Step 5: Run** test → PASS; tsc, lint, full suite green.
- [ ] **Step 6: Commit** `feat(cycle): credit_on_interest switch and additive schema`

### Task 2: Suggestions — open cap, score, ordering, top-up triggers

**Files:** Modify `src/lib/matching/auto-suggest.ts`, `src/app/api/admin/suggestions/generate/route.ts`, `src/lib/cron/suggestions.ts` (`runWeeklySuggestions`), `src/lib/suggestions/mutual.ts` (`expireMutualSuggestions` only), `src/app/api/suggestions/route.ts:124`, `src/lib/suggestions/feed.ts:155-200`, `src/components/suggestions/mutual-suggestions-view.tsx` (empty states only). Tests: `src/__tests__/matching/auto-suggest.test.ts`, `src/__tests__/suggestions/feed.test.ts`, `src/__tests__/cron/suggestions.test.ts`, admin generate test.

**Interfaces (produced):** in `auto-suggest.ts`: `export const MAX_OPEN_SUGGESTIONS = 5`; `export function minSuggestionScore(flags: CycleFlags): number`; `export async function openSuggestionCount(userId: string): Promise<number>` (MUTUAL open rows either side + LEGACY PENDING as recipient); `export async function openCounts(userIds: string[]): Promise<Map<string, number>>`. In `feed.ts`: `export function suggestionOrder(flags: CycleFlags)`. Flag on: never `weekly_cap`; `nextSuggestionsAtFor` → `null`.

- [ ] **Step 1: Failing tests** (flag on via mocked `getCycleFlags`): `tops up to 5 when 0 open`; `tops up 2 when 3 open`; `nothing and reason "pending" when 5 open`; `drops candidates below 50` and `flag off keeps ≥30 and the weekly cap`; `skips a candidate with 5 open`; `no weekly_cap and nextSuggestionsAt null when flag on`; `admin generate uses the same min score and open cap`; feed `orders by compatibilityScore desc then createdAt desc when flag on` (assert `orderBy` arg) and unchanged when off; cron `runWeeklySuggestions selects users with < 5 open when flag on`; `expireMutualSuggestions tops up both sides when it expired rows (flag on)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Flag-on branch in `generate`: `limit = MAX_OPEN_SUGGESTIONS - openSuggestionCount`, skip weekly block, `score >= minSuggestionScore(flags)`, popular guard via `openCounts`. Flag off: untouched. Expiry top-up fire-and-forget (lazy import to avoid a cycle).
- [ ] **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(suggestions): open cap 5, min score helper, score ordering behind credit_on_interest`

### Task 3: "مهتم" costs a credit and carries the intro preference

**Files:** Modify `src/lib/suggestions/mutual.ts` (`decideSuggestion`), `src/app/api/suggestions/[id]/decide/route.ts`, `src/app/api/suggestions/[id]/like/route.ts`, `src/app/api/interests/[id]/accept/route.ts`, `src/lib/credits.ts` (add `notifyInterestCreditsExhausted` if no fitting notice exists), `src/lib/intro/errors.ts` (reuse `NO_CREDITS`, `CONSENT_REQUIRED`, `GUARDIAN_REQUIRED`; add `PREFERENCE_REQUIRED` if missing). Tests: `src/__tests__/suggestions/mutual.test.ts`, a new `src/__tests__/api/legacy-interest-credit.test.ts`.

**Interfaces:**
- `decideSuggestion(args: { suggestionId: string; userId: string; interested: boolean; introPreference?: "CHAT" | "FAMILY"; guardianConsent?: boolean }): Promise<{ match: boolean; matchId?: string; creditsLeft?: number }>`.
- Route body: `z.object({ interested: z.boolean(), introPreference: z.enum(["CHAT","FAMILY"]).optional(), guardianConsent: z.boolean().optional() })`.
- Charging (flag on, interested): inside `db.$transaction(async tx => …)`: the existing conditional `suggestion.updateMany` claim (now also writing the preference); if `count === 0` → throw `notFound()` (nothing charged); then `reserveCredits(userId, 1, tx)` — false ⇒ throw `IntroError("NO_CREDITS")` (rolls back the claim); `recordCredit({ userId, delta: -1, reason: "INTEREST", refId: suggestionId }, tx)`. Pre-checks before the transaction: balance ≥ 1 (fast `NO_CREDITS`), preference present (`PREFERENCE_REQUIRED`), CHAT refused when chat flag off, FAMILY needs guardian (`GUARDIAN_REQUIRED`) and consent (existing, or `guardianConsent: true` → `setGuardianConsent(userId)`; else `CONSENT_REQUIRED`).
- After commit: if balance is now 0 → one exhausted notice; `autoSuggestForUser(userId)` fire-and-forget; match path unchanged (calls `createMutualMatch`).
- Legacy like/accept (flag on): same reserve+record in a transaction with their state change; `NO_CREDITS` at 0.

- [ ] **Step 1: Failing tests:** `"مهتم" charges 1 credit and records INTEREST`; `refused with NO_CREDITS at 0 and records nothing`; `"لا" free at 0 credits`; `charges once when the claim is lost` (second call: claim count 0 → no reserve); `no charge when the decision is refused` (expired / blocked / unavailable partner); `PREFERENCE_REQUIRED without preference`; `CHAT refused when chat flag off`; `FAMILY without guardian → GUARDIAN_REQUIRED`; `FAMILY without consent → CONSENT_REQUIRED`; `FAMILY with guardianConsent:true sets consent and stores FAMILY`; `preference stored on my side's column`; `a decision sends no notification` (except the exhausted notice when balance hits 0, asserted separately: `exhausted notice once when balance reaches 0`); `tops up the decider after a decision`; `flag off: free, preference ignored, existing behaviour`; legacy `like charges 1 when flag on`, `accept charges 1 when flag on`, `both free when flag off`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(suggestions): interested costs 1 credit and carries chat/family preference`

### Task 4: Free match with immediate outcome

**Files:** Create `src/lib/intro/outcome.ts`; modify `src/lib/intro/match.ts` (`createMutualMatch`), `src/lib/intro/requests.ts` (`sendIntroRequest`: no reserve/record/exhausted notice when flag on). Tests: `src/__tests__/intro/outcome.test.ts`, `src/__tests__/intro/requests.test.ts`.

**Interfaces (produced):**
- `export async function applyIntroOutcome(match: { id: string; femaleId: string; maleId: string; suggestionId: string | null }, flags: CycleFlags): Promise<"CHAT" | "FAMILY" | "NONE">` — reads the suggestion's two preferences (mapping recipient/candidate to female/male by id): both CHAT and chat flag on → `IntroRequest{type:"CHAT",status:"ACCEPTED",senderId:femaleId,receiverId:maleId,respondedAt:now,expiresAt:now}` + `Conversation{matchId, expiresAt: now + CHAT_TTL_DAYS days}`; both FAMILY or mixed → `IntroRequest{type:"FAMILY",status:"ACCEPTED",…}` + stamp `femaleGuardianShareAt` / `maleGuardianShareAt` for each FAMILY side; otherwise `"NONE"`. Runs in one transaction; idempotent (skips if an ACCEPTED request of that type already exists for the match).
- `createMutualMatch` (flag on): create with `openedAt: now`, no VisitRequest, call `applyIntroOutcome`, then notify per outcome (texts in spec decision 7; mixed CHAT side gets the extra line; null → match text without credit sentence; urls: conversation for CHAT, `/dashboard/matches?match=<id>` otherwise). Flag off: unchanged.
- `sendIntroRequest` flag on: free (no `reserveCredits`, no `recordCredit`, no exhausted notice); flag off unchanged.

- [ ] **Step 1: Failing tests:** `CHAT+CHAT creates ACCEPTED CHAT request and a Conversation`; `FAMILY+FAMILY creates ACCEPTED FAMILY request and both stamps`; `mixed creates FAMILY, stamps only the FAMILY side`; `CHAT+CHAT with chat flag off → NONE`; `null preference → NONE`; `idempotent on a second call`; `createMutualMatch flag on: openedAt set, no VisitRequest, no credit taken`; notifications `one per person`, `conversation url for CHAT`, `mixed CHAT side gets "الطرف الآخر فضّل التعارف العائلي"`; `flag off: unchanged text and VisitRequest` (existing); `sendIntroRequest free when flag on`, `paid when flag off` (existing).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(matches): free match opens straight into chat or family introduction`

### Task 5: Intro state and per-match guardian consent

**Files:** Modify `src/lib/intro/requests.ts` (`getMatchIntroState`, `respondToIntroRequest` FAMILY accept stamps the accepting/sending sides for `openedAt` matches); create `src/app/api/matches/[id]/guardian-share/route.ts`. Tests: `src/__tests__/intro/requests.test.ts`, `src/__tests__/api/guardian-share.test.ts`.

**Interfaces:**
- `IntroState` gains `outcome?: "CHAT" | "FAMILY"` (from the auto-accepted rows) and `myGuardian.sharedForMatch: boolean`, `myGuardian.askShare: boolean` (true when the match has `openedAt`, an accepted FAMILY intro, and my stamp is missing).
- For matches with `openedAt`: `family.contacts` only when the partner's stamp is set **and** partner's global consent exists. Pre-flag matches: today's rule.
- `POST /api/matches/[id]/guardian-share`: requireUser; must be a party; requires my guardian + global consent (`CONSENT_REQUIRED` otherwise, or body `{ consent: true }` sets it); stamps my side; returns new state.
- Later FAMILY requests on `openedAt` matches (free): on accept, stamp both sides that have global consent (sender consented to send; receiver consents to accept — today's checks).

- [ ] **Step 1: Failing tests:** `mixed: CHAT side's guardian hidden until per-match share`; `askShare true for the unstamped side of an accepted family intro`; `guardian-share stamps only my side and requires consent`; `pre-flag match keeps the global-consent rule`; `withdrawn global consent hides contacts even when stamped`; `later family request on an openedAt match stamps both on accept`; `chat→family move still free after an auto-opened chat`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; full suite green.
- [ ] **Step 5: Commit** `feat(matches): per-match guardian consent for credit_on_interest matches`

### Task 6: UI and copy

**Files:** Create `src/components/suggestions/interest-dialog.tsx`; modify `src/components/suggestions/mutual-suggestions-view.tsx`, `src/app/(ar)/dashboard/suggestions/page.tsx` (legacy like/accept buttons: credit gate + hint when flag on), `src/components/intro/match-intro-panel.tsx` (outcome state, share prompt calling `/api/matches/[id]/guardian-share`, request buttons "مجاناً" when flag on), `src/app/api/me/counts/route.ts` + `src/contexts/dashboard-context.tsx` (`flags.creditOnInterest`, `credits`), `src/components/dashboard/next-step-card.tsx` (0 credits with open suggestions → "اشحن رصيدك لتُبدي اهتمامك"), copy (flag-aware) in `src/app/(ar)/dashboard/payments/page.tsx`, `src/components/intro/intro-confirm-dialog.tsx`, `src/components/shared/onboarding-guide.tsx`, `src/components/landing/content.ts`, `src/app/(ar)/faq/faq-data.ts`. Test: `src/__tests__/components/interest-dialog.test.tsx`.

**Interfaces:** `InterestDialog({ open, onOpenChange, partnerGender, credits, chatEnabled, guardian: { exists: boolean; consented: boolean }, onConfirm: (p: { introPreference: "CHAT" | "FAMILY"; guardianConsent?: boolean }) => Promise<void> })`. Choices "محادثة هنا أولاً" / "تعارف عائلي مباشرة"; hint "مهتم يستخدم رصيداً واحداً — رصيدك N"; FAMILY without consent shows the checkbox "أوافق على مشاركة اسم ورقم ولي الأمر" (and a link to the guardian step when no guardian); CHAT hidden when `chatEnabled` false. Copy line: "يُستخدم رصيد واحد عند اختيار «مهتم»، والتوافق والطلبات والمحادثة مجانية."

- [ ] **Step 1: Failing tests:** `requires a choice`; `FAMILY without consent shows the checkbox and blocks confirm until ticked`; `chat option hidden when chat disabled`; `shows the balance hint`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (0 credits ⇒ "مهتم" disabled with "اشحن رصيدك للمتابعة" link to `/dashboard/payments`; on `NO_CREDITS` from the API show the same message). **Step 4: Run** → PASS; lint 0 errors.
- [ ] **Step 5: Commit** `feat(ui): interest dialog with chat/family choice, credit-on-interest copy`

### Task 7: Docs

**Files:** `CLAUDE.md` (credits rules, "No credit gate on matches", Matching Algorithm score/open cap, Empty suggestions, new "Credit on interest" section, notification texts); header comments of `src/lib/credits.ts`, `src/lib/intro/requests.ts`, `src/lib/matching/auto-suggest.ts`, `src/lib/intro/outcome.ts`.

- [ ] **Step 1:** Edit. **Step 2:** Commit `docs: credit on interest rules`

### Task 8: Verification

- [ ] **Step 1:** tsc clean; lint 0 errors; full suite green.
- [ ] **Step 2:** Docker rebuild from `git archive HEAD` (scratchpad copy + `.env`), `prisma db push` on start; turn `credit_on_interest` on (Admin → Settings).
- [ ] **Step 3:** Walkthrough with seeded users via scripted sessions + browser: (a) new MUTUAL suggestion, both "مهتم"+CHAT → 1 credit each (INTEREST in ledger), chat open, outcome notification; (b) FAMILY+FAMILY → contacts both sides; (c) mixed → CHAT side share prompt, contacts after yes; (d) 0-credit user: "مهتم" disabled, API `NO_CREDITS`, "لا" works; (e) double POST of "مهتم" → one ledger row; (f) flag off → existing chat still works, "مهتم" free.
- [ ] **Step 4:** Report: generated SQL, results, not verifiable (OneSignal delivery, Stripe on a real host, real-data score distribution).
