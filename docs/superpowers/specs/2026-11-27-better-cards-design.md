# Better cards: age ranges and people active today (2026-11-27)

Short design, approved by the owner on 2026-11-27.

## Why

Production analysis of Jordan, 1–26 Nov 2026 (read-only):

- Matches are what keep members: established members with no match in two weeks left 58–68% of the time, with 3+ matches 18–31%.
- 36% of women's cards break the woman's own age range. She says «مهتم» on 1.5–3% of them, about 24% inside her range. For men: 18.6% outside his range, 50.3% inside; 23% of men's cards are outside.
- The score barely punishes it: age is 2 of about 11 preference points, so an out-of-range card still scores about 75.
- Supply is ample: the median active woman has 184 active men inside both age ranges; 4% have fewer than 15.
- A «مهتم» to someone active the same day becomes a match 30% of the time for men (72% for women); one day away 10% (29%); 2–3 days 7% (21%).
- People away more than 3 days are already kept out of «جديدة» (`suggest_active_3_days`, on since 2026-11-16); its empty-feed exception applies to under 1% of members, so that part is not changed.

## Goals

More «مهتم» per card and more matches, by creating new cards that both people are likely to answer.

Non-goals: score weights, fair exposure, refunds, notices, the feed order of existing cards. Anti-goals: empty or near-empty «جديدة»; any change while the switches are off; anything that needs an app version.

## Approaches

1. **Hard filter inside `generate`, with a small safety net (chosen).** Same place as «شروط أساسية»; easy to switch off; the safety net keeps short feeds filled.
2. Raise the weight of age in the score. Rejected: it changes every score shown and the 60 minimum together, and is part of the later score-weight work.
3. Hide out-of-range cards in the feed. Rejected: the cards would still be created and fill slots and the other person's feed.

## Design

Two switches in `system_settings`, off by default, set in Admin → Settings, only with `new_suggestions_flow` on (like the other feed switches). Server only.

**`respect_age_range`** (`CycleFlags.respectAgeRange`)
- In `generate`, a candidate fits only when each person's age is inside the other's `prefAgeMin`–`prefAgeMax` (an empty bound is open; an unknown age fails a set bound, as the age «شرط أساسي» does).
- Safety net (builder's call, approved): if the member would hold fewer than `AGE_SAFETY_OPEN` (5) open «جديدة» cards after the in-range cards are added, the gap up to 5 may be filled with out-of-range candidates, best order first.
- Not affected: existing cards, second-chance cards, revealing hidden cards.
- `memberSuggestStatus` needs no logic change: it counts candidates only when the member has 0 open cards, and then the safety net lets every candidate through. The filter tip is unchanged for the same reason (age never empties a feed).

**`suggest_today_first`** (`CycleFlags.todayFirst`)
- New cards are ordered: score ≥ `PREFERRED_SCORE` and seen in the last 24 h, then ≥ `PREFERRED_SCORE` seen in 3 (or 7) days, then below `PREFERRED_SCORE` seen in 24 h, then the rest. Within each group the current order (`orderForSlots`) is kept. Nobody is removed, so men's smaller pool is filled from 3-day people as now.
- `memberSuggestStatus` needs no change (order only).

## Testing

Unit tests for both rules, the safety net and both switches off (same output as today); a read-only production check of how many members would fall under the safety net; lint, types, all tests, production build.

## Left to the builder

Helper names, where the age-fit helper lives (db-free, next to `mutuallyAcceptable`), test layout.
