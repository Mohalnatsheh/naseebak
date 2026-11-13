# White Friday offer (+% credits) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While an admin-set offer window is open, credit purchases and the first Pro payment give `percent`% more credits, recorded so refunds take the bonus back.

**Architecture:** Four `system_settings` keys define the offer; a db-free module does the maths and a settings reader decides "active for this country now". The bonus is fixed when the checkout is created (Stripe metadata + `Payment.bonusCredits`), granted by the existing fulfil paths, and shown by the existing APIs and pages.

**Tech Stack:** Next.js 16, Prisma 7, Stripe, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-white-friday-offer-design.md`

## Global Constraints

- Work in a separate `git worktree` off `main` (branch `feature/white-friday-offer`); stage files by path, never `git add -A`.
- Schema change is additive only: `Payment.bonusCredits Int?`.
- Off by default: `offer_bonus_percent` missing or `0` = today exactly.
- `bonus = Math.ceil(credits * percent / 100)`; percent is an integer 1–100.
- Active only when `startsAt <= now < endsAt` **and** `purchasesAvailable(countrySettings)` for the member's country.
- Pro: bonus on the **first** paid invoice only (`billing_reason === "subscription_create"`), never on `creditsPerGrant`, never on renewals, never on a not-live (duplicate/ended) invoice.
- Every credit change goes through `recordCredit()`.
- Client components never import runtime values from modules that import `@/lib/db`: the maths lives in db-free `src/lib/payments/offer.ts`.
- No forbidden Tailwind palettes; gold text on light uses `accent-ink`; copy gender-neutral; dates `"ar-JO-u-nu-latn"`, Western digits; counts with `arabicCount()`.
- No app version: older apps must keep working with the new optional fields.
- Before done: `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`.

## Review Focus

1. A checkout created inside the window and paid after it ends still gets the bonus (decided at creation) — test in Task 2.
2. Refunding a bonus purchase takes back base + bonus, floored at 0 — test in Task 2.
3. A Pro renewal of a subscription started during the offer gets no bonus — test in Task 3.
4. A webhook delivered twice grants the Pro bonus once (`offer:<invoiceId>` key) — test in Task 3.
5. A country not selling (Lebanon today) gets `offer: null` and plain package names — test in Task 4.

---

### Task 1: Offer settings and maths

**Files:**
- Create: `src/lib/payments/offer.ts` (db-free)
- Modify: `src/lib/settings.ts` (add reader)
- Modify: `prisma/schema.prisma` (`Payment.bonusCredits Int?` with a `///` comment: "Extra credits from a sale offer (e.g. White Friday), fixed at checkout; a refund takes them back")
- Test: `src/__tests__/payments/offer.test.ts`

**Interfaces:**
- Produces (offer.ts): `type OfferSettings = { percent: number; startsAt: Date | null; endsAt: Date | null; title: string }`; `type ActiveOffer = { percent: number; title: string; endsAt: string /* ISO */ }`; `bonusFor(credits: number, percent: number): number`; `offerOpenAt(s: OfferSettings, now: Date): boolean`; `offerPackageName(baseName: string, bonus: number): string` → `` `${baseName} + ${bonus} هدية` `` (e.g. `"10 أرصدة + 5 هدية"`; «هدية» stays singular after a digit, so no `arabicCount`); `DEFAULT_OFFER_TITLE = "عروض الجمعة البيضاء"`.
- Produces (settings.ts): `getOfferSettings(): Promise<OfferSettings>` reading `offer_bonus_percent`, `offer_starts_at`, `offer_ends_at`, `offer_title`; `activeOfferFor(country: string, countrySettings: CountrySettings, now = new Date()): Promise<ActiveOffer | null>`.

- [ ] **Step 1: Failing tests** — `bonusFor(10,50)===5`, `bonusFor(25,50)===13`, `bonusFor(5,0)===0`; `offerOpenAt` false when percent 0, when either date null, at `endsAt` exactly, before `startsAt`; true at `startsAt`; `offerPackageName("10 أرصدة",5)==="10 أرصدة + 5 هدية"`; `activeOfferFor` (mock `getSetting`, `purchasesAvailable`) returns null for a non-selling country and `{percent:50,title:"عروض الجمعة البيضاء",endsAt}` otherwise (empty title falls back to default).
- [ ] **Step 2:** `npx vitest run src/__tests__/payments/offer.test.ts` → FAIL.
- [ ] **Step 3:** Implement; invalid percent (non-integer, <0, >100) reads as 0; invalid dates read as null.
- [ ] **Step 4:** Tests PASS. Add the field, then `DATABASE_URL=postgresql://<user>@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate`.
- [ ] **Step 5:** Commit `prisma/schema.prisma src/lib/payments/offer.ts src/lib/settings.ts src/__tests__/payments/offer.test.ts` — "Offer: settings and bonus maths for a sale offer (off by default)".

### Task 2: Credit packages get the bonus; refunds take it back

**Files:**
- Modify: `src/app/api/payments/checkout/route.ts`, `src/lib/payments/intent.ts` (`paymentIntentParams`), `src/app/api/dev/mock-checkout/[id]/route.ts`, `src/lib/payments/refund.ts`, `src/lib/payments/fulfil.ts` + `intent.ts` fulfil (ledger note only)
- Test: `src/__tests__/payments/offer-checkout.test.ts` (follow `checkout-routes.test.ts` mocks), extend `src/__tests__/payments/refund.test.ts`

**Interfaces:**
- Consumes: `activeOfferFor`, `bonusFor` (Task 1).
- Produces: Stripe metadata `credits` = base + bonus and new `bonusCredits` (string, only when > 0); `paymentIntentParams(pkg, ids, bonus = 0)`; `Payment.bonusCredits` set on the row (null when 0).

- [ ] **Step 1: Failing tests** — offer active at 50%: checkout for the 10-credit package sends metadata `credits:"15"`, `bonusCredits:"5"`, row `bonusCredits:5`, description says 15; offer off: metadata `credits:"10"`, no `bonusCredits`, row `bonusCredits` null; mock-checkout "paid" adds `pkg.credits + payment.bonusCredits`; refund of a COMPLETED package row with `bonusCredits:5` deducts 15 (and from a balance of 8 floors at 0); refund of a row with null bonus deducts 10 as today.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Read `activeOfferFor(country, countrySettings)` once in the route after `findPackage`; pass bonus to metadata, `paymentIntentParams`, row. Refund: `creditsToDeduct = (pkg?.credits ?? 0) + (payment.bonusCredits ?? 0)` for non-Pro rows (add `bonusCredits` to the select). Fulfil ledger `note: "offer:+<bonus>"` when metadata has `bonusCredits`. The purchase notice stays as is (it already states the total).
- [ ] **Step 4:** Run the new file plus `src/__tests__/payments` → PASS.
- [ ] **Step 5:** Commit those files — "Offer: credit packages give the bonus, refunds take it back".

### Task 3: Pro first payment gets the bonus

**Files:**
- Modify: `src/lib/pro/checkout.ts` (`startProCheckout`), `src/lib/pro/stripe-events.ts` (`handleProInvoicePaid`, live path only), `src/app/api/dev/mock-checkout/[id]/route.ts` (Pro metadata)
- Test: extend `src/__tests__/pro/stripe-events.test.ts` and `src/__tests__/pro/checkout.test.ts`

**Interfaces:**
- Consumes: `activeOfferFor`, `bonusFor`; existing `grantProCredits({ subscriptionId, paymentId, key, credits, silent? })`.
- Produces: Pro metadata `offerBonus` (string, only when > 0), checkout `Payment.bonusCredits`; grant key `offer:<invoiceId>`.

- [ ] **Step 1: Failing tests** — checkout with offer active (monthly, 20 credits, 50%): metadata `credits:"20"`, `offerBonus:"10"`, row `bonusCredits:10`; first invoice (`billing_reason:"subscription_create"`, meta `offerBonus:"10"`) makes two grants, `invoice:<id>` 20 and `offer:<id>` 10, both with the same `paymentId`; same invoice delivered twice → bonus granted once; `subscription_cycle` invoice with the same meta → no `offer:` grant; not-live (duplicate) first invoice → no `offer:` grant; refund of that first payment takes back 30 (existing grants query).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In `startProCheckout`, compute bonus from `offer.credits` (the first invoice's grant; yearly = its monthly amount), add to metadata and the row. In `handleProInvoicePaid` after the normal grant: if `invoice.billing_reason === "subscription_create"` and `Number(meta.offerBonus)` is an integer 1–200, `grantProCredits({ ..., key: \`offer:${invoice.id}\`, credits: bonus, silent: true })`. The normal «رصيد Pro» notice already went out; add the bonus to it only if it is a one-line change, else leave silent (builder's call). Mock route: Pro metadata gets `offerBonus` from `payment.bonusCredits`.
- [ ] **Step 4:** `npx vitest run src/__tests__/pro` → PASS.
- [ ] **Step 5:** Commit — "Offer: Pro first payment gives the bonus once".

### Task 4: APIs show the offer (website and old apps)

**Files:**
- Modify: `src/app/api/payments/plans/route.ts`, `src/lib/pro/my-state.ts` (offers in `GET /api/pro`), `src/lib/pro/plans.ts` (`ProPlanOffer.bonusCredits?: number`)
- Test: `src/__tests__/payments/offer-plans.test.ts`, extend `src/__tests__/pro/state-route.test.ts`

**Interfaces:**
- Produces: plans JSON top-level `offer: ActiveOffer | null`; each package `bonusCredits?: number`, `name` = `offerPackageName(name, bonus)` while active; `credits` unchanged (base). `/api/pro` → `offer: ActiveOffer | null`, each offer `bonusCredits?`.

- [ ] **Step 1: Failing tests** — offer active, JO selling: `offer.percent===50`, 10-credit package `name==="10 أرصدة + 5 هدية"`, `bonusCredits===5`, `credits===10`; LB not selling: `offer===null`, names unchanged, no `bonusCredits`; offer off: response identical to today's keys plus `offer:null`. `/api/pro`: monthly offer `bonusCredits===10`, `offer` set.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit — "Offer: plans and Pro APIs carry the offer and bonus".

### Task 5: Admin settings and payment display

**Files:**
- Modify: `src/app/api/admin/settings/new-cycle/route.ts` (state + zod: `offerPercent: z.number().int().min(0).max(100)`, `offerStartsAt`/`offerEndsAt: z.string().datetime().nullable()`, `offerTitle: z.string().max(60)`; refuse `endsAt <= startsAt` with 400), `src/components/admin/new-cycle-settings-card.tsx` (a «Sale offer» block: percent, start, end in Amman time shown and stored as UTC ISO, title, a status line "Active now / Scheduled / Ended / Off"), Admin → Payments row/detail shows `+N bonus` when `bonusCredits`
- Test: extend the admin settings route test if one exists (`src/__tests__/admin`), else `src/__tests__/admin/offer-settings.test.ts`

- [ ] **Step 1: Failing tests** — PATCH saves the four keys; end before start → 400; non-admin → refused (existing `requireAdmin`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (admin is English LTR; datetime inputs are fine in admin). **Step 4:** PASS.
- [ ] **Step 5:** Commit — "Offer: admin settings and bonus in Admin → Payments".

### Task 6: Website banners

**Files:**
- Create: `src/components/payments/offer-banner.tsx` (client; props `{ offer: ActiveOffer }`)
- Modify: `src/app/(ar)/dashboard/payments/page.tsx` (banner above packages, «+5 هدية» chip on each package from `bonusCredits`), `src/app/(ar)/dashboard/pro/page.tsx` (banner above plans, chip per plan)
- Test: `src/__tests__/components/offer-banner.test.tsx`

Banner copy (exact): title = `offer.title`; line «رصيد إضافي بنسبة {percent}% عند شراء أي باقة أو الاشتراك في Pro» (on the Pro page: «… عند أول دفعة اشتراك في Pro»); «ينتهي العرض {date}» with `toLocaleDateString("ar-JO-u-nu-latn", { day:"numeric", month:"long", timeZone:"Asia/Amman" })`. Style: `bg-primary` card with `text-accent` heading (gold on navy), radius 16, no new hex. Chip: `+{bonus} هدية`.

- [ ] **Step 1: Failing test** — renders title, `50%`, the end date; nothing when `offer` null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; the design-system guard test must stay green. **Step 4:** `npx vitest run` PASS.
- [ ] **Step 5:** Commit — "Offer: banner and gift chips on the payments and Pro pages".

### Task 7: Verify end to end, then docs

- [ ] **Step 1:** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` → all green.
- [ ] **Step 2:** Locally (`PAYMENTS_MOCK`), set the offer in Admin → Settings (now → +1 day, 50); sign in `0777000001`; `/dashboard/payments` shows banner and chips; buy 10 via mock → balance +15; Admin refund → −15; `/dashboard/pro` shows the banner; mock Pro monthly → first grant + bonus; mock «renew» → no bonus. Set end in the past → banner gone, purchase gives 10. Screenshot proof.
- [ ] **Step 3:** CLAUDE.md: one bullet under Money and credits (switch keys, off by default, bonus on payment, Pro first invoice only, no app version) and the spec appendix texts for Admin → Alerts / Notifications. Commit — "Docs: sale offer".
- [ ] **Step 4:** Ask the owner before deploying (needs `--db-push`; check the diff first per CLAUDE.md).
