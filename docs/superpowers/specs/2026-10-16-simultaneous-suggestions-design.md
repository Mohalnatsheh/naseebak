# Simultaneous suggestions (new cycle, phase 4) — design

> **Historical document.** It records a decision or plan at the time it was written. The live behaviour has changed since. The current rules (as of 2026-10-17) are in `CLAUDE.md`.

Date: 2026-10-16 · Status: scope agreed with the product owner (see `2026-10-16-new-cycle-design.md`); details below marked **builder's call** were decided while building.

## Why

Today a suggestion needs two approvals in sequence: the recipient answers it, then the other person gets an "interest" (a `Like`) and answers that, across three tabs on `/dashboard/suggestions`. It is slow, confusing, and the second person learns they were chosen before deciding — which also tells the first person when they are turned down ("تم الاطلاع" with no match).

The product owner agreed: both people see the same suggestion at the same time, each taps **مهتم** or **لا**, a match happens only when both say yes, and nobody ever learns the other's answer otherwise.

## Goals

1. One suggestion row is shown to both people. Each decides independently.
2. Both "مهتم" → mutual match via `createMutualMatch()` (`src/lib/intro/match.ts`), which already handles the new cycle (no admin visit, MATCH notification to both).
3. No leak: a "لا" (or silence) looks exactly like "still waiting" to the other person until the suggestion expires.
4. `/dashboard/suggestions` has two tabs: **اقتراحات جديدة** (to decide) and **بانتظار الطرف الآخر** (I said مهتم). Matches stay on `/dashboard/matches`.
5. Dealbreakers: a user can mark some of their preferences as "شرط أساسي"; marked preferences become hard filters in automatic and admin-generated suggestions (both directions).
6. Every card shows a short "لماذا هذا الاقتراح" reason.

## Non-goals

- Changing the score weights or the minimum score (30).
- Removing admin review of profile edits (phase 5).
- Re-checking existing suggestions when someone changes dealbreakers later.
- Filtering admin hand-picked suggestions (the admin chose them explicitly).

## Anti-goals

- A legacy suggestion or interest that is in flight when the switch is turned on stops working or disappears before it is answered.
- Someone can tell from the UI, an API response or a notification that the other person said "لا".
- Two matches, or two MATCH notifications, for the same pair when both tap at the same moment.
- Turning the switch off breaks anything.

## Constraints

- Live site, ~200 users: schema changes additive only (new enum, new columns with defaults / nullable).
- New `SystemSetting` key `new_suggestions_flow`, default `"false"`.
- Brand colour tokens only; Arabic RTL; RTL pagination rules (CLAUDE.md).

## Switch

`new_suggestions_flow` — effective only when `intro_requests_enabled` is also on (**builder's call**: the simultaneous flow relies on per-request credits, where suggestions are free and capped at 3 per rolling 7 days; in legacy credit mode there would be no fair answer to "who pays for a shared suggestion"). Exposed as `CycleFlags.mutualSuggestions` from `getCycleFlags()`, shown in Admin → Settings → "New user cycle" with a warning when turned on without intro requests.

When the effective flag is **off**, everything behaves exactly as today (3 tabs, recipient-then-interest, no dealbreaker filtering, no reasons).

## Data model (additive)

```prisma
enum SuggestionFlow     { LEGACY MUTUAL }
enum SuggestionDecision { INTERESTED DECLINED }

model Suggestion {
  // existing fields unchanged
  flow                SuggestionFlow      @default(LEGACY)
  recipientDecision   SuggestionDecision?
  recipientDecidedAt  DateTime?
  candidateDecision   SuggestionDecision?
  candidateDecidedAt  DateTime?
}

model Profile {
  // existing fields unchanged
  dealbreakers String[] @default([])   // preference keys that are hard filters
}
```

Existing rows get `flow = LEGACY` and keep working through the existing endpoints. `recipientId`/`candidateId` on a MUTUAL row only say who triggered the run; the UI treats both sides the same.

## Lifecycle of a MUTUAL suggestion

- Created with `status = PENDING`, `expiresAt = createdAt + 14 days` (**builder's call**: long enough for weekly users, short enough that "waiting" ends).
- Each side records its decision once (atomic `updateMany` on `decision IS NULL`).
- Both INTERESTED → `status` PENDING→ACCEPTED (atomic, only one caller wins) → `createMutualMatch`. The winner's response says `match: true`; the other person learns via the MATCH notification.
- Any DECLINED once both have decided → `status = REJECTED`. When only one side has declined the row stays PENDING.
- `expiresAt` passed while PENDING → `EXPIRED` (applied lazily when either user loads the feed).
- Deciding on an expired, closed, blocked or foreign suggestion → 404 with a generic message.

### What each person sees

| My decision | Other's decision | Tab 1 (new) | Tab 2 (waiting) |
|---|---|---|---|
| none | any | shown until expiry | — |
| INTERESTED | none / DECLINED | — | "بانتظار الطرف الآخر" until expiry, then gone |
| INTERESTED | INTERESTED | — (it's a match, on /dashboard/matches) | — |
| DECLINED | any | — | — |

The API never returns the other side's decision or the row's status. Tab 2 hides rows by my decision + `expiresAt` only, so DECLINED and "not yet" are indistinguishable. No notification is sent on a decline, an expiry, or on the other person's "مهتم".

## Creating suggestions (flag on)

`autoSuggestForUser` and admin Generate create MUTUAL rows:

- Weekly cap counts suggestions on **either side** in the last 7 days (both people see them), for the user and for each candidate; candidates already at the cap are skipped so popular users aren't flooded.
- "Nothing waiting" check: no PENDING, unexpired row where *I* haven't decided (either side) and no legacy PENDING row where I'm the recipient.
- Both people get a SUGGESTION notification through `notify()` (link `/dashboard/suggestions`).
- Exclusions unchanged (any past suggestion in either direction, matches, blocks) plus dealbreakers.
- Admin hand-picked suggestions (`POST /api/admin/suggestions`) are created MUTUAL too when the flag is on, and both sides are notified.

## Dealbreakers

Keys: `age`, `city`, `education`, `maritalStatus`, `religiosity`, `smokingStatus`, `hijab`, `beard`, `children` — one per existing preference. A key only applies when that preference is filled in.

`passesDealbreakers(owner, other, otherGender)` in `src/lib/matching/score.ts`; a pair is suggested only if both pass each other's. **Builder's call:** when the other person's value is missing, a dealbreaker fails (a user who explicitly asked for "non-smoker only" must not get "unknown"). `hijab` applies only to women, `beard` only to men; `children` with "no_children" fails when `childrenCount > 0`.

Editing: a "شروطي الأساسية" card on the suggestions page lists the user's filled-in preferences with a switch each, saved by `PUT /api/profile/dealbreakers` directly (**builder's call**: private matching filter, not shown to anyone, so no admin review — like guardian info). Only shown when the flag is on. Turning the flag off ignores dealbreakers (data kept).

## "لماذا هذا الاقتراح"

`suggestionReason(viewer, other)` in `src/lib/matching/reasons.ts` — pure, from the viewer's side only: which of the viewer's preferences the other person meets (top 3 by weight, Arabic labels), plus "وشخصيتاكما متقاربة" when both took the quiz and similarity ≥ 0.75. Gendered wording (يوافق/توافق, تبحث/تبحثين). Falls back to same city, then to "اقترحناه لتوافق ملفيكما بشكل عام". Never mentions the other person's preferences. Shown on every card in both tabs, including legacy cards.

## Legacy items in flight (flag on)

Tab 1 also lists, with the same card and buttons:
- legacy PENDING suggestions where I'm the recipient → existing `/api/suggestions/[id]/like|reject`;
- legacy received interests (a `Like` to me I haven't answered) → existing `/api/interests/[id]/accept|reject`.

Tab 2 also lists my legacy sent interests that haven't matched, shown as "بانتظار الطرف الآخر" (no "تم الاطلاع"). They stop showing 14 days after being sent (same rule as MUTUAL rows).

Legacy endpoints refuse MUTUAL rows (they only act on `flow = LEGACY`).

## Switching off later

New suggestions go back to legacy. Users who still have open MUTUAL rows keep the two-tab view (`GET /api/suggestions` returns `mutualView: true` when the flag is on or the user has an open MUTUAL row) and `POST /api/suggestions/[id]/decide` keeps working for them, so nothing in flight is lost.

## API

- `GET /api/suggestions` — unchanged shape, plus `mutualView: boolean`; when the flag is on, page 1 still triggers auto-suggest and `total` counts tab-1 items (dashboard card).
- `GET /api/suggestions/feed?tab=new|waiting&page=n` — merged, per-viewer cards: `{ kind: "mutual"|"legacy_suggestion"|"legacy_interest"|"legacy_sent", id, compatibilityScore, reason, candidate }`.
- `POST /api/suggestions/[id]/decide` `{ interested: boolean }` → `{ match: boolean, matchId? }`.
- `GET|PUT /api/profile/dealbreakers`.

## Builder's calls (summary)

- Flag effective only with `intro_requests_enabled`.
- 14-day expiry for MUTUAL suggestions; tab 2 entries vanish at expiry with no notice.
- Missing value fails a dealbreaker.
- Dealbreakers saved directly, no admin review; not applied retroactively; not applied to admin hand-picks.
- Legacy sent interests shown as plain "waiting" in the new view.
- Admin hand-picked suggestions become MUTUAL while the flag is on.
