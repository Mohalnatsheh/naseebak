# Jordan: matches and retention analysis (2026-11-27)

Read-only production queries, Jordan only, test accounts left out, Amman days. Covers 20–26 Nov (with 13–19 Nov to compare) and card decisions from 1–26 Nov.

## Week numbers

| | 13–19 Nov | 20–26 Nov |
|---|---|---|
| New sign-ups | 534 | 854 (dip 20–22 Nov from a weak ad campaign; 150–210 a day from 23 Nov) |
| Weekly active | 1,169 | 1,552 |
| «مهتم» taps | 3,422 | 4,204 |
| Matches | 924 | 1,102 |
| Paid purchases | 20 | 12 (67 JOD) |

Base: 2,512 live, finished members, 1,679 men and 833 women. Active in 7 days: 889 men, 559 women.

## What keeps members

- **Matches.** Members active 6–19 Nov who left the next week: 68% of men and 58% of women with 0 matches; 18% and 31% with 3+. New members with a match in their first 24 h came back within 3 days 74–97% of the time; without a match and without push, 19% (men) and 31% (women). The gap holds among new members who said «مهتم» on day one: 50 → 81 (men), 42 → 78 (women).
- **Push.** App members with no match on day one came back within 3 days 65% with push and 34% without (women 59% vs 30%). Website members: 79% vs 23% with OneSignal (women 89% vs 40%). Only about 25% of new website members turn push on.
- **Credits do not predict leaving.** Men at 0 credits left less (28%) than men with credits (52%): the ones who spent are the engaged ones. Free credits are not a retention fix.

## Deletions (the biggest loss)

- 248 of about 1,450 new Jordanian members since 13 Nov asked to delete: 27% of women and 14% of men. 111 did it about 13 minutes after signing up, after 1–3 card decisions.
- 265 of about 300 requests give no reason (the reason is optional free text).
- 524 chats since 1 Nov were closed because one side left (`system:left`), 335 of them by the woman deleting. In 74 pairs both people deleted, many probably moved on together.
- Not explained by bad cards: women with mostly in-range cards deleted as often (36%) as women with mostly out-of-range cards (24%). Not explained by overload either (3.9 vs 3.7 matches).

## Cards and the score

- Feeds have enough cards: the median active member has 12–13 open cards; 2–3% have none. Card quality is the problem.
- The score points the right way: men's «مهتم» goes from 4% (score 60–65) to 22% (90+), women's from 2% to 15%.
- 36% of women's cards broke the woman's own age range; she said «مهتم» to 1.5–3% of them, about 24% inside it. Men: 18.6% outside his range, 50.3% inside; 23% of men's cards were outside. Age is only 2 of about 11 preference points, so these cards still scored about 75.
- What women choose on: a man 0–12 years older with a bachelor's or higher gets 23% «مهتم»; every other card 1–8.5% (average score 77 vs 70). By education: high school 5%, diploma 7%, bachelor's 15%, master's 26%. Height under 175 cm 8–9%, 175+ 15–17%. A younger man 2%.
- 35% of the score is "profile quality" when neither has the quiz (27% of men and 40% of women took it), and the identity points can never be earned.
- Interest is uneven: 54% of men got no «مهتم» from women in 3 weeks; the top 10% got 64% of it.
- Supply inside both age ranges is ample: median active man 74 new people, woman 130 (11% of men and 4% of women have fewer than 5).

## Activity

- «مهتم» to someone seen the same day became a match 30% of the time (men) and 72% (women). One day away: 10% / 29%. 2–3 days: 7% / 21%. 4+ days: 0–3%.
- `suggest_active_3_days` already keeps people away more than 3 days out of «جديدة»; its empty-feed exception applies to under 1% of members.
- 438 «مهتم» (25%) waited on people away 3+ days on 2026-11-27.

## After the match

- Matches 1–12 Nov: 894 matches, 839 chats, 77% of chats ended within a week, 13 extended, 108 family requests (12%), 86 accepted.
- Women send 85% of family requests (89% accepted); men's are mostly not accepted (9%).
- The outcome question: 235 "not a match", 1 engaged.

## Payments

- 245 members opened a checkout since 9 Nov; 49 (20%) ever paid. 202 checkouts expired after 30+ minutes on the Stripe page; 1 card was declined.

## Done from this analysis

- `respect_age_range` and `suggest_today_first` built and deployed off (`3678495a`); `respect_age_range` turned on 2026-11-27 17:01 Amman. Before: 47% of new Jordanian cards broke someone's age range; after: 0 of the first 27.

## Next changes, ranked

1. A required one-tap reason when deleting, with «إيقاف مؤقت» offered first, and "found someone here" as an answer. Website first; the app needs a version.
2. Score weights: less "quality", more age gap and education (test on past decisions first).
3. A reminder to women that «مهتمون بك» cards wait and the reply is free (women answer 46% of them, median 8 h).
4. Fair exposure: fewer cards for men with no «مهتم» after about 20 cards, shown to the women most likely to say yes, plus a profile tip.
5. Push asked right after the first «مهتم» or match; app install pushed to website members (the app part needs a version).
6. A family-step offer around day 3 of an active chat, and a short "how did it go?" when a chat ends.
7. Payments: check Apple Pay and Google Pay in JOD, try `arabic_checkout`, consider a local method (CliQ or a wallet).
8. An earlier refund when the other side has been away 3 days since the «مهتم».
