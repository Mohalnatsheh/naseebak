# Pro membership (عضوية Pro) — design

Date: 2026-11-09. Status: draft for owner approval.

## Intent

Add a paid **Pro** membership to the website and the app, sold as a weekly, monthly or yearly subscription. Pro is a second way to earn from the platform next to credit packages, and a way to give engaged members (people already in a chat after a match) richer chat tools.

Pro in this first version gives:

1. **Photos in chat**: a Pro member can send photos in an active chat.
2. **Voice notes in chat**: a Pro member can record and send voice notes in an active chat.
3. **Pro badge**: shown on the member's suggestion card, next to their name in the chat header, and on their own profile/dashboard.
4. **Free credits**: each plan adds credits to the member's normal balance. The amount is set in admin per plan and per country.

## Goals

- Members in Jordan and Saudi Arabia can subscribe weekly, monthly or yearly, paid with Stripe on the web, renewing automatically until they cancel.
- Prices and free credits per plan are set in Admin → Countries, per country.
- Pro features work on the website at once and in the app from the next app version.
- Everything sits behind a switch, `pro_enabled` (Admin → Settings, off by default).

## Non-goals (this version)

- Apple / Google in-app purchase. The app opens Stripe in the browser, the way credit packages are paid today (owner accepts the store risk).
- Free trial. No trial, and no admin-granted Pro.
- Read receipts as a Pro feature. ✓✓ already shows for everyone and stays free (owner, 2026-11-09).
- Longer chats, undo «لا», more cards, profile insights: possible later Pro features, not now.
- Checking photos for phone numbers or contact details. The owner accepts this (2026-11-09).

## Anti-goals (a failure even if it works)

- **Pro never changes who gets suggested or in what order.** Not in `generate`, `orderForSlots`, the «جديدة» order or score. The badge is display only.
- **No member loses anything they have today.** Text chat, ✓✓, the match, requests: all unchanged for non-Pro.
- **Pro never opens contact outside the cycle.** Media only inside an ACTIVE chat after a mutual match, with the same block, end, expiry and report rules as text.
- **Chat media is never public.** No guessable CDN URL. Only the two people in the chat (and admins, logged) can load it.
- **The legacy flow is untouched.** The old `Subscription` model and its code stay as they are. Pro uses a new model.
- Old app versions (1.0.x) must keep working when a media message arrives.

## Owner decisions (2026-11-09)

| Question | Decision |
|---|---|
| Plans | Weekly, monthly, yearly |
| Payment | Stripe on the web (also from the app, opened in the browser) |
| Free credits | Per plan and per country, set in admin |
| Unused free credits at renewal | Carry over: they join the normal balance and never expire |
| Yearly plan credits | A monthly amount, given every month for 12 months (not all at once) |
| Who sends media | Only a Pro member sends; the other person sees/hears it without Pro |
| Admins and media | Admins see photos and hear voice notes in chats they open, logged like today's `[admin-chat-view]` |
| Media limits | Generous: voice notes up to 3 minutes, no daily count limit |
| When media is allowed | Only while the chat is ACTIVE. Never after it ends, expires or is blocked |
| Cancel / failed payment | Pro stays until the end of the paid period. A failed renewal gets Stripe's automatic retries, then Pro ends. Credits already given stay. Media already sent stays visible |
| Badge | Suggestion cards, chat header, own profile |
| Trial | None |
| Photo content check | None |
| Read receipts | Stay free for everyone, not a Pro feature |
| `pro_enabled` off | Stops new sales only. Subscribers keep Pro |
| Media storage | Same Bunny zone, unguessable never-shown paths, served through our route |
| Plan switching | Not in v1 |
| Testing | Local mock subscription path, then one real purchase on production |

## How it works

### 1. Switch and country settings

- `pro_enabled` in `system_settings` (read through `src/lib/settings.ts`, 30s cache). **It gates new sales only** (owner, 2026-11-09). Off: no Pro offer, no plans page, no checkout. Members already subscribed keep everything (features, badge, credit grants) until their subscription ends. Nobody is charged for nothing. Before the first sale, the switch also hides the badge and media buttons, because nobody has Pro yet.
- `CountrySetting` gets an additive `proPlans Json?`, edited in Admin → Countries:

  ```json
  {
    "weekly":  { "enabled": true, "price": 1.5, "credits": 2 },
    "monthly": { "enabled": true, "price": 4,   "credits": 8 },
    "yearly":  { "enabled": true, "price": 35,  "monthlyCredits": 8 }
  }
  ```

  Prices are in the country's display currency (JOD / SAR). Jordan is charged in USD at the same rate as packages (dinar × 1.41, `chargeFor` in `packages.ts`). Saudi Arabia is charged in SAR.
- Pro sales follow the same gate as packages: `purchasesAvailable(countrySettings)` (purchases enabled and «Prices approved» on). Saudi Pro stays unsold until then.
- A plan with no row or `enabled: false` is not offered. *(Builder's call: code defaults may be empty, so nothing sells until an admin sets prices.)*
- **Price and credit changes apply to new subscribers only.** A subscription keeps the price and credit amount it was bought at (stored on the subscription row).

### 2. Data (all additive)

- New model **`ProSubscription`**: `id`, `userId` (SetNull on account deletion, so payment history is kept), `country`, `plan` (`WEEKLY | MONTHLY | YEARLY`), `status` (mirrors Stripe: `ACTIVE | PAST_DUE | CANCELED | ENDED`), `stripeSubscriptionId` (indexed, not unique, per the `db push` note in `Message`), `stripeCustomerId`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `price`, `currency`, `creditsPerGrant`, `nextCreditGrantAt` (yearly only), `endedAt`, `createdAt`, `updatedAt`.
- `CreditReason` gets `PRO_GRANT`.
- `Payment` rows are reused: one row per paid invoice, `type: SUBSCRIPTION`, `planName: "pro_weekly" | "pro_monthly" | "pro_yearly"`, `providerTxId` = the Stripe invoice id, so payment history, admin payments and refunds keep working.
- `Message` gets `kind` (`TEXT | IMAGE | VOICE`, default `TEXT`), `mediaPath String?` (storage path, never a public URL), `mediaDurationSec Int?`, `mediaWidth Int?`, `mediaHeight Int?`.
- **Who counts as Pro:** `isPro(userId)` = a `ProSubscription` with status `ACTIVE` or `PAST_DUE` (Stripe still retrying) and `currentPeriodEnd > now`. It does **not** depend on `pro_enabled` (see §1). One helper, used everywhere: badge, send checks, plans page.

### 3. Buying (Stripe Billing)

- `POST /api/pro/checkout { plan }` → Stripe Checkout in `mode: "subscription"` with inline `price_data` (`recurring.interval` = week / month / year, amount from the country's `proPlans`), so no Stripe dashboard products are needed. Metadata on **both** the session and `subscription_data`: `app` (the same `CHECKOUT_APP` marker), `kind: "pro"`, `userId`, `plan`, `country`, `paymentId`.
- **The Stripe account is shared.** Every new webhook branch first checks the Naseebak marker and ignores everything else.
- `fulfilCheckoutSession` (`src/lib/payments/fulfil.ts`) handles credit packages today and logs an error for a session without `credits`. A subscription-mode session must be routed to the Pro handler **before** that function, never into it.
- A member who already has Pro can't start a second subscription. The plans page shows their current plan instead.
- **No plan switching in v1** (owner). To change plans, a member cancels and picks a new plan once the current one ends. A member whose subscription is set to cancel can subscribe again only after it ends.
- **Local testing:** a mock subscription path, like today's `PAYMENTS_MOCK` (`/api/dev/mock-checkout/[id]`). It creates the subscription and fires the same internal handlers as `checkout.session.completed` and `invoice.paid`, plus dev-only buttons to simulate renewal, a failed payment and the end of the subscription. The owner then makes one real low-price purchase on production. No Stripe test-mode keys.
- **Stripe dashboard (owner, before go-live):** add `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` and `customer.subscription.deleted` to the existing webhook endpoint. Without them nothing renews.
- The app: the plans screen calls the same endpoint and opens the returned URL in the external browser, the way credit purchases work today. Test accounts never see Pro in the app (same rule as payments).

### 4. Webhooks and the credit grant

Handled in `src/app/api/payments/webhook/route.ts`, new cases:

| Stripe event | What happens |
|---|---|
| `checkout.session.completed` (mode subscription, ours) | Create the `ProSubscription` |
| `invoice.paid` (ours) | Mark the `Payment` PAID, update `currentPeriodEnd`, status ACTIVE. Weekly/monthly: grant `creditsPerGrant`. Yearly: grant the first month and set `nextCreditGrantAt` to +1 month |
| `invoice.payment_failed` | Status PAST_DUE, notify the member to update their card |
| `customer.subscription.updated` | Sync `cancelAtPeriodEnd`, status, period end |
| `customer.subscription.deleted` | Status ENDED, `endedAt`. Pro ends |

- **Each grant happens once.** It is keyed by the invoice id (or, for yearly monthly grants, the subscription plus the month number). It runs in one transaction with `matchCredits` increment + `recordCredit({ reason: "PRO_GRANT", refId })`, the same pattern as `fulfil.ts`.
- **Yearly monthly grants:** a new idempotent task in the morning job (`src/lib/cron/daily.ts`) grants every yearly subscription whose `nextCreditGrantAt <= now` while it is still Pro, then moves `nextCreditGrantAt` on by a month. 12 grants per paid year at most. A cancelled yearly subscription keeps getting its monthly credits until its paid year ends.
- Webhook ordering: `invoice.paid` may arrive before `checkout.session.completed`. The handler must cope (look up or create the row from the subscription's metadata).

### 5. Cancel, refund

> **Owner decision (2026-11-09), supersedes anything below that refunds on its own:** refunds are made only by an admin. Members can cancel renewal; cancelling never refunds. A second paid subscription while one is live, or a renewal paid after Pro ended, is cancelled at Stripe at once, its invoice's credits are granted, Pro is not made live (the older membership stays), and the admins are emailed the payments to refund by hand. Stripe `unpaid`/`paused` end Pro and are cancelled at Stripe.

- «اشتراكي» section on the website payments page (and the app's plans screen) shows the plan, the next renewal date and a cancel button. Cancel = Stripe `cancel_at_period_end: true`. Before the period ends, the member can undo it («متابعة الاشتراك»).
- **Refunds** *(my calls, the owner can change them)*:
  - A **full** refund of the **current** period's invoice ends Pro at once and takes back every credit granted from that invoice, never below 0. For yearly that is all the monthly grants so far, because every grant's `refId` points to its invoice.
  - A full refund of an **older** invoice takes back that invoice's credits only. Pro carries on.
  - A **partial** refund changes nothing automatically. The admin adjusts credits by hand if needed.
- A dispute only flags the payment, as today. Pro carries on until an admin acts.
- **Admin «cancel now» and account deletion** cancel the Stripe subscription at once, with no automatic refund and no credit take-back *(my call)*. An admin who wants to refund uses the existing refund action, and the rules above apply.

### 6. Media in chat

**Sending** (`POST /api/chats/[id]/media`, multipart; web and app):

- *Superseded (Global Constraint, audit B11): `pro_enabled` gates new sales and offers only; sending follows `isPro` whatever the switch. Don't add the switch back here.*
- Allowed only when `pro_enabled` is on, the sender `isPro`, the chat is ACTIVE, the sender is in it, and nobody has blocked anyone. Otherwise a clear Arabic error, with a Pro offer when the only missing piece is Pro.
- **Photos:** JPEG / PNG / WebP / HEIC up to 10 MB uploaded. Re-encoded server-side to WebP (`sharp` is already a dependency), long side ≤ 1600 px, **all metadata stripped (EXIF / GPS location)**. One photo per message, no caption in this version.
- **Voice:** up to 3 minutes. The app records AAC/M4A, browsers record what `MediaRecorder` gives (WebM/Opus on Chrome/Android, MP4/AAC on Safari). Store as sent; the server checks type and duration (reject > 185 s). *(Builder's call: transcoding is not required if both clients can play both formats. Check that Safari plays WebM/Opus and that the app can play both. If not, transcode or record one format.)*
- No daily count limit (owner). Keep the existing per-chat message rate limits that stop abuse, and apply them to media too.
- The `clientNonce` retry rule applies to media sends as it does to text.
- The text filter does not run on photos or voice (owner accepts this).

**Storing and serving:**

- Stored in the **same Bunny storage zone** as profile photos (owner, 2026-11-09), or `.dev-uploads/` locally. That zone is behind a public CDN, so privacy rests on the path being unguessable and never shown. The path is `chat/<conversationId>/<32+ random bytes, base64url>.<ext>`, saved only in `Message.mediaPath`. It is never sent to any client, never put in Ably events, push payloads, analytics or logs.
- The server reads files back through the Bunny **storage API** (with the storage key), not the CDN URL. **Known risk accepted by the owner:** anyone who obtained a file's CDN address could open it.
- Served only by `GET /api/chats/[id]/media/[messageId]`, which checks the requester is one of the two members (web session or app Bearer) or an admin (logged `[admin-chat-view]`), then streams the file with private cache headers. Never a public CDN URL.
- Media stays viewable read-only after a chat ends, like text.
- **Report evidence:** a reported chat's evidence must keep its media when an account is deleted (CLAUDE.md: "Report evidence survives account deletion"). The builder must check how `evidence` is built today and make sure media files referenced there are not deleted.
- Deleting an account deletes its media files except those kept as report evidence. `Message.sender` cascades, so the deleted member's messages, media included, disappear from the other person's chat, as text does today. File clean-up and the evidence copy (`reports.ts`, `cron/deletions.ts`) must run **before** the cascade.

**Showing:**

- Website chat (`src/components/chat/`): a photo button and a hold/tap-to-record mic button next to the text box, **only for Pro members**. Non-Pro members see the buttons greyed with a small Pro tag that opens the Pro offer. *(My call: it shows the feature exists. The owner can change it to hidden.)* Photo bubbles open full size in a `Dialog`. Voice bubbles have play/pause, a progress bar and the duration.
- The chat list's last-message preview and the chat push: «📷 صورة» / «🎤 رسالة صوتية». The push title stays «رسالة جديدة من <name>», never content.
- Ably `message` events carry `kind`, duration, size and the media route, never the file.

**Old app versions:** the API keeps `body` filled for media messages with a fallback text, for example «📷 صورة — حدّث التطبيق لعرضها» / «🎤 رسالة صوتية — حدّث التطبيق لسماعها». App 1.0.x shows that as a normal text bubble. New fields (`kind`, `media`) are additive. Unread counts and SMS logic treat a media message like any other message.

### 7. Badge

- *Superseded (Global Constraint, audit B11): `isPro` and the badge follow the membership whatever `pro_enabled` says; the switch gates new sales and offers only.*
- An `isPro` boolean (only while `pro_enabled` is on) is added to the payloads behind the shared person card (`src/components/shared/person-card.tsx`), the chat header and the member's own profile/dashboard data (`/api/me/counts` or the profile endpoint). The app gets the same fields.
- Look: a small gold (`accent`) «Pro» pill. Brand colour rules apply.
- The badge is display only. See anti-goals.

### 8. Pages

- **Website:** a Pro section at the top of `/dashboard/payments`: three plan cards (price per period, credits, the three features), the «اشتراكي» block for subscribers, and the Saudi "not available yet" state when purchases are off. No pricing on the landing page (existing rule). A Pro offer dialog is reused from the chat's greyed buttons.
- **App (next version):** a plans screen reached from the credits/payments area and from the chat's greyed media buttons, a media picker and recorder in the chat, photo and voice bubbles, the badge.
- **Admin:**
  - Settings: the `pro_enabled` switch.
  - Countries: the per-plan enabled / price / credits editor.
  - Member page: Pro status, plan, renewal date, the Stripe subscription id and a "cancel now" action (calls Stripe).
  - Payments: Pro invoices listed with packages.
  - *(Builder's call, nice to have:)* active Pro count per plan and country on the admin dashboard.

### 9. Notifications

All via `notify()`. Each one is added to `src/lib/notifications/automatic.ts` with its text at its call site (guard test). Push + bell, never SMS. Texts follow `forViewer()` gender rules.

- Pro started: «أصبحت عضوية Pro فعّالة».
- Credits added: «أُضيف N رصيد من اشتراك Pro», using `arabicCount()`.
- Payment failed: update your card.
- Pro ended.

*(Exact wording is the builder's draft for owner review.)*

## Constraints (from CLAUDE.md)

- Additive schema only. `--db-push` deploy. Check the diff first.
- Client components never import runtime values from db modules. Put plan types and defaults in a db-free module (like `packages.ts`).
- Zod from `zod/v4`. Western digits. Prices formatted like packages. RTL, ≥ 16px inputs, ≥ 44px tap targets, `Dialog` not `window.confirm`, `LoadError` on failed loads.
- API changes must keep app 1.0.x working.
- Stripe: ignore events without our marker. Credits only from paid money, once.
- Every `matchCredits` change goes through `recordCredit()`.
- Copy follows switches: never mention Pro while `pro_enabled` is off.
- Update CLAUDE.md (switch list, money section, "what needs an app version") and `docs/reference/payments.md` when this ships.

## Needs a new app version

Yes: the plans screen, sending and playing media, the recorder (microphone permission: iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`), the badge. The website ships first, and app 1.0.x degrades to the fallback text.

## Rollout

1. Ship the website with `pro_enabled` off. Set Jordan prices and credits in admin. Test with a test account in Stripe test mode locally, then one real low-price purchase on production by the owner.
2. Turn `pro_enabled` on. App version with Pro follows.
3. Saudi Arabia: set prices; sales start when «Prices approved» is on.

## Left to the builder

- Exact UI layout of plan cards, bubbles and recorder (follow existing chat and payments styles).
- Voice formats and whether to transcode (see §6).
- Stripe Customer reuse (one customer per member, stored on the latest `ProSubscription` row).
- Whether the yearly grant task lives in the morning job or its own small task in `runDailyJobs`.
- Draft Arabic copy for the owner to review.
