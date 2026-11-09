# Pro Membership (website + server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can buy a weekly, monthly or yearly Pro subscription with Stripe. Pro gives photos and voice notes in chat, a Pro badge and free credits. Prices and credits are set per country in admin, and everything sits behind `pro_enabled`.

**Architecture:** Pro lives in a new `src/lib/pro/` folder:
- `plans.ts`: db-free plan config.
- `status.ts`: who is Pro.
- `grants.ts`: idempotent credit grants.
- `stripe-events.ts`: webhook handlers.
- `manage.ts`: cancel, resume and admin actions.

Stripe Checkout runs in `mode: "subscription"` with inline `price_data`. Every grant is keyed by a unique `ProCreditGrant.key`. Chat media extends `Message` (`kind`, `mediaPath`) and is stored in the existing Bunny zone under unguessable paths. It is served only through an authenticated route.

**Tech Stack:** Next.js 16, Prisma 7 (Postgres), Stripe Node 20 (Billing), sharp, Ably, Vitest, Tailwind v4/shadcn.

**Spec:** `docs/superpowers/specs/2026-11-09-pro-membership-design.md`. Read it first. This plan covers the website and server only. The Flutter app gets its own plan after this ships. Until then, app 1.0.x shows the fallback text from Task 8.

## Global Constraints

- Every schema change is additive. New tables may have unique constraints. Never add a unique constraint to an existing table.
- `pro_enabled` (system_settings, `"true"`/`"false"`, default off) gates **new sales and offers only**. `isPro()` never reads it.
- Pro never touches suggestion generation, ordering or score: no edits in `src/lib/matching/*` or the `orderForSlots`/feed sort.
- Stripe account is shared: every handler first checks `metadata.app === CHECKOUT_APP && metadata.kind === "pro"` (on the session, or the subscription/invoice's `subscription_details.metadata` / `parent.subscription_details.metadata`), else returns `"not_ours"`.
- Credits change only inside a `$transaction` with `recordCredit(..., tx)`, reason `PRO_GRANT` (grants) or `REFUND` (take-backs), floored at 0.
- Jordan: display JOD, charge USD cents = `Math.round(price * 141)`. Saudi Arabia: SAR, halalas = `price * 100`. Reuse `chargeFor` from `packages.ts` (export it).
- Sales need `purchasesAvailable(countrySettings)` **and** `pro_enabled` **and** an enabled plan with price > 0.
- Chat media paths: `chat/<conversationId>/<randomBytes(32).toString("base64url")>.<ext>`. Never sent to clients, Ably, push, analytics or logs.
- Limits: photo upload ≤ 10 MB (jpeg/png/webp/heic/heif). Stored as WebP, long side ≤ 1600 px, metadata stripped. Voice ≤ 185 s by declared duration and ≤ 6 MB, types `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/aac`, `audio/mpeg`, `audio/x-m4a`. No daily count. The existing `chat-burst` rate limit applies.
- Fallback `body` for media messages (old apps): IMAGE `«📷 صورة — حدّث التطبيق لعرضها»`, VOICE `«🎤 رسالة صوتية — حدّث التطبيق لسماعها»`. Chat list preview and new clients use `«📷 صورة»` / `«🎤 رسالة صوتية»`.
- Copy: Arabic, Western digits, gender via `forViewer()`, counts via `arabicCount()`, no hardcoded Tailwind colours (badge = `accent`). Client components import only db-free modules (`plans.ts`, `pro-types.ts`).
- Every new automatic notice is added to `src/lib/notifications/automatic.ts` (guard test). Push + bell, `sms: false`.
- Before calling done: `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`.

## Review Focus

1. **`invoice.paid` arriving before `checkout.session.completed`** (common in Stripe). Expected: the subscription row is created from the invoice's subscription metadata and credits are granted once. *Test in Task 5.*
2. **Stripe re-delivers the same event**, or webhook and mock both fire. Expected: one grant, one Payment COMPLETED. *Test in Tasks 3 and 5.*
3. **Another site's subscription or invoice on the shared Stripe account.** Expected: ignored, no DB writes. *Test in Task 5.*
4. **Pro lapses, the chat ends or a block happens while the media composer is open.** Expected: the upload is refused with a clear Arabic error, nothing is stored in Bunny, and no message row is created. *Test in Task 8.*
5. **An iPhone sends a HEIC photo, or Safari records `audio/mp4`.** Expected: the photo is accepted and converted to WebP. Voice is stored with its real type and served with the same `Content-Type`. *Test in Task 8.*

---

### Task 1: Schema and plan config

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/payments/packages.ts` (export `chargeFor`), `src/lib/countries/settings.ts` (add `proPlans` to `BASE`/`toSettings`/type)
- Create: `src/lib/pro/plans.ts` (db-free)
- Test: `src/__tests__/pro/plans.test.ts`

**Interfaces:**
- Produces:
  - `type ProPlanId = "weekly" | "monthly" | "yearly"`
  - `interface ProPlanConfig { enabled: boolean; price: number; credits: number }`. For yearly, `credits` means credits per month.
  - `type ProPlans = Partial<Record<ProPlanId, ProPlanConfig>>`
  - `readProPlans(value: unknown): ProPlans | null`: drops invalid entries, price > 0, credits integer 0–100.
  - `interface ProPlanOffer { id: ProPlanId; price: number; currency: "JOD" | "SAR"; chargeCurrency: "usd" | "sar"; chargeAmount: number; credits: number; interval: "week" | "month" | "year" }`
  - `proOffersFor(country: unknown, plans: ProPlans | null): ProPlanOffer[]`: enabled plans only, in weekly/monthly/yearly order.
  - `proPlanName(id: ProPlanId): string` → `"pro_weekly"` etc.
  - `planFromName(name: string | null | undefined): ProPlanId | null`
  - `PRO_PLAN_LABELS: Record<ProPlanId, string>` = `{ weekly: "أسبوعي", monthly: "شهري", yearly: "سنوي" }`
  - `CountrySettings.proPlans: ProPlans | null`
- Schema (additive):
  - `CountrySetting.proPlans Json?`
  - enums: `ProPlan { WEEKLY MONTHLY YEARLY }`, `ProStatus { ACTIVE PAST_DUE CANCELED ENDED }`, `MessageKind { TEXT IMAGE VOICE }`, `CreditReason` + `PRO_GRANT`
  - `model ProSubscription`:
    - `id`
    - `userId String?` (relation `onDelete: SetNull`)
    - `country String`
    - `plan ProPlan`
    - `status ProStatus @default(ACTIVE)`
    - `stripeSubscriptionId String?` (`@@index`)
    - `stripeCustomerId String?`
    - `currentPeriodEnd DateTime`
    - `cancelAtPeriodEnd Boolean @default(false)`
    - `price Decimal @db.Decimal(10,2)`, `currency String`
    - `creditsPerGrant Int`
    - `grantsMade Int @default(0)`, `nextCreditGrantAt DateTime?`
    - `endedAt DateTime?`
    - `createdAt`, `updatedAt`
    - `@@index([userId, status])`, `@@map("pro_subscriptions")`
  - `model ProCreditGrant`:
    - `id`
    - `key String @unique`
    - `subscriptionId String`
    - `paymentId String?`
    - `userId String?`
    - `credits Int`
    - `takenBack Boolean @default(false)`
    - `createdAt`
    - `@@index([paymentId])`, `@@map("pro_credit_grants")`
  - `Payment.proSubscriptionId String?` (`@@index`)
  - `Message.kind MessageKind @default(TEXT)`, `mediaPath String?`, `mediaType String?`, `mediaDurationSec Int?`, `mediaWidth Int?`, `mediaHeight Int?`

- [ ] **Step 1: Write failing tests** in `plans.test.ts`:
  - `readProPlans({ weekly: { enabled: true, price: 1.5, credits: 2 }, monthly: { price: -1 } })` → `{ weekly: {...} }`
  - `readProPlans("x")` → `null`
  - `proOffersFor("JO", { monthly: { enabled: true, price: 4, credits: 8 } })` → `[{ id: "monthly", currency: "JOD", chargeCurrency: "usd", chargeAmount: 564, interval: "month", credits: 8, price: 4 }]`
  - `proOffersFor("SA", { yearly: { enabled: true, price: 199, credits: 10 } })[0]` → `chargeAmount: 19900`, `interval: "year"`
  - A disabled plan is omitted.
  - `planFromName("pro_yearly") === "yearly"` and `planFromName("launch_10") === null`
- [ ] **Step 2:** `npx vitest run src/__tests__/pro/plans.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `plans.ts`. Export `chargeFor` from `packages.ts`. Edit the schema. Add `proPlans` to country settings.
- [ ] **Step 4:** `DATABASE_URL=postgresql://$USER@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate`, then the test. Expected: PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `prisma/schema.prisma src/lib/pro/plans.ts src/lib/payments/packages.ts src/lib/countries/settings.ts src/__tests__/pro/plans.test.ts` with message `Pro: schema and per-country plan config`.

### Task 2: Pro status and switch

**Files:**
- Create: `src/lib/pro/status.ts`, `src/lib/pro/pro-types.ts` (db-free shared types)
- Modify: `src/lib/settings.ts`
- Test: `src/__tests__/pro/status.test.ts`

**Interfaces:**
- Produces:
  - `getProEnabled(): Promise<boolean>` (settings.ts, key `pro_enabled`)
  - `isPro(userId: string, now?: Date): Promise<boolean>`
  - `proUserIds(userIds: string[], now?: Date): Promise<Set<string>>`: one query, for card lists
  - `currentProSubscription(userId: string, now?: Date): Promise<ProSubscription | null>`
  - An active subscription has status in `[ACTIVE, PAST_DUE]` and `currentPeriodEnd > now`. The function's doc comment says it is independent of `pro_enabled`.
  - `pro-types.ts`: `interface MyProState { enabled: boolean; isPro: boolean; plan: ProPlanId | null; renewsAt: string | null; cancelAtPeriodEnd: boolean; pastDue: boolean; canBuy: boolean; offers: ProPlanOffer[] }`

- [ ] **Step 1: Failing tests** (mock db as in `src/__tests__/intro/requests.test.ts`):
  - ACTIVE with a future end → true
  - PAST_DUE with a future end → true
  - ACTIVE with a past end → false
  - CANCELED with a future end → false
  - `getSetting` is never called by `isPro`
  - `proUserIds(["a","b"])` returns only "a" when the db holds one row for "a"
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit with message `Pro: status helpers and pro_enabled switch`.

### Task 3: Credit grants (incl. yearly monthly drip)

**Files:**
- Create: `src/lib/pro/grants.ts`
- Modify: `src/lib/cron/daily.ts` (morning task `proGrants`)
- Test: `src/__tests__/pro/grants.test.ts`

**Interfaces:**
- Consumes: `ProSubscription`, `ProCreditGrant` (Task 1), `recordCredit`, `notify`
- Produces:
  - `grantProCredits(args: { subscriptionId: string; paymentId: string | null; key: string; credits: number }): Promise<"granted" | "already">`
    - One `$transaction`: create `ProCreditGrant` (a unique-key violation P2002 → `"already"`), increment `matchCredits`, `recordCredit({ reason: "PRO_GRANT", refId: grant.id, note: key })`, `grantsMade += 1`.
    - After commit, a notice: title `«رصيد Pro»`, body `«أُضيف ${arabicCount(n, …)} إلى رصيدك من اشتراك Pro.»`.
    - `credits <= 0` → `"already"` with no writes.
  - Keys: `invoice:<stripeInvoiceId>` for weekly/monthly and the first yearly month, `yearly:<subscriptionId>:<n>` for yearly months 2–12.
  - `runYearlyProGrants(now: Date): Promise<{ granted: number }>`
    - Picks YEARLY subscriptions, active per `isPro` rules, with `nextCreditGrantAt <= now` and `grantsMade < 12`.
    - Grants key `yearly:<id>:<grantsMade+1>`, linked to the subscription's latest COMPLETED Payment.
    - Then sets `nextCreditGrantAt` to one calendar month later.
    - At most 500 per run.

- [ ] **Step 1: Failing tests:**
  - A first call → `"granted"`, credits incremented by `credits`, a ledger row with `PRO_GRANT`.
  - The same key again → `"already"`, no increment.
  - `runYearlyProGrants` with `grantsMade: 12` grants nothing.
  - With `nextCreditGrantAt` in the past and `grantsMade: 3`, it grants key `yearly:s1:4` and moves `nextCreditGrantAt` +1 month.
  - A CANCELED subscription past its period end is skipped.
  - A grant still happens while `cancelAtPeriodEnd` is true and the period hasn't ended.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Register `tasks.proGrants = await runTask("proGrants", () => runYearlyProGrants(now()))` in the morning part.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit with message `Pro: idempotent credit grants and yearly monthly task`.

### Task 4: Checkout, state API and mock path

**Files:**
- Create: `src/app/api/pro/route.ts` (GET → `MyProState`), `src/app/api/pro/checkout/route.ts` (POST), `src/lib/pro/checkout.ts`
- Modify: `src/app/api/dev/mock-checkout/[id]/route.ts` (Pro outcomes)
- Test: `src/__tests__/pro/checkout.test.ts`

**Interfaces:**
- Consumes: `proOffersFor`, `getProEnabled`, `currentProSubscription`, `purchasesAvailable`, `paymentsMockEnabled`
- Produces:
  - `startProCheckout(userId: string, plan: ProPlanId): Promise<{ url: string; paymentId: string }>`, which throws `ProError(code: "DISABLED" | "UNAVAILABLE" | "ALREADY_PRO" | "UNKNOWN_PLAN")` with an Arabic message.
    - Creates a PENDING `Payment` (`type: SUBSCRIPTION`, `planName: proPlanName(plan)`, amount/currency = display price).
    - Then `stripe.checkout.sessions.create`:
      - `mode: "subscription"`, `line_items: [{ quantity: 1, price_data: { currency: chargeCurrency, unit_amount: chargeAmount, recurring: { interval }, product_data: { name: "نصيبك Pro — " + PRO_PLAN_LABELS[plan] } } }]`
      - `metadata` **and** `subscription_data.metadata` = `{ app: CHECKOUT_APP, kind: "pro", userId, plan, country, paymentId }`
      - success/cancel URLs to `/dashboard/payments?pro=success|cancel`
      - Stores `stripeSessionId`.
    - With the mock on: session id `mock_pro_<uuid>`, url `/dashboard/payments?mockPro=<paymentId>`.
  - `POST /api/pro/checkout { plan }` → `{ url }`. Test accounts in the app (Bearer + test account) get 403, the same rule as payments.
  - Mock route, Pro payments only:
    - `outcome: "paid"` calls `handleProCheckoutCompleted` + `handleProInvoicePaid` (Task 5) with Stripe-shaped fakes, using invoice id `mock_in_<paymentId>`.
    - New outcomes: `"renew"` (a new invoice id, +1 period), `"fail"` (calls the failed handler), `"end"` (calls the subscription-deleted handler).
    - It stays 404 off-mock.

- [ ] **Step 1: Failing tests:**
  - Switch off → `DISABLED`.
  - Saudi Arabia with prices not approved → `UNAVAILABLE`.
  - An existing active subscription → `ALREADY_PRO`.
  - A `cancelAtPeriodEnd` subscription not yet ended → `ALREADY_PRO`.
  - Happy path: the Stripe create mock gets `mode: "subscription"`, `recurring.interval: "month"`, `unit_amount: 564` for JO monthly at 4, and both metadata blocks include `kind: "pro"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit with message `Pro: checkout, state API and mock subscription path`.

### Task 5: Stripe webhook handlers

**Files:**
- Create: `src/lib/pro/stripe-events.ts`
- Modify:
  - `src/app/api/payments/webhook/route.ts`: in `checkout.session.*`, route `session.mode === "subscription"` to Pro **before** `fulfilCheckoutSession`. Add cases `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
  - `src/lib/payments/fulfil.ts`: `reconcileStripePayments` skips `planName` starting with `pro_`.
- Test: `src/__tests__/pro/stripe-events.test.ts`

**Interfaces:**
- Consumes: `grantProCredits`, `planFromName`
- Produces (each returns `"ok" | "already" | "not_ours"`):
  - `isOurProMetadata(m: Record<string,string> | null | undefined): boolean`
  - `handleProCheckoutCompleted(session)`: upsert-like. Finds the row by `stripeSubscriptionId` or creates it from metadata, with plan, price/currency from the Payment, and `creditsPerGrant` from the country's plan config **at this moment** (snapshot).
  - `handleProInvoicePaid(invoice)`:
    1. Ensures the subscription row exists (create from subscription metadata if checkout hasn't arrived yet).
    2. Sets `currentPeriodEnd` from the invoice line period end, and status ACTIVE.
    3. Payment: the first invoice completes the checkout's PENDING Payment. Each renewal creates a new COMPLETED Payment (`providerTxId` = invoice id, `proSubscriptionId`).
    4. Grants `invoice:<id>`.
    5. Yearly: sets `nextCreditGrantAt` = +1 month when `grantsMade` was 0.
    6. Notice «أصبحت عضوية Pro فعّالة» on the first invoice only.
  - `handleProInvoiceFailed(invoice)`: status PAST_DUE, notice «تعذّر تجديد اشتراك Pro» / «يمكنك تحديث بطاقتك من صفحة الدفع لمواصلة Pro.» (once per Amman day).
  - `handleProSubscriptionChanged(sub)`: syncs `cancelAtPeriodEnd`, `currentPeriodEnd`. Stripe `canceled` → CANCELED. Deleted → ENDED + `endedAt`, notice «انتهت عضوية Pro».

- Note: `stripe@20` uses the newer API shape. An invoice's subscription and metadata are at `invoice.parent.subscription_details.{subscription, metadata}`, and period ends are on `subscription.items.data[0].current_period_end` (not top-level). Read them through one small accessor so tests can build fakes.

- [ ] **Step 1: Failing tests:**
  - Invoice-before-checkout creates the row and grants once. Then checkout-completed changes nothing extra.
  - The same invoice twice → one grant, one COMPLETED Payment.
  - Metadata `{ app: "other" }` → `"not_ours"` with zero db calls.
  - A subscription-mode session never reaches `fulfilCheckoutSession` (spy).
  - A renewal invoice creates a second Payment and grant.
  - `customer.subscription.deleted` → ENDED.
  - `reconcileStripePayments` ignores a PENDING `pro_monthly` row.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit with message `Pro: Stripe subscription webhooks`.

### Task 6: Cancel, resume, refunds, admin cancel, deletion

**Files:**
- Create: `src/lib/pro/manage.ts`, `src/app/api/pro/cancel/route.ts`, `src/app/api/pro/resume/route.ts`, `src/app/api/admin/users/[id]/pro/route.ts` (GET status, POST `{ action: "cancel_now" }`)
- Modify: `src/lib/payments/refund.ts` (Pro branch in `applyRefund`), `src/lib/cron/deletions.ts` (cancel Stripe subscription before deleting)
- Test: `src/__tests__/pro/manage.test.ts`

**Interfaces:**
- Produces:
  - `cancelPro(userId)` / `resumePro(userId)`: Stripe `subscriptions.update(id, { cancel_at_period_end })` plus a local mirror. Mock subscriptions only update locally.
  - `cancelProNow(subscriptionId, by: { adminId?: string; reason: "admin" | "deletion" })`: Stripe `subscriptions.cancel`, status ENDED. No refund and no credit take-back.
  - `applyRefund` Pro branch, when `planFromName(planName)` is set:
    - Take back the sum of non-`takenBack` `ProCreditGrant.credits` where `paymentId` matches (floored at 0, one `REFUND` ledger row), and mark them `takenBack`.
    - If this payment is the subscription's latest COMPLETED payment: `cancelProNow` + ENDED.
    - Notice body `«تم استرداد ${formatPaidCharge(payment)} من اشتراك Pro إلى بطاقتك، وأُزيل رصيده من حسابك.»`
    - The partial-refund path in `handleChargeRefunded` stays unchanged (it does nothing automatic).

- [ ] **Step 1: Failing tests:**
  - Cancel sets `cancelAtPeriodEnd` and keeps `isPro` true.
  - Resume undoes it.
  - A yearly refund with 3 grants (8 each) and a balance of 10 → balance 0, one ledger delta -10, all 3 marked takenBack, Pro ENDED.
  - Refunding an older invoice takes back only its own grants and keeps Pro.
  - Account deletion calls `subscriptions.cancel` before the user rows go.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit with message `Pro: cancel/resume, refunds, admin cancel, deletion`.

### Task 7: Automatic notification list

**Files:**
- Modify: `src/lib/notifications/automatic.ts`. New group `pro: "Pro membership"` with entries `pro-started`, `pro-credits`, `pro-payment-failed`, `pro-ended`, `pro-refund`, texts identical to Tasks 3, 5 and 6.
- Test: `src/__tests__/lib/automatic-notifications.test.ts` (existing guard)

- [ ] **Step 1:** `npx vitest run src/__tests__/lib/automatic-notifications.test.ts`. Expected: FAIL (call-site texts not listed).
- [ ] **Step 2:** Add the entries (channels `["bell","push"]`).
- [ ] **Step 3:** Re-run. Expected: PASS.
- [ ] **Step 4:** Commit with message `Pro: list automatic notices`.

### Task 8: Chat media backend

**Files:**
- Create:
  - `src/lib/chat/media.ts`
  - `src/app/api/chats/[id]/media/route.ts`: POST, multipart. Fields `file`, `kind`, `durationSec?`, `clientNonce?`
  - `src/app/api/chats/[id]/media/[messageId]/route.ts`: GET stream
- Modify:
  - `src/lib/bunny.ts`: add `readFromBunny(path): Promise<Buffer | null>` via the storage API, local fallback `readLocalUpload`.
  - `src/lib/chat/service.ts`: extract `assertCanSend(conversationId, senderId)` from `createMessage`. Add `sendMediaMessage`. Extend `ChatMessage`, `toMessage`, `summarise` and the Ably payload.
  - `src/app/api/admin/chats/[id]/messages/route.ts`: include `kind` + admin media URL, log `[admin-chat-view]` media fetches.
  - `src/lib/reports.ts`: evidence transcript entries get `kind` and `mediaPath`.
  - `src/lib/cron/deletions.ts`: delete the user's `chat/` media except paths referenced in any `Report.evidence`.
- Test: `src/__tests__/chat/media.test.ts`

**Interfaces:**
- Produces:
  - `ChatMessage` adds `kind: "TEXT" | "IMAGE" | "VOICE"` and `media: { url: string; type: string; durationSec: number | null; width: number | null; height: number | null } | null`. `url` = `/api/chats/<cid>/media/<mid>`, never the Bunny path. `body` keeps the fallback text.
  - `ChatSummary.lastMessage.body` uses the short preview for media.
  - `processImage(buf: Buffer): Promise<{ buffer: Buffer; width: number; height: number }>`: sharp `.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 })`. No `withMetadata`, so EXIF/GPS is dropped.
  - `validateVoice(type: string, size: number, durationSec: number): { ok: true } | { ok: false; message: string }`
  - `sendMediaMessage(args: { conversationId; senderId; kind: "IMAGE" | "VOICE"; file: Buffer; type: string; durationSec?: number; clientNonce?: string }): Promise<ChatMessage>`
    - Order: `assertCanSend` → `isPro(senderId)` (else `IntroError("PRO_REQUIRED", "إرسال الصور والرسائل الصوتية متاح لأعضاء Pro")`) → rate limit → validate/process → upload → create row → Ably → bell/push (same as text, push body unchanged).
    - Nothing is uploaded before every check passes.
    - Nonce dedupe is the same as `sendMessage`.
  - GET media: the requester must be one of the two members, or an admin web session (admin never via Bearer). 404 otherwise. Headers `Content-Type: mediaType`, `Cache-Control: private, max-age=86400`. Supports `Range` for audio (Safari needs it).

- [ ] **Step 1: Failing tests:**
  - A non-Pro sender → `PRO_REQUIRED` and `uploadToBunny` not called.
  - An ENDED chat → `NOT_ALLOWED`, no upload.
  - Blocked → `BLOCKED`, no upload.
  - A HEIC fixture (`src/__tests__/fixtures/photo.heic`, or a sharp-generated JPEG with EXIF GPS) → WebP whose `sharp(out).metadata()` has no `exif`, long side ≤ 1600.
  - Voice `audio/mp4` 120 s ok. 200 s refused. `video/mp4` refused.
  - The stored path matches `/^chat\/c1\/[A-Za-z0-9_-]{43}\.webp$/`.
  - The returned `media.url` contains no `chat/`.
  - The text message `body` filter still runs on text.
  - The GET route by a stranger → 404.
  - The GET route with `Range: bytes=0-99` → 206.
  - Evidence includes `kind` and `mediaPath`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, plus `npx vitest run src/__tests__/chat src/__tests__/admin/chat-messages.test.ts`. Expected: PASS (old chat tests unchanged).
- [ ] **Step 5:** Commit with message `Chat: Pro photos and voice notes backend`.

### Task 9: Pro badge data and component

**Files:**
- Create: `src/components/shared/pro-badge.tsx` (gold `accent` pill «Pro», `aria-label="عضو Pro"`)
- Modify:
  - `src/lib/suggestions/feed.ts` and its types in `feed-types.ts`: `isPro?: boolean` per card, via one `proUserIds` call per page.
  - `src/lib/chat/service.ts`: `ChatSummary.partner.isPro`.
  - `src/app/api/me/counts/route.ts`: `pro: { isPro, cancelAtPeriodEnd }`.
  - `src/contexts/dashboard-context.tsx`.
  - Card and chat header renderers: pass `<ProBadge />` through `PersonCard`'s `badges`.
  - The dashboard home/profile header.
- Test: `src/__tests__/suggestions/feed-pro.test.ts`

**Interfaces:**
- Produces: `ProBadge({ size?: "sm" | "md" })`. `isPro` flags as above. Badge data is sent even while `pro_enabled` is off, per the switch rule.

- [ ] **Step 1: Failing test:** the feed for a viewer whose partner is Pro has `isPro: true`. Card order is identical with and without Pro rows (same input, compare id order).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit with message `Pro: badge on cards, chat header, own profile`.

### Task 10: Website Pro section and offer dialog

**Files:**
- Create: `src/components/payments/pro-section.tsx`, `src/components/payments/pro-offer-dialog.tsx`, `src/components/payments/my-pro-card.tsx`
- Modify: `src/app/(ar)/dashboard/payments/page.tsx` (Pro section above packages when `state.enabled || state.isPro`. Handle `?pro=success` with a toast, polling `/api/pro` up to 10 s for the webhook. Handle `?mockPro=` with dev Paid/Renew/Fail/End buttons like the existing mock.)

**Interfaces:**
- Consumes: `GET /api/pro` (`MyProState`), `POST /api/pro/checkout`, `/api/pro/cancel`, `/api/pro/resume`
- Behaviour:
  - Three plan cards: price with `formatPrice`, the period label, «${credits} رصيد مجاناً» (yearly: «كل شهر»), and the three features.
  - With `canBuy` false: the existing «غير متاح حالياً» state.
  - `MyProCard` shows the plan, «يتجدد في <date ar-JO-u-nu-latn>», or «ينتهي في …» when cancelling. Buttons «إلغاء التجديد» (confirm via `Dialog`) and «متابعة الاشتراك».
  - PAST_DUE: an amber note.
  - `ProOfferDialog` is reused by chat.
  - `LoadError` on a failed load.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Production-build QA (CLAUDE.md "Real-flow QA") as `0777000001`, with `pro_enabled` on and JO plans set via Admin (Task 12) or SQL:
  1. Buy monthly through the mock.
  2. The balance rises by the plan credits.
  3. The card shows Pro.
  4. Cancel, then resume.
  5. Mock «Renew» adds credits again.
  6. Mock «End» → Pro gone.
  Screenshot each state at phone width.
- [ ] **Step 3:** Commit with message `Pro: payments page section and offer dialog`.

### Task 11: Website chat composer and bubbles

**Files:**
- Create: `src/components/chat/media-buttons.tsx` (photo input `accept="image/*"`, mic recorder), `src/components/chat/voice-recorder.ts` (MediaRecorder wrapper: picks `audio/webm;codecs=opus`, else `audio/mp4`, stops at 180 s, returns `{ blob, type, durationSec }`), `src/components/chat/media-bubble.tsx`
- Modify: `src/components/chat/chat-room.tsx` (optimistic media message with a local blob preview, upload via `FormData`, the same pending/failed/retry states as text), `src/components/chat/message-bubble.tsx` (render `media`), the chat list preview

**Behaviour:**
- Pro + ACTIVE chat: buttons enabled.
- Not Pro, with `pro_enabled` on: buttons shown disabled with a small «Pro» tag that opens `ProOfferDialog`.
- Not Pro, with the switch off, or the chat not ACTIVE: buttons hidden.
- Photo bubble: `next/image` `unoptimized`, tap opens a `Dialog`.
- Voice bubble: play/pause, a progress bar, `m:ss`.
- Tap targets ≥ 44px.
- A preview `blob:` image may use the allowed targeted eslint-disable.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** QA on the production build with two browsers (`0777000001` Pro, `0777000002` not):
  1. Send a photo and a 10 s voice note.
  2. The partner receives both live (Ably) and plays the voice.
  3. The partner's buttons show the Pro tag.
  4. End the chat → buttons hidden, media still visible.
  5. Admin chat view shows both media.
  Use phone width plus Safari-format (`audio/mp4`) playback in Chromium.
- [ ] **Step 3:** Commit with message `Chat: photo and voice composer and bubbles`.

### Task 12: Admin

**Files:**
- Modify:
  - `src/app/(en)/admin/settings/page.tsx` + `src/app/api/admin/settings/new-cycle/route.ts` (or a sibling `pro` route): `pro_enabled` toggle with help text "Stops new sales only; subscribers keep Pro."
  - `src/app/(en)/admin/countries/page.tsx` + `src/app/api/admin/countries/[code]/route.ts`: a Pro plans editor (enabled/price/credits per plan, validated with `readProPlans`, clears the country cache).
  - The admin user detail page: a Pro panel from `GET /api/admin/users/[id]/pro` (plan, status, renews/ends, Stripe ids, «Cancel now» with confirm).
  - The admin payments list: show a "Pro · monthly" label for `pro_*` plan names.
- Test: extend `src/__tests__/admin/` with the countries route accepting `proPlans` and rejecting a negative price.

- [ ] **Step 1:** Failing route test.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Manual check in admin on the production build.
- [ ] **Step 5:** Commit with message `Admin: Pro switch, country plans, member Pro panel`.

### Task 13: Docs and full verification

**Files:**
- Modify:
  - `CLAUDE.md`: switch list (`pro_enabled`); Money section (Pro grants, refunds); "What needs an app version" (the Pro app screens); the Stripe dashboard events the owner must add.
  - `docs/reference/payments.md`
  - `docs/platform-flow.html` (Pro in the chat/payments flow)

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: lint 0 problems, tsc clean, all tests pass, build succeeds.
- [ ] **Step 3:** Run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against local. Expected: only `CREATE TABLE`, `CREATE TYPE`, `ALTER TYPE ... ADD VALUE`, `ALTER TABLE ... ADD COLUMN` and `CREATE INDEX`.
- [ ] **Step 4:** Commit the docs with message `Docs: Pro membership`. Ask the owner before any deploy (`--db-push` needed). Remind them to add the 4 Stripe webhook events and to set prices with the switch still off.
