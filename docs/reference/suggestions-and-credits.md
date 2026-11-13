# Suggestions and credits

How cards are made, ordered, charged and closed.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Simultaneous suggestions

- Spec: `docs/superpowers/specs/2026-10-16-simultaneous-suggestions-design.md`.
- `CycleFlags.mutualSuggestions`.
- One `Suggestion` row with `flow: MUTUAL` is shown to both people; each records `recipientDecision`/`candidateDecision` once via `POST /api/suggestions/[id]/decide` (`decideSuggestion` in `src/lib/suggestions/mutual.ts`); both INTERESTED → `createMutualMatch` (if that fails after the decision + charge are saved, the call still succeeds with `match: true` and no id, and the daily `healMissingMatches` creates it; the second of two simultaneous «مهتم» looks up the match id for its link).
- **A «لا» closes the row at once** (REJECTED, owner decision 2026-10-18): the other side's card disappears as if it expired (never told it was a «لا», can't pay for it), both slots free and both are topped up; older rows where one side declined are closed (REJECTED) lazily (`expireMutualSuggestions`), by the daily job (`expireMutualSuggestionsAll`) or when the other side tries to decide (404).
- So REJECTED on a MUTUAL row means "someone said «لا»", not "both answered" — read the two decisions.
- Rows expire after 7 days (`MUTUAL_SUGGESTION_DAYS`, lazily + daily job; rows created before the change keep their 14 days).
- **No leak:** no notification on a "لا", and the feed (`src/lib/suggestions/feed.ts`, `GET /api/suggestions/feed?tab=new|interested|waiting`) never returns the row status; the other side's «لا» reaches only someone who said «مهتم» (`declined` on the `waiting` tab, see Interest is shown).
- Tabs (`MutualSuggestionsView`): `new`, `interested`, `waiting`, plus «توافق متبادل»; legacy suggestions and interests in flight show in the same tabs and use their old endpoints (which refuse MUTUAL rows).
- `GET /api/suggestions` returns `mutualView` (flag on, or the user still has an open MUTUAL row after a switch-off).
- Weekly cap counts either side (replaced by the 10-open cap under `credit_on_interest`); busy candidates are skipped in per-request mode, while with `credit_on_interest` a full candidate gets the card hidden (`hiddenFromCandidate`, see Credit on interest → Suggestions).
- Dealbreakers: `Profile.dealbreakers` (`DEALBREAKER_KEYS`, `passesDealbreakers`/`mutuallyAcceptable` in `score.ts`; missing value fails), edited in "شروطي الأساسية" and as "شرط أساسي" chips in the setup/edit wizards (shown when `mutualSuggestions` is on; `PUT /api/profile/dealbreakers`, saved directly, never via the review request; summaries in `src/lib/matching/dealbreaker-summary.ts`).
- Education preferences mean "this level or higher" (the lowest level picked is a minimum: `educationMatches`/`EDUCATION_ORDER` in `score.ts`, used by the dealbreaker, the match % and the reasons; shown as «دبلوم فأعلى»; owner decision 2026-10-18).
- Yes/no preferences are stored as "نعم"/"لا"/"لا يهم" by the wizards: read them with `prefYesNo()` / `wantsNoChildren()` from `score.ts`. "لماذا هذا الاقتراح": `suggestionReason()` in `src/lib/matching/reasons.ts` (viewer's preferences only).
- **Feed order (2026-11-04):** «جديدة» and «مهتمون بك» (`getSuggestionFeed`, used by the website and the app) sort by the other person's `lastActiveAt` group first — ≤3 days, 3–7 days, longer/never (`activityGroup`, `ACTIVITY_GROUP_DAYS` in `src/lib/suggestions/feed.ts`; nobody is hidden) — then by score (credit on interest) or newest; «بانتظار ردهم» keeps its own order.
- Each group is loaded separately (`otherInGroupWhere`, best `SOURCE_LIMIT` = 50 each, ~2 ms per group on production) so active people are never cut off for members with many cards (up to 132 open).
- `lastActiveAt` is read for sorting only, never sent to clients.
- Why: a «مهتم» to someone active within a day became a match 41% of the time vs 12% for someone away 7+ days, and half the paid «مهتم» waiting were on people idle 3+ days.
- **«جديدة» limit (2026-11-04):** at most `NEW_TAB_LIMIT` = 15 cards, the first 15 in that order (`visible.splice` in `getSuggestionFeed`; `countMutualTabs().fresh` capped the same, so every badge says ≤15); «مهتمون بك» and «بانتظار ردهم» are not limited.
- Answering one lets the next in: the app reloads the tab after every answer (`_reload++`), the website reloads «جديدة» quietly (`load(tab, page, { quiet: true })` in `removeAndRefill`).
- Why: men held a median of 24 open cards (up to 132) and ~14,000 cards a week expired undecided.
- Cards past 15 still exist and expire.
- Done 2026-11-08 for everyone, behind `free_interest_reply` (off by default): answering a «مهتم» is free. Design: `docs/superpowers/specs/2026-11-08-free-interest-reply-design.md`.
- **To watch:** overall «مهتم» → match was 25.7% (2,048 «مهتم» given 28 Oct–4 Nov 17:34, read on 4 Nov; 38.1% answered).
- Compare the week after the change (4–11 Nov) with that week, both read on or after 2026-11-18 when every card from both weeks has closed (cards stay open 7 days).

## Matching algorithm

- Weighted scoring in `src/lib/matching/score.ts`: Preference match (50%), Personality similarity (30% — cosine on 5D vectors, redistributed if no quiz), Profile quality (20%).
- Admin generate (shared suggestions off) creates top-3 per user (score >= 30); with `new_suggestions_flow` on it runs `autoSuggestForUser` for every eligible user active in 30 days (same rules and once-a-day notices as the automatic top-up).
- **Automatic suggestions** (`src/lib/matching/auto-suggest.ts`): once a user passes `meetsSuggestionGate` with no pending suggestions, top-3 (score ≥ `minSuggestionScore(flags)` = 30, or 60 with `credit_on_interest` where it tops up to 10 open instead; opposite gender, excluding past suggestions/matches/blocks) are created on profile save and whenever `/api/suggestions` page 1 loads (dashboard + suggestions page).
- Concurrent calls share one run; an empty run retries after 30 min.
- Only `role: USER` accounts get or are given suggestions: an admin who fills in a profile from the dashboard never sees any (test the cycle with the test accounts instead).

## Credit on interest

Spec: `docs/superpowers/specs/2026-10-16-credit-on-interest-design.md`. `CycleFlags.creditOnInterest` = `mutualSuggestions` && setting (Admin → Settings → New user cycle; needs Shared suggestions on — turning Shared suggestions or intro requests off also sets `credit_on_interest` to false, so it never comes back on by itself). Off = the per-request behaviour above, unchanged; matches/chats opened under the flag keep working after a switch-off.
- **Cost:** only "مهتم" costs 1 credit (ledger reason `INTEREST`), "لا" is free.
  - **Refund only when the other side never answered:** when the suggestion closes (7 days, or early: being blocked, dealbreaker sweep, profile refresh, engagement) with one side INTERESTED and the other undecided, `refundUnansweredInterests` (`mutual.ts`; lazy expiry + daily job) gives the credit back once (`Suggestion.interestRefundedAt`, ledger `REFUND`, PAYMENT notice with neutral wording «أُغلق اقتراح أبديت اهتمامك به قبل أن يكتمل التوافق…», never the reason), only for a real `INTEREST` charge and only for rows closed in the last 7 days.
  - A "لا" closes the row as REJECTED at once and is never refunded — the owner accepted that "no refund" lets people infer a "لا".
  - Claim + `reserveCredits` + `recordCredit` run in one transaction in `decideSuggestion` (`mutual.ts`): a lost claim (double tap, expired, blocked) charges nothing.
  - Legacy rows: `/api/suggestions/[id]/like` and `/api/interests/[id]/accept` are the "مهتم" and charge the same.
  - Balance reaching 0 → one PAYMENT notice "انتهى رصيدك — اشحن لتتابع" (`notifyInterestCreditsExhausted`).
  - The match, intro requests, chat and chat → family are free while the flag is on (`requests.ts` reads the current flag when charging, so this also covers pre-flag matches; after a switch-off requests cost 1 credit again)
- **Blocking closes the open shared suggestions between the two** (`closeSuggestionsBetween`, EXPIRED now, refund rule applies, except that the blocker's own unanswered «مهتم» on a card still inside its 7 days stays spent: owner decision 2026-11-06, `interestRefundedAt` stamped with no refund, so an unblock doesn't bring it back; the person blocked still gets theirs), and a partner who deactivated or was suspended doesn't fill one of the 10 open slots (`openMutualWhere`, `openCounts`).
  - The per-user refund check has no time limit; the daily job looks back 7 days.
  - A match lost at the last moment (partner left) refunds both «مهتم» (same PAYMENT notice)
- **Terms page** (`src/app/(ar)/terms/terms-view.tsx`) follows the switches (`buildSections(creditOnInterest)`), like the FAQ
- **Older-style cards close when credit on interest goes live** (owner decision): switching it on runs `closeLegacyInFlight()` (LEGACY PENDING suggestions → EXPIRED); while the flag is on the feed hides legacy items and `/api/interests/[id]/accept` refuses (404), so nothing older is ever charged
- **Refresh after a profile change** (`refreshOpenSuggestions` in `src/lib/suggestions/refresh.ts`, fire-and-forget): an admin-approved profile edit, `PUT /api/profile`, saved partner preferences (`update-request`) and the personality quiz recalculate the match % on the person's shared suggestions they haven't answered, close the ones nobody has answered that no longer fit (either side's dealbreakers, or under the minimum score; admin hand-picks only for dealbreakers), then top up. A card the other side already said «مهتم» on stays open (only its % is updated) until the person answers or it expires (owner decision 2026-11-07; before, it was closed and their credit refunded). The «شروط أساسية» sweep (`dealbreaker-sweep.ts`) follows the same rule.
  - Answered rows are untouched; with shared suggestions off it is only the usual top-up
- **Admin hand-picks** respect the 10-open cap for both people while credit on interest is on (409), but not the minimum score (an admin may pick a lower-scoring pair on purpose)
- **Interest is shown, a «لا» only to someone who said «مهتم»** (owner decisions 2026-10-19, replacing the earlier secrecy rule): the feed has three tabs — `new` (nobody answered), `interested` (`likedYou`: the other side already said «مهتم»; a «مهتم» there is an instant match; it costs 1 credit, or nothing while `free_interest_reply` is on) and `waiting` (my «مهتم»; a row the other side declined carries `declined` and shows «لم يحصل توافق» until its window ends, no refund).
  - Every «مهتم» on an undecided visible card sends «شخص أبدى اهتمامه بك» (`notifyInterestShown`, once per Amman day, url `?tab=interested`, SMS event `interest`); the old neutral «اقتراح بانتظار قرارك» nudge is gone (the cron 2-day reminder keeps that title).
  - Copy everywhere: "نُعلمك عندما يبدي أحدهم اهتمامه بك، أما قرار «لا» فلا يعرفه إلا من أبدى اهتمامه".
  - `countNewItems` = new + interested.
  - No suggestion reminder is sent on a row the other side already declined
- **Split-number chat filter** only joins the sender's own consecutive number-only messages; two people alternating can still pass a number — accepted by the owner (stricter would block normal messages)
- **0 credits:** cards stay fully visible (both tabs) and «لا» stays free; only «مهتم» is refused (`NO_CREDITS`, disabled in the UI with a recharge link)
- **Introduction choice:** "مهتم" opens `InterestDialog`, which stays open (busy) until the server answers and shows fixable errors (`GUARDIAN_REQUIRED`, `CONSENT_REQUIRED`, `NO_CREDITS`, network) inside it; consent is stored in the same transaction as the charge, only when the «مهتم» goes through (the dialog's quick form saves the guardian without consent, `shareConsent={false}`) (CHAT hidden if chat is off; FAMILY needs the guardian consent checkbox, guardian missing → `GUARDIAN_REQUIRED`); stored as `Suggestion.recipientIntroPreference` / `candidateIntroPreference` (`IntroPreference` CHAT|FAMILY, validated before charging; errors `PREFERENCE_REQUIRED`, `CONSENT_REQUIRED`)
- **Mutual match** (`createMutualMatch` → `openMatch`, sets `MutualMatch.openedAt`): `applyIntroOutcome` (`src/lib/intro/outcome.ts`) opens it straight into the choice — CHAT+CHAT → `Conversation` (14 days), FAMILY+FAMILY or mixed → family introduction accepted; both as an auto-accepted `IntroRequest` row (`respondedAt === expiresAt`, see `isOutcomeRow`) so `getMatchIntroState` stays the one source. Any null preference (legacy rows) or CHAT+CHAT with chat off → the (free) request buttons. After a FAMILY outcome either side may still send a free chat request
- **Guardian contact per match** (`openedAt` set): shown only for a side with `femaleGuardianShareAt` / `maleGuardianShareAt` AND `ParentInfo.shareConsentAt`.
  - FAMILY choosers are stamped at match creation; the CHAT side of a mixed match is asked and stamped via `POST /api/matches/[id]/guardian-share` (`shareGuardianForMatch`: needs an ACCEPTED FAMILY intro row on the match and the partner's `shareConsentAt`, else 409 with the same wording as accepting a family request); accepting a later family request stamps both.
  - A mixed match shows neither guardian until both sides have shared; a closed match (blocked, inactive, «لم يحصل نصيب», «تمت الخطبة», finished) never returns contacts.
  - Consent (`shareConsentAt`) is stored only when the send / accept / share it was given for completes.
  - Pre-flag matches keep the global-consent rule
- **Suggestions:** no weekly cap — at most `MAX_OPEN_SUGGESTIONS` = 10 undecided per person in «جديدة» (since 2026-11-06, was 5; a card in «مهتمون بك» takes no slot; MUTUAL row counts for both), topped up on page open / save, after a decision and on expiry (lazy + scheduler).
  - Slots are counted with `slotMutualWhere` (`mutual.ts`; the feed still uses `openMutualWhere`): a card older than `SLOT_IDLE_DAYS` (2) whose other person hasn't been seen for 2 days stops filling my slot but stays visible, and a card still hidden from the candidate fills the recipient's slot, never the candidate's (since 2026-11-06).
  - **A full candidate is never skipped** (owner decision 2026-10-18), but candidates with a free slot are ranked first (score order within each group; 2026-10-19, production had 300 of 698 open cards hidden): the card is created with `Suggestion.hiddenFromCandidate` (hidden from them, no slot, no notice, no reminder, decide → 404) until the recipient says «مهتم» (shown at once, whatever their «جديدة» holds, full 7-day window, reminder reset, notice «شخص أبدى اهتمامه بك») or they have room again (`revealHiddenFor`, best score first, before anyone new is added; revealed cards count in the "new suggestions" notice); a «لا» closes it unseen and a card the recipient refused is never revealed.
  - Pairs: one row per direction (`@@unique`); a pair whose card closed EXPIRED with neither side answering may be suggested again after `RESUGGEST_AFTER_DAYS` (30), in the free direction (`pairAvailability`/`isResuggestable` in `auto-suggest.ts`); min score `minSuggestionScore(flags)` (60 since 2026-10-19, owner decision on production data; 30 off); order `compatibilityScore desc, createdAt desc` (`suggestionOrder`, feed + `GET /api/suggestions`), and in the feed's "new" tab cards the other side already said «مهتم» to come first, silently (no tag; owner decision 2026-10-19)
- **Candidates must be recently seen:** with shared suggestions on, people are suggested to others only if `lastActiveAt` is within `CANDIDATE_ACTIVE_DAYS` (7, `recentlySeenWhere()` in `src/lib/activity.ts`, no `updatedAt` fallback) — so a «مهتم» lands on someone who will answer; legacy mode keeps the 30-day `activeWhere()`
- **Notifications** (one per person per event, none for a «لا»; a «مهتم» sends «شخص أبدى اهتمامه بك», see Interest is shown): CHAT+CHAT "توافق متبادل! المحادثة مفتوحة الآن" (url = chat); FAMILY+FAMILY "توافق متبادل! تم مشاركة بيانات التواصل العائلي" (url = match); mixed: the CHAT side is told the other preferred family and is asked to share, the FAMILY side is told it waits for the other's guardian contact (and is notified when `shareGuardianForMatch` stamps it; the card shows an amber waiting banner); null preference = the request-buttons text.
  - Copy is flag-aware everywhere (payments, cards, match page, onboarding, landing, FAQ) — never say requests cost credit when the flag is on

## Activity and empty pages

- **Activity:** `User.lastActiveAt` (null for users from before it) is touched at most once per hour by `/api/me/counts`, `/api/suggestions` and sign-in (`touchLastActive()` in `src/lib/activity.ts`). "Active" = `COALESCE(lastActiveAt, updatedAt)` within 30 days (`isActive()` / `activeWhere()`). Idle users are never suggested to others and get no new suggestions until they come back (lazily); shared suggestions use 7 days, see Candidates must be recently seen. Any write to a `User` row bumps `updatedAt`, so scheduler writes on idle users must preserve "last seen" (see `runReengagement`)
- **Empty suggestions:** page 1 of `GET /api/suggestions` returns `emptyReason` (`weekly_cap` | `no_candidates` | `pending` | null) + `nextSuggestionsAt` (oldest suggestion of the rolling 7 days + 7 days; with `credit_on_interest` there is no weekly cap: `pending` = 10 open, else `no_candidates`, and `nextSuggestionsAt` is null) from `autoSuggestWithReason()`; `MutualSuggestionsView` shows "اقتراحاتك القادمة يوم …" or a "no one fits" state linking to شروطي الأساسية / preferences

## Recent notes

- **Activity on suggestion cards:** `activityLabel` in `lib/suggestions/feed.ts` sends «نشط اليوم» or «نشط هذا الأسبوع» (gendered) as `activity` on feed items; nothing for older activity, and the time itself never leaves the server. The website shows it now; the app shows it from the next version.
- **Which cards go first:** `orderForSlots`: `PREFERRED_SCORE` (70) and up first, 60–69 only fill what's left, then people with a free slot, then score. The floor stays 60. Compare «مهتم» → match per score band after 2 weeks.
- **Expiry reminders:** `remindMutualSuggestions` walks every due card in pages (`MAX_REMINDER_PAGES`), still one notice per person per day.
- **Second chance:** a «مهتم» left unanswered because the other person was away (no `activity_days` row during the wait) comes back to them once (`secondChanceCards`, `reopenedAt`, `SECOND_CHANCE_DAYS` 30): full 7 days, in «مهتمون بك» so it takes no slot, and up to `SECOND_CHANCE_PER_DAY` (3) a day whatever «جديدة» holds (until 2026-11-07 it waited for room there, which blocked 120 of 165), with the «مهتم» notice. Checked again: both still fit, neither blocked, matched, engaged or gone. The first person keeps their refund and pays nothing more if it matches. Cards closed by a change never come back this way (`closedByChange`).
- **After the match (evening job, push + bell, never SMS):** `nudgeQuietChats` nudges a chat 48 hours on if nobody wrote (both) or a message is unread (the silent one), once (`quietNudgeAt`). `closeUnsharedMatches`: mixed choice gets a last call on day 5 (`guardianShareLastCallAt`) and closes 2 days later; the side that didn't share carries `NOT_A_MATCH`, no refund, no chat is opened. Win-back: `runReengagement` invites members away 7–30 days with nothing waiting (finished profile, not flagged, not engaged), same weekly limit.
- **Card buildup:** a hidden card fills the recipient's slot (`slotMutualWhere`, `openCounts`), never the candidate's. Members away `CANDIDATE_ACTIVE_DAYS` (7) get no new cards and no reveals until they return; the 14-day candidate fallback stays, so active members aren't left empty. Old piles shrink by expiry only: no bulk closing. On 2026-11-06, 19,044 of 22,338 open cards were hidden.
- **«الديانة» (switch `religion_enabled`, 2026-11-13):** `religionsMatch` (`src/lib/profile-religion.ts`) runs in `generate`, `memberSuggestStatus`, the dealbreaker sweep and the admin hand-pick, whatever the switch says. Same religion always fits; a mixed pair only when both chose «لا مانع» (null reads مسلم / نفس ديانتي). Muslim-only fields and «شروط أساسية» keys (`hijab`, `beard`, `sect`) are stripped for a Christian.
- **Empty search wait:** after a run finds nobody, `generate` waits 30 minutes (`RETRY_COOLDOWN_MS`). Any change to a member's own data, preferences or «شروط أساسية» clears it (`clearSuggestCooldown`), and PUT dealbreakers always tops up, so removing a condition brings cards at once.
- **Cards closed by a member's change:** `closedByChange` on `suggestions` (set by the «شروط أساسية» sweep and `refreshOpenSuggestions`, only on cards nobody answered). If nobody answered, the pair can meet again at once and the same row is reopened (`generate`, unique pair); answered cards and natural expiries keep `RESUGGEST_AFTER_DAYS` (30).
- **Stuck members (2026-11-05, no app version):** on 5 Nov, 38 of the 149 most active members had nobody: about 200 people available, their own dealbreakers leaving about 8; the score minimum stays 60 (cards that became a match: 80+ 4.8%, 70–79 1.8%, 60–69 0.3%).
  - **Fallback:** `generate` looks at people seen in 7 days, then `CANDIDATE_FALLBACK_DAYS` (14) only if nobody is left; `memberSuggestStatus` uses 14 to stay in step.
  - **Filter tip:** `src/lib/matching/filter-tip.ts` (`filterTip`, read-only, needs a gain of 3+ people who pass the score; never changes a member's filters), `sendFilterTips` (`src/lib/cron/filter-tips.ts`, evening part, title «شروطك تقلّل اقتراحاتك», push + bell, every 7 days at most, opens `?tab=new` where website and app already have the filter editor), website line on the empty page via `GET /api/suggestions/filter-tip`.
  - The app's empty page doesn't show the line (would need an app version).
  - Live 19:08 (`850db57`).
  - Dry run: 57 members, median gain 25 people, 17 s.

## Legacy flow (switches off)

```
Suggestion → recipient accepts/rejects (no photos) →
  accepted: other user gets interest → accepts/rejects →
    mutual like: photos + full details revealed → visit request → admin arranges family visit
```
1. **اقتراحات جديدة** — new suggestions (user is recipient)
2. **الطلبات المرسلة** — sent interests with status tracking
3. **طلبات الاهتمام** — received interests

**Sent interest status** (derived from DB, no extra schema):

| Status | Condition |
|---|---|
| بانتظار الاطلاع (Amber) | INTEREST notification `isRead: false` |
| تم الاطلاع (Primary blue) | Notification read, no MutualMatch |
| توافق متبادل (Emerald) | MutualMatch exists |
