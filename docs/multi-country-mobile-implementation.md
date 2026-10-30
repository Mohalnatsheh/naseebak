# Multi-country platform + Flutter app — implementation record

Branch: `feature/multi-country-mobile` (local only — nothing pushed or deployed). Started 2026-10-29 from the live
version `59643be` (naseebak.com).

> Status legend: ✅ done and tested · 🟡 partly done · ⬜ not started. This file is updated as work lands; the
> "Progress" section at the end is the checkpoint to resume from.

## 1. Current architecture (inspected, not assumed)

| Area | What the code actually is |
|---|---|
| Framework | Next.js 16.1.6, **App Router** (`src/app`), React 19.2, TypeScript, Turbopack in dev / webpack in production builds |
| Package manager | pnpm 10.24 (`pnpm-lock.yaml`), Node 22 |
| UI | Tailwind CSS v4 (oklch tokens in `globals.css`), shadcn/ui, lucide-react; Arabic RTL public site + dashboard, English LTR admin |
| Database | PostgreSQL + Prisma 7.4 (`@prisma/adapter-pg`), 34 models in `prisma/schema.prisma`; schema changes go out with `prisma db push` (additive only — live site) |
| Auth | NextAuth 5 (beta.30), **JWT strategy, cookie session**. Members: phone + OTP (`credentials` provider → `authorizePhoneLogin`). Admins: email + password (`admin-credentials`). API routes guard with `requireUser()` / `requireAdmin()` (`src/lib/auth.ts`) — 58 member routes go through `requireUser()` |
| OTP | `/api/auth/send-otp` → `/api/auth/verify-otp` → sign-in or `/api/auth/register`; limits in Postgres (`rate_limit_buckets`): send 3/phone/5 min, 10/IP/15 min; verify 5/phone, 30/IP; sign-in 5 failures/15 min. Test numbers (`EXTRA_TEST_PHONES`, built-ins outside production) use the fixed code 111111 and never get SMS |
| SMS | `src/lib/sms.ts`: routed by the phone's country — JO → Broadnet, SA → Unifonic (untested, no account). Notice SMS (`sms-notice.ts`) are **off** in production since 2026-10-29 (`sms_notices_enabled`); only OTP SMS are sent |
| Payments | Stripe Checkout (embedded), packages per country in `src/lib/payments/packages.ts`; credits only by `fulfilCheckoutSession` (webhook / return page / daily reconcile), idempotent (claims the Payment row in a transaction) |
| Real time | Ably (`src/lib/ably.ts`, server-publish only; browsers get subscribe-only tokens from `/api/chats/ably-token`); without the key the chat page polls every 4 s |
| Push | OneSignal web push (`external_id` = user id); no native push |
| Jobs | `GET /api/cron/daily` (Bearer `CRON_SECRET`), `/api/cron/unread-sms` every 15 min (system cron on the server) |
| Admin | `/admin/*` (English, client pages + `/api/admin/*`), country selector (cookie `admin_country`, JO / SA / ALL) |
| Tests | Vitest (1171 tests at the start of this branch, all passing), ESLint flat config, `tsc --noEmit`, `pnpm build` |

## 2. Business rules to preserve (from the code, which wins over the task text)

The task brief lists "3 credits for 3 JOD, 5 for 4, 10 for 7". **The code has newer, approved rules** (owner decisions
in `CLAUDE.md` and `packages.ts`):

- Registration gives **3 credits** (`getRegistrationCredits()`), new cycle.
- **Credit on interest** (switch `credit_on_interest`, on in production): «مهتم» costs **1 credit**, «لا» is free,
  refunded only when the other side never answered; matches, chats and the chat→family move are free.
- Jordan packages on sale (opening offer since 2026-10-23): **10 credits = 3 JOD, 25 = 6 JOD, 50 = 10 JOD**, shown in
  JOD, charged in USD (423 / 846 / 1410 cents). The old 3/5/10 packages are "retired" (kept for refunds only).
- Credits never expire; no subscriptions are sold (the `Subscription` model is legacy).
- `سؤال نصيبك`: 1 credit per answered question (members only).
- Saudi packages in the code (15 / 30 / 50 SAR) were **never approved** (`[NEEDS INPUT]`). This branch makes Saudi
  purchases **disabled** until an admin enables them after approval.

## 3. Database and auth (relevant parts)

- `User.country` (`"JO"` default, indexed with gender) — set at registration from the phone's dial code and fixed.
  All existing rows are Jordanian: every production member registered with a `962…` number (checked: the Saudi branch
  was never deployed), so the default `"JO"` is the correct backfill — no guess involved.
- Members are only paired within one country (auto-suggest, admin generate, hand-pick check).
- `Payment.currency` records JOD / SAR; `CreditLedger` records every credit change.
- Sessions are NextAuth JWT cookies — **not usable by a native app**. This branch adds mobile bearer tokens (§6).

## 4. Existing APIs the app reuses (contracts in `docs/api-mobile.md`)

Auth: `send-otp`, `verify-otp`, `register`, `forgot-password`/`reset-password` (admins only). Member: `profile`,
`profile/draft`, `profile/photos`, `profile/dealbreakers`, `suggestions/feed`, `suggestions/[id]/decide`,
`matches`, `matches/[id]/intro`, `intro-requests/*`, `chats`, `chats/[id]/messages`, `chats/[id]/read`,
`notifications*`, `me/counts`, `payments/plans`, `payments/checkout`, `payments/session-status`, `payments/history`,
`blocks`, `reports`, `profile/deactivate`, `profile/delete`, `polls/*`. All of them call `requireUser()`.

## 5. Gaps for multi-country (and what this branch adds)

| Gap | Change |
|---|---|
| Country settings live only in code; nothing editable | New `CountrySetting` table (one row per country, typed columns): active, registration open, purchases enabled, SMS provider + sender id, support contacts, SEO + hero overrides, feature flags. Code registry stays the source for fixed facts (dial code, phone rules, currency, time zone) |
| Inactive / closed countries | `send-otp` (register), `register`, checkout and the public config API check the country's settings |
| SMS provider per country is hard-wired | `sendSms` picks the provider from the country's setting (`BROADNET` / `UNIFONIC` / `MOCK` / `NONE`); secrets stay in env |
| No local SMS | `MOCK` provider (dev only, never in production) + `/api/dev/sms-outbox` (404 in production) |
| No public country API | `GET /api/countries`, `GET /api/countries/[code]` — safe fields only (tested) |
| Admin can't manage countries | `/admin/countries`: list, edit, validation warnings, safe SMS test |
| Native app can't use cookie sessions | `MobileSession` table + `/api/mobile/auth/*`; `requireUser()` accepts `Authorization: Bearer` |
| Checkout is web-embedded only | `mode: "hosted"` for the app; dev-only mock checkout that credits through `fulfilCheckoutSession` |

## 6. Flutter architecture (naseebak_app/)

Flutter 3.41.6 / Dart 3.11.4 (installed at `C:\src\flutter`), Android SDK present. Feature-first folders,
`flutter_riverpod` for state, `go_router` for routing and guards, `dio` for HTTP with a bearer interceptor,
`flutter_secure_storage` for the token, `shared_preferences` only for the non-secret selected country, Arabic-first
(RTL) with Cairo font, brand colors from `globals.css` (navy `#22476a`, gold `#c19250`). API base URL from
`--dart-define=API_BASE_URL` (Android emulator `http://10.0.2.2:3020`).

## 7. Test plan

Backend: Vitest unit/route tests for country settings, public config (no secrets), registration by country, SMS
provider selection and mock, mobile token issue/revoke/expiry, `requireUser` bearer path, checkout country rules,
mock checkout idempotency — plus the full existing suite. Flutter: `flutter analyze`, unit + widget tests with mocked
HTTP, an Android debug build, and (where an emulator is available) a run against the local API.

## 8. Risks and open questions

- Saudi SMS (Unifonic) has no account → only mock/test numbers work for Saudi locally.
- Saudi prices and SAR on the Stripe account are unapproved → purchases off for SA.
- Saudi legal text needs review (`[NEEDS LEGAL REVIEW: KSA]` markers from the earlier branch).
- Native push needs a Firebase project (not available) → prepared, not active.
- iOS builds need macOS → not buildable here.

## Progress (checkpoint)

- ✅ Milestone 1 — inspection, this document, safe local setup: database `naseeb_mobile` on localhost:5434,
  git-ignored `.env.development.local` / `.env.production.local` (no real SMS/email; Neon never touched).
- ✅ Merge of `feature/multi-country` onto the live version (`8d2dea0`), tsc clean, 1171/1171 tests.
- ✅ Milestone 2 — `country_settings` (typed, admin-editable, safe defaults), `GET /api/countries`,
  `GET /api/countries/[code]` (safe fields only), seeds (`prisma/seed-countries.mjs`, `--dev` local only). Commit `fc8da19`.
- ✅ Milestone 3 — sign-up gated by country (inactive / closed / mismatch) in `send-otp` and `register`; SMS routed
  by the country setting with a MOCK provider + `/api/dev/sms-outbox` (refused on real servers); landing hero/SEO
  overrides; Admin → Countries (settings, warnings, member numbers, credential yes/no, safe test SMS); polls per
  country; Saudi purchases off until `PRICES_APPROVED.SA`; hosted checkout + `GET /api/payments/[id]/status` + local
  mock checkout through `fulfilCheckoutSession`; mobile Bearer tokens (`mobile_sessions`, `/api/mobile/*`,
  `requireUser` accepts them, admin routes never). Browser-checked: admin Countries (save, warnings, test SMS via
  mock), `/` and `/sa` titles and hero. Scripted API check of the mobile sign-in (see `docs/local-testing.md`).
- ✅ Tests: 1215 passing (44 new: settings, SMS routing + mock, mobile tokens, bearer `requireUser`, mobile routes,
  admin countries, checkout gate); `tsc` clean; `eslint .` 0 problems.
- ✅ Milestones 4–5 — Flutter app `naseebak_app/` (Flutter 3.41.6): country picker from the API, phone + code sign-in
  and sign-up, token storage and restore, paused-account screen, short setup (lists from the API), home, shared
  suggestions (three tabs, «مهتم» sheet with chat/family + consent, «لا»), matches with the intro panel, chat (polling,
  sent/failed/filtered + edit), notifications, credits (packages, hosted or mock checkout, status polling, history,
  Saudi «غير متاح»), profile, guardian, notification preferences, blocks, pause/delete, logout.
  `flutter analyze` 0 issues · `flutter test` 40 passed · `flutter build apk --debug` OK. Emulator (Pixel 8 Pro API 31)
  walkthrough against :3020 with screenshots in `naseebak_app/docs/screens/`: Jordan sign-in → home → suggestions →
  matches → credits mock buy (10 → 20) → logout → Saudi sign-in (packages unavailable); sign-up + onboarding to home;
  Saudi chat both ways incl. a filtered number; «مهتم» sheet opened and cancelled.
- ✅ Milestone 6 — scripted API run with mobile tokens (Saudi pair): Saudi-only suggestions, «مهتم» 1 credit, repeat
  refused without a second charge, mutual match free, chat opened, message delivered, number blocked, bell entry; no
  cross-country suggestion in the database. Saudi switched off in the admin → hidden from the country API, `/sa`
  → Jordan home, new Saudi sign-up refused, existing Saudi member can still sign in; switched back on → listed at once.
- ✅ Milestone 7 — 1215 backend tests, `tsc`, `eslint .` 0 problems, production webpack build OK and served
  (`next start`): `/`, `/sa`, `/register`, `/login`, `/faq`, `/sa/terms`, `/payments/return`, country APIs — no page errors.

- ✅ Milestone 8 (2026-10-29, after the first report) — app: photos (pick, upload ≤ 5, main photo, delete),
  partner preferences with «شرط أساسي» (same options and rules as the web wizard, saved at once), personality quiz
  (result + 3-month retake rule), live chat through Ably SSE with polling fallback. Backend: local photo storage
  without Bunny (`.dev-uploads/`, `/api/dev/uploads/...`, refused on real servers). Checked: 52 Flutter tests,
  1218 Vitest, tsc, eslint, production build; real API run (photos upload/list/serve/main/delete, preferences +
  dealbreakers, wrong age range refused, quiz save + retake refused, Ably token 404 without a key); emulator: photo
  picked from the gallery and uploaded, preferences + «شرط أساسي» saved (checked in the database), quiz result.

- ✅ Milestone 9 (2026-10-30) — everything a member does on the website can be done in the app: «تعديل ملفي» with
  every profile field (same save/review rules as `/dashboard/profile/edit`, pending request + withdraw), support
  tickets, invitation code at sign-up + «دعوة الأصدقاء», «قوة ملفك» card on home. Backend: country detail returns
  all form lists/options (`SKIN_COLORS` / `HOUSING_TYPES` now shared in `profile-options.ts`). Checked: 61 Flutter
  tests, 1219 Vitest, tsc, eslint, build; API run of a new Saudi member (sign-up with invitation code → setup →
  every field → review request → second request refused → withdraw → support ticket → inviter credited); emulator:
  editor, review request saved + withdrawn (database), referral, support.

### Not done / limits
- iOS build (needs macOS), native push (needs Firebase), English UI.
- Live chat through Ably is built and unit-tested but **not tried against a real Ably account** (no key locally).
- Legacy-flow screens (admin-arranged visits, per-suggestion credits) are not in the app: production runs the new
  cycle. The web install guide (`/dashboard/install`) has no app equivalent (not needed in a native app).
- Arabic typing on the emulator is not possible through adb, so chat text typed in tests was Latin.
- `src/lib/settings.ts` (global switches) still keeps its 30 s cache per module copy — a switch change can take up to
  30 s per route, as before (unchanged behaviour).
