# Free «مهتم» Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind the switch `free_interest_reply`, answering «مهتم» on a card where the other side already said «مهتم» costs no credit, on the server, website, notices and app 1.0.1.

**Architecture:** One new cycle flag `freeInterestReply` (gated by `creditOnInterest`) flows through `getCycleFlags()` to `decideSuggestion`, `/api/me/counts` (`flags`), `/api/suggestions` and the admin card. The client already knows which cards are free replies: feed items carry `likedYou`. All UI decisions become per card: `free = freeInterestReply && likedYou`.

**Tech Stack:** Next.js 16 / Prisma 7 / Zod v4 / Vitest; Flutter (Riverpod, Dio, flutter_test).

**Spec:** `docs/superpowers/specs/2026-11-08-free-interest-reply-design.md`

## Global Constraints

- Setting key `free_interest_reply`, default `"false"`; flag `freeInterestReply = creditOnInterest && setting === "true"`.
- Switch off = today's behaviour exactly (existing tests unchanged and green).
- A free reply writes no `INTEREST` ledger row, never calls `reserveCredits`, never throws `NO_CREDITS`.
- Chat/family choice, `checkIntroPreference` and guardian consent apply to every «مهتم» under `creditOnInterest`, free or paid.
- Copy follows the switch; Arabic, gender-aware via `forViewer`; no masculine commands in shared text; Western digits.
- Never use hardcoded Tailwind colours listed in CLAUDE.md (success = `emerald-`).
- Client components never import runtime values from modules that import `@/lib/db`.
- API changes are additive (old app 1.0.0 keeps working).
- Keep `UNPAID_TITLE` and the «صفر: اشح» top-up line wherever they still apply. Change `automatic.ts` and the call sites together.
- `pnpm lint` 0 errors; `flutter analyze` 0 issues.

## Review Focus

1. Free reply at **0 credits** with a **FAMILY** choice and no guardian: must still answer `GUARDIAN_REQUIRED`, not match silently. Test in Task 1.
2. Free reply where the card **expired or closed** between feed load and tap: `notFound`, no charge. Test in Task 1.
3. Both tap «مهتم» at once (snapshot shows other undecided): both charged, match created once. Existing tests cover it; Task 1 adds an assertion that the free claim requires `otherDecision: "INTERESTED"`.
4. Website balance after a free reply must not drop by 1. Test in Task 2.
5. Notice to a 0-credit member with the switch on must not contain «اشح». Test in Task 3.

---

### Task 1: Server flag, admin switch, free-reply charge rule

**Files:**
- Modify: `src/lib/settings.ts` (DEFAULTS, `CycleFlags`, `getCycleFlags`)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts` (state, schema, PATCH)
- Modify: `src/components/admin/new-cycle-settings-card.tsx` (new row "Free «مهتم» reply", gated like `activeFirstFeed`)
- Modify: `src/lib/suggestions/mutual.ts` (`decideSuggestion`), doc comment in `src/app/api/suggestions/[id]/decide/route.ts`
- Modify: `src/app/api/suggestions/route.ts` (return `freeInterestReply` next to `creditOnInterest`)
- Test: `src/__tests__/lib/cycle-flags.test.ts`, `src/__tests__/admin/new-cycle-settings.test.ts`, `src/__tests__/suggestions/mutual.test.ts`

**Interfaces:**
- Produces: `CycleFlags.freeInterestReply?: boolean`; admin state/PATCH field `freeInterestReply: boolean`; `/api/suggestions` JSON `freeInterestReply: boolean`; `/api/me/counts` `flags.freeInterestReply` (automatic).

- [ ] **Step 1: Failing tests**
  - cycle-flags: `free_interest_reply` true + credit on → `freeInterestReply: true`; credit off → `false`.
  - admin: PATCH `{ freeInterestReply: true }` stores `"true"`; GET returns the field.
  - mutual (`describe("free «مهتم» reply")`, flags `{ ...on, freeInterestReply: true }`):
    - other side `INTERESTED`, my balance 0 → no throw, `reserveCredits` not called, no `recordCredit` with `INTEREST`, match created, `creditsLeft` = 0 returned.
    - other side `INTERESTED` with `introPreference: "CHAT"` → claim data contains `recipientIntroPreference`/`candidateIntroPreference: "CHAT"`.
    - `FAMILY` with no guardian, free → rejects `GUARDIAN_REQUIRED`; with consent → `parentInfo.updateMany` called.
    - free claim `where` contains the other decision `"INTERESTED"`.
    - other side undecided → charged as today (`INTEREST` row).
    - switch off, other side INTERESTED → charged as today.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/lib/cycle-flags.test.ts src/__tests__/admin/new-cycle-settings.test.ts src/__tests__/suggestions/mutual.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement**
  - `decideSuggestion`: `introChoice = flags.creditOnInterest && interested`; `otherDecision` from `s`; `freeReply = introChoice && !!flags.freeInterestReply && otherDecision === "INTERESTED"`; `charge = introChoice && !freeReply`; `preference = introChoice ? args.introPreference : undefined`; run `checkIntroPreference` when `introChoice`.
  - The free path is one transaction: claim with the other decision `"INTERESTED"` added to `where` + consent + read the balance → `creditsLeft`.
  - Admin card row label "Free «مهتم» reply", hint "Answering someone who already said «مهتم» costs no credit. The first «مهتم» still costs 1." Disabled unless credit on interest is on.
- [ ] **Step 4: Run the same tests plus** `src/__tests__/intro/outcome.test.ts src/__tests__/suggestions/refund.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** "Free «مهتم» reply: switch, admin row and charge rule"

### Task 2: Website (cards, dialog, banners, dashboard, public copy)

**Files:**
- Modify: `src/lib/suggestions/copy.ts`: add `FREE_REPLY_LINE` and `freeReplyCopy` (db-free)
- Modify: `src/components/suggestions/mutual-suggestions-view.tsx` (prop `freeInterestReply`; per-card `free`; button enabled; note; «مهتمون بك» 0-credit banner; balance fallback)
- Modify: `src/components/suggestions/interest-dialog.tsx` (prop `free?: boolean`)
- Modify: `src/app/(ar)/dashboard/suggestions/page.tsx` (pass the flag), `src/contexts/dashboard-context.tsx` (flag type)
- Modify: `src/app/(ar)/dashboard/page.tsx`, `src/components/dashboard/next-step-card.tsx` (a waiting «مهتم» wins over recharge at 0 when free)
- Modify: `src/app/(ar)/faq/faq-data.ts`, `src/app/(ar)/terms/terms-view.tsx`, `src/components/landing/content.ts`, `src/app/(ar)/dashboard/payments/page.tsx` (one free-reply sentence when on)
- Test: `src/__tests__/suggestions/interest-dialog-flow.test.tsx`, `src/__tests__/components/credit-on-interest-copy.test.ts`

**Interfaces:**
- Consumes: `/api/suggestions` `freeInterestReply`, `flags.freeInterestReply`, `OpenFeedItem.likedYou`.
- Produces: `FREE_REPLY_LINE = "الرد بـ«مهتم» على من أبدى اهتمامه بك مجاني."`

- [ ] **Step 1: Failing tests**
  - Dialog with `free` and `credits={0}`: shows `FREE_REPLY_LINE`; no «يستخدم رصيداً واحداً»; submit button present (no recharge footer).
  - Copy: FAQ for credit-on with free on contains `FREE_REPLY_LINE`; free off does not.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement**
  - In the view, the balance after a decision uses the server's `creditsLeft` only, never `balance - 1`, when the card was free.
- [ ] **Step 4: Run** the full `npx vitest run src/__tests__/suggestions src/__tests__/components`. Expected: PASS.
- [ ] **Step 5: Commit** "Website: free «مهتم» reply on cards, dialog, banners and help copy"

### Task 3: Notices and Insights

**Files:**
- Modify: `src/lib/suggestions/mutual.ts` (`notifyInterestShown`), `src/lib/cron/suggestions.ts` (`remindWaitingInterest`)
- Modify: `src/lib/notifications/automatic.ts` (both entries: switch-on variants)
- Modify: `src/app/(en)/admin/insights/page.tsx` (note on "0 credits with a «مهتم» waiting" when the switch is on)
- Test: `src/__tests__/lib/automatic-notifications.test.ts`, `src/__tests__/cron/suggestions.test.ts`, `src/__tests__/suggestions/mutual.test.ts`

**Interfaces:**
- Consumes: `CycleFlags.freeInterestReply`.

- [ ] **Step 1: Failing tests:** switch on and recipient at 0 credits → the body has no «اشح» and contains «والرد مجاني», for both notices; switch off → unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** When the switch is on, skip `topUpLine` and add the free line (gendered, ≤ 1 short sentence). Mirror the texts in `automatic.ts`.
- [ ] **Step 4: Run** the three test files plus `src/__tests__/payments/topup-prompt.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** "Notices: free «مهتم» reply wording; Insights note"

### Task 4: App 1.0.1

**Files:**
- Modify: `naseebak_app/lib/features/home/counts.dart` (`freeInterestReply`)
- Modify: `naseebak_app/lib/features/discovery/suggestions_screen.dart` (per item: `interestDisabled: outOfCredits && !free`, note; sheet `free`; «مهتمون بك» banner)
- Modify: `naseebak_app/lib/features/discovery/interest_sheet.dart` (`free` param)
- Modify: `naseebak_app/pubspec.yaml` → `version: 1.0.1+2`
- Test: `naseebak_app/test/suggestions_flow_test.dart`

**Interfaces:**
- Consumes: `/api/me/counts` `flags.freeInterestReply`, `FeedItem.likedYou`.

- [ ] **Step 1: Failing widget tests:** at 0 credits with flag on, a `likedYou` card's «مهتم» is enabled and shows «الرد بـ«مهتم» مجاني»; a non-liked card is disabled; the sheet in free mode has no «يُخصم رصيد واحد».
- [ ] **Step 2: Run** `flutter test test/suggestions_flow_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `flutter test && flutter analyze`. Expected: all pass, 0 issues.
- [ ] **Step 5: Commit** "App 1.0.1: free «مهتم» reply"

### Task 5: Docs, full checks, local run, Play bundle

- [ ] **Step 1: Update docs:**
  - `CLAUDE.md`: switch list, Money and credits, parked item.
  - `docs/reference/suggestions-and-credits.md`.
  - `naseebak_app/CLAUDE.md`: version 1.0.1 and what is waiting.
- [ ] **Step 2: Run** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: 0 errors, all tests pass, build OK.
- [ ] **Step 3: Local check with the switch on and off:**
  - Website: free reply at 0 credits creates a match, the balance is unchanged, and the chat/family choice is saved.
  - App on the simulator: the same.
- [ ] **Step 4: Play bundle:**
  - `flutter clean && flutter build appbundle --release` (production API by default).
  - Copy to `~/Documents/EvoKey-Projects/naseebak-release-1.0.1/naseebak-1.0.1-2.aab`.
- [ ] **Step 5: Commit and push to GitLab main and GitHub.** Copy the app files to the mirror repo and push it. The website deploy waits for the owner's go-ahead.
