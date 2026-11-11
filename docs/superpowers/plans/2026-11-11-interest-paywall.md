# «مهتم» at 0 credits opens the paywall — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At 0 credits, members who can buy get an enabled «مهتم» whose tap opens a short «انتهى رصيدك» step with a buy button, behind switch `interest_paywall`.

**Architecture:** The server decides once, per member, in `/api/me/counts` (`interestPaywall`). The website (`MutualSuggestionsView` + `InterestDialog`) and the app (`SuggestionsScreen` + a new small sheet) only read that field.

**Tech Stack:** Next.js 16, Vitest + Testing Library; Flutter + Riverpod, flutter_test.

**Spec:** `docs/superpowers/specs/2026-11-11-interest-paywall-design.md`

## Global Constraints

- Switch key `interest_paywall`, default `"false"`; admin state key `interestPaywall`; Admin label "«مهتم» at 0 credits opens the paywall".
- Counts field: `interestPaywall: boolean` (top level, next to `credits`), always present for signed-in members.
- Copy: title `g("انتهى رصيدك", "انتهى رصيدكِ")`; body `CREDIT_ON_INTEREST_LINE`; website button `rechargeToContinue(viewerFemale)` → `/dashboard/payments`; app button `forViewer(female, 'اشحن رصيدك', 'اشحني رصيدكِ')` → `/credits`; «إلغاء».
- «لا» free; free reply (`free_interest_reply` on `likedYou` mutual card) never opens the paywall.
- No hardcoded forbidden Tailwind colours; `amber-` for the warning box (as today).
- Never `git add -A`; no `pubspec.yaml` bump.

## Review Focus

- Free reply at 0 with the paywall on: «مهتم» must still decide for free (website and app), not show the paywall.
- Counts failing / not loaded (website `counts` = switches-off defaults; app `counts == null`): behave as today (locked).
- `NO_CREDITS` while the dialog/sheet is mid-confirm with the paywall on: the dialog becomes the paywall step (choice hidden), not an error line.
- Test phone in a selling country with the switch on: `interestPaywall` false.
- Legacy (non-mutual, `costOnly`) card at 0 with the paywall: the paywall step, not the credit confirm.

---

### Task 1: Switch and the server decision

**Files:**
- Modify: `src/lib/settings.ts` (DEFAULTS), `src/app/api/admin/settings/new-cycle/route.ts`, `src/components/admin/new-cycle-settings-card.tsx`, `src/app/api/me/counts/route.ts`, `src/contexts/dashboard-context.tsx` (`CycleCounts.interestPaywall?: boolean`)
- Create: `src/lib/payments/interest-paywall.ts`
- Test: `src/__tests__/payments/interest-paywall.test.ts`, extend `src/__tests__/admin/new-cycle-settings.test.ts`, `src/__tests__/admin/new-cycle-settings-card.test.tsx`, `src/__tests__/api/me-counts-pro.test.ts`

**Interfaces:**
- Produces: `interestPaywallFor(input: { creditOnInterest: boolean; country: string | null | undefined; phone: string | null | undefined; app: boolean }): Promise<boolean>` — reads `getSetting("interest_paywall")`, `getCountrySettings` + `purchasesAvailable`, `isTestPhone`, and for `app` `appPaymentsEnabled()`. Short-circuits to false without reads when `creditOnInterest` is false or the switch is off.

- [ ] Tests (`interest-paywall.test.ts`, mocked settings): true when all hold; false for switch off, creditOnInterest off, purchases off, test phone, app with app payments off; web ignores app payments.
- [ ] Implement; counts route adds `interestPaywall: await interestPaywallFor({...})` (`.catch(() => false)`), using `me.country`, `me.phone`, `isAppRequest(request)`; included in the early `!flags.introRequests` answer as `false`.
- [ ] Admin: route state/schema/PATCH, card row (quickOff; disabled unless creditOnInterest), tests extended.
- [ ] `npx vitest run src/__tests__/payments src/__tests__/admin src/__tests__/api` green; commit.

### Task 2: Website dialog and card

**Files:**
- Modify: `src/components/suggestions/interest-dialog.tsx`, `src/components/suggestions/mutual-suggestions-view.tsx`
- Test: `src/__tests__/suggestions/interest-paywall-view.test.tsx` (pattern of `free-reply-view.test.tsx`)

**Interfaces:**
- Consumes: `counts.interestPaywall`.
- `InterestDialog`: when `noCredits` (`!free && credits <= 0`), render the paywall step: title `g("انتهى رصيدك","انتهى رصيدكِ")`, description `CREDIT_ON_INTEREST_LINE`, no radiogroup / guardian / consent / cost box, footer = recharge link + «إلغاء». Applies also to `costOnly`.
- View: `const paywall = !!counts.interestPaywall;` button `disabled={acting === item.id || (outOfCredits && !isFreeReply(item) && !paywall)}`; `onInterested` unchanged (opens the dialog under creditOnInterest).

- [ ] Tests: paywall on + 0 credits → «مهتم» enabled, click → dialog with «انتهى رصيدك», link to `/dashboard/payments`, no radio, no `/decide` call; paywall off → disabled (today); free reply with paywall on → radio shown, decide called; female viewer → «انتهى رصيدكِ» and «اشحني»; `NO_CREDITS` from decide while in dialog → paywall step shown.
- [ ] Implement; run the new test plus `free-reply-view`, `x4a-review-fixes`, `wm07-fetch-rules`; commit.

### Task 3: App

**Files:**
- Modify: `naseebak_app/lib/features/home/counts.dart` (`Counts.interestPaywall`, default false), `naseebak_app/lib/features/discovery/suggestions_screen.dart`
- Create: `naseebak_app/lib/features/discovery/recharge_sheet.dart` (`RechargeSheet.show(BuildContext, {required bool viewerFemale})`: title, `CREDIT_ON_INTEREST_LINE` text, primary button key `Key('recharge-sheet-buy')` → pop then `context.push('/credits')`, «إلغاء»)
- Test: extend `naseebak_app/test/suggestions_flow_test.dart` (`counts()` helper gets `interestPaywall`)

- [ ] Screen: `paywall = (counts?.interestPaywall ?? false) && ref.watch(appPaymentsProvider)`; `interestDisabled: outOfCredits && !_freeReply(counts, item) && !paywall`; at top of `_interested`, if out of credits, not free reply, paywall → `RechargeSheet.show` and return. `_handleError` `NO_CREDITS` and `InterestSheet` unchanged (it already offers recharge).
- [ ] Tests: paywall on, 0 credits → «مهتم» enabled, tap → sheet, buy → `/credits` route; paywall off → disabled (existing test); free reply with paywall → interest sheet, not recharge sheet; appPayments false + paywall true → disabled.
- [ ] `flutter analyze && flutter test`; commit.

### Task 4: Docs and full checks

- [ ] CLAUDE.md switch line for `interest_paywall` and the app-version list entry; `naseebak_app/CLAUDE.md` note.
- [ ] `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`; `flutter analyze && flutter test`; commit.
