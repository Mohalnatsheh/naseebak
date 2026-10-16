# Credit on match — design

Date: 2026-10-16 · Status: draft for review · Owner request: `docs/cycle-v2-prompt.md`

## Why

Today a match is free and each family/chat **request** costs the sender 1 credit. Users pay for requests the other side may ignore or decline, suggestions trickle in at 3 per week, and after a match both people still have to send and accept a request before anything happens. The new cycle makes the **match** the one paid moment: both people pay 1 credit only when both said "مهتم", and the introduction they chose opens immediately. Suggestions flow continuously (up to 5 open), only good pairs (≥ 50%, pending the owner's OK on the number) are shown, best first.

## Goals

- One paid event: a mutual match costs each person 1 credit, charged atomically when the match opens.
- "مهتم" carries an introduction preference (chat first / family directly); the match opens straight into the outcome.
- Continuous free suggestions: at most 5 undecided per person, topped up as soon as one is decided or expires.
- Better suggestions: minimum score 50 (number pending owner OK, see "Open"), most compatible first.
- Every later action is free: intro requests, chat, chat → family, family introduction.
- No admin involvement anywhere in the cycle.

## Non-goals

- Changing chat rules (14 days, +7 once, filter, 50/day, end/report, "ننتقل لتعارف عائلي").
- New packages or prices (3/5/10 stay).
- The ~7-day follow-up after a family introduction: **it does not exist yet** (phase 6, not built). Out of scope here; the owner's prompt assumed it exists.
- Removing the legacy or per-request flows. They stay for rollback.

## Anti-goals (a failure even if it "works")

- A one-sided decision is ever revealed (no notification, no feed hint, no timing leak).
- Anyone is charged for a match that never opens, or charged twice for one match.
- Turning the flag off breaks in-flight suggestions, matches, requests or chats, or changes today's behaviour.
- A guardian's contact is shown without that side's recorded consent.

## Constraints

- Live site, ~200 users. Schema changes additive only (new nullable columns / new enum values / new enum). No renames, no drops.
- One new switch `credit_on_match` (SystemSetting, default `"false"`, 30 s cache) exposed as `CycleFlags.creditOnMatch`. It only takes effect when `mutualSuggestions` is on (which itself needs `introRequests`): `creditOnMatch = mutualSuggestions && setting === "true"`. Flag off ⇒ code paths identical to today.
- Existing balances honoured. Registration grant stays `NEW_CYCLE_FREE_CREDITS = 3` once; existing users get nothing extra.
- All notifications through `notify()` / `notifyMany()`; every credit change through `reserveCredits` + `recordCredit`.

## Decisions (owner's, from the prompt and Q&A on 2026-10-16)

1. **Open-suggestion cap.** Flag on: no weekly cap. `MAX_OPEN_SUGGESTIONS = 5` undecided per person; a MUTUAL row counts for both people. `autoSuggestForUser` tops up `5 − open` (today it only runs at 0 pending). Top-up also runs right after a decision and when a suggestion expires (lazy path and scheduler), besides page open / profile save. Popular-profile guard: skip a candidate who already has 5 open. Same rules in admin Generate and the scheduler's suggestions task. Keep in-flight dedupe, empty-run cooldown and every existing exclusion (idle 30+ days, suspended, deactivated, flagged, past suggestions, matches, blocks).
2. **Minimum score.** One shared helper used by auto-suggest and admin Generate. Flag on: 50. Flag off: 30. The 50 is **not final** until the owner sees the distribution on real data (see "Open").
3. **Ordering.** Suggestion lists order by `compatibilityScore desc, createdAt desc` (GET /api/suggestions and the feed).
4. **Credit at the match.**
   - "مهتم" requires `matchCredits ≥ 1` — enforced in the API (`decideSuggestion`, and legacy like/accept when the flag is on), and the UI disables the button with "اشحن رصيدك للمتابعة" → `/dashboard/payments`. "لا" is always free.
   - Low balance is allowed: with 1 credit a user may say "مهتم" on several suggestions; the dialog says "كل توافق يستخدم رصيداً واحداً — رصيدك 1". Extra matches go to waiting-for-credit.
   - When both said "مهتم": create the match and, in the **same transaction**, charge each person 1 (`reserveCredits` + `recordCredit` reason `MATCH`, new enum value). Concurrent "مهتم" on both sides charges exactly once per person (only the caller that closes the suggestion row creates and charges).
   - If either person has 0 at that moment: the match is created in **waiting-for-credit**; **nobody is charged**, nothing is revealed (no photos, no details, no chat, no guardian contact) for either side.
   - When credits are added (Stripe webhook; also admin +credit adjust and referral grant), try to open every waiting match of that user: charge both atomically; if the other person now has 0, it keeps waiting and the "recharge" prompt moves to them.
   - After **14 days** waiting the match closes quietly: nobody charged, nobody told; it leaves the matches list. One reminder at day 10 to whoever lacks credit ("4 days left to open your match").
   - Intro requests are free when the flag is on (no `reserveCredits` in `sendIntroRequest`), also on matches created before the switch. Credits already spent on requests are not refunded.
5. **Introduction choice on "مهتم".** Stored with the decision on the suggestion (new nullable `recipientIntroPreference` / `candidateIntroPreference`, enum `IntroPreference { CHAT FAMILY }`; old decisions = null).
   - Choosing FAMILY requires guardian consent in the same dialog: a required checkbox "أوافق على مشاركة اسم ورقم ولي الأمر" (and the guardian fields if missing). Without consent the user can still choose CHAT.
   - When the match **opens** (both paid): both CHAT → open the Conversation immediately (`CHAT_TTL_DAYS`, same limits/filter). Both FAMILY or mixed → family introduction accepted immediately; guardian contact shown only for sides with consent (today's rule). Mixed → the CHAT side is told "الطرف الآخر فضّل التعارف العائلي". Any null preference (old rows / pre-switch matches) → today's request buttons.
   - After a FAMILY outcome either side may still send a (free) chat request the other accepts/declines.
6. **Notifications.**
   - A single "مهتم"/"لا" in the MUTUAL flow stays silent.
   - Match outcome: both CHAT → "توافق متبادل! المحادثة مفتوحة الآن" (url = the conversation). FAMILY/mixed → "توافق متبادل! تم مشاركة بيانات التواصل العائلي" (url = the match); mixed adds "الطرف الآخر فضّل التعارف العائلي" for the CHAT side.
   - Waiting: to the person without credit "لديك توافق متبادل! اشحن رصيدك لفتحه" (url `/dashboard/payments`); to the other "لديك توافق متبادل، بانتظار إكمال الطرف الآخر". On open: the normal outcome notification to both.
   - Scheduler's undecided-side reminder ("لديك اقتراح بانتظار قرارك") stays and never reveals the other side.
   - Exactly one notification per person per event (claim-then-notify, like the scheduler markers).
7. **Old rows.** Legacy (non-MUTUAL) suggestions/interests still in flight follow the same rule when the flag is on: credit at match from both, same waiting handling, no preference ⇒ free request buttons.
8. **Rollback.** Turning `credit_on_match` off opens every waiting match immediately and free (today's rule: matches are free). The open-free step runs lazily wherever a waiting match is read and in the scheduler; nobody is charged. Matches already opened keep their outcome.
9. **Guardian contact is per match.** In a FAMILY/mixed outcome a side's guardian contact is shown only when that side consented **for this match**: ticking the consent box when choosing FAMILY in the "مهتم" dialog, or — for a CHAT chooser in a mixed match — answering yes to "الطرف الآخر فضّل التعارف العائلي — هل توافق على مشاركة بيانات ولي أمرك؟" on the match. An earlier global `ParentInfo.shareConsentAt` alone is not enough for matches opened under this flag (it stays the rule for everything else). Withdrawing global consent still hides the contact everywhere.
10. **Closed unpaid is final.** A quiet 14-day close is permanent for that pair, like a declined suggestion; the pair is never suggested again.
11. **Docs/admin.** Update CLAUDE.md rules (per-request credits, "no credit gate on matches", score ≥ 30, empty suggestions) and header comments of `credits.ts`, `intro/requests.ts`, `matching/auto-suggest.ts`. Admin Settings: the new switch with a short explanation (and that it needs shared suggestions on). Admin credit ledger shows `MATCH`.

## Data (additive only)

- `enum CreditReason` + `MATCH`.
- `enum IntroPreference { CHAT FAMILY }` (new).
- `Suggestion.recipientIntroPreference IntroPreference?`, `Suggestion.candidateIntroPreference IntroPreference?`.
- `MutualMatch.awaitingCreditSince DateTime?` — non-null = waiting for credit. Existing rows null = open, exactly as today.
- `MutualMatch.openedAt DateTime?` — set when a waiting match opens (null on pre-existing and on matches that opened immediately is fine; the builder may set it for immediate opens too).
- `MutualMatch.closedUnpaidAt DateTime?` — set by the 14-day quiet close.
- `MutualMatch.creditReminderSentAt DateTime?` — the day-10 reminder marker.
- `MutualMatch.femaleGuardianShareAt DateTime?`, `MutualMatch.maleGuardianShareAt DateTime?` — per-match guardian consent (decision 9).
- Builder's call (see below): how an auto-accepted family intro and an auto-opened chat are represented.

The SQL from `prisma migrate diff` is shown to the owner before it is applied anywhere.

## Behaviour by surface

- **Suggestion card / decide dialog:** "مهتم" opens a small dialog with the two choices; FAMILY shows the consent checkbox when consent is missing; 0 credits ⇒ disabled button + recharge link; the low-balance hint.
- **Matches list / match page:** waiting matches show a calm card ("بانتظار شحن الرصيد لفتح التوافق" for the side without credit with a payments button; "بانتظار إكمال الطرف الآخر" for the other), no photos/details. Opened matches show the outcome state: chat open, or family contacts, via `getMatchIntroState`. Photos API and intro state refuse/withhold for waiting and closed-unpaid matches.
- **Next-step card:** a waiting match where *I* lack credit ⇒ "اشحن رصيدك لفتح توافقك"; counts exclude closed-unpaid matches.
- **Empty suggestions:** flag on ⇒ `emptyReason` is `pending` when 5 are open, `no_candidates` otherwise; `weekly_cap` / `nextSuggestionsAt` are not returned.
- **Copy:** every place saying a request costs a credit (payments page, suggestion cards, match page, request buttons/dialogs, onboarding guide, landing content, FAQ) gets flag-aware copy: "الرصيد يُستخدم عند التوافق المتبادل فقط".
- **Scheduler:** suggestions task tops up to 5 for active users with < 5 open (flag on); new task: day-10 credit reminder and 14-day quiet close of waiting matches; expiry of a suggestion triggers top-up for both sides.

## Calls made by Claude (owner to check)

- Chat switch off ⇒ the CHAT choice is hidden in the "مهتم" dialog (only FAMILY offered), so a CHAT+CHAT outcome can't happen without chat.
- Prompt moves when the other side spent their credit meanwhile: that person gets one "اشحن رصيدك لفتحه" notification for this match; the side who just recharged gets nothing new. The 14 days run from the first `awaitingCreditSince` (no restart). The day-10 reminder is sent once per match, to whoever lacks credit at that moment.
- Ordering by score is flag-gated (flag off = unchanged).
- The "مهتم" credit check also applies to legacy like/accept when the flag is on (decision 7).

## Left to the builder (decide and note in the plan)

- Representation of the immediate outcomes: an auto-accepted `IntroRequest` (FAMILY / CHAT, ACCEPTED) vs. conversation-only, as long as `getMatchIntroState` and the match page show the right state and the free chat→family move keeps working.
- Exact component split for the decide dialog.
- Whether ordering-by-score also applies when the flag is off (owner said "flag off = unchanged"; default: flag-gated).

## Open (owner)

- **Minimum score number.** Local databases only hold seeded test users (all pairs ≥ 70%), so the distribution says nothing yet. Run `DATABASE_URL=<prod or prod copy> node scripts/score-distribution.ts` (read-only) and confirm 50 or another number before the threshold ships.

## Verification

- Unit/API tests: score cutoff; open-cap top-up (0/3/5 open); top-up after a decision and after expiry; popular-profile guard; ordering; "مهتم" refused at 0 credits (API); match charging (both have credit / one at 0 / recharge opens it / other spent meanwhile keeps waiting / 14-day close charges nobody); concurrent "مهتم" both sides charges once each; preferences CHAT+CHAT, FAMILY+FAMILY, mixed, null; FAMILY without consent refused; free intro requests; notifications per outcome, none on a one-sided decision, exactly one per person; flag off = current behaviour (existing tests unchanged and green).
- Full suite, `tsc --noEmit`, `pnpm lint`.
- Docker (:3001) walkthrough with one man + one woman: both "مهتم"+CHAT → chat open; FAMILY and mixed → contacts per consent; a 0-credit user → waiting → simulated top-up (admin +credit) opens it.
- Not verifiable locally: OneSignal pushes (placeholder app id), the Stripe webhook on a real host (simulated via the same credit-added hook), the score distribution on real users.
