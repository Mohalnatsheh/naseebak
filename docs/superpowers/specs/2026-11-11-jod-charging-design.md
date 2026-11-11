# Charge Jordan in dinars (JOD): design

Status: draft for owner approval (2026-11-11)

## Why

Today Jordanian members see prices in dinars, but the card is charged in US dollars: 3 JD shows up as 4.23$, and the payment page says «تُخصم 4.23$ بالدولار». The checkout numbers for the week before 2026-11-11 are poor. Of 106 credit checkouts, 66 never had a card entered, and only 18 paid. Of 14 Pro checkouts, 10 never tried a card. A foreign-currency charge is one likely reason, because it makes the payment look foreign and some banks add a fee. On 2026-11-11 Stripe test mode confirmed that our account can charge in JOD for every flow we use: credits on the Arabic page, hosted checkout, all three Pro plans, a paid Pro invoice, a 3DS check, a decline and a refund.

## Goal

When the switch is on, new Jordanian purchases are charged in JOD for exactly the shown dinar price, and nothing on the website or in the app mentions dollars for Jordan.

Success means a Jordanian member paying for «10 أرصدة بـ 3 د.أ» sees 3.000 JOD on Stripe's page, in Apple Pay or Google Pay, and on their bank statement.

## Non-goals

- Saudi Arabia (SAR) and Lebanon (USD) don't change.
- No price changes. Same packages, same Pro prices, same credits.
- No new app version. The app shows what the server sends: the dollar line disappears by itself once the server stops sending a USD charge.
- No local payment method yet, such as CliQ.

## Anti-goals (would make it a failure even if it "works")

- A past payment that was charged in dollars suddenly shows or refunds as if it had been charged in dinars, or the reverse.
- An existing Pro subscriber's renewal changing currency or price. Their Stripe subscription stays in USD until it ends.
- An amount off by ×10, because JOD has 1,000 fils where USD has 100 cents.
- Turning the switch off breaks anything. Off means today's behaviour, exactly.

## The switch

`jod_charging` in `system_settings`, shown in Admin → Settings. Off by default and off in production until the owner turns it on. It only affects new Jordanian checkouts: credits on both the Arabic page and the hosted page, and new Pro subscriptions.

## Behaviour with the switch on

1. **Charge.** A Jordanian package or Pro offer charges `jod` at `price × 1000` fils. Stripe requires the last fils digit to be 0, so the amount is rounded to whole 10 fils. Every price today is a whole dinar, so nothing actually rounds.
2. **What the member reads.** Every dollar mention for Jordan disappears:
   - the «يُخصم … بالدولار» line on package cards and Pro plans;
   - «المبلغ الذي سيظهر في صفحة الدفع: …$»;
   - the line on `/pay/<id>`;
   - the dollar part of the hosted-checkout message (`checkoutMessage`);
   - the Jordan note on the payments page, which becomes something like «الأسعار والدفع بالدينار الأردني …», keeping the LOGICCR statement name and the seller line.
   
   For the app, `/api/payments/plans` stops sending `chargeUsd`, and `chargeLabel` becomes «3 د.أ», which the app already hides when it matches the price.
3. **Recording what was charged.** Each new Payment row stores the currency the card was actually charged in, in a new nullable column `Payment.chargeCurrency` (`"jod"`, `"usd"` or `"sar"`). This is additive, so it needs `--db-push`. When the column is null (every older row), the current rule applies: JOD rows were charged in USD at 1.41. History, the payment page, refund texts and the admin refund preview all read this field, so old rows keep showing «(4.23$)» and new rows show the dinar price alone.
4. **Pro renewals.** A renewal's Payment row takes its charge currency from the Stripe invoice (`invoice.currency`), not from the switch. Subscribers who started in USD keep renewing in USD, and their rows say so. New subscribers renew in JOD.
5. **Minor units.** One helper gives the number of minor units per currency (jod 1000, usd 100, sar 100). Every place that turns a Stripe amount into a readable number uses it. Today's `/ 100` in the admin refund and dispute emails would be ×10 wrong for JOD.

## With the switch off

Exactly today's behaviour. New rows still get `chargeCurrency` filled in (`"usd"` for Jordan), which only makes the record more exact.

## Constraints

- The schema change is additive (one nullable column) and goes out with `--db-push`, after checking the diff.
- Older app versions keep working: no response field changes type, and `chargeUsd` was already optional.
- The client never imports a runtime value from a db-importing module, so the switch reaches pages through their API answers or server components.
- Tests come first (Vitest). Then a Stripe test-mode run against a local production build with the switch on: credits on `/pay`, hosted credits checkout, a Pro checkout and a refund.
- Ask the owner before the deploy and again before turning the switch on.

## Settled details

These are my calls (Claude's), marked so the owner can check them.

- **The currency is fixed when the checkout is created.** The Payment row gets its `chargeCurrency` at that moment. Every later step on that row reads the row's value and never re-reads the switch: `/pay/<id>` reusing or recreating an intent, retries, reconcile, refunds. Flipping the switch never changes a checkout that is already open.
- **Pro rows keep the dinar price for display.** On every Pro row, `amount` and `currency` stay the display price, as today (`sub.price` / `sub.currency`). Only `chargeCurrency` follows the Stripe invoice. If an invoice's currency differs from what was expected, it is only logged, never acted on.
- **Old rows read exactly as today.** The display helpers (`formatPaidCharge`, `formatPaidAmount`, `refundAmountText`) get an optional `chargeCurrency`. When it is null, they return exactly what they return today (the ×1.41 rule). Every caller passes the row's value.
- **Jordanian prices have two decimals at most.** In Admin → Countries a JOD price is limited to 2 decimals, so a charge never needs rounding and always equals the shown price.
- **The app is safe.** It reads Pro's `chargeCurrency` only to show the dollar line when it is `usd`, and for credits it shows `chargeLabel` only when it differs from the price. A `"jod"` value hides both in every app version.
- **What you receive doesn't change.** Stripe already converts today's USD charges to the AED payout. A 3 JOD test payment paid out 15.54 AED with a 1.86 AED fee, about the same as 4.23$ today.

## What is left to the builder

- The exact Arabic wording of the new Jordan note on the payments page. Keep the statement name and the seller.
- Whether the switch is read once per request and passed down, or read where it's needed (it is cached for 30 seconds).

## Known gap

Apple Pay and Google Pay in JOD can't be tested through the API. Check them on a real iPhone and Android phone right after the switch is turned on, then watch the first real payments. If anything looks wrong, turning the switch off brings back today's behaviour at once.
