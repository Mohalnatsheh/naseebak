# Home and Suggestions Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A simpler home and suggestions page on the website (behind the switch `dashboard_redesign`) and in the Flutter app (next app version), with a short card and the whole profile one tap away.

**Architecture:** Website: new components sit beside the old ones; `page.tsx` and `mutual-suggestions-view.tsx` pick old or new by `counts.dashboardRedesign`. The card's answer block is extracted once and used by the old card, the new card and the profile sheet, so «مهتم» / «لا» run the same code everywhere. App: the card is rebuilt, a pushed `CandidateProfileScreen` returns the member's answer to the list, which runs its existing handlers; home is reworked in place.

**Tech Stack:** Next.js 16 / React 19 / Tailwind v4 tokens / shadcn `Sheet` + `Dialog`, Vitest + Testing Library; Flutter (Riverpod, go_router), `flutter test`.

**Spec:** `docs/superpowers/specs/2026-11-13-home-and-suggestions-redesign-design.md` (mockup: `docs/design-mockup/home-suggestions-redesign-2026-11-13.html`).

## Global Constraints

- Brand tokens only; no `blue-`, `violet-`, `purple-`, `rose-`, `pink-`, `sky-`, `cyan-`, `indigo-`, `slate-`, `gray-`, `orange-`; no raw hex; nothing under 12 px (`text-caption` minimum); radius 8/12/16/24; tap targets ≥ 44 px.
- RTL logical properties, Western digits, gendered copy (`forViewer`, `forPartner`, `g()` / app `g`), `describeOption()` / `OptionLabels.describe` for option values, `veilLabel` / `hijabLabel` for the veil.
- No photo ever before a mutual «مهتم»: avatars use `photoLocked` (web) and the app's locked/initials avatar exactly as today.
- No API or schema change except the one additive boolean `dashboardRedesign` in `/api/me/counts`.
- Switch `dashboard_redesign`, default `"false"`. Off = today's website exactly (old components unedited apart from the extraction in Task 5).
- Client components import nothing at runtime from db modules; new helpers are db-free.
- Never `git add -A`; stage by path. Don't touch `src/components/chat/` or `naseebak_app/lib/features/chat/`.
- Before calling the website done: `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. App: `flutter analyze && flutter test` in `naseebak_app/`.

## Review Focus

1. **0 credits:** in the profile sheet/screen, «مهتم» shows the same line and state as the card (greyed, recharge link, or paywall when `interestPaywall`; free reply stays tappable). Tests in Tasks 5 and 9.
2. **Answering from the profile:** the profile closes and the list behaves exactly like a card answer (interest dialog, undo toast for «لا», card removed, counts refreshed); an error keeps the card. Tests in Tasks 5 and 9.
3. **Empty fields:** a candidate with no job/about/height/tribe shows no empty tiles, no «عنها» heading, and no empty profile section. Tests in Tasks 2 and 7.
4. **«بانتظار ردّهم» and declined cards:** no «مهتم» / «لا» on the card or profile, only the notes and ⋮. Tests in Tasks 5 and 9.
5. **Switch off:** the website renders today's `PersonCard` and today's home. Tests in Tasks 5 and 6.

---

### Task 1: Website switch `dashboard_redesign`

**Files:**
- Modify: `src/lib/settings.ts` (DEFAULTS + getter)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts` (GET + PUT field)
- Modify: `src/components/admin/new-cycle-settings-card.tsx` (toggle, next to «Chat delete»)
- Modify: `src/app/api/me/counts/route.ts` (both `NextResponse.json` returns)
- Modify: `src/contexts/dashboard-context.tsx` (counts type)
- Test: `src/__tests__/api/me-counts-redesign.test.ts`

**Interfaces:**
- Produces: `getDashboardRedesign(): Promise<boolean>` in `src/lib/settings.ts`; counts JSON field `dashboardRedesign: boolean`; context `counts.dashboardRedesign?: boolean`; admin PUT body `{ dashboardRedesign?: boolean }`.

- [ ] **Step 1: Write the failing test** (copy the mocking style of `src/__tests__/api/me-counts-pro.test.ts`)
  - `it("sends dashboardRedesign true when the switch is on")`: setting `dashboard_redesign` = `"true"` → `json.dashboardRedesign === true`.
  - `it("sends dashboardRedesign false by default")`: no row → `false`.
  - `it("sends it on the early return too")`: `intro_requests_enabled` off → `json.dashboardRedesign` is a boolean.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/api/me-counts-redesign.test.ts`. Expected: FAIL (`undefined`).
- [ ] **Step 3: Implement.** Add `dashboard_redesign: "false"` to `DEFAULTS` with a one-line comment (2026-11-13, home + suggestions redesign); `getDashboardRedesign()` like `getChatDeleteEnabled()`; read it in the counts route next to `interestPaywall` and add it to both returns; admin route GET `dashboardRedesign`, PUT `z.boolean().optional()` → `setSetting("dashboard_redesign", …)`; admin card toggle labelled "Dashboard redesign (home + suggestions)" with help text "Off = the current home and suggestion cards."
- [ ] **Step 4: Run** the test file again and `src/__tests__/api/me-counts-pro.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** (`git add` the six paths) — `"Switch dashboard_redesign (off by default), sent in /api/me/counts"`.

### Task 2: Card facts helper (website, db-free)

**Files:**
- Create: `src/lib/suggestions/card-facts.ts`
- Test: `src/__tests__/suggestions/card-facts.test.ts`

**Interfaces:**
- Consumes: `FeedCandidate` from `src/lib/suggestions/feed-types.ts`.
- Produces: `export interface CardFact { key: string; label: string; value: string }` and `cardFacts(c: FeedCandidate, partnerGender: "MALE" | "FEMALE", country: CountryCode): CardFact[]`.

- [ ] **Step 1: Write the failing tests**
  - Full Jordanian woman → keys in order `["job","education","religiosity","veil","height","maritalStatus","smoking","tribe"]`; labels `العمل`, `التعليم`, `الالتزام`, `الحجاب`, `الطول`, `الحالة الاجتماعية`, `التدخين`, `tribeLabel("JO")`; height value `"165 سم"`.
  - Man → key `"beard"`, label `اللحية`, value `نعم`/`لا` as `CandidateDetails` shows it; no `"veil"`.
  - Lebanon with `sect: "سني"` → last key `"sect"`, label `المذهب`, no `"tribe"`. Lebanon with `sect: null` → falls back to `"tribe"`.
  - Empty fields (`job: null`, `height: null`, `tribe: ""`) → those keys absent, no item with an empty value.
  - Values are gendered: `religiosity: "ملتزم"` for a FEMALE partner → `describeOption("religiosity","ملتزم","FEMALE")`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/suggestions/card-facts.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** with the same helpers `CandidateDetails` uses (`describeOption`, `veilLabel`, `tribeLabel`); import only db-free modules.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** — `"cardFacts: the eight facts on the new suggestion card"`.

### Task 3: Profile sheet (website)

**Files:**
- Create: `src/components/suggestions/profile-sheet.tsx`
- Modify: `src/components/suggestions/candidate-details.tsx` (add prop `flat?: boolean`: every `Section` open, no toggle button; default false keeps today)
- Test: `src/__tests__/components/profile-sheet.test.tsx`

**Interfaces:**
- Consumes: `CandidateDetails` (`flat`), `WhyLine`, `MemberAvatar`.
- Produces: `ProfileSheet({ item: FeedItem | null, onClose: () => void, footer: ReactNode, menu?: ReactNode })`. Renders nothing when `item` is null. Phone (< md): full-screen; ≥ md: shadcn `Sheet` from the inline-end side, width 440 px. Title = «الاسم، العمر».

- [ ] **Step 1: Write the failing tests**
  - Renders the name, «الصور تظهر بعد التوافق المتبادل فقط», `item.reason`, `aboutMe`, and every `CandidateDetails` label for a full candidate with no button named «إخفاء» or «عرض جميع التفاصيل».
  - `flat` sections have no toggle: `queryAllByRole("button", { expanded: true })` is empty inside the details.
  - Renders the `footer` node; Escape calls `onClose`; the ✕ button (aria-label «إغلاق») calls `onClose`.
  - `item: null` renders nothing.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/profile-sheet.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Order: avatar (`photoLocked`), name/age, «المدينة · activity · توافق N%», lock line, `WhyLine`, «عنها»/«عنه» (`forPartner`), `<CandidateDetails c flat />`; footer pinned (`sticky bottom-0`), `menu` in the header. Browser back closes it: push `#profile` with `history.pushState` on open and close on `popstate` (my call; keeps the URL unchanged otherwise).
- [ ] **Step 4: Run** the test and `src/__tests__/components/candidate-details-sections.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** — `"ProfileSheet: the whole profile in one scroll"`.

### Task 4: New suggestion card (website)

**Files:**
- Create: `src/components/suggestions/suggestion-card.tsx`
- Test: `src/__tests__/components/suggestion-card.test.tsx`

**Interfaces:**
- Consumes: `cardFacts` (Task 2), `MemberAvatar`, `ProBadge`.
- Produces: `SuggestionCard({ item: FeedItem, partnerGender, country, status?: ReactNode, onOpen: () => void, actions: ReactNode })`.

- [ ] **Step 1: Write the failing tests**
  - Shows «نسرين، 27», city, activity, «توافق 86%», eight fact labels, «عنها» text, and a «الملف كاملاً» button; no «عرض جميع التفاصيل».
  - Clicking the card body or «الملف كاملاً» calls `onOpen` once; clicking a button inside `actions` does not (`stopPropagation` / target check).
  - Enter on the focused card calls `onOpen` (role `button` region with aria-label «الملف كاملاً: نسرين»).
  - No `aboutMe` → no «عنها» heading. `status` node renders under the header.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/suggestion-card.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** per spec "Suggestion card": 56 px locked avatar; score as `bg-accent-soft text-accent-ink` pill; facts grid `grid-cols-2 lg:grid-cols-3`, tiles `bg-muted rounded-xl`; about `line-clamp-2`; «الملف كاملاً» row with `ChevronLeft`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** — `"SuggestionCard: short card with eight facts"`.

### Task 5: Wire the new card and sheet into the suggestions page

**Files:**
- Modify: `src/components/suggestions/mutual-suggestions-view.tsx`
- Test: `src/__tests__/suggestions/redesign-view.test.tsx` (copy setup from `free-reply-view.test.tsx` / `interest-paywall-view.test.tsx`)

**Interfaces:**
- Consumes: `counts.dashboardRedesign` (Task 1), `SuggestionCard` (Task 4), `ProfileSheet` (Task 3).
- Produces: inside the view, `renderAnswers(item: FeedItem, index: number, opts?: { onDone?: () => void }): ReactNode` — today's `actions` block moved verbatim; `onDone` runs after `onInterested` / `declineWithUndo` are called. `renderStatus(item)` returns today's badges. Old `PersonCard` path calls both, unchanged in output.

- [ ] **Step 1: Write the failing tests**
  - Switch off → today's card: «عرض جميع التفاصيل» present (regression).
  - Switch on, tab «جديدة» → clicking the card opens the sheet (dialog named «نسرين، 27»); «مهتم» in the sheet calls `POST /api/suggestions/<id>/decide` through the same interest dialog path as the card and the sheet closes.
  - Switch on, «لا» in the sheet → sheet closes, the undo toast appears, card leaves the list.
  - Switch on, 0 credits, `interestPaywall` false → sheet «مهتم» disabled and the recharge link shown; `interestPaywall` true → «مهتم» enabled and opens the paywall step; `likedYou` with free reply → enabled with the free-reply line.
  - Switch on, tab «بانتظار ردّهم» → card and sheet show the waiting note, no button named «مهتم» or «لا»; declined item shows «لم يحصل توافق».
- [ ] **Step 2: Run** `npx vitest run src/__tests__/suggestions/redesign-view.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Extract `renderAnswers` / `renderStatus` first (old path output identical), then `const redesign = !!counts?.dashboardRedesign`; when on, map items to `SuggestionCard` and keep `openId` state for one `ProfileSheet` whose `footer` is `renderAnswers(item, index, { onDone: close })` and `menu` the ⋮ menu. Drop the `WhyLine` from the new card (it lives in the sheet).
- [ ] **Step 4: Run** this file plus `free-reply-view`, `interest-paywall-view`, `interest-dialog-flow`, `dealbreakers-reload`. Expected: all PASS.
- [ ] **Step 5: Commit** — `"Suggestions page: new card and profile sheet behind dashboard_redesign"`.

### Task 6: Website home v2

**Files:**
- Create: `src/components/dashboard/home-v2.tsx`
- Modify: `src/app/(ar)/dashboard/page.tsx` (early `if (counts?.dashboardRedesign) return <HomeV2 … />` after the same loading/error/suspended guards it has today)
- Test: `src/__tests__/components/home-v2.test.tsx`

**Interfaces:**
- Consumes: `useDashboardData()` (`profile`, `counts`), `BannerSlot`, `NextStepCard`, `GuardianConsentCard`, `PollCard`, `proIntroShown`, `homeZeroCreditLine`, `matchesHref`, `listTimeLabel`, `MemberAvatar`.
- Produces: `HomeV2()`; section ids `home-waiting`, `home-interested`, `home-today`, `home-more` (for tests).

- [ ] **Step 1: Write the failing tests**
  - Order: greeting («صباح الخير/مساء الخير، <name>»), banner slot, `home-waiting`, guardian card, `home-interested`, `home-today`, `home-more`.
  - `pendingIntros: 0`, `actionableMatches: 0` → no `home-waiting`; `pendingIntros: 1` → a row «طلب تعارف بانتظار ردّك» linking to `matchesHref(pendingIntroMatchId)`.
  - Interested feed with 6 items → 5 people rendered (the 4th and 5th carry `max-md:hidden`, so phones show 3), each a link to `/dashboard/suggestions?tab=interested`; empty feed → no `home-interested`; free-reply note only when `counts.flags.freeInterestReply`.
  - «اقتراحات جديدة» row shows the «جديدة» count and links to `/dashboard/suggestions`.
  - On mount it still calls `GET /api/suggestions?page=1` (top-up) once, then `/api/suggestions/feed?tab=interested&page=1` and `/api/chats` (only when chat is on or `hasChats`).
  - `home-more`: poll row only when the poll API returns a question; profile row only below 100%; Pro row only when `proIntroShown(...)` is true. Clicking the poll row opens a `Dialog` containing `PollCard`.
  - Setup unfinished (`qualifiesForSuggestions` false) → `NextStepCard` and none of the sections above.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/home-v2.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** per spec "Home"; rows are 52 px (44 px in «المزيد») grouped lists; the poll row reads the same poll endpoint `PollCard` uses and shows «جديد» while unanswered.
- [ ] **Step 4: Run** the test and the existing dashboard home tests (`npx vitest run src/__tests__ -t home`). Expected: PASS.
- [ ] **Step 5: Commit** — `"Home v2 behind dashboard_redesign: what needs me now first"`.

### Task 7: App card facts + always-expanded details

**Files:**
- Create: `naseebak_app/lib/features/discovery/card_facts.dart`
- Modify: `naseebak_app/lib/shared/widgets/person_details_view.dart` (param `bool alwaysExpanded = false`: show `more` + `texts`, no toggle)
- Test: `naseebak_app/test/card_facts_test.dart`

**Interfaces:**
- Produces: `class CardFact { final String key, label, value; }`, `List<CardFact> cardFacts(PersonDetails p, {required bool female, required String tribeLabel, required bool lebanon})`; `PersonDetailsView(alwaysExpanded: true)`.

- [ ] **Step 1: Write the failing tests** — same five cases as Task 2 (order, beard for men, Lebanon sect swap and fallback, empty fields skipped, gendered values via `OptionLabels.describe`); plus `PersonDetailsView(alwaysExpanded: true)` shows «الطول» and «نبذة» text and finds no «عرض كل التفاصيل».
- [ ] **Step 2: Run** `cd naseebak_app && flutter test test/card_facts_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again plus `flutter test test/lebanon_test.dart`. Expected: PASS.
- [ ] **Step 5: Commit** — `"App: cardFacts and always-expanded person details"`.

### Task 8: App candidate profile screen

**Files:**
- Create: `naseebak_app/lib/features/discovery/candidate_profile_screen.dart`
- Test: `naseebak_app/test/candidate_profile_test.dart`

**Interfaces:**
- Consumes: `PersonDetailsView(alwaysExpanded: true)` (Task 7), `FeedItem` / `FeedTab` from `suggestion_models.dart`.
- Produces: `enum ProfileAnswer { interested, declined }`; `CandidateProfileScreen({required FeedItem item, required FeedTab tab, required bool candidateFemale, required String tribeLabel, required Widget answerNote, required bool interestEnabled, String interestLabel = 'مهتم', VoidCallback? onReport, VoidCallback? onBlock})`; opened with `Navigator.of(context).push<ProfileAnswer>(MaterialPageRoute(...))`, pops with the answer.

- [ ] **Step 1: Write the failing tests**
  - Shows the name, the lock line «الصور تظهر بعد التوافق المتبادل فقط», `reason`, all details, back button labelled «الاقتراحات».
  - Tapping «مهتم» pops `ProfileAnswer.interested`; «لا» pops `ProfileAnswer.declined`.
  - `interestEnabled: false` → «مهتم» disabled; `answerNote` shown above the buttons.
  - `tab: FeedTab.waiting` → no «مهتم»/«لا» buttons; ⋮ menu shows «إبلاغ وحظر» when `onReport` is set.
- [ ] **Step 2: Run** `flutter test test/candidate_profile_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement** per spec "Full profile"; buttons in a bottom bar 52 px, safe-area aware.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** — `"App: candidate profile screen (whole profile, one tap)"`.

### Task 9: App suggestion card + wiring

**Files:**
- Modify: `naseebak_app/lib/features/discovery/suggestion_card.dart` (remove `_Details`; header, status pill, facts grid, «عنها»/«عنه», «الملف كاملاً», answers; new callback `VoidCallback onOpen`)
- Modify: `naseebak_app/lib/features/discovery/suggestions_screen.dart` (`onOpen` pushes the profile, then calls the same `onInterested` / `onDecline` handler the card uses)
- Test: `naseebak_app/test/suggestions_flow_test.dart` (extend)

**Interfaces:**
- Consumes: `cardFacts` (Task 7), `CandidateProfileScreen` / `ProfileAnswer` (Task 8).

- [ ] **Step 1: Write the failing tests**
  - Card shows eight fact labels and «الملف كاملاً»; finds no `Key('card-details-open')`.
  - Tapping the card pushes `CandidateProfileScreen`; «مهتم» there runs the same flow as the card's «مهتم» (interest sheet / decide call) and the card leaves the list.
  - «لا» from the profile → same undo snackbar as the card.
  - 0 credits, no paywall → profile «مهتم» disabled; `counts.interestPaywall` → enabled and opens `RechargeSheet`; `likedYou` with free reply → enabled.
  - Waiting tab → profile has no answer buttons.
  - Short phone (`MediaQuery` 360×640): card shows the first 4 facts only and «مهتم»/«لا» stay on screen (my call replacing today's `fold`).
- [ ] **Step 2: Run** `flutter test test/suggestions_flow_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.** `answerNote` / `interestEnabled` passed to the profile are computed by the same code that builds the card's credit line and button state (extract it into one private method in `suggestions_screen.dart` used by both).
- [ ] **Step 4: Run** `flutter test`. Expected: all PASS.
- [ ] **Step 5: Commit** — `"App: short suggestion card, full profile one tap away"`.

### Task 10: App home rework

**Files:**
- Modify: `naseebak_app/lib/features/home/home_screen.dart`
- Test: `naseebak_app/test/home_redesign_test.dart`

**Interfaces:**
- Consumes: `Counts` (`counts.dart`), `PollCard`, `ProfileStrengthCard` logic, `_BannerSlot`, the interested feed via `suggestions_repository.dart` (`SuggestionsRepository.feed(FeedTab.interested, page: 1)`).

- [ ] **Step 1: Write the failing tests**
  - Light header: greeting + first name, credits pill (opens `/credits`), bell — no navy header block.
  - Order: banner, «بانتظار ردّك» (only with something waiting, rows from what the three status chips use today), «مهتمون بك» (up to 3, tap → suggestions tab `interested`; hidden when empty; free-reply note when the flag is on), «اليوم» («اقتراحات جديدة» + count; «المحادثات» with unread count when chat is on), «المزيد».
  - «المزيد» rows: «سؤال الأسبوع» opens a bottom sheet with `PollCard`; «ملفك مكتمل N%» only below 100%, tap goes where `ProfileStrengthCard` goes today; «عضوية Pro» only when `counts.pro.showPage`, tap → the Pro screen route used today.
  - The counts re-read after setup (`_Once`, QA A-L01) still runs; `_SuggestionsStrip` is gone.
- [ ] **Step 2: Run** `flutter test test/home_redesign_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement** in the mockup style (`#f4f3f0`-equivalent app background token, white grouped sections radius 12, hairlines); reuse theme tokens from `core/theme/app_theme.dart`, no new hex.
- [ ] **Step 4: Run** `flutter analyze && flutter test`. Expected: no issues, all PASS (update `home_next_step_test.dart` expectations only where they asserted the removed strip/navy header).
- [ ] **Step 5: Commit** — `"App: simpler home, what needs me now first"`.

### Task 11: Full verification and docs

**Files:**
- Modify: `CLAUDE.md` (one bullet under the switches: `dashboard_redesign`, off by default, not on in production; app: redesign in the next version)
- Modify: `naseebak_app/CLAUDE.md` (the version note for the redesign)

- [ ] **Step 1: Run** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: 0 lint problems, no type errors, all tests pass, build succeeds.
- [ ] **Step 2: Run** `cd naseebak_app && flutter analyze && flutter test`. Expected: clean.
- [ ] **Step 3: Check by eye** with a production build (`NODE_ENV=production pnpm build`, `next start -p 3030`, login `0777000001` / `111111`, switch on locally): home and «جديدة» / «مهتمون بك» / «بانتظار ردّهم» at 390 px and 1280 px; open and close the sheet with ✕, Esc and browser back; switch off → old pages. App on the simulator against `http://localhost:3020`.
- [ ] **Step 4: Commit** the two docs — `"Docs: dashboard_redesign switch and app redesign note"`. Do not deploy or turn the switch on in production; ask the owner first.
