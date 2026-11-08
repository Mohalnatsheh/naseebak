# Free «مهتم» reply — design

Date: 2026-11-08 · Scope: everyone (owner, 2026-11-08) · Switch: `free_interest_reply` (Admin → Settings, off by default)

## Why

Production, 24 days to 2026-11-08 (read-only queries):

- 4,584 «مهتم» were sent; 63% (2,874) were never answered. 79% of the unanswered ones were waiting on a woman, and
  1,610 were waiting on someone active in the last 7 days.
- After a match, chat already works: about 83% of matches got a chat with messages (630 of 759).
- So the weak step is the reply. The person replying has to spend a credit even though one tap makes the match.
  Making that reply free removes the money decision at the moment that creates matches, and so chats.

## What the owner decided

- Answering a «مهتم» with «مهتم» is **free for everyone** (men and women, Jordan and Saudi Arabia).
- It sits behind a switch in Admin → Settings that the owner can turn on and off. Off = exactly today's behaviour.
- The first «مهتم» still costs 1 credit. «لا» stays free. A match then costs 1 credit instead of 2.
- It ships with a new app version (Play Store first), handled correctly in the app and on the website.

## Rules (switch on)

A reply is free when, at the moment of the decision, the **other side's decision on that MUTUAL card is already
`INTERESTED`** (the card shows `likedYou` in the feed: the «مهتمون بك» tab, and «جديدة» cards the other side already
liked).

- **Charge:** none. No `INTEREST` ledger row, no `reserveCredits`, no `NO_CREDITS` refusal, even at 0 credits.
- **Chat / family choice and guardian consent still apply.** Today `decideSuggestion` ties them to the charge
  (`const preference = charge ? args.introPreference : undefined`). Split this into two conditions:
  - asks for an introduction choice = `creditOnInterest && interested` (unchanged meaning);
  - is charged = that, and not a free reply.
  The choice, the `checkIntroPreference` check and consent must be stored on free replies too, otherwise matches
  open with no preference.
- **Atomic:** the free path's claim must also require the other side's decision to still be `INTERESTED` in its
  `where`, so the "free" check and the write are one step. If both people tap «مهتم» at the same moment, both see
  "not answered yet" and both pay: each was the first «مهتم» from their own view. Accepted.
- **Balance in the reply:** the decide response returns `creditsLeft` on free replies too (the unchanged balance),
  so the website doesn't take 1 off on its own (`data.creditsLeft ?? balance - 1`).
- **Refunds:** unchanged. A free reply has no `INTEREST` row, so it can never be refunded (nothing was paid). The
  first person's refund rules are unchanged: refund only if the other side never answered and the card closed; a
  match lost at the last moment refunds whoever paid.
- **Second chance** (`reopenSecondChances`): the first person already got their refund. With the switch on, the
  reply is free too, so that match costs nobody anything. Accepted (at most 3 a day). *Builder's/Claude's call;
  owner may object.*
- **Legacy flow:** untouched. The switch only acts when `credit_on_interest` is on
  (`freeInterestReply = creditOnInterest && setting === "true"` in `getCycleFlags`).

Switch off: byte-for-byte today's behaviour (tests must prove it).

## What members see (switch on)

Copy follows the switch (project rule: never describe a switched-off feature, never say something costs when it
doesn't). Everything is gender-aware (`forViewer`), with no masculine commands in shared text.

### Website

- **Suggestion card with `likedYou`:** instead of ««مهتم» يستخدم رصيداً واحداً» or the 0-credit recharge line, show
  a short line that the reply is free (e.g. «الرد بـ«مهتم» مجاني»). The «مهتم» button stays enabled at 0 credits on
  these cards. Cards without `likedYou` behave as today (cost note, disabled at 0).
- **Interest dialog (chat/family choice):** for a free reply, replace the cost box («مهتم يستخدم رصيداً واحداً —
  رصيدك …» and the refund line) with a free line; at 0 credits show the normal choice and submit, not the
  recharge footer.
- **Banners:**
  - The «مهتمون بك» banner at 0 credits («شخص مهتم بك ينتظر ردّك. انتهى رصيدك، اشحن لتردّ…») becomes a line that
    the reply is free.
  - The general 0-credit banner keeps applying to «جديدة».
- **Dashboard home and next-step card:** a «مهتم» waiting on you is shown as the next step even at 0 credits, and
  the recharge step only wins when no free reply is waiting.
- **Public/help copy:** FAQ (both countries), terms, landing "choose" step and the dashboard payments page add one
  sentence when the switch is on: replying «مهتم» to someone who already showed interest is free. Copy for the
  first «مهتم» stays.

### Notices

- «شخص أبدى اهتمامه بك» (`notifyInterestShown`) and «شخص ينتظر ردّك» (`remindWaitingInterest`): drop the
  0-credit top-up line («رصيدك صفر: اشحن … لتردّ»), which would now be untrue. Add a short "the reply is free"
  line instead. Keep `UNPAID_TITLE` and the «صفر: اشح» top-up line wherever it still applies (Admin Insights counts
  them by text). Update `src/lib/notifications/automatic.ts` and its guard test together.
- The interest SMS stays as it is: it has no credit wording, and adding "free" would go past 70 characters.

### App (new version 1.0.1)

- Parse the new flag from `/api/me/counts` → `flags.freeInterestReply`.
- Per card: «مهتم» is disabled only if `outOfCredits && !(freeInterestReply && item.likedYou)`. The note under the
  button is the free line on those cards, the cost line on the others.
- InterestSheet: a `free` mode that shows the free line instead of «يُخصم رصيد واحد عند إرسال «مهتم» · رصيدك …».
- The 0-balance banner on the «مهتمون بك» tab says the reply is free instead of asking to recharge.
- Old app versions: the owner turns on the force update to 1.0.1 once that version is live (owner, 2026-11-08), so
  the free-reply notices are true for everyone using the app. Until then, members with credits on the old app are
  not charged for a reply (its built-in text still says a credit is used), and members at 0 credits there still
  see «مهتم» locked. The notices therefore send the free line to every recipient while the switch is on, with no
  version check.

### Admin

- New row in the new-cycle settings card: "Free «مهتم» reply" with a one-line explanation, enabled only while
  «Credit on interest» is on, like the other sub-switches. No turn-off confirmation needed (turning it off restores
  the charge; nothing is lost).
- Insights "0 credits with a «مهتم» waiting": with the switch on these members are not stuck. Add a note on that
  card (or hide the metric) so it doesn't mislead.

## Non-goals

- No 1-credit reply gift / reserved credit for old app versions (*Claude's call*: the new version fixes it properly;
  22 app members at 0 credits with a reply waiting today).
- No price change for the first «مهتم»; no change to refunds, packages, «لا», requests, chat or the legacy flow.
- No SMS wording change.

## Anti-goals (would make this a failure even if it "works")

- A free reply that loses the chat/family choice or guardian consent.
- Any charge or ledger row that doesn't match what the member was told.
- A member at 0 credits told to recharge for something that is free.
- Old app versions breaking (API changes stay backward compatible: new fields only).

## Release

1. Build server + website + app, with tests. Switch stays off.
2. Deploy the website (needs the owner's go-ahead; no schema change, the switch is a `system_settings` row with a
   code default).
3. App: version `1.0.1+2` in `pubspec.yaml`, signed Android App Bundle (`flutter build appbundle`), handed to the
   owner to upload in Play Console. The build also carries the app changes already waiting (setup profile refresh,
   `X-App-Platform`, Crashlytics fixes, Saudi WhatsApp wording, activity label). iOS is out of scope for now
   (App Store 1.0.0 still in review).
4. Copy the changed app files to the mirror repo and push it (as `naseebak_app/CLAUDE.md` requires).
5. The owner turns the switch on in Admin → Settings when ready, together with the force update to 1.0.1.
   *Claude's suggestion:* after 2026-11-18, so it doesn't mix with the `feed_active_first` / SMS measurements
   already running (around 2026-11-14 and from 2026-11-18). If the App Store approves iPhone 1.0.0 first, the iPhone
   build needs 1.0.1 too before the force update goes on.
6. Measure: reply rate on «مهتم» and new matches per day, two weeks before vs after turning it on.

## Docs to update

`CLAUDE.md` (switch list, Money and credits, Suggestion flow), `docs/reference/suggestions-and-credits.md`
(the "still costs 1 credit" line and the parked item), `naseebak_app/CLAUDE.md` (version status, waiting list),
`docs/platform-flow.html` if it describes the reply cost.

## Left to the builder

Exact Arabic wording of the new lines (short, gender-aware, consistent with existing copy), component structure,
test layout, how the flag reaches server-rendered public pages.
