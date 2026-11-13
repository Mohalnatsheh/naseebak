# «عروض الجمعة البيضاء»: 50% more credits (design, 2026-11-13)

## Intent

The owner wants a White Friday sale: during a set period, anyone who buys a credit package or starts a Pro
subscription gets 50% more credits than usual. The aim is more sales in a short window. Members hear about it
through the payment pages, a popup and a notice.

## Goals

- Credit packages: during the offer, a purchase gives `credits + bonus`, with `bonus = ceil(credits × percent / 100)`
  (10 → 15, 25 → 38 at 50%). (Rounding up is my call: «+50%» should never give less than half.)
- Pro: the **first paid invoice only** gets the extra (owner). Renewals give the normal amount. Yearly: the bonus is
  50% of what the first invoice grants (its first month), not of the whole year (my call, to keep "first payment" literal).
- All countries where buying is open (`purchasesAvailable`). Lebanon is included automatically once its prices are
  approved; until then it gets no offer, no popup and no notice (owner said all countries; buying there is off).
- Shown while the offer runs: on the website payments page (`/dashboard/payments`), the Pro page (`/dashboard/pro`)
  and the app's credits and Pro screens.
- A popup (Admin → Alerts) and one notice to all members (Admin → Notifications) when the offer starts.

## Non-goals / anti-goals

- No price change, no Stripe coupon: the price stays, the credits grow.
- A refund must never leave the bonus behind, and a payment made before or after the window never gets it.
- No new app version required.
- Renewals never carry the bonus, even for a subscription started during the offer.

## Constraints (from the code)

- Package credits come from code and refunds read them there (`packages.ts`, `refund.ts`). So the bonus is
  stored on the payment.
- Pro stores `creditsPerGrant` on the subscription from the checkout metadata: the bonus must **not** go there, or
  every renewal would carry it.
- Switches are cached 30 s; schema changes must be additive; live site.
- The app shows a package's `name` and `credits` as the server sends them (`credits_repository.dart`).

## Approaches

1. **Time-limited switch with dates (picked).** Settings `offer_bonus_percent` (0 = off), `offer_starts_at`,
   `offer_ends_at`, `offer_title` in Admin → Settings. The server decides at checkout, records the bonus, and the
   offer ends on its own. Reusable for later offers.
2. Temporary package ids with the bonus built in: two deploys, doesn't cover Pro. Dropped.
3. Stripe coupons: a discount, not extra credits. Dropped.

## Design

**Offer state** (`src/lib/payments/offer.ts`, db-free helpers + one reader using `getSetting`):
`activeOffer(country, now)` → `{ percent, title, endsAt } | null`. Active when percent > 0, `startsAt ≤ now < endsAt`
and the country is selling. `bonusFor(credits, percent)`.

**Credit packages**
- Checkout (`/api/payments/checkout`, `/pay` PaymentIntent `intent.ts`, mock checkout): if an offer is active when
  the checkout is created, metadata `credits` = total and a new `bonusCredits` field is written. The decision is made
  at creation (like `chargeCurrency`): a checkout opened at 23:58 and paid at 00:05 keeps the bonus.
- Schema (additive): `Payment.bonusCredits Int?`.
- Fulfil: unchanged (adds metadata `credits`). The ledger note says the offer.
- Refund: take back `pkg.credits + (payment.bonusCredits ?? 0)`.
- `/api/payments/plans`: while active, each package carries `bonusCredits`, `credits` stays the base, and `name`
  becomes «10 أرصدة + 5 هدية» so older apps show it; plus top-level `offer { title, percent, endsAt }`.

**Pro**
- Checkout (`lib/pro/checkout.ts`): metadata gets `offerBonus` when active. `creditsPerGrant` stays the normal amount.
- First paid invoice (`stripe-events.ts`): besides the normal `invoice:<id>` grant, a second `grantProCredits` with key
  `offer:<invoiceId>` and the bonus, tied to the same `paymentId`. A refund of that invoice already takes back every
  grant of that payment, so the bonus goes back too. A duplicate/not-live subscription follows the existing rules.
- `/api/pro` offers: each plan carries `bonusCredits` while active.

**Display**
- Website: a gold offer banner (`accent`, `accent-ink`) above the packages on `/dashboard/payments` and the plans on
  `/dashboard/pro`, with the end date; each package and plan shows «+5 هدية». Copy stays gender-neutral.
- App: the existing screens show the server's `name`/`credits` (no version). A dedicated badge needs a version: later.

**Popup and notice** (existing admin tools, no code): ready-made texts in the spec appendix for the owner to send
from Admin → Alerts (button «اشحن الآن» → `/dashboard/payments`, start/end = the offer) and Admin → Notifications,
per selling country. The Lebanese dialect rule applies to automatic notices only; admin sends are verbatim.

**Admin**: Settings fields for percent, start, end, title; Admin → Payments shows a payment's bonus.

## Left to the builder

- Exact banner layout (follow the one-banner rule on the page).
- Tests: bonus maths, window edges, refund with bonus, Pro first invoice vs renewal, inactive country.

## Appendix: texts (draft, owner to approve)

- Popup / notice title: «عروض الجمعة البيضاء»
- Body: «احصل على رصيد إضافي بنسبة 50% عند شراء أي باقة أو الاشتراك في Pro، حتى <التاريخ>.»
- Button: «اشحن الآن»

Dates: not set yet; the owner sets them in Admin → Settings.
