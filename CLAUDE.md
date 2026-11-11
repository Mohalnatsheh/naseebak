# CLAUDE.md

Rules for working on Naseebak (نصيبك). This file holds what you need in every session.

- Long detail by area: [docs/reference/](docs/reference/README.md)
- Dated history, past deploys and audit notes: [docs/project-history.md](docs/project-history.md)
- Open work: [docs/platform-review-2026-11-06.md](docs/platform-review-2026-11-06.md)
- Mobile app rules: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md)

## Working rules

- The repo is `~/Documents/EvoKey-Projects/naseebak` (website + `naseebak_app/`).
- `~/Desktop/Evokey-APPS/Naseebak/naseebak` is a stale checkout. Never work or deploy from it.
- Plans go through Superpowers: `superpowers:brainstorming` for a new feature or refactor, then `superpowers:writing-plans`. No ad-hoc plans.
- This is a live site with real members: keep changes additive and behind a switch when they change behaviour.
- Every schema change must be additive.
- Ask the owner before each deploy.
- Before building, tell the owner if a change needs a new app version ([list](#what-needs-an-app-version)).
- Parallel sessions may share this checkout: stage files by path, never `git add -A`, and don't switch branches. Prefer a separate `git worktree`.
- Never run the seed against production.

## Project overview

- Traditional marriage facilitation platform for Jordan, Saudi Arabia and Lebanon (Lebanon live since 2026-11-10, no sales yet). **Not** a dating app.
- Production: https://naseebak.com. Full spec: `SRS.md` (parts superseded). Specs: `docs/superpowers/specs/`. QA notes: `docs/qa/`.
- Flow map and gaps register: `docs/platform-flow.html` (some numbers are older than the code; update it when a flow changes).
- The cycle: free shared suggestions → both say «مهتم» → match → family introduction or a short filtered in-app chat. No admin work.
- Each «مهتم» costs 1 credit. The match, requests and chat are free.
- Four switches run it, all **on** in production since 2026-10-17: `intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, `credit_on_interest`.
- All four default to off. Off = the [legacy flow](#legacy-flow).
- Two more switches, both **on** in production since 2026-11-07, both off by default: `feed_active_first` (the «جديدة» order, Admin → Settings) and `sms_notices_enabled` (notice SMS, set in `system_settings`: no admin button yet, Admin → Notifications → Automatic only shows it).
- `free_interest_reply` (Admin → Settings, off by default, **on** in production since 2026-11-09, needs `credit_on_interest`, 2026-11-08): answering «مهتم» on a card the other side already said «مهتم» on (`likedYou`) costs no credit, also at 0 credits; the first «مهتم» still costs 1. The chat/family choice and guardian consent still apply (`decideSuggestion`: `introChoice` vs `charge`). The notices say the reply is free (`replyNoticeLine`). App 1.0.1+ handles it; 1.0.0 at 0 credits still locks «مهتم». Android requires 1.1.1 since 2026-11-10 (`mobile_android_min_version`; 1.1.0 earlier that day, 1.0.1 from 2026-11-09); iPhone has no minimum until 1.0.1 is on the App Store.
- `sa_relaxed_matching` (Admin → Settings, off by default, 2026-11-08): Saudi members get suggestions with no score minimum (`minSuggestionScore(flags, country)` = 0), best score first. «شروط أساسية», same country and test-account separation still apply. Jordan unchanged.
- `lb_relaxed_matching` (Admin → Settings, off by default, 2026-11-10): the same for Lebanese members (`minSuggestionScore` = 0 for LB), «شروط أساسية» incl. the sect kept.
- `chat_delete_enabled` (Admin → Settings, off by default, 2026-11-11): Pro chat delete. **On** in production since 2026-11-11 (owner). Off stops new deletes; existing hides stay applied.
- `interest_paywall` (Admin → Settings, off by default, needs `credit_on_interest`, 2026-11-11, owner; **on** in production since 2026-11-11): at 0 credits «مهتم» stays tappable and opens a short «انتهى رصيدك» step with a buy button (website: the «مهتم» dialog → `/dashboard/payments`; app: `RechargeSheet` → `/credits`). Only for members who can buy: the server sends `interestPaywall` in `/api/me/counts` (`interestPaywallFor`, `src/lib/payments/interest-paywall.ts`): false for test accounts, countries not selling (`purchasesAvailable`) and, in the app, while «Payments in the app» is off. They keep the greyed «مهتم». «لا» and the free reply are unchanged; the server's `NO_CREDITS` stays the safety net. App part needs the version after 1.2.1; older apps keep the greyed button.
- `pro_enabled` (Admin → Settings, off by default, 2026-11-09): Pro membership. It gates new sales and offers only (checkout, `/api/pro` offers and `canBuy`, the Pro page `/dashboard/pro` and its links, the chat's greyed buttons and offer). The badge and media sending follow `isPro()` whatever the switch. Subscribers keep Pro and their credits while it is off (`isPro()` never reads it). **On** in production since 2026-11-10 (Jordan 3 / 10 / 89 JOD, Saudi 6 / 20 / 178 SAR; 5 / 20 / 20-a-month credits).

## Commands

```bash
pnpm dev -p 3020                  # Dev server (Turbopack). Local AUTH_URL is http://localhost:3020
pnpm build                        # next build --webpack, same as the server
pnpm test                         # All tests (vitest run)
pnpm test:watch                   # Tests in watch mode
npx vitest run src/__tests__/suggestions/slots.test.ts   # One test file
pnpm lint                         # eslint . (must stay at 0 problems)
npx tsc --noEmit                  # Type check
pnpm db:generate                  # Regenerate the Prisma client
pnpm db:push                      # Push the schema to the database
pnpm db:studio                    # Prisma Studio
node prisma/seed.mjs              # Seed local test users
```

```bash
# Before calling work done
pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build
```

```bash
# After changing prisma/schema.prisma (pass DATABASE_URL explicitly in this checkout)
DATABASE_URL=postgresql://<user>@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate

# Stale Prisma errors
rm -rf .next && pnpm dev -p 3020
```

```bash
# Real-flow QA: use a production build (Playwright against next dev gets truncated chunks)
set -a; . ./.env.development.local; set +a
NODE_ENV=production pnpm build
NEXT_PUBLIC_APP_URL=http://localhost:3030 npx next start -p 3030
```

```bash
docker compose up -d --build      # http://localhost:3001, app + Postgres 17
docker compose down -v            # Reset the Docker database
node scripts/score-distribution.ts   # Read-only score buckets. Run on a prod copy before changing the minimum
```

## Local development

- Database: `naseeb_push` on localhost:5432 (Homebrew Postgres).
- Env: git-ignored `.env.development.local`. It sets port 3020, `SMS_MOCK`, `PAYMENTS_MOCK` and `UPLOADS_LOCAL`.
- Test logins: `0777000001`, `0777000002` with code `111111`.
- Fresh sign-up test: the number in `EXTRA_TEST_PHONES` in `.env.development.local`, code `111111`.
- Other numbers: read the code from `GET /api/dev/sms-outbox` (newest first).
- OTP limits live in Postgres. If scripted logins land on the login page, switch test phone or run `delete from rate_limit_buckets;` locally.
- Switches: `system_settings`, or Admin → Settings. All four are on locally. They are cached for 30s.
- Local payments: `PAYMENTS_MOCK=true`, `/api/dev/mock-checkout/[id]`. Local photos: `.dev-uploads/`.
- Tests mock the DB with `vi.hoisted()` + `vi.mock("@/lib/db")`; mock `$transaction` as `fn => fn(db)`. Example: `src/__tests__/intro/requests.test.ts`.
- Local app runs: `--dart-define=API_BASE_URL=http://10.0.2.2:3020`. Every app build defaults to production.
- More: [docs/reference/local-development.md](docs/reference/local-development.md), `docs/local-testing.md`.

## Tech stack

- Next.js 16.1.6, React 19, Node 22, pnpm 10.24 (dev Turbopack, production webpack)
- Tailwind CSS v4 (oklch), shadcn/ui, lucide-react
- PostgreSQL, Prisma 7.4 (`@prisma/adapter-pg`), 41 models
- NextAuth.js 5 beta.30, Zod v4 (import from `zod/v4`)
- Stripe, Ably (chat), OneSignal (website push), Firebase Cloud Messaging (app push)
- Vitest. Flutter app in `naseebak_app/`

## Architecture

```
src/
├── app/
│   ├── (ar)/         # Arabic RTL: public pages, register, login, dashboard, /pay
│   ├── (en)/admin/   # English LTR admin panel
│   └── api/          # All API routes
├── components/       # shared, ui, landing, dashboard, suggestions, matches, intro, chat,
│                     # payments, profile, blog, engagement, admin
├── contexts/         # dashboard-context (profile, counts, unread)
├── hooks/            # use-auto-save, use-in-view
├── lib/              # auth, db, settings, notify, credits, sms, stripe, bunny, activity
│   ├── suggestions/  # mutual (decide, slots), feed, refresh, dealbreaker-sweep
│   ├── matching/     # score, auto-suggest (generate), reasons, filter-tip
│   ├── intro/        # match, requests, outcome, followup
│   ├── matches/      # state, leave, links
│   ├── chat/         # service, filter
│   ├── cron/         # daily and its tasks
│   ├── payments/     # packages, fulfil, intent, refund, checkout-branding
│   ├── countries/    # fixed facts + admin settings
│   ├── notifications/ # automatic (the list of automatic messages)
│   ├── engagement/   # polls
│   └── admin/        # stats, insights, members-suggest-reason, moderation
└── proxy.ts          # Next 16 name for middleware
```

- Route protection: `src/lib/auth.config.ts`, run by `src/proxy.ts`. `/admin/*` needs admin, `/dashboard/*` needs sign-in.
- `src/lib/settings.ts` reads `system_settings` with a 30s cache.
- `DashboardDataProvider` shares `profile`, `counts` and unread data, polling `/api/me/counts` every 30s while the tab is visible.
- Member cards share `src/components/shared/person-card.tsx`.
- `src/lib/auth.ts`: `requireUser()` accepts the web session or an app `Authorization: Bearer` token. Admin routes never accept Bearer.
- Website sign-out (`signOutAndUnlinkPush` → `POST /api/auth/logout`) stamps `User.sessionsRevokedAt`: every web session signed in before it is refused in the `jwt` callback, so one sign-out (a shared computer, say) also signs the member out of their phone browser and laptop: per user by design (WA-01) (`src/lib/session-revocation.ts`, routes and proxy). Prefetch/RSC answers never refresh the session cookie (2026-11-10). Admin sign-out does the same (2026-11-11). App Bearer sessions are separate.
- Admin sign-in: 5 failures per email + IP or 20 per IP in 15 minutes lock it; 50 per email across addresses only email the admins and never refuse a correct password. Removing an admin demotes (never yourself, never the last admin who can sign in). Detail: [docs/reference/member-rules.md](docs/reference/member-rules.md#auth).
- Caching: every `/api/*` answer is `private, no-store` by default (`next.config.ts` `headers()`, which overrides a route's own, so the public routes that set theirs are excluded); `/images/*` a week. A new public cached route must be added to that exclusion.

## Brand and colours

- Only standalone "نصيبك" is the brand name.
- Logo: `public/images/logo.svg`, via `Image`, in nav and brand areas. In headings use the text "نصيبك" with a gradient. On the login panel use `brightness-0 invert` for a white logo.
- Palette: deep blue `#22476a` (primary), warm gold `#c19250` (accent), oklch in `globals.css`.
- One font: Cairo. Headlines use `.font-display`.
- **Never** use hardcoded Tailwind colours: `blue-`, `violet-`, `purple-`, `rose-`, `pink-`, `sky-`, `cyan-`, `indigo-`, `slate-`, `gray-`, `orange-`.

| Purpose | Token |
|---|---|
| Main UI, decorative | `primary`, `secondary`, `accent` |
| Success only | `emerald-`, `green-` |
| Pending or warning only | `amber-` |
| Error, destructive | `destructive` |
| Muted | `muted`, `muted-foreground` |

- Gradients: `from-primary to-secondary`, `from-accent to-accent/70`. Subtle: `bg-primary/5`, `bg-primary/10`.
- Photos: warm editorial, brand blue and gold, **never people's faces** (hands, homes, objects, Amman scenery). Always `next/image`, WebP ≤ ~180 KB. Dashboard pages have no photos.
- Page titles use `PageHeader`, never hand-built gradient boxes.
- **Design system (2026-11-11, website and app share the names):** gold text or icons on a light background use `accent-ink` (gold fills only on navy); `sand` for the chat and family rooms; one type scale (`text-display` … `text-caption`, nothing under 12 px); radius 8/12/16/24; motion tokens, all instant under reduced motion; two page widths; **one banner slot** above the title (`pickBanner` priority); badges red = act, gold = good news, navy = count. A guard test fails on raw hex, forbidden palettes, text under 12 px. One set of names: «الاقتراحات», «التوافقات», «المحادثات»; tabs «جديدة», «مهتمون بك», «بانتظار ردّهم». Detail: [docs/reference/design-system.md](docs/reference/design-system.md).

## Arabic and RTL

- Member pages are Arabic RTL. Admin is English LTR.
- Digits are Western (0-9) everywhere. Format dates with `"ar-JO-u-nu-latn"`.
- Phone and OTP inputs accept Arabic-Indic digits: convert with `toLatinDigits()` (`src/lib/digits.ts`).
- Number fields (height, weight, ages, counts) use `NumberInput` (`src/components/shared/number-input.tsx`), never `type="number"`: it silently drops Arabic-Indic digits (2026-11-09).
- RTL chevrons: `ChevronRight` = السابق, `ChevronLeft` = التالي.
- Copy follows gender: `forViewer()`, `forPartner()` (`src/lib/gendered-copy.ts`). The partner is the opposite gender of the viewer.
- Shared messages use no masculine commands: say «يمكنك …».
- Counted nouns use `arabicCount()`.
- Hijab is one question «الحجاب»: محجبة / منتقبة / غير محجبة, stored as `hijab` + `niqab` (2026-11-08). `applyNiqabRule` (`src/lib/profile-veil.ts`) runs in every write path: niqab ⇒ hijab, no hijab ⇒ no niqab, a missing `niqab` never clears it (app 1.0.0). `prefHijab` «منتقبة» needs `niqab` true (score and «شروط أساسية»).
- Stored option values never change (`"ملتزم"`). Show `selfLabel()` for my own profile and `describeOption()` / `partnerOptions()` for someone else (`src/lib/profile-options.ts`).
- Text inputs must be ≥ 16px on phones, so iPhone doesn't zoom. Tap targets ≥ 44px.
- Dialog close ✕ sits at `end-2`.
- Filter bars use `flex flex-wrap justify-center gap-2`, never `overflow-x-auto`.
- Never `<input type="date">`: use `BirthDateSelect` (it failed in Instagram's Android browser).
- Use `DropdownMenu` and `Dialog`, never `window.confirm` or hand-made overlays.
- A failed load shows `LoadError`, never a fake empty state. Never let a form save after its data failed to load.
- «إنهاء التوافق» is the one term for ending a match.

## Build and code traps

- **Client components must never import a runtime value from a module that imports `@/lib/db`** (`feed.ts`, `settings.ts`, `credits.ts`, `intro/*`, `matching/*`). It breaks `next build` while tsc and vitest pass. Use `import type` and db-free modules such as `src/lib/suggestions/feed-types.ts`.
- Never name a top-level `const` helper `short`, `long`, `int`, `float`, `char`, `byte` or similar. The production minifier drops it and the page crashes with "X is not defined".
- After touching code that client pages import at load (schemas, option tables), test a production build.
- `pnpm lint` stays at 0 problems. A targeted `eslint-disable-next-line <rule> -- <reason>` is only for blob:/data: image previews.
- Raw SQL must state instants as UTC (`::timestamptz AT TIME ZONE 'UTC'`): production Postgres runs in Europe/Berlin, columns are UTC without a zone.
- Any write to a `User` row bumps `updatedAt`, so scheduler writes on idle users must preserve "last seen" (see `runReengagement`).
- Every change to `matchCredits` calls `recordCredit()`.
- A new file in `public/` is served only after the app restarts.
- PM2 stays one fork process on purpose: auto-suggest locks and the chat limits live in memory.
- In a server `.env`, a `$` in a value is written `\$`, or Next expands it.

## Countries and `/sa` and `/lb` routing

- Countries: JO, SA and LB (Lebanon, 2026-11-10). Built switched off (an inactive country has no `/lb` page, switcher entry, sign-up or sale); **on in production since 2026-11-10** (owner): active, registration open, purchases off (no prices approved), polls off, notice SMS NONE. Fixed facts in `src/lib/countries/index.ts`, admin settings in `country_settings` (Admin → Countries, 30s cache).
- A member's country follows the phone number and never changes. Members are paired only within one country.
- Jordan sits at the root, Saudi Arabia under `/sa`, Lebanon under `/lb` (same rewrites, same traps; an inactive country falls back to Jordan).
- `/sa/...` reaches its page through `rewrites()` in `next.config.ts`. `src/proxy.ts` only sets `x-site-country`.
- **Never `NextResponse.rewrite` in `src/proxy.ts`.** On production it carries the public host, so Next fetches naseebak.com as an external site and the header is lost. It works on localhost, so test with `Host: naseebak.com` against `next start`.
- A new localized path goes in both `LOCALIZED_PATHS` (`src/lib/site-paths.ts`) and `next.config.ts`.
- The country switcher does a full page load: `/sa` and `/` are one route to the client router.
- Blog posts and polls belong to a country. A post opens only under its own country.
- The dashboard follows the member's country, not the last public page.
- Saudi purchases stay off until «Prices approved» is on in Admin → Countries. SAR prices are drafts until then. Lebanon is the same: shown and charged in USD («$»), draft packages `lb_10` / `lb_25` / `lb_50` (3 / 6 / 10 $), not approved; Pro plans only once set. Meanwhile the payments page (website and app) says buying isn't available and disables the buttons (`purchasesEnabled` from `/api/payments/plans`).
- Sign-in codes by WhatsApp are `CountryConfig.otpByWhatsapp` (SA and LB), never `country === "SA"`. Lebanon's notice-SMS provider defaults to NONE (no notice SMS) until the owner picks one.
- Numbers in `EXTRA_TEST_PHONES` pass the closed-country sign-up gate (`countrySignupBlock`), so a closed country can be walked on production before it opens. Admin «Send a test SMS» tests the country's SMS provider (Saudi Arabia: Unifonic, as before); only a WhatsApp country with no SMS provider ready (NONE or missing credentials: Lebanon today) gets a real WhatsApp sign-in code instead (checks VerifyWay to +961).
- **«المذهب»** (Lebanon only, `src/lib/profile-sect.ts`): `Profile.sect` سني / شيعي / «أفضّل عدم الذكر», `prefSect` (سني / شيعي), «شرط أساسي» key `sect`. «أفضّل عدم الذكر» is never shown on a card, never a preference, and fails a sect «شرط أساسي». The server strips `sect`, `prefSect` and the `sect` key for non-LB members. Required in the website and app 1.2.0 setup, never by the server (older apps).
- More: [docs/reference/countries-and-app.md](docs/reference/countries-and-app.md).

## Money and credits

- New members get 3 credits (`getRegistrationCredits()`).
- Only «مهتم» costs: 1 credit (ledger `INTEREST`). «لا» is free. The match, requests, chat and chat → family are free. With `free_interest_reply` on, a reply to someone who already said «مهتم» is free too (no `INTEREST` row, so never refunded).
- Refund only when the other side never answered and the card closed. A «لا» is never refunded.
- `refundUnansweredInterests` refunds once, stamped by `Suggestion.interestRefundedAt`.
- A blocker's own unanswered «مهتم» on an open card stays spent. The person blocked gets theirs back, but only from the morning job: user-scoped refund sweeps skip a pair with a block between them, so the notice never follows the block (it would give it away).
- A match lost at the last moment refunds both.
- Charge, claim and ledger run in one transaction in `decideSuggestion`: a lost claim charges nothing.
- At 0 credits cards stay visible and «لا» stays free. Only «مهتم» is refused (`NO_CREDITS`).
- No pricing on the landing page. Packages show only in dashboard payments.
- Copy follows the switches: never say requests cost credit while `credit_on_interest` is on. Never describe a switched-off feature.
- Referral: friend +1, referrer +2 after the friend finishes short setup, referrer's reward stops after 10 (`maybeAwardReferral()`).
- Jordan: shown in JOD, charged in USD (dinar × 1.41). Saudi Arabia: shown and charged in SAR.
- Lebanon: shown and charged in USD (draft, not approved).
- Prices are set in Admin → Countries. A package id's credits stay in code, because refunds read them, so a different size needs a new package id.
- Credits are added only by `fulfilCheckoutSession()` / `fulfilPaymentIntent`, once, when paid.
- **The Stripe account is shared with other sites.** Ignore anything without our metadata (`isOurSession`).
- Past payments report their own amount (`formatPaidCharge`), never today's price.
- `arabic_checkout` (Payment Element on `/pay/<id>`) is off by default. Its state on production is set in Admin → Settings.
- Test accounts never see payments in the app.
- Pausing the account, or asking to delete it, stops a live Pro renewal at the period end, no refund, with a notice (`stopProRenewalOnLeave`). Reactivating never resumes it (2026-11-10). A renewal already failing (`PAST_DUE`) ends at once instead. A paused member can read `/api/pro` and cancel; checkout and resume stay refused.
- A paid Pro invoice that never made Pro live (a duplicate, or a renewal after the end) tells the member and is marked `Payment.proNotLive` («Refund decision» in Admin → Payments).
- **Pro membership** (switch `pro_enabled`, code `src/lib/pro/`, **on** in production since 2026-11-10):
  - Its own dashboard page `/dashboard/pro` (owner, 2026-11-10): plans or «اشتراكي», the Stripe return (`?pro=success|cancel`) and Pro notices land there. `/dashboard/payments` keeps credit packages and history plus one small «عضوية Pro» link card; that card and the «عضوية Pro» nav entries show only when the member can buy a plan or is Pro (`proPageShown`, `counts.pro.showPage`).
  - Weekly, monthly or yearly Stripe subscription (Checkout `mode: "subscription"`, inline `price_data`). Plans, prices and credits per plan are set per country in Admin → Countries and apply to new subscribers only. No trial, no plan switching (cancel, then subscribe again after it ends).
  - Credits are granted once per paid invoice (ledger `PRO_GRANT`, `ProCreditGrant.key`). Yearly gives a monthly amount: the first month on the invoice, the rest by the morning job (`runYearlyProGrants`), every month of every paid year. Unused credits carry over.
  - **Refunds are made only by an admin. Members can cancel renewal; cancelling never refunds.** No code refunds on its own (owner, 2026-11-09).
  - Cancel = at period end; Pro stays until then. Only Stripe `active`/`past_due` are live (`PAST_DUE` is still Pro while Stripe retries). `unpaid` and `paused` end Pro here (CANCELED) and are cancelled at Stripe at once; `canceled` and `incomplete_expired` end it too.
  - An admin's full refund of the current invoice ends Pro and takes back that invoice's grants (floored at 0); an older invoice takes back only its own; a partial refund changes nothing. Admin «cancel now» and account deletion cancel in Stripe with no refund.
  - A second paid subscription while one is live is never live: it is cancelled at Stripe at once, its invoice grants its credits, the older one stays the member's Pro, and the admins are emailed both payments to refund by hand. A renewal paid after Pro ended here is handled the same way: Pro does not come back (`lib/pro/duplicate.ts`).
  - Pro checkout sessions expire after `CHECKOUT_TTL_MS` (35 min); a new Pro checkout expires the member's other open ones. The unpaid-checkout reminder skips `pro_*` rows. The webhook reads both Stripe payload shapes (before and after API 2025-03-31).
  - Webhook cases come before `fulfilCheckoutSession` and ignore anything without our metadata (`kind: "pro"`).
  - Sales need `purchasesAvailable` and `pro_enabled` and an enabled plan with a price. Pro never touches suggestions, score or order. The plans list «أولوية في الاقتراحات» by owner decision (2026-11-10), made after being told nothing delivers it yet: don't "correct" the copy; the priority is owed and gets built later.
  - Detail: [docs/reference/payments.md](docs/reference/payments.md#pro-membership).
- More: [docs/reference/payments.md](docs/reference/payments.md), [docs/reference/suggestions-and-credits.md](docs/reference/suggestions-and-credits.md).

## Privacy and domain rules

- No contact between members except chat after a mutual match and an accepted request: text only, filtered.
- Photos stay hidden until a mutual like. Member photos use `next/image` with `unoptimized`.
- Parent/guardian data is admin-only, except after an accepted family introduction with consent (`ParentInfo.shareConsentAt`).
- A closed match never returns guardian contacts.
- Members are 18+.
- No guardian at setup: it is asked for only at a family step, and the server refuses without it (`GUARDIAN_REQUIRED`).
- Suggestion gate: always `meetsSuggestionGate()` (server) or `qualifiesForSuggestions()` (client). Matches are never gated.
- Only `role: USER` accounts get or receive suggestions.
- Test accounts (`src/lib/test-accounts.ts`) meet only each other. On production only `EXTRA_TEST_PHONES` count.
- Never put a real or review phone number in a doc, and never send personal data in analytics params. Dashboard page titles stay fixed labels.
- Sign-up never reveals whether a number is registered. Sign-in learns it from `verify-otp` (after the code). `send-otp` still returns `userExists` only for app builds before 2026-11-07: remove it once the force update requires the newer app.
- GA runs on public pages and the dashboard with ids stripped, never in `/admin`. GTM and the Pixel are off the dashboard, admin, `/pay`, `/payments` and login.
- Identity verification is removed for members. `VerifiedBadge` is hidden while `intro_requests_enabled` is on.
- **Chat media (Pro):** photos and voice notes only from a Pro sender, only in an ACTIVE chat, never after block, end or expiry. Files sit in the shared Bunny zone under `chat/<conversationId>/<32 random bytes>.<ext>`; the path stays in `Message.mediaPath` and never reaches a client, Ably, push, analytics or logs. They are served only by `GET /api/chats/[id]/media/[messageId]` (a member of the chat, or an admin, logged `[admin-chat-view]`). Photos are re-encoded to WebP, metadata stripped. HEIC/HEIF is decoded in a worker thread (`heic-convert`), one at a time, capped at 50 MP and 20 s. Every voice note is transcoded to AAC in `.m4a` (`audio/mp4`) by `ffmpeg-static` as a child process, one at a time, 30 s timeout, demuxer pinned from the MIME, input on stdin only. Both queues are capped and refuse a burst with «حاول مرة أخرى». The media route answers 401 when signed out. The greyed media buttons show only where the viewer can buy Pro (`canBuy`). Old apps get a fallback text in `body`.
- Profile edits after setup go through review, except partner preferences and filling an empty field.
- Sign-in, reports, moderation and leaving: [docs/reference/member-rules.md](docs/reference/member-rules.md), [docs/reference/matches-and-safety.md](docs/reference/matches-and-safety.md).

## Notifications

- Always use `notify()` / `notifyMany()` (`src/lib/notify.ts`). It writes the bell row, respects preferences and pushes to OneSignal and FCM.
- **Guard test:** the list of automatic messages is `src/lib/notifications/automatic.ts`, and the texts stay at their call sites. `src/__tests__/lib/automatic-notifications.test.ts` fails when they differ, so change both.
- Keep `UNPAID_TITLE` and the «صفر: اشح» top-up line. Admin Insights count them by text.
- **Lebanese dialect (2026-11-10):** `notify()` / `notifyMany()` run the body of every notice to an LB member through `toLebanese` (`src/lib/notifications/lebanese.ts`, db-free, sentence pairs in `LB_DIALECT`). Call sites keep MSA, so JO/SA are unchanged. Titles are never rewritten (jobs find notices by stored title), and «صفر: اشح» stays. A new automatic text needs a pair in `LB_DIALECT`: `src/__tests__/lib/lebanese-notices.test.ts` fails otherwise. Admin sends pass `verbatim: true`. The chat bell row (`lib/chat/bell.ts`), emails and SMS stay MSA.
- **Notice SMS, narrowed** (owner, 2026-11-07; off 2026-10-29 to 11-07). `sms_notices_enabled` is **on** in production since 2026-11-07: only a match or a «مهتم» (`SMS_NOTICE_EVENTS`), only to members with no push seen in the last 14 days, one per day, each text one Arabic SMS (≤ 70 characters). No automatic chat or expiry SMS. Admin «send now» is not narrowed.
- Saudi and Lebanese sign-in codes go by WhatsApp (`sendOtpCode`, VerifyWay). The reply repeats the code, so it is never logged.
- A chat push reads «رسالة جديدة من <name>», never the message text. The bell keeps one row per chat (`upsertChatBell` reuses the chat's newest row, even a read one).
- Ask push permission with `requestPushPermission()` and sign out with `signOutAndUnlinkPush()`, never the bare browser prompt or `signOut()`.
- More: [docs/reference/notifications-and-sms.md](docs/reference/notifications-and-sms.md).

## Suggestion flow

Feed tabs (one set of names on the website and the app since 2026-11-11): `new` = «جديدة», `interested` = «مهتمون بك», `waiting` = «بانتظار ردّهم». A fourth website tab, «التوافقات», lists matches.

| Constant | Value | Where |
|---|---|---|
| `MAX_OPEN_SUGGESTIONS` | 10 per person, only «جديدة» counts | `matching/auto-suggest.ts` |
| `minSuggestionScore()` | 60 (30 with `credit_on_interest` off) | `matching/auto-suggest.ts` |
| `PREFERRED_SCORE` | 70 | `matching/auto-suggest.ts` |
| `MUTUAL_SUGGESTION_DAYS` | 7, card life | `suggestions/mutual.ts` |
| `SLOT_IDLE_DAYS` | 2 | `suggestions/mutual.ts` |
| `NEW_TAB_LIMIT` | 15 cards shown in «جديدة» | `suggestions/feed.ts` |
| `CANDIDATE_ACTIVE_DAYS` | 7 | `activity.ts` |
| `CANDIDATE_FALLBACK_DAYS` | 14 | `activity.ts` |
| `RESUGGEST_AFTER_DAYS` | 30 | `matching/auto-suggest.ts` |
| `SECOND_CHANCE_DAYS` | 30 | `matching/auto-suggest.ts` |
| `RETRY_COOLDOWN_MS` | 30 minutes | `matching/auto-suggest.ts` |

- One `Suggestion` row with `flow: MUTUAL` is shown to both people. Each decides once through `decideSuggestion` (`POST /api/suggestions/[id]/decide`). The same answer again (a double tap) returns the card's current state with `repeated: true`, never a 404 or a second charge.
- Both «مهتم» → `createMutualMatch`. If that fails after the charge, `healMissingMatches` creates it in the daily job.
- A «لا» closes the row at once (REJECTED). Read the two decisions: REJECTED means someone said «لا», not that both answered.
- Nobody is told about a «لا», except someone who already said «مهتم»: their card shows «لم يحصل توافق» (`declined`), no refund.
- Every «مهتم» on an undecided visible card tells the other person «شخص أبدى اهتمامه بك» (`notifyInterestShown`, once per Amman day).
- `lastActiveAt` is used for sorting and never sent to clients. `activityLabel` sends only «نشط اليوم» or «نشط هذا الأسبوع».
- **`memberSuggestStatus`** (`src/lib/admin/members-suggest-reason.ts`) is read-only and **must mirror `generate`** (`src/lib/matching/auto-suggest.ts`). Change one, change the other.
- Cards top up on page open, on save, after a decision, on expiry and in the daily job. The morning job and Admin «Generate All» (a background run with progress) handle up to `WEEKLY_SUGGEST_LIMIT` (600, `cron/suggest-limit.ts`, db-free) members, most recently active first; the top-up also reveals their hidden cards. On the website the page-open top-up rides on the first «جديدة» feed request (`?topup=1`, which also returns `emptyReason`); the app keeps calling `GET /api/suggestions`.

Current notes:

- **Which cards go first:** `orderForSlots`: `PREFERRED_SCORE` (70) and up first, 60–69 only fill what's left, then people with a free slot, then score. The floor stays 60.
- **«جديدة» order:** activity groups (3 days, 7 days, older), then score. Switch `feed_active_first` (Admin → Settings, off by default, **on** in production since 2026-11-07) makes it 1 day, 3, 7, older, and puts someone with `BUSY_WAITING` (5) «مهتم» waiting on them last in their group. Order only: nobody is hidden, nothing sent to clients (`src/lib/suggestions/feed.ts`).
- **Expiry reminders:** `remindMutualSuggestions` walks every due card in pages (`MAX_REMINDER_PAGES`), still one notice per person per day.
- **Card buildup:** a hidden card fills the recipient's slot (`slotMutualWhere`, `openCounts`), never the candidate's. Members away 7 days get no new cards and no reveals until they return. The 14-day candidate fallback stays, so active members aren't left empty. Old piles shrink by expiry only: no bulk closing.
- **Second chance:** a «مهتم» left unanswered because the other person was away (no `activity_days` row during the wait) comes back to them once (`secondChanceCards`, `reopenedAt`): full 7 days, in «مهتمون بك» so it takes no slot, up to `SECOND_CHANCE_PER_DAY` (3) a day whatever «جديدة» holds (until 2026-11-07 it waited for room there, which blocked 120 of 165), with the «مهتم» notice. Both must still fit, with neither blocked, matched, engaged or gone. The first person keeps their refund and pays nothing more if it matches. Cards closed by a change never come back this way (`closedByChange`).
- **After the match (evening job, push + bell, never SMS):** `nudgeQuietChats` nudges a chat once, 48 hours on, if nobody wrote (both) or a message is unread (the silent one). `closeUnsharedMatches`: a mixed choice gets a last call on day 5 and closes 2 days later; the side that didn't share carries `NOT_A_MATCH`, no refund, no chat. Win-back: `runReengagement` invites members away 7–30 days with nothing waiting (finished profile, not flagged, not engaged), same weekly limit.
- **Empty search wait:** after a run finds nobody, `generate` waits 30 minutes. Any change to a member's data, preferences or «شروط أساسية» clears it (`clearSuggestCooldown`).
- **Cards closed by a member's change:** a change closes only cards nobody answered (`closedByChange`); the pair can meet again at once on the same row. A card either side said «مهتم» on stays open whatever either changes (owner, 2026-11-07). Natural expiries keep the 30 days.

Detail: [docs/reference/suggestions-and-credits.md](docs/reference/suggestions-and-credits.md).

## After a match

- `createMutualMatch` → `openMatch` → `applyIntroOutcome` opens the match straight into what both chose.
- CHAT + CHAT → `Conversation`, 14 days (+7 once in the last 3 days). FAMILY + FAMILY or mixed → family introduction.
- Choosing FAMILY needs a guardian and consent. Consent is stored only when the action completes.
- Mixed match: neither guardian shows until both shared.
- Requests expire after 7 days. A declined request is final for that type on that match.
- The chat filter blocks phones, links and handles, including spelled-out or split numbers (`src/lib/chat/filter.ts`). A sender's own messages between number pieces don't reset the run; the partner's message does (two people alternating is accepted).
- Only the server publishes to Ably `chat:<id>`. Browsers get subscribe-only tokens.
- Modern chat (2026-11-10, website + app 1.1.0, old apps ignore the new fields):
  - Reply: `replyToId` (same chat, else 400) → `replyTo {id, mine, kind, snippet}`. Reactions ❤️ 👍 😊 🤲, one per member: `POST …/messages/[messageId]/reaction {emoji|null}`. Typing: `POST …/typing` (3 s client pace, 8 s shown, `TYPING_SHOW_MS`, in memory). Starters in the GET while I haven't written. None of these in an ended or blocked chat; reactions make no push.
  - «إبلاغ عن الرسالة» sends `report.messageId` to `/api/chats/[id]/end` (`Report.messageId`, same chat only).
  - Without Ably: the GET returns `partnerTyping` and `polledAt`; a poll with `reactionsSince` (last `polledAt` − 5 s) gets `reactionUpdates`. Own typing wakes the fast poll.
  - Status bar, one line by priority (`chatStatusBar`, website and app): expiry while extendable; the family offer or a request received (+ days left); expiry with no action; another family step; push chip. The offer waits until both have written (`bothWrote` in the chat GET, whole chat). Mic: hold to record, slide to cancel, slide up to lock; stops and waits at 3 min or in the background.
  - Report: «إبلاغ فقط» (`end: false`) files the report and the chat stays open, no block; «إبلاغ وإنهاء المحادثة» (no `end`, old apps) ends it, blocks and closes the match. A reported `messageId` must be the partner's. A closed chat offers «إبلاغ وحظر».
  - Filter (2026-11-11): also digits glued to number words, spaced or dotted app names, English number words in Arabic letters, «signal» only with context. A refused message shows as a gold note with the family button.
  - Polling without Ably: 4 s, slowing to at most 8 s while visible, paused when hidden; typing shows 8 s. The chats list doesn't poll on its own: it follows the badges and my sends.
  - Pro chat delete (2026-11-11, switch `chat_delete_enabled`, spec `docs/superpowers/specs/2026-11-11-chat-delete-pro-design.md`): message «حذف لديّ» / «حذف لدى الجميع» (everyone only on my own messages, only in an open unblocked chat); clear chat «مسح المحادثة» (for me / for everyone). Pro only (`isPro()`); entries show only where the member is Pro or can buy (website `deleteEntryMode`, app also `appPaymentsProvider`), else none. Silent: no push, bell or SMS; the chat stays open.
  - Nothing is erased (`Message.deletedAt`, `MessageHide`, `ConversationClear`, `Conversation.clearedAt`): hidden in SQL on member reads (`visibleMessageWhere`, `src/lib/chat/visibility.ts`). A message leaving someone's view is stamped read for them, so badges, SMS and nudges follow the view (side effect: hiding the partner's unread message shows them ✓✓). Deleted for everyone shows «تم حذف الرسالة» to both (old apps get it as plain TEXT); still reportable; the media route 404s deleted or hidden media for members. The admin chat view tags each message (deleted for everyone / hidden by / cleared for everyone by / before X's clear).
  - Ably events `deleted {messageId}`, `cleared {before}`; GET fields `deleteEnabled`, `clearedBefore`; poll `deletedIds` / `hiddenIds`. Accepted: an old app with the chat already open shows a deleted message until reopened.
  - The first page (no `before`/`after`) widens to 100 in a chat with a deletion, a hide by me or a clear, so old apps' 100-message device cache (`ChatCache.keep`) is fully replaced on reopen. Also accepted (owner, 2026-11-11): on an old app, a chat with more than 100 visible messages whose device copy was saved before the delete or clear, with new messages arriving before the next open, can show the original text for that one session (only when scrolled to the top); the next open fixes it.
- `ChatSummary.endedBy` (`me` | `partner` | `system`, 2026-11-10) sits next to `endedByMe`: an admin's end or the member's own pause reads «انتهت هذه المحادثة.», never «أنهى الطرف الآخر». Older apps read `endedByMe` only.
- Admin chat views are logged (`[admin-chat-view]`).
- A block ends the chat for good and keeps it read-only for the blocked person, so reports stay possible.
- Reports never act on their own (owner, 2026-11-07): no automatic flag, no automatic chat pause. Every report emails the admins, who flag, end the chat or suspend by hand. Report evidence survives account deletion.
- Detail: [docs/reference/matches-and-safety.md](docs/reference/matches-and-safety.md).

## Scheduler

- `GET|POST /api/cron/daily?part=morning|evening|frequent` with `Authorization: Bearer $CRON_SECRET`. No part = morning + evening, as Admin «Run now».
- `runDailyJobs()` (`src/lib/cron/daily.ts`): each task is isolated and idempotent. A failed task emails the admins.
- Morning 06:00 Amman: expiry, refunds, new suggestions, chats, deletions, payments, clean-up. No pushes.
- Evening 18:00, the online peak: reminders, filter tips, follow-ups, re-engagement.
- Frequent, every 15 minutes: the unpaid-checkout reminder.
- Also every 15 minutes, `/api/cron/unread-sms`: sends SMS held overnight (match and «مهتم» only). Its chat SMS stop at once (`chat_sms_off`).
- 03:30: database backup, local plus an encrypted copy off the server (`/var/log/naseebak/backup.log`).
- Schedule: `/etc/cron.d/naseebak` (Amman time). Results: `/var/log/naseebak/cron.log`.
- The scheduler's request times out at 5 minutes (curl and Nginx). The first evening run with every expiry reminder (2026-11-07, about 4,500 cards) took 2.5 minutes. To run a part by hand, call the live slot's port directly with `Host: naseebak.com`, so the timeout doesn't apply.

## Deployment

**Production: `644ab4e` (Pro chat delete, switch `chat_delete_enabled` ON since 2026-11-11, owner; «مهتم» paywall, switch `interest_paywall` ON since 2026-11-11, owner; Pro page delete line and lock; app crash and keyboard fixes), deployed 2026-11-11 with `--db-push` (3 nullable columns, tables `message_hides` and `conversation_clears`; backup `/root/backups/naseeb-before-deploy-644ab4e-20261111-2039.dump`), slot a. Lebanon is on since 2026-11-10 (owner): active, registration open, no sales (no prices approved), polls off.**

Update that one line after each deploy. Don't list past versions. The live revision is in `/var/www/naseebak/REVISION`.

```bash
# 1. Push to GitLab main (the working checkout has only GitHub https as origin)
git push git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git HEAD:main
git push git@github.com:Mohalnatsheh/naseebak.git HEAD:main   # needs SSH keys; the https origin has no saved login

# 2. If new Tailwind classes were added or look missing, clear the idle slot's cache
ssh -i ~/.ssh/naseebak_vps_ed25519 -o IdentitiesOnly=yes root@146.103.57.224 'rm -rf /var/www/naseebak-b/.next/cache'   # idle slot: a or b

# 3. Deploy
ssh -i ~/.ssh/naseebak_vps_ed25519 -o IdentitiesOnly=yes root@146.103.57.224 naseebak-deploy

# Options: --db-push (dump, then prisma db push, additive only), --ref <branch|commit>, --rollback
```

- Only committed and pushed code is deployed.
- Blue/green: slots `/var/www/naseebak-a` (port 3000) and `/var/www/naseebak-b` (port 3010). `/var/www/naseebak` is a symlink to the live slot.
- A deploy builds in the idle slot, checks it (`/` = 200 and `/api/mobile/config` contains `"android"`), reloads Nginx, then stops the old process. A failed build or check leaves the live site untouched.
- `--rollback` switches to the other slot. Run it again to undo.
- Ports 3001–3003 belong to shabaah.com, which shares the server. Leave it alone.
- **Stale `.next` cache trap:** `naseebak-deploy` keeps `.next` between runs, and a stale webpack cache silently drops new Tailwind classes. The cure is step 2 above.
- A build failing with `Cannot read properties of null (reading '1')` under `nextFontGoogleFontLoader` is a bad Google Fonts download. The live site is untouched: run the deploy again.
- Before `--db-push`, check what it will run: `npx prisma migrate diff --from-config-datasource --to-schema <file> --script` in `/var/www/naseebak` with `.env` loaded (read-only).
- **Pro went live 2026-11-10 (`3593127`); `pro_enabled` turned on the same day with the owner's prices.** Done then: `--db-push` (all additive, diff checked), the idle slot's cache cleared, `pnpm install --frozen-lockfile` brought `ffmpeg-static`, `heic-convert`, `sharp@0.34.5`. Nginx (`/etc/nginx/sites-available/naseebak`, backup in `/root/nginx-naseebak-*.bak`): `client_max_body_size 11m`, a `location ~ ^/api/chats/[^/]+/media` with `proxy_read_timeout 120s`, and `Permissions-Policy` `microphone=(self)` (it was `microphone=()`, which blocks website voice notes). `X-Real-IP` was already set. Before turning `pro_enabled` on: the four Stripe webhook events (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`), the endpoint's API version and the Billing "after all retries fail" setting, Pro prices in Admin → Countries, the owner's refund/terms wording. Detail: [docs/reference/payments.md](docs/reference/payments.md#pro-membership).
- Env: `/var/www/naseebak/.env`. `NEXT_PUBLIC_*` needs a rebuild. Any other `.env` change: `sudo -u naseebak pm2 restart naseebak-a --update-env` (use the live slot).
- Logs: `/var/log/naseebak/out.log`, `error.log`, `deploy.log`, `cron.log`. Requests: `/var/log/nginx/naseebak.access.log` (`rt=`, `urt=`).
- Never use `/root/backups/naseebak-deploy-20261103-2112.bak`: it no longer works.
- Server, Nginx, backups and performance: [docs/reference/operations.md](docs/reference/operations.md).

## Owner decisions in force

- Not a dating app: no contact outside the cycle, no faces in site photos.
- Minimum score stays 60. Card life stays 7 days.
- A full candidate is never skipped: the card is created hidden.
- «لا» closes the card at once. "No refund" lets people infer a «لا»: accepted.
- Interest is shown. A «لا» is shown only to someone who said «مهتم».
- Cards the other side already said «مهتم» to come first in `new`, silently.
- Education preferences mean "this level or higher".
- Guardian is asked for only when needed. Sign-up stays short.
- Referral pays after the short setup.
- Two people alternating can still pass a number through chat: accepted, stricter would block normal messages.
- Notices are push + bell. SMS only for a match or a «مهتم», to members with no push active in the last 14 days (2026-11-07).
- Stripe stays in the app, with the known Play and Apple billing risk.
- Refunds are made only by an admin. Members can cancel renewal; cancelling never refunds. No code refunds on its own (2026-11-09).
- Old card piles shrink by expiry only.
- Public pages never mention poll credits. Visitors never earn.
- PM2 stays one fork process. SSH password login stays on.
- Dashboard home has no welcome pop-up. Every match is managed on the suggestions page.
- Pro (2026-11-09): read receipts stay free. No content check on chat photos. Chat media shares the profile-photo Bunny zone: the CDN address is unguessable but public, risk accepted. Admins see and hear media in chats they open.

Parked, or waiting for the owner:

- The cap on hidden cards per recipient (G53) and a popular member at 0 credits holding many paid «مهتم» cards (G57).
- Comparing «مهتم» → match by feed order on or after 2026-11-18, and by score band.
- About 2026-11-14, measure `feed_active_first` and the SMS: «مهتم» → match by how many «مهتم» already waited on the other side (before, 24 Oct – 4 Nov: 32% with none, 12% with 1–4, 6% with 5–9, 3% with 20+), and the answer rate for members without push (before: 25%, 44% with push). 64% of «مهتم» went unanswered.
- Device checks still needed for app 1.1.0+4: Android 14 predictive back and one task in recents (A2-M1, A2-M2), Android frame times on a real phone (A2-M6), no Impeller opacity warnings at launch and sign-in (A-L10).
- Everything else open: [docs/platform-review-2026-11-06.md](docs/platform-review-2026-11-06.md).

## What needs an app version

Reach the app at once, no version: list contents and order, limits, prices, API texts, notices, pushes, Admin popups, the force-update and maintenance switches, «Payments in the app».

Needs a new app version:

- Anything the app decides itself, such as the «مهتم» lock at 0 credits. The «مهتم» paywall (`interest_paywall`, 2026-11-11) is built in the app after 1.2.1 (`RechargeSheet`, `Counts.interestPaywall`), not released yet.
- New screens, new fields the app sends, analytics events, push channels, deep links.
- A `purchase` event, popup tap actions.
- The filter tip on the app's empty «جديدة» page.
- The website's «الرصيد أرخص» saving line. A live chat widget in the app.
- Chat delete (2026-11-11): the delete and clear entries, the «تم حذف الرسالة» bubble and the live `deleted` / `cleared` events in the app. Old apps show a deleted message as plain text.
- Pro in the app: plans screen (calls `POST /api/pro/checkout`, opens the URL in the browser), «اشتراكي», sending photos and voice notes (picker, recorder, microphone permission), photo and voice bubbles, the Pro badge. Old apps still show media messages as text («حدّث التطبيق»). The website has all of it already.

App 1.2.0+6 (built 2026-11-10 from `d441363`: Play bundle `~/Documents/EvoKey-Projects/naseebak-release-1.2.0/naseebak-1.2.0-6.aab`, iOS uploaded to TestFlight): «المذهب» (setup, edit, preference, «شرط أساسي», cards), the code wording from the server's `otpChannel`, +961 guardian phones, the Pro «أولوية في الاقتراحات» line. Lebanon went live before 1.2.0 reached the stores (owner, 2026-11-10): Lebanese members on 1.1.x get no «المذهب» question and see «برسالة نصية» on the code screen; once 1.2.0 is live in both stores, set the force update to 1.2.0. Details: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md).

App 1.1.0+4 (live on Play 2026-11-10 with the force update to 1.1.0; iOS uploaded to TestFlight the same day): Pro, chat photos and voice, the modern chat, the QA round 2 fixes and the shared design (type scale, tokens, brand kit, seal, time arc, one banner slot, badge rules). Ships only after the server branch is live (hard gate: an older server strips `end:false`, so «إبلاغ فقط» would end the chat and block); update the store privacy answers first (audio and photos in chat). Details: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md).

App 1.0.1+2 (built 2026-11-09, not uploaded yet; Play has 1.0.0): free «مهتم» reply, niqab answer, chat tabs «النشطة» / «المنتهية», six Crashlytics fixes, `X-App-Platform`, the activity label on cards, the WhatsApp wording for Saudi codes. Once it is live, turn on the force update to 1.0.1. Details: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md).

App 1.2.1+7 (built 2026-11-10 from the audit fixes, Play bundle built and iOS uploaded to TestFlight the same day): the app side of the 2026-11-10 audit (crash on leaving the match page mid-action, counts refreshed on resume and push, tab links, sheets above the tab bar, chat recorder and reply fixes, Pro return reads success/cancel). Details: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md).

API changes must keep old app versions working. Members update slowly.

## Legacy flow

- Applies only with the switches off, and to old rows. Production does not use it.
- Admin-arranged family visits, 2 free credits, 1 credit per suggestion received, no chat.
- Keep its code paths intact: the switches must still restore it.
- Detail: [docs/reference/suggestions-and-credits.md](docs/reference/suggestions-and-credits.md#legacy-flow-switches-off).
