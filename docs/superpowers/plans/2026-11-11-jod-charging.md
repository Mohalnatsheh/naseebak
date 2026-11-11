# JOD Charging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With switch `jod_charging` on, new Jordanian purchases (credits and new Pro subscriptions) are charged in JOD for the shown dinar price, with no dollar mentions for Jordan. Off means today's behaviour, exactly.

**Architecture:** The money helpers in `src/lib/payments/packages.ts` (db-free) gain a `jod` flag that turns a JOD price into a `jod` charge in fils. Server callers decide the flag once per request via `jodChargingFor(country)` (settings, 30s cache). Each new Payment row stores the real `chargeCurrency`, and every display reads it, with null meaning the legacy USD×1.41 rule.

**Tech Stack:** Next.js 16, Prisma 7, Stripe, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-jod-charging-design.md`

## Global Constraints

- The switch is `jod_charging`, default `"false"`. It acts only on country JO.
- The JOD charge is `Math.round(price * 100) * 10` fils (whole 10 fils). Admin prices already allow at most 2 decimals (`src/lib/validations/country-settings.ts`), so no validation change.
- Schema: one nullable column `Payment.chargeCurrency String?` (`"jod" | "usd" | "sar"`), additive.
- A row's `chargeCurrency` is null for old rows. Every display then gives exactly today's output.
- No response field changes type. `chargeUsd` stays optional, sent only for a USD charge of a non-USD price.
- No new app version.
- Client components never import runtime values from db-importing modules.
- `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` must pass.

## Review Focus

1. A JO row with `chargeCurrency` null (older payment) → history, `/pay`, refund notice and admin preview still show «… (4.23$)» / "USD charged". Test in Task 1.
2. A switch flip between checkout and `/pay` → `/pay` reads the row's `chargeCurrency`, not the switch. Test in Task 3.
3. A Pro renewal of a USD-started subscription after the switch is on → its row gets `chargeCurrency: "usd"` from `invoice.currency`. Test in Task 3.
4. A Stripe amount in an admin email for a JOD charge → divided by 1000, not 100. Test in Task 1 (`fromMinor`).
5. SA and LB with the switch on → unchanged charges (`sar`, `usd`). Test in Task 1.

---

### Task 1: Money helpers know JOD

**Files:**
- Modify: `src/lib/payments/packages.ts`, `src/lib/pro/plans.ts`, `src/lib/admin/refund-preview.ts`
- Test: `src/__tests__/payments/jod-charging.test.ts` (new)

**Interfaces (produces):**
- `type ChargeCurrency = "usd" | "sar" | "jod"`. `CreditPackage.chargeCurrency` and `ProPlanOffer.chargeCurrency` take this type.
- `minorUnits(currency: string): number`: 1000 for jod (case-insensitive), 100 otherwise.
- `fromMinor(amount: number, currency: string): number`.
- `chargeFor(price, currency, jod = false)`: with `jod && currency === "JOD"` it returns `{ chargeCurrency: "jod", chargeAmount: Math.round(price*100)*10 }`; otherwise it behaves as today.
- `packagesFor(country, prices?, jod = false)`, `findPackage(id, country?, prices?, jod = false)`, `proOffersFor(country, plans, jod = false)`.
- `formatCharge(p)`: for jod it returns `` `${fromMinor} د.أ` `` (for example «3 د.أ»).
- `formatPaidCharge(payment: { amount; currency; chargeCurrency?: string | null })` and `formatPaidAmount(same)`: `chargeCurrency === "jod"` gives the dinar price alone; null or other values work as today.
- `refundAmountText(p: { amount; currency; chargeCurrency?: string | null })`: jod gives `"6.00 JOD"` with no "USD charged".

- [ ] **Step 1: Write the failing tests** in `jod-charging.test.ts`:
  - `chargeFor(3, "JOD")` returns `{chargeCurrency:"usd", chargeAmount:423}`.
  - `chargeFor(3, "JOD", true)` returns `{chargeCurrency:"jod", chargeAmount:3000}`.
  - `chargeFor(2.99, "JOD", true).chargeAmount` is `2990`.
  - `chargeFor(15, "SAR", true)` returns `sar 1500`.
  - `chargeFor(3, "USD", true)` returns `usd 300`.
  - `packagesFor("JO", null, true)` charges every package in jod at price×1000.
  - `packagesFor("SA", null, true)` is unchanged.
  - `findPackage("launch_10","JO",null,true)` charges jod 3000.
  - `proOffersFor("JO", {monthly:{enabled:true,price:10,credits:20}}, true)[0]` is jod 10000.
  - `formatCharge({chargeCurrency:"jod", chargeAmount:3000})` is `"3 د.أ"`.
  - `formatPaidAmount({amount:"6", currency:"JOD"})` is `"6 د.أ (8.46$)"`, the legacy output.
  - `formatPaidAmount({amount:"6", currency:"JOD", chargeCurrency:"jod"})` is `"6 د.أ"`.
  - `formatPaidAmount({amount:"6", currency:"JOD", chargeCurrency:"usd"})` is `"6 د.أ (8.46$)"`.
  - `refundAmountText({amount:"6", currency:"JOD"})` is `"6.00 JOD (8.46 USD charged)"`.
  - `refundAmountText({amount:"6", currency:"JOD", chargeCurrency:"jod"})` is `"6.00 JOD"`.
  - `fromMinor(3000,"jod")` is 3, `fromMinor(423,"USD")` is 4.23, `minorUnits("sar")` is 100.
- [ ] **Step 2:** Run `npx vitest run src/__tests__/payments/jod-charging.test.ts`. Expect it to fail.
- [ ] **Step 3:** Implement the interfaces above. `withPrice` passes `jod` through to `chargeFor`, and the static `PACKAGES` entries are mapped through `chargeFor` when `jod` is true. Update the module doc comments.
- [ ] **Step 4:** Run the new test file and the existing payments and pro tests: `npx vitest run src/__tests__/payments src/__tests__/pro`. Expect them to pass.
- [ ] **Step 5:** Commit.

### Task 2: Switch, column and Admin toggle

**Files:**
- Modify: `prisma/schema.prisma` (Payment: `chargeCurrency String?` with a `///` doc line), `src/lib/settings.ts`, `src/app/api/admin/settings/new-cycle/route.ts`, the Admin → Settings page that toggles `chatDeleteEnabled`
- Test: extend the existing new-cycle settings route test (find it with `grep -rl new-cycle src/__tests__`)

**Interfaces (produces):**
- `DEFAULTS.jod_charging = "false"`.
- `jodChargingFor(country: string | null | undefined): Promise<boolean>` in `src/lib/settings.ts`: true only when the country is `"JO"` and the setting is `"true"`.
- The admin GET returns `jodCharging: boolean`. The admin PATCH accepts `jodCharging?: boolean` and logs `[admin settings] jod_charging=…`.
- The Admin toggle reads "Charge Jordan in JOD", with the help text "New Jordanian purchases are charged in dinars instead of US dollars. Existing Pro subscriptions keep their currency."

- [ ] **Step 1:** Write the failing tests:
  - `jodChargingFor("JO")` is false by default and true when the mocked setting is "true".
  - `jodChargingFor("SA")` is always false.
  - The route's PATCH `{jodCharging:true}` calls `setSetting("jod_charging","true")`.
- [ ] **Step 2:** Run them. Expect them to fail.
- [ ] **Step 3:** Implement. Run `DATABASE_URL=postgresql://<user>@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate`.
- [ ] **Step 4:** Run the tests. Expect them to pass. Also run `npx tsc --noEmit`.
- [ ] **Step 5:** Commit.

### Task 3: Checkouts charge and record the currency

**Files:**
- Modify: `src/app/api/payments/checkout/route.ts`, `src/lib/pro/checkout.ts`, `src/lib/pro/stripe-events.ts`, `src/lib/pro/my-state.ts`, `src/lib/pro/on-sale.ts`, `src/lib/payments/refund.ts` (admin email amounts)
- Test: the existing checkout and Pro tests in `src/__tests__/payments/` and `src/__tests__/pro/`

**Interfaces (consumes):** Task 1 helpers and Task 2's `jodChargingFor`.

- [ ] **Step 1:** Write the failing tests:
  - Credits checkout, JO member, switch on: the Stripe `line_items[0].price_data` is `{currency:"jod", unit_amount:3000}` for `launch_10`, the PaymentIntent params have `currency:"jod", amount:3000`, and `payment.create` data has `chargeCurrency:"jod"`.
  - The same with the switch off gives `usd 423` and `chargeCurrency:"usd"`.
  - SA member, switch on: `chargeCurrency:"sar"`.
  - Pro checkout, JO, switch on: `price_data.currency` is "jod" and `unit_amount` is 10000, and the row has `chargeCurrency:"jod"`.
  - Renewal invoice with `currency:"usd"` on a JOD-display subscription: the created row has `chargeCurrency:"usd"`, `amount` = `sub.price`, `currency` = `sub.currency`.
  - First invoice completing the checkout row: the update sets `chargeCurrency` from `invoice.currency`.
  - The admin refund-alert text for a jod charge with `amount_refunded:1000, amount:3000` reads "1.00 of 3.00 JOD".
- [ ] **Step 2:** Run them. Expect them to fail.
- [ ] **Step 3:** Implement:
  - Read `jodChargingFor(country)` once per request and pass it to `findPackage` and `proOffersFor`, including in my-state, on-sale and the stripe-events offer lookup.
  - Store `chargeCurrency: pkg.chargeCurrency` / `offer.chargeCurrency` on the new rows.
  - On invoice rows (create and the first-invoice update), set `chargeCurrency: invoice.currency?.toLowerCase() ?? null`.
  - When an invoice's currency differs from the stored checkout row's `chargeCurrency`, add a `console.warn("[pro] invoice currency differs", …)` with ids only, and no other effect.
  - Replace the `/ 100` amount formatting in `refund.ts` with `fromMinor`.
- [ ] **Step 4:** Run `npx vitest run src/__tests__/payments src/__tests__/pro`. Expect them to pass.
- [ ] **Step 5:** Commit.

### Task 4: No dollars for Jordan in what members read

**Files:**
- Modify:
  - `src/app/api/payments/plans/route.ts`;
  - `src/app/(ar)/dashboard/payments/page.tsx` (the JO note, `chargeUsd` lines, history);
  - `src/app/(ar)/pay/[id]/page.tsx`;
  - `src/lib/payments/checkout-branding.ts`;
  - `src/lib/payments/refund.ts` (member notice: pass the row's `chargeCurrency`);
  - `src/app/(ar)/refund-policy/refund-policy-view.tsx` and its page;
  - `src/app/(en)/admin/countries/page.tsx`;
  - the admin payments refund preview caller (pass `chargeCurrency`).
- Test: the plans route test, the checkout-branding test and the refund notice test.

**Interfaces (consumes):** the Task 1 helpers, the Task 2 `jodChargingFor`, and `Payment.chargeCurrency`.

Copy (fixed):
- Payments page note, JO, switch on: «الأسعار والدفع بالدينار الأردني (يظهر في كشف الحساب باسم LOGICCR). البائع: LOGIC CENTER FOR WEBSITE DESIGN». The plans API sends a `jodCharging: boolean` so the client picks the note.
- Refund policy, switch on: «تُعرض الأسعار ويتم الخصم بالدينار الأردني. تظهر العملية في كشف حسابك باسم LOGICCR.»

- [ ] **Step 1:** Write the failing tests:
  - With the switch on for JO, the plans route has no `chargeUsd`, `chargeLabel` is "3 د.أ" for `launch_10`, and `jodCharging` is true.
  - With the switch off, `chargeUsd` is 4.23.
  - `checkoutMessage` for a jod package contains no «بالدولار».
  - The refund notice for a row with `chargeCurrency:"jod"` reads «تم استرداد 3 د.أ …».
- [ ] **Step 2:** Run them. Expect them to fail.
- [ ] **Step 3:** Implement:
  - `/pay` shows the dollar line only when `payment.chargeCurrency !== "jod"` and the package charges usd for a non-USD price. Its `formatPaidCharge` call passes the row's `chargeCurrency`.
  - The admin countries page passes `jod` from the settings data, or simply labels it "Card is charged … (JOD when jod_charging is on)". Keep it minimal.
- [ ] **Step 4:** Run the full gate: `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expect everything to pass.
- [ ] **Step 5:** Commit.

### Task 5: Real Stripe test-mode run and docs

- [ ] Run a local production build (CLAUDE.md "Real-flow QA") with `STRIPE_SECRET_KEY` set to the test key from `.env.development.local` (`STRIPE_TEST_SECRET_KEY`), `PAYMENTS_MOCK` unset and the switch on locally:
  - buy `launch_10` on `/pay` with 4242…, and confirm Stripe shows 3.000 JOD and the credits arrive (through the webhook or the status check);
  - start a Pro monthly hosted checkout and confirm it shows JOD 10.000;
  - confirm the history row shows «3 د.أ» with no dollars;
  - turn the switch off and confirm a new checkout is in USD 4.23.
- [ ] Update `CLAUDE.md` (Money and credits: the `jod_charging` line) and `docs/reference/payments.md`. Commit.
