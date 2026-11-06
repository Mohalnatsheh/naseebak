# Payments

Stripe flow, checkout page, prices and conversion work. Failure reasons are in admin-panel.md.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Stripe payments

- Jordan's prices are shown in JOD and charged in **USD**, Saudi Arabia's shown and charged in SAR — one package list per country in `src/lib/payments/packages.ts`, prices set in Admin → Countries (see Money under Countries; the payments page shows the USD amount; owner's choice, Oct 2026).
- Flow: `POST /api/payments/checkout` → embedded Stripe Checkout Session (metadata `app: "naseebak"`, `paymentId`, `userId`, `credits`; expires after `CHECKOUT_TTL_MS` = 35 min) → the PENDING `Payment` row (with `stripeSessionId`) is written only after Stripe returns the session (a Stripe error → 502, logged as `[payments] Stripe checkout session failed`, no row) → credits are added by `fulfilCheckoutSession()` (`src/lib/payments/fulfil.ts`) only when `payment_status === "paid"`, once (claims the Payment row in the same transaction, also a FAILED/timed-out one), from three places: the webhook (`checkout.session.completed` / `async_payment_succeeded`), the return page (`session-status`, owner only) and the daily job (`reconcileStripePayments`, sessions of the last 3 days).
- **The Stripe account is shared with other sites:** anything without our metadata is ignored (`isOurSession`).
- «رجوع» / «إلغاء» (`POST /api/payments/cancel` with `paymentId`) expires the Stripe session and fails the row (credits it instead if it was paid meanwhile); `checkout.session.expired` / `async_payment_failed` fail it too.
- `charge.refunded` (full) → `applyRefund()` (`src/lib/payments/refund.ts`, also used by the admin refund route: REFUNDED once, package credits taken back floored at 0, ledger REFUND, notice in USD); partial refund → admin email only; `charge.dispute.created` → `Payment.disputedAt` + admin email.
- Payment and CreditLedger rows survive account deletion (`userId` set null).
- Webhook events to enable on the naseebak.com endpoint: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`.
- Lazy-init client in `src/lib/stripe.ts`.
Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Prices per country

- **Money:** package prices are set in Admin → Countries (`country_settings.packagePrices`, by package id; the prices in `src/lib/payments/packages.ts` are defaults) and reach the site, the app (`/api/payments/plans`), checkout and the FAQ within 30 s, with no app version.
  - A package id's credits stay in code on purpose: refunds read them from there, so a different size means a new package id.
  - Jordan's USD charge follows the dinar price at 1.41.
  - Past payments report their own amount (`formatPaidCharge`), never today's price.
  - Saudi purchases stay off until «Prices approved» is on there (`country_settings.pricesApproved`, null = `PRICES_APPROVED` in code); SAR prices are drafts until then.
  - Checkout `mode: "hosted"` for the app; `GET /api/payments/[id]/status`; local mock checkout (`PAYMENTS_MOCK=true`, `/api/dev/mock-checkout/[id]`) credits through `fulfilCheckoutSession`.

## Checkout branding

- **Checkout branding (2026-11-05):** the Stripe account is shared and registered as «LOGIC CENTER FOR WEBSITE DESIGN» (UAE, logiccr.com, statement «LOGICCR», no logo); its hosted page (the app's checkout) showed that name and a dollar price — **0 of 13 app checkouts were ever paid**, and no failed payment ever had a card attempt (people leave).
  - Every checkout now carries `checkoutPresentation(pkg, hosted)` — **`branding_settings` only on the app's hosted page**: Stripe refuses a logo on the embedded form («You cannot set `logo` when `ui_mode` is `embedded`», no `param`), which broke website checkouts 14:38:41–14:39:39 on 5 Nov (one member, 3 tries) until the rollback; `isPresentationError` now retries without the extras on any `StripeInvalidRequestError`, and both session types were checked on live Stripe before redeploying — (`src/lib/payments/checkout-branding.ts`): `branding_settings` (display name «نصيبك (Naseebak)», logo/icon from naseebak.com/images, button #22476a), an Arabic `custom_text.submit` line with the dinar price, the dollar charge and the statement name (wrapped in Unicode isolates RLI/LRI/PDI — Stripe's page is LTR and the plain text came out scrambled), product name «نصيبك · <package>», and `payment_intent_data.statement_descriptor_suffix` «NASEEBAK» (statement «LOGICCR* NASEEBAK»).
  - If Stripe refuses any of these (`isPresentationError`) the plain session is created instead.
  - Checked on two live unpaid sessions (expired right after).
  - Still showing the legal name (Stripe dashboard only): the browser tab title and the Stripe **Link** box («Pay securely at LOGIC CENTER…» — turn Link off in Settings → Payment methods; limiting the session to cards did not hide it).
  - Stripe Checkout has no Arabic locale.
  - Best fix (owner): Naseebak's own Stripe account / public business name.

## Arabic payment page

- **Arabic payment page (2026-11-05, `2082af9`, live with the switch OFF):** Stripe Checkout has no Arabic, so with `arabic_checkout` (system setting, Admin → Settings → «Mobile app»: Off / Test accounts only / Everyone; default off) a purchase is a Stripe **PaymentIntent** paid on **`/pay/<paymentId>?t=<payToken>&from=app|web`** (`src/app/(ar)/pay/[id]/page.tsx` + `src/components/payments/arabic-pay-form.tsx`: Payment Element, locale `ar`, Naseebak design, package + dinar price + dollar charge + statement name).
  - No sign-in on that page: the random `payToken` on the Payment row is the key (`tokenMatches`, constant time).
  - Logic in `src/lib/payments/intent.ts`: `usesArabicCheckout(phone)` («test» = `EXTRA_TEST_PHONES` only — note test accounts never see payments in the app, so test it on the website), `paymentIntentParams` (same metadata as Checkout sessions + `statement_descriptor_suffix` NASEEBAK), `fulfilPaymentIntent` (claim + increment in one transaction; `providerTxId` = intent id so refunds/disputes work unchanged), `reconcilePaymentIntents` (daily job, with the Checkout reconcile).
  - Paths: checkout route (intent; if Stripe refuses → the usual Checkout), webhook `payment_intent.succeeded` / `.payment_failed` (row stays PENDING with `DECLINED:<code>`) / `.canceled` (FAILED), `/payments/return` (`payment_intent` + `redirect_status` + `pid` + `from`; website members → «صفحة الرصيد», app members → back to the app), the app's status check, cancel (cancels the intent; credits it if paid; leaves it while `processing`).
  - The website's buy button follows `payUrl`; the app opens `checkoutUrl` as before (no app version).
  - Schema (additive): `payments.stripePaymentIntentId` (indexed), `payments.payToken`. naseebak.com is registered with Stripe for Apple Pay / Google Pay.
  - **Next (owner):** set «Test accounts only», buy the smallest package on the website with a test number, check credits + «تم الدفع بنجاح», then «Everyone» (or back to Off).
  - My first-look test payment on production was blocked by auto mode (writes to the DB and Stripe).

## Payment conversion

- **Payment conversion (2026-11-05, `05a5a42`, live 15:30; no app version needed):** (1) website payments page shows how much cheaper each credit is than in the smallest package («الرصيد أرخص 20٪ / 33٪», `savingVsSmallest`; separate from the opening-discount «وفّر X٪» badge; the app would need a version for it).
  - (2) Unpaid-checkout reminder `src/lib/cron/payment-reminders.ts`: PENDING/FAILED payments 50 min–12 h old → one push + bell «باقي خطوة لإتمام شحن رصيدك» (never SMS), once per payment (notification with that title after it) and once per Amman day, skipped if paid since, admins/test phones/unavailable members, quiet 23:00–09:00 Amman; first run reminded 4 members.
  - (3) 0-credit prompt: `src/lib/payments/topup-prompt.ts` `topUpLine` adds « رصيدك صفر: اشحن <smallest package> بـ <price> لتردّ.» to «شخص أبدى اهتمامه بك» (`notifyInterestShown`) and «شخص ينتظر ردّك» (`remindWaitingInterest`) when credits are 0, credit on interest is on, the country sells and it's not a test phone; website «مهتمون بك» at 0 credits shows «شخص مهتم بك ينتظر ردّك» with a one-tap «اشحن 10 أرصدة بـ 3 د.أ» → `/dashboard/payments?buy=<packageId>`, which starts that package's payment on load.
  - Measure: completed payments per day and how many «باقي خطوة» receivers pay within 24 h.
