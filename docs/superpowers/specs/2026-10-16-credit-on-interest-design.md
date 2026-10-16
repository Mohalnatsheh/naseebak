# Credit on interest — design

Date: 2026-10-16 · Status: approved by the owner (revised the same day: the credit is spent on "مهتم", not at the match) · Owner request: `docs/cycle-v2-prompt.md`

## Why

Today a match is free and each family/chat **request** costs the sender 1 credit. Users pay for requests the other side may ignore, suggestions trickle in at 3 per week, and after a match both still have to send and accept a request before anything happens. The new cycle: suggestions flow continuously and free (up to 5 open, only good pairs, best first); saying **"مهتم" costs 1 credit**; when both say "مهتم" the match is free and opens straight into the introduction they chose.

## Goals

- One paid action: each "مهتم" costs the person who taps it 1 credit, taken immediately. "لا" is free.
- "مهتم" carries an introduction preference (chat first / family directly); a mutual match opens straight into the outcome.
- Continuous free suggestions: at most 5 undecided per person, topped up as soon as one is decided or expires.
- Better suggestions: minimum score 50 (provisional — owner to confirm on real data), most compatible first.
- Everything after "مهتم" is free: the match, intro requests, chat, chat → family, family introduction.
- No admin involvement anywhere in the cycle.

## Non-goals

- Changing chat rules (14 days, +7 once, filter, 50/day, end/report, "ننتقل لتعارف عائلي").
- New packages or prices (3/5/10 stay).
- The ~7-day follow-up after a family introduction: it does not exist yet (phase 6). Out of scope.
- Removing the legacy or per-request flows (kept for rollback).

## Anti-goals

- A one-sided decision is ever revealed (no notification, no feed hint, no credit refund that would hint at it).
- Anyone charged twice for one "مهتم" (double tap, retries, concurrent requests).
- Turning the flag off breaks in-flight suggestions, matches, requests or chats, or changes today's behaviour.
- A guardian's contact is shown without that side's per-match consent (for matches opened under the flag).

## Constraints

- Live site, ~200 users. Schema changes additive only.
- One new switch `credit_on_interest` (SystemSetting, default `"false"`) exposed as `CycleFlags.creditOnInterest = mutualSuggestions && setting === "true"` (mutualSuggestions already requires introRequests). Flag off ⇒ today's code paths unchanged.
- Existing balances honoured; registration grant stays `NEW_CYCLE_FREE_CREDITS = 3` once.
- All notifications via `notify()` / `notifyMany()`; every credit change via `reserveCredits` + `recordCredit`.

## Decisions (owner)

1. **Open-suggestion cap.** Flag on: no weekly cap; `MAX_OPEN_SUGGESTIONS = 5` undecided per person; a MUTUAL row counts for both. Top up `5 − open` on page open / profile save, right after a decision, and when a suggestion expires (lazy path and scheduler). Popular-profile guard: skip a candidate with 5 open. Same in admin Generate and the scheduler's suggestions task. Keep in-flight dedupe, empty-run cooldown and all exclusions (idle 30+ days, suspended, deactivated, flagged, past suggestions, matches, blocks).
2. **Minimum score.** One shared helper: 50 when the flag is on (provisional), 30 when off.
3. **Ordering.** `compatibilityScore desc, createdAt desc` in GET /api/suggestions and the feed (flag-gated).
4. **Credit on "مهتم".**
   - "مهتم" costs 1 credit, taken in the **same transaction** that records the decision; if recording fails (already decided, expired, blocked) nothing is charged. A double tap or concurrent retry charges once (the conditional claim on the decision column wins once). Ledger reason `INTEREST` (new `CreditReason` value).
   - 0 credits ⇒ "مهتم" refused in the API (`NO_CREDITS`). "لا" costs nothing.
   - **0 credits ⇒ new suggestions are locked (owner, added during implementation):** in the "new" tab the feed returns each undecided suggestion as a locked item (compatibility score only, no profile fields), shown as a blurred card with "اشحن رصيدك لعرض الاقتراح والرد" → `/dashboard/payments` and no "مهتم"/"لا" buttons, until the balance is ≥ 1. The decide API also refuses (`NO_CREDITS`) while locked.
   - No refund when the other side says "لا" or never answers (owner's rule; also keeps decisions secret).
   - When the balance reaches 0 after a "مهتم", one PAYMENT notification "انتهى رصيدك — اشحن لتتابع" (existing exhausted-notice pattern).
   - The match is free; intro requests are free when the flag is on (also on matches created before the switch); credits already spent on requests are not refunded.
   - Legacy (non-MUTUAL) rows in flight: the legacy "like" and "accept interest" are the "مهتم" actions there — 1 credit each when the flag is on; their matches are free and show the (free) request buttons (no preference).
5. **Introduction choice on "مهتم".** Stored with the decision (`recipientIntroPreference` / `candidateIntroPreference`, enum `IntroPreference { CHAT FAMILY }`; old rows null).
   - FAMILY requires guardian consent in the same dialog (required checkbox "أوافق على مشاركة اسم ورقم ولي الأمر", guardian fields link if missing). Without consent the user can still choose CHAT. Chat switch off ⇒ CHAT choice hidden.
   - On mutual match: both CHAT → Conversation opens immediately (`CHAT_TTL_DAYS`). Both FAMILY or mixed → family introduction accepted immediately. Mixed → the CHAT side is told "الطرف الآخر فضّل التعارف العائلي". Any null → today's (free) request buttons.
   - After a FAMILY outcome either side may still send a free chat request.
6. **Guardian contact is per match** for matches opened under the flag (`MutualMatch.openedAt` set): shown only for a side with a per-match share stamp (`femaleGuardianShareAt` / `maleGuardianShareAt`) **and** global consent. FAMILY choosers are stamped at match creation; the CHAT side of a mixed match is asked "الطرف الآخر فضّل التعارف العائلي — هل توافق على مشاركة بيانات ولي أمرك؟" and stamped on yes. Pre-flag matches keep today's global-consent rule.
7. **Notifications.**
   - A single "مهتم"/"لا" in the MUTUAL flow stays silent (the credit notice at 0 balance is about the user's own balance only).
   - Match outcome: both CHAT → "توافق متبادل! المحادثة مفتوحة الآن" (url = conversation). FAMILY/mixed → "توافق متبادل! تم مشاركة بيانات التواصل العائلي" (url = match); mixed adds "الطرف الآخر فضّل التعارف العائلي" for the CHAT side. Null preference → today's match text without the credit sentence.
   - Scheduler reminder to the undecided side ("لديك اقتراح بانتظار قرارك") unchanged.
   - Exactly one notification per person per event.
8. **Rollback.** Flag off ⇒ "مهتم" is free again (today's rule), requests cost credits again, weekly cap returns. Matches and chats opened under the flag keep working; per-match guardian rule keeps applying to matches with `openedAt` set.
9. **Docs/admin.** CLAUDE.md rules (per-request credits, "no credit gate on matches", score ≥ 30, empty suggestions) and header comments of `credits.ts`, `intro/requests.ts`, `matching/auto-suggest.ts`. Admin Settings switch with explanation (needs Shared suggestions on). Admin credit ledger shows `INTEREST`.

## Data (additive only)

- `CreditReason` + `INTEREST`.
- `enum IntroPreference { CHAT FAMILY }`.
- `Suggestion.recipientIntroPreference IntroPreference?`, `Suggestion.candidateIntroPreference IntroPreference?`.
- `MutualMatch.openedAt DateTime?` (set when a match is created under the flag), `MutualMatch.femaleGuardianShareAt DateTime?`, `MutualMatch.maleGuardianShareAt DateTime?`.

Generated SQL is shown to the owner before it is applied anywhere but local Docker.

## Surfaces

- **Suggestion card / dialog:** "مهتم" opens a dialog with the two choices, the consent checkbox for FAMILY when missing, and "مهتم يستخدم رصيداً واحداً — رصيدك N". 0 credits ⇒ disabled + recharge link.
- **Match page:** outcome state (chat open / family contacts) via `getMatchIntroState`; mixed share prompt; request buttons marked free.
- **Empty suggestions:** flag on ⇒ `pending` when 5 open, else `no_candidates`; no `weekly_cap` / `nextSuggestionsAt`.
- **Copy (flag-aware):** payments page, suggestion cards, match page, request buttons/dialogs, onboarding, landing content, FAQ — "يُستخدم رصيد واحد عند اختيار «مهتم»، والتوافق والطلبات والمحادثة مجانية."
- **Scheduler:** suggestions task tops up to 5 for active users with < 5 open (flag on); suggestion expiry triggers top-up.

## Calls made by Claude

- Ordering by score is flag-gated.
- Outcome rows: an auto-accepted `IntroRequest` (CHAT or FAMILY, status ACCEPTED) is created for the outcome (plus the `Conversation` for chat) so `getMatchIntroState` keeps one source of truth.
- Chat switch off ⇒ CHAT choice hidden.

## Open (owner)

- Minimum score number on real data: `DATABASE_URL=<prod copy> node scripts/score-distribution.ts` (read-only).

## Verification

Tests: score cutoff; open cap (0/3/5 open); top-up after decision / expiry; popular guard; ordering; "مهتم" charges 1 and records INTEREST; refused at 0 credits; "لا" free; double tap / concurrent charges once; no charge when the claim fails; legacy like/accept charge when flag on; free match; preferences CHAT+CHAT / FAMILY+FAMILY / mixed / null; FAMILY without consent refused; per-match guardian rule; free intro requests; notifications per outcome and none on a one-sided decision; flag off unchanged. Full suite, tsc, lint. Docker walkthrough: CHAT+CHAT → chat open; FAMILY / mixed → contacts per consent; 0-credit user refused. Not verifiable locally: OneSignal delivery, Stripe on a real host, real score distribution.
