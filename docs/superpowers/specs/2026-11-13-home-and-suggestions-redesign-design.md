# Home and suggestions redesign (website + app)

Date: 2026-11-13. Status: approved by the owner (mockup and answers below), not built.

## Why

The owner's words: "home and suggestions page need redesign to make it simple and modern … a note in suggestion
page i have to click two buttons to see all user info".

- **Two taps (app):** on a suggestion card, «عرض جميع التفاصيل» (`suggestion_card.dart`, `_Details`) opens only
  the key facts of `PersonDetailsView`. The rest is behind a second button, «عرض كل التفاصيل»
  (`shared/widgets/person_details_view.dart`). On the website it is one tap, but the closed card hides the job
  and «نبذة» too.
- **Too much on home:** the website home stacks up to ten blocks (greeting, banner, setup step, «بانتظار ردّك»,
  suggested matches, Pro card, poll, conversations, guardian consent, profile strength). The app home has a
  navy header, three status chips, the suggestions strip, profile strength and the poll.

Success: a member opens home and sees at once what waits on them; on the suggestions page every detail about a
person is at most **one tap** away, and the card itself already answers the main questions.

## Decisions (owner, 2026-11-13)

| Question | Answer |
|---|---|
| Where | **Both**: website and the Flutter app |
| Full information | **Short card + full profile**: the card shows the key facts and «عنها»; one tap (on the card or «الملف كاملاً») opens everything in one scroll, «مهتم» / «لا» pinned at the bottom |
| Home leads with | **What needs me now**: greeting + credits, then only what waits on the member |
| Poll, Pro card, profile strength | **Keep all three, each shrunk to one small row**, below the "needs me" part (owner picked all three plus "keep all, just smaller"; read as: they stay, one row each) |
| Style | **The 2026-11-12 app mockup**: plain, realistic; light grey background, white grouped cards, navy actions, gold only for small accents |
| Card facts | All eight offered: **job, education, religiosity, hijab (women) / beard (men), height, marital status, smoking, family/tribe** |
| Approach | **A: the profile opens over the list** (below) |

Mockup shown to the owner: `docs/design-mockup/home-suggestions-redesign-2026-11-13.html` (app home, app
suggestions, app full profile; website desktop home, desktop suggestions with the profile panel open, phone
suggestions and phone profile). Names and numbers there are examples.

## Approaches

- **A. Profile opens over the list (chosen).** Website: a full-screen sheet on phones, a side panel on desktop.
  App: a pushed screen (back «الاقتراحات»). Uses the `FeedCandidate` already loaded with the feed, so it opens
  at once, needs no new API, keeps the list's scroll position, and «مهتم» / «لا» call the same code as the card.
  Trade-off: no shareable link to one profile (not needed).
- **B. A page per suggestion** (`/dashboard/suggestions/[id]`, app `/suggestions/:id`). Needs a new server route
  that returns one card with every privacy and gate check repeated, an extra load, and the list can lose its
  place. Gains deep links from pushes to one person: not needed now. Rejected.
- **C. Fix only the app's second button.** Solves the complaint but not "simple and modern". Rejected.

## Goals

1. Home on both platforms: greeting, credits, bell; the one banner slot; then «بانتظار ردّك», «مهتمون بك»,
   «اليوم»; then «المزيد» with one small row each for the poll, profile strength and Pro.
2. Suggestion card on both platforms: header + eight facts + «عنها» (2 lines) + «الملف كاملاً» + answers. No
   "show details" button inside the card.
3. Full profile, one tap from the card, with **every** field `CandidateDetails` / `PersonDetailsView` show today,
   open in one scroll (no collapsed sections), and the answers pinned.

## Non-goals

- No change to who is suggested, order, counts, credits, refunds, the free reply, the paywall, «لا» undo,
  report/block, empty states or the matches tab logic.
- No photos: avatars stay locked/initials exactly as today (`photoLocked`, never a photo before a mutual «مهتم»).
- No API or schema change. No new analytics events.
- Other pages that use `PersonCard` (matches, sent requests, admin) keep their current card.
- Chat files are out of scope (another session is rebuilding chat).

## Anti-goals (a failure even if it works)

- A member can tap «مهتم» from the profile without seeing the same credit line the card shows («مهتم» يستخدم
  رصيداً واحداً / free reply / recharge), or the profile bypasses the paywall or the 0-credit lock.
- Any photo, contact detail or guardian data appears in the card or the profile.
- The website's switch off does not restore today's pages exactly.
- Hardcoded colours or text under 12 px (the design-system guard test).

## Design

### Home (both)

Order, top to bottom. A block with nothing in it is not shown.

1. **Header:** «صباح الخير / مساء الخير» + first name; credits pill (opens payments / `/credits`); bell. Website
   desktop keeps the sidebar; the top bar keeps credits + bell.
2. **One banner slot**: unchanged logic (website `BannerSlot` / `pickBanner`, app `_BannerSlot`).
3. **Setup not finished**: `NextStepCard` stays as today, replacing everything below it that needs the gate.
4. **«بانتظار ردّك»**: one white grouped list, a row per thing waiting on me (family request, guardian consent
   missing, a match needing a step), with the days left in red when the client already has them (see calls below). Website: what today's «بانتظار ردّك»
   block and `GuardianConsentCard` show, as rows. App: what today's three status chips point to, as rows.
5. **«مهتمون بك»**: up to 3 (phone) / 5 (desktop) people from the «interested» tab: locked avatar, «الاسم، العمر»,
   city; «عرض الكل» opens the tab. One note under it while `free_interest_reply` is on: «ردّك بـ«مهتم» على من
   اهتم بك مجاني.» Hidden when the tab is empty.
6. **«اليوم»**: a grouped list: «اقتراحات جديدة» with the count (opens «جديدة»), then conversations with
   something new (website: today's "conversations to continue" rows, max 3; app: one row «المحادثات» with the
   unread count when chat is on).
7. **«المزيد»** (small grey heading), one 44 px row each, only when shown today:
   - «سؤال الأسبوع» with «جديد» while unanswered; tapping opens the poll (website: expands `PollCard` in place or
     opens it in a dialog, builder's call; app: pushes the poll screen or a sheet with `PollCard`).
   - «ملفك مكتمل N%» with a small bar, only while something is left (same rule as today's profile strength).
   - «عضوية Pro», only where `proIntroShown` / `counts.pro.showPage` say so today; ✕ hiding is not needed (it is
     one small row now).

The website «توافقات مقترحة» strip and the app `_SuggestionsStrip` are dropped from home: «اقتراحات جديدة» in
«اليوم» replaces them.

### Suggestion card (both)

- **Header:** locked avatar (56 px), «الاسم، العمر», «المدينة · نشطة اليوم» (green dot), score as a small gold
  pill «توافق 86%» (replaces the ring), Pro badge as today.
- **Status line** when there is one, as today: «أبدت اهتمامها بك» (green), «بانتظار الطرف الآخر · حتى …» (amber),
  «لم يحصل توافق» (muted).
- **Facts grid** (2 columns on phones, 3 on wide website cards), each a soft tile with label + value, empty ones
  skipped, gendered with `describeOption()` / app `OptionLabels.describe`:
  العمل · التعليم · الالتزام · الحجاب (women, `veilLabel`) / اللحية (men) · الطول · الحالة الاجتماعية ·
  التدخين · العشيرة / القبيلة (`tribeLabel(country)`, the app's `tribeLabel`).
  **Lebanon:** «المذهب» replaces «العشيرة/القبيلة» (builder's call recorded here: keeps eight tiles; the sect is
  what Lebanese members filter on).
- **«عنها» / «عنه»** (gendered): `aboutMe`, two lines, clipped. Hidden when empty.
- **«الملف كاملاً ‹»** row. The whole card (outside the buttons and ⋮) also opens the profile.
- **Answers:** today's lines and buttons unchanged (credit line, free reply, recharge link, «مهتم» / «لا» / ⋮,
  waiting and declined notes). The «why» line moves to the profile.

### Full profile (both)

- Opens from a card tap or «الملف كاملاً». Website: `Sheet`-style panel from the inline-end side on ≥ md
  (≈ 440 px, list dimmed behind), full-screen on phones; ✕, Esc and browser back close it and focus returns to the
  card. App: a pushed route over the tab with back «الاقتراحات», the item passed in memory (no fetch).
- **Content, one scroll, nothing collapsed:** big locked avatar, name, age, city, activity, score; «الصور تظهر
  بعد التوافق المتبادل فقط»; the why line (`reason`, soft gold); «عنها»; then grouped lists (label right, value
  left): المعلومات الشخصية, التعليم والعمل, الدين ونمط الحياة, العائلة, الهوايات والاهتمامات, «قيم الأسرة».
  Every field `CandidateDetails` (website) and `PersonDetailsView` (app) show today, same labels and helpers.
- **Pinned bottom:** the same answer block as the card (credit line + «مهتم» / «لا»); in «بانتظار ردّهم» only the
  waiting note; ⋮ (report/block) in the header. Answering closes the profile and the card reacts exactly as if
  answered on the card (same `onInterested` / `declineWithUndo` / app callbacks, so the interest dialog,
  paywall, undo and errors are unchanged).

### Website switch

- New setting `dashboard_redesign` (default `"false"`), in `DEFAULTS` (`src/lib/settings.ts`), Admin → Settings
  toggle, sent to the client as `counts.flags.dashboardRedesign` (or the same place the other flags travel).
- On: new home and new suggestion cards + profile sheet. Off: today's components untouched. Both versions live
  side by side; the old ones are not edited.
- The app has no switch: the redesign ships with its version (owner told before building; it needs a new app
  version).

## Constraints

- Brand tokens only (`accent-ink`, `accent-soft`, `primary`, `muted-ink` …), type scale, nothing under 12 px,
  radius 8/12/16/24, tap targets ≥ 44 px, RTL logical properties, Western digits, gendered copy (`forViewer`,
  `forPartner`, `g()`).
- Client components import no runtime value from db modules (use `feed-types.ts`).
- Keep the existing feed tests passing; the website old path must stay byte-for-byte in behaviour with the switch
  off.
- App: keep old API compatibility (no new fields needed). The app work lands in its own version after 1.3.0.

## Calls made after the builder check (not asked of the owner; open to correction)

1. **No API change on home.** «بانتظار ردّك» rows show only what `/api/me/counts` already sends (e.g. one row
   «طلب تعارف بانتظار ردّك» from `pendingIntros` / `pendingIntroMatchId`, one row for `actionableMatches`). No
   per-item deadline unless the client already has it; the red "days left" in the mockup is dropped where the data
   isn't there. A row per item only where the client already has the items.
2. **Home is read-only.** Tapping a person in «مهتمون بك» opens the «مهتمون بك» tab (focused on that card where
   cheap); the full profile and the answer buttons live only on the suggestions page.
3. **Guardian consent stays a card.** `GuardianConsentCard` keeps its wording, in-place «أوافق» and dismiss; it sits
   in the "needs me" part (after «بانتظار ردّك»), unchanged. Privacy consent is not reshaped.
4. **The switch covers home and the suggestions page only.** The dashboard layout, sidebar, top bar and other pages
   are untouched; the new pieces use the existing page background and tokens.
5. **One global switch**, like every other switch. Test locally and on a production build before turning it on.
6. **All three tabs** use the new card and profile. In «بانتظار ردّهم» and on declined cards the pinned area shows
   only today's notes (and ⋮), no «مهتم» / «لا».
7. **Behaviour kept from the dropped strips:** the website home's first «جديدة» feed request (`?topup=1`) and the
   app's counts re-read after setup (QA A-L01) keep running even though the suggestions strip leaves home.

## Left to the builder

- Exact component names and file split (suggested: `src/components/suggestions/suggestion-card-v2.tsx`,
  `profile-sheet.tsx`, `src/components/dashboard/home-v2.tsx`; app `features/discovery/suggestion_card.dart`
  rewrite + `candidate_profile_screen.dart`, `features/home/home_screen.dart` rework).
- How the poll opens from its row (dialog vs in-place).
- Animations within the motion tokens.
- Desktop grid width of the «جديدة» list (two columns as today is fine).
