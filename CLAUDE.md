# CLAUDE.md

## Planning & Implementation

**Always use Superpowers skills for planning.** When creating implementation plans, use `superpowers:writing-plans`. When starting a new feature or refactor, use `superpowers:brainstorming` first. Never write ad-hoc plans — always go through the Superpowers skill workflow.

## Project Overview

**Naseebak (نصيبك)** — web-based traditional marriage facilitation platform for Jordan. **Not** a dating app. Two flows behind admin switches: **legacy** (admin-arranged family visits, credits per suggestion, no user contact) and the **new cycle** (weekly free shared suggestions → mutual match → family introduction or a short filtered in-app chat; credits per request or, with `credit_on_interest`, 1 credit per "مهتم"; no admin work). Full spec in `SRS.md`; new-cycle specs in `docs/superpowers/specs/`, QA notes in `docs/qa/`. Production at **https://naseebak.com** — all four new-cycle switches **on** since 2026-10-17. Live site with real users: keep changes additive and switch-gated.

## Commands

```bash
pnpm dev              # Dev server (Turbopack) on localhost:3000
pnpm build            # Production build
pnpm test             # Run all tests (vitest)
pnpm test:watch       # Tests in watch mode
pnpm db:generate      # Regenerate Prisma client after schema changes
pnpm db:push          # Push schema changes to database
pnpm db:studio        # Open Prisma Studio GUI
```

After changing `prisma/schema.prisma`, run `pnpm db:push && pnpm db:generate`. Stale Prisma errors → `rm -rf .next && pnpm dev`.

### Local development notes
- Local DB: Postgres 17 via Homebrew (`brew services start postgresql@17`, database `naseeb`); `node prisma/seed.mjs` seeds users (test phones `0777000001` / `0777000002` / `0796922292` → OTP `111111`). `prisma/seed-blog.sql` is stale (missing `categoryId`).
- Other phones: without working SMS locally `send-otp` returns 502 and deletes the code — use the test phones above (or add yours to `EXTRA_TEST_PHONES`). The local `.env.local` has `EXTRA_TEST_PHONES=0790000777` for a fresh-signup test (code `111111`); the local account «تجربة» uses it.
- Run the dev server on port 3000: `AUTH_URL` is `http://localhost:3000`, so sign-out on another port redirects there. If pnpm isn't 10.24 locally, use `npx pnpm@10.24.0 …`.
- Local switches: all four new-cycle switches are on in the local DB (`credit_on_interest` turned on 2026-10-18 so local screens match production).
- OTP limits are in Postgres now (`rate_limit_buckets`), so repeated scripted logins with one test phone hit "send 3/phone/5min" and land on the login page: reuse a saved browser session, switch to the other test phone, or `delete from rate_limit_buckets;` locally.
- `docs/platform-flow.html` = the flow map of every member/system flow plus the gaps register (G01–G52, each marked fixed / partly fixed on 2026-10-18). Update it when a flow changes; open gaps left: G11 (Stripe dashboard check), G15 (score check on a prod copy), G32 (signed CDN URLs), G34 (support reply thread), G37 (login/chat/contact limits in memory), G38 (SMS to the guardian).
- `pnpm lint` = `eslint .` (flat config; React Compiler rules are warnings). **0 problems** (errors and warnings, cleaned 2026-10-18) — fix new ones properly (derive state in render, `useEffectEvent`, `useSyncExternalStore` for localStorage/device reads); a targeted `eslint-disable-next-line <rule> -- <reason>` only for blob:/data: image previews. Also run `tsc --noEmit` + `npx vitest run`. `pnpm build` has no warnings (Ably is in `serverExternalPackages` in `next.config.ts`).
- Docker: `docker compose up -d --build` → http://localhost:3001 (app + Postgres 17, reads `.env`, seeds once, turns the 3 new-cycle switches on, runs the credit top-up). `docker compose down -v` resets the DB.
- Digits: Western (0-9) everywhere; format dates with `"ar-JO-u-nu-latn"`. Inputs accept Arabic-Indic/Persian digits: phone and OTP fields and their schemas convert with `toLatinDigits()` (`src/lib/digits.ts`).
- Admin enum labels: `src/lib/admin/enum-labels.ts` (English). Suggestion & match cards share `src/components/shared/person-card.tsx`.
- `node scripts/score-distribution.ts` (read-only; `DATABASE_URL=… ` to target another DB): compatibility score buckets for all eligible pairs and how many users would have 0 candidates per minimum score — run it on a prod copy before changing the minimum
- Switches for local testing: `system_settings` keys `intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow` (or Admin → Settings); 30s cache.
- Tests mock the DB with `vi.hoisted()` + `vi.mock("@/lib/db")` (see `src/__tests__/intro/requests.test.ts`); mock `@/lib/settings` for switch-dependent code and `$transaction` as `fn => fn(db)`.
- Parallel sessions sharing this checkout: stage files by path (never `git add -A`; `docs/cycle-v2-prompt.md` is never committed) and don't switch branches; prefer separate `git worktree`s.

## Technology Stack

Next.js 16.1.6 (Turbopack), React 19, Node 22 | Tailwind CSS v4 (oklch) | PostgreSQL + Prisma 7.4 (`@prisma/adapter-pg`) | Ably (chat events) | NextAuth.js 5 (beta.30) | Zod v4 (`zod/v4` import) | shadcn/ui + lucide-react | Stripe Checkout (JOD) | OneSignal push | Vitest | pnpm 10.24

## Architecture

```
src/
├── app/
│   ├── (ar)/              # Arabic RTL user-facing pages (landing, login, register, blog, dashboard)
│   ├── (en)/admin/        # English LTR admin panel (14 pages)
│   └── api/               # All API routes
├── components/{shared,ui}  # DashboardSidebar, AdminSidebar, Navbar, Footer + shadcn/ui
├── components/{intro,chat,suggestions,landing,dashboard,admin}  # new-cycle UI (match intro panel, chat, shared suggestions, landing, next-step card, admin cards)
├── hooks/                  # use-auto-save, use-in-view
├── contexts/               # dashboard-context (shared profile + unread count)
└── lib/                    # auth, db, stripe, onesignal, rate-limit, settings, matching/, validations/, data/jordan-areas,
                            # intro/ (requests, match), chat/ (service, filter), suggestions/ (mutual, feed), admin/, notify, credits
```

## Critical Domain Rules

- **No messaging/chat/communication** between users — except the in-app chat of the new cycle (below): only after a mutual match **and** an accepted chat request, text only, filtered
- **New user cycle is behind switches** (`intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, `credit_on_interest`, default off) — when off, the site behaves exactly as the legacy flow. Live site: every schema change must stay additive
- **Photos hidden** until mutual like
- **Gender-neutral access** — same workflow for all users
- **Identity verification removed for users** (Oct 2026): no `/dashboard/identity` page or `/api/identity/*` routes (`/dashboard/identity` redirects to `/dashboard`). Existing `IdentityDoc` data is kept; `VerifiedBadge` shows "موثّق" only for already-verified users and renders nothing otherwise. Admin Identity Review page stays for pending docs
- **Members are 18+:** `dateOfBirthError()` / `maxDateOfBirth()` in `src/lib/validations/profile.ts` (profile + draft schemas, setup/edit wizards, update requests)
- **Profile text limits** (`validations/profile.ts`, shown on other members' cards): short fields ≤ 100, long texts ≤ 500, lists ≤ 30 items, in the profile and draft schemas; `POST /api/profile/update-request` validates `changes` with `profileUpdateChangesSchema` (built from `profileDraftFields`: unknown keys refused, wizard enums, numeric strings / "" / null accepted, birth date checked whatever its type) and `message` ≤ 1000
- **Guardian contact is validated** with `parentInfoSchema` (Arabic name, Jordanian mobile, stored normalised as `962…`, never the user's own number) in `/api/profile/parent-info` and both wizards
- **Short onboarding:** the setup wizard (and `profileSchema`) requires only birth date, nationality, city, education, marital status (+children if not single), religiosity and partner age range; everything else is optional ("(اختياري)"). **No guardian at setup in the new cycle** (owner decision 2026-10-18, most sign-ups dropped there): the wizard has 4 steps (legacy keeps step 5), and the guardian is asked for only when needed — `GuardianQuickForm` (`src/components/intro/guardian-quick-form.tsx`; the dialogs pass `shareConsent={false}`: it saves only the contact and the action records the consent once it goes through) inside `InterestDialog` (FAMILY), `IntroConfirmDialog` (send/accept family, chat → family) and the mixed-match share prompt (saves, then shares). The server still refuses every family step without one (`GUARDIAN_REQUIRED`). `missingSetupSteps()` (`profile-completeness.ts`) names the required steps left on the suggestions page and the next-step card. The wizard keeps yes/no answers (hijab, beard, driving licence) null until answered — never a default `false`
- **Option labels per gender** (`src/lib/profile-options.ts`): stored values never change (`"ملتزم"`, `"لا أدخن"`, `"مهندس"`); show `selfLabel()` for my own profile (feminine for women) and `describeOption()` / `partnerOptions()` when describing someone else (third person)
- **Suggestion gate:** always use `meetsSuggestionGate(user, newCycle)` (server) / `qualifiesForSuggestions()` (client) from `src/lib/profile-completeness.ts` — new cycle: a finished short setup (`profile.isComplete`) is enough; legacy: ≥50% (`SUGGESTIONS_MIN_COMPLETENESS`). Matches are never gated (not even by the optional quiz)
- **Parent/guardian data** visible to admin only — except name/relationship/phone shown to the other family after an **accepted family introduction**, and only if that user consented (`ParentInfo.shareConsentAt`)
- **Credits, per-request mode (`intro_requests_enabled` on, `credit_on_interest` off):** suggestions are free (3 per rolling 7 days, `WEEKLY_FREE_SUGGESTIONS`); each family/chat request costs the sender 1 credit, never refunded; new users get 3 (`getRegistrationCredits()`). One-time top-up: `node scripts/new-cycle-migrate.mjs` right after turning the switch on
- **Suggestion credits (legacy, switch off):** new users get 2 (`FREE_MATCH_CREDITS` in `src/lib/credits.ts`). Each suggestion received uses 1 credit (`reserveCredits`, atomic) — auto-suggest and admin Generate only create as many as the balance allows; admin hand-picked suggestions are free. At 0 the user gets a PAYMENT notification and a recharge alert (dashboard + suggestions page). Packages (3/5/10 suggestions) in `/dashboard/payments`
- **No credit gate on matches** — mutual match details always fully visible (with `credit_on_interest` the match itself is free too; the credit is spent earlier, on "مهتم")
- **No pricing on landing page** — packages only in dashboard payments
- **Suggestion/match cards** show full expandable profile details and a `VerifiedBadge` (only for already-verified users) from `User.isVerified`

## Branding & Colors

**Brand:** نصيبك (Naseebak). Only standalone "نصيبك" is the brand name. Logo SVG at `public/images/logo.svg` — use via `Image` component in nav/brand areas. In headings use text "نصيبك" with gradient, not the logo image. Login panel: `brightness-0 invert` filter for white logo.

### Color Rules (Strictly Enforced)

Palette: **deep blue `#22476a`** (primary) + **warm gold `#c19250`** (accent), oklch in `globals.css`.

**Never use hardcoded Tailwind color classes** (`blue-`, `violet-`, `purple-`, `rose-`, `pink-`, `sky-`, `cyan-`, `indigo-`, `slate-`, `gray-`, `orange-`). Always use CSS variable tokens:

| Purpose | Token |
|---|---|
| Main UI / decorative | `primary`, `secondary`, `accent` |
| Success states only | `emerald-` / `green-` |
| Pending/warning only | `amber-` |
| Error/destructive | `destructive` |
| Muted/neutral | `muted`, `muted-foreground` |

Gradients: `from-primary to-secondary`, `from-accent to-accent/70`, subtle: `bg-primary/5`, `bg-primary/10`

## Auth System

Dual auth: phone+OTP for users, email+password for admins. Providers in `src/lib/auth.ts`: `"credentials"` (phone+OTP) and `"admin-credentials"` (email+password).

**User flow:** `POST /api/auth/send-otp` → `POST /api/auth/verify-otp` → `signIn("credentials")` or `POST /api/auth/register`. A verified code finishes sign-in/registration only within 30 minutes of being sent (`VERIFIED_OTP_WINDOW_MS`) and sign-in uses it up (deletes verified codes); `verify-otp` allows 5 tries per phone (then the code is deleted) and 30 per IP per 15 min. A failed SMS returns 502 (never "code sent"). Sign-up never reveals whether a number is registered: `send-otp` with `context: "register"` always sends the code and answers the same (no `userExists`; with registration closed every number gets 403); only a verified code does — `POST /api/auth/register` → 409 `PHONE_EXISTS`, and the register page then signs the member in with that code (else `/login?exists=true`). The login context still returns `userExists` (the login page uses it to send new numbers to register). User email = `phone_${phone}@naseeb.local`. Names (`arabicNameField` in `src/lib/validations/auth.ts`): trimmed, inner spaces collapsed, Arabic only, ≥ 2 Arabic letters, ≤ 40 chars (`NAME_MAX_LENGTH`). Sign-up needs one required tick (terms + privacy + 18 or older, `termsAccepted: true`) stored as `User.termsAcceptedAt`. Login honours a same-site `callbackUrl` (`safeCallbackPath()` in `src/lib/safe-redirect.ts`; other hosts, auth pages and API routes → `/dashboard`).

**Admin:** `signIn("admin-credentials", { email, password })` → bcrypt verify → `/admin`. Seed (local only): `admin@naseeb.jo` / `Admin123!`. Production uses a random password kept in `/root/.naseebak-admin-pass` on the server — never run the seed against production.

**Route protection** (`src/lib/auth.config.ts`, run by `src/proxy.ts` — Next 16 name for middleware): `/admin/*` → admin role required. `/dashboard/*` → auth required. `/login`, `/register` → redirect if logged in.

## Database Schema

30 models in `prisma/schema.prisma`. Key points:
- `User.phone` stored as `962XXXXXXXXX`. `normalizePhone()` converts input formats
- `User.email` = `phone_962xx@naseeb.local` for users, real email for admins
- `User.passwordHash` optional — set for admins only (bcrypt)
- `Suggestion` uses `recipientId`/`candidateId` (mapped to `femaleId`/`maleId` DB columns via `@map`)
- `MutualMatch` `femaleId`/`maleId` — assigned dynamically based on actual genders
- `SystemSetting` — key-value store, read via `src/lib/settings.ts` (30s cache)
- `ProfileUpdateRequest` — user profile edits require admin review (steps 1-4) except partner preferences (`pref*`), which `/api/profile/update-request` saves directly (then `refreshOpenSuggestionsInBackground`: rescore, close cards that break a dealbreaker or fall under the minimum, top up), and filling a still-empty field (`splitProfileEdit()` in `src/lib/profile-edit-split.ts` → `PUT /api/profile`). Preferences, fills and step 5 guardian info stay editable while a review is pending; only another change to a stored value is refused (409 `REQUEST_PENDING`, checked before anything is written). «سحب الطلب» = `POST /api/profile/update-request/withdraw` (status `WITHDRAWN`). Every new request emails the admins (`sendAdminAlert`, best effort), like new support tickets
- `Notification` has `@@index([userId, createdAt])` and `@@index([userId, isRead])` (2026-10-19; deploy with `--db-push`)
- `MutualMatch` follow-up: `femaleOutcome`/`maleOutcome` (`MatchOutcome` CONTINUING | NOT_A_MATCH | ENGAGED) + `…OutcomeAt`, `followUpCount`/`followUpSentAt`, `guardianShareRemindedAt` (see "Family introduction follow-up")

## Matching Workflow (legacy — switches off)

```
Suggestion → recipient accepts/rejects (no photos) →
  accepted: other user gets interest → accepts/rejects →
    mutual like: photos + full details revealed → visit request → admin arranges family visit
```

### Simultaneous suggestions (switch `new_suggestions_flow`, needs `intro_requests_enabled`)

Spec: `docs/superpowers/specs/2026-10-16-simultaneous-suggestions-design.md`. `CycleFlags.mutualSuggestions`. One `Suggestion` row with `flow: MUTUAL` is shown to both people; each records `recipientDecision`/`candidateDecision` once via `POST /api/suggestions/[id]/decide` (`decideSuggestion` in `src/lib/suggestions/mutual.ts`); both INTERESTED → `createMutualMatch` (if that fails after the decision + charge are saved, the call still succeeds with `match: true` and no id, and the daily `healMissingMatches` creates it; the second of two simultaneous «مهتم» looks up the match id for its link). **A «لا» closes the row at once** (REJECTED, owner decision 2026-10-18): the other side's card disappears as if it expired (never told it was a «لا», can't pay for it), both slots free and both are topped up; older rows where one side declined are closed (REJECTED) lazily (`expireMutualSuggestions`), by the daily job (`expireMutualSuggestionsAll`) or when the other side tries to decide (404). So REJECTED on a MUTUAL row means "someone said «لا»", not "both answered" — read the two decisions. Rows expire after 7 days (`MUTUAL_SUGGESTION_DAYS`, lazily + daily job; rows created before the change keep their 14 days). **No leak:** no notification on a "لا", and the feed (`src/lib/suggestions/feed.ts`, `GET /api/suggestions/feed?tab=new|waiting`) never returns the other side's decision or the row status — "waiting" shows my INTERESTED rows until expiry whether the other said no or nothing. Two tabs (`MutualSuggestionsView`): اقتراحات جديدة / بانتظار الطرف الآخر; legacy suggestions and interests in flight show in the same tabs and use their old endpoints (which refuse MUTUAL rows). `GET /api/suggestions` returns `mutualView` (flag on, or the user still has an open MUTUAL row after a switch-off). Weekly cap counts either side (replaced by the 5-open cap under `credit_on_interest`); busy candidates are skipped in per-request mode, while with `credit_on_interest` a full candidate gets the card hidden (`hiddenFromCandidate`, see Credit on interest → Suggestions). Dealbreakers: `Profile.dealbreakers` (`DEALBREAKER_KEYS`, `passesDealbreakers`/`mutuallyAcceptable` in `score.ts`; missing value fails), edited in "شروطي الأساسية" and as "شرط أساسي" chips in the setup/edit wizards (shown when `mutualSuggestions` is on; `PUT /api/profile/dealbreakers`, saved directly, never via the review request; summaries in `src/lib/matching/dealbreaker-summary.ts`). Education preferences mean "this level or higher" (the lowest level picked is a minimum: `educationMatches`/`EDUCATION_ORDER` in `score.ts`, used by the dealbreaker, the match % and the reasons; shown as «دبلوم فأعلى»; owner decision 2026-10-18). Yes/no preferences are stored as "نعم"/"لا"/"لا يهم" by the wizards: read them with `prefYesNo()` / `wantsNoChildren()` from `score.ts`. "لماذا هذا الاقتراح": `suggestionReason()` in `src/lib/matching/reasons.ts` (viewer's preferences only).

### Suggestions Page (3 Tabs, legacy — switch off)

1. **اقتراحات جديدة** — new suggestions (user is recipient)
2. **الطلبات المرسلة** — sent interests with status tracking
3. **طلبات الاهتمام** — received interests

**Sent interest status** (derived from DB, no extra schema):

| Status | Condition |
|---|---|
| بانتظار الاطلاع (Amber) | INTEREST notification `isRead: false` |
| تم الاطلاع (Primary blue) | Notification read, no MutualMatch |
| توافق متبادل (Emerald) | MutualMatch exists |

## Dashboard Pagination (RTL)

All list pages use server-side pagination. RTL chevron direction: `ChevronRight` = السابق (previous), `ChevronLeft` = التالي (next). Page sizes: 10 (suggestions, matches, payments, support), 20 (notifications).

```tsx
<Button onClick={() => setPage(page - 1)}><ChevronRight /> السابق</Button>
<Button onClick={() => setPage(page + 1)}>التالي <ChevronLeft /></Button>
```

## Landing Page UI Patterns

- **Title dash on mobile:** Em-dash `—` hidden on mobile, replaced with `<br>`: `<span className="hidden sm:inline">—</span><br className="sm:hidden" />`
- **Blog/FAQ filter bars:** Use `flex flex-wrap justify-center gap-2`, never `overflow-x-auto`
- **Footer:** 4 columns. No newsletter section (intentionally removed)
- **Navbar section links:** Use `Link href="/#features"` for homepage anchors
- **Switch-aware public pages:** `src/app/(ar)/page.tsx` is a server component that reads `getCycleFlags()` and renders `src/components/landing/*` with copy from `content.ts`; FAQ answers come from `src/app/(ar)/faq/faq-data.ts` (`faqsFor()`), used by both the page and its JSON-LD. Never describe a feature that is switched off
- **Live numbers band** (`principles.tsx`, `/api/stats/public`): each number is hidden until it reaches its minimum (`MIN_PUBLIC_USERS = 100`, `MIN_PUBLIC_MATCHES = 20`) — a small count reads as an empty site
- **Landing design (2026-10-18 redesign):** navy night hero (`.landing-night`) with a faint gold khatam tile (`.landing-khatam`), headlines in Reem Kufi (`displayClass` from `page.tsx`), body Cairo, verse Amiri. `LandingBody` (client) holds «أبحث عن زوجة / زوج», shared by the hero and final `StartForm`s and the `DemoDeck` (example cards, never real members; «مهتم» plays the mutual-match reveal, «لا» shows the secrecy line). `StartForm` hands gender + optional phone to `/register` via sessionStorage (`naseeb:register-start`, `src/lib/landing-start.ts`, 30 min, never the URL; register pre-fills them) and fires `landing_start`. `StickyStart` = phone-only bottom bar while no form or the footer is on screen. Sections: hero → how it works (4 steps across on desktop) → «نصيبك ليس تطبيق تعارف» comparison (`content.compare`) + live numbers → FAQ → final CTA. The navbar turns light-on-dark at the top of `/`. No accent-coloured words in headlines
- **Hero example card** mirrors the real suggestion card labels («مهتم» / «لا»)
- **Photos (made with Runway, Oct 2026):** warm editorial style in brand blue/gold, **never people's faces** (owner's rule for a halal marriage site; hands, homes, objects and Amman scenery only). Homepage: `public/images/landing/*.webp` (hero, signup, profile, match, family, privacy band, cta). Public pages: `public/images/pages/*.webp` via `PageHeroPhoto` (`src/components/shared/page-hero-photo.tsx`, faint photo fading into the page behind the hero title): about, blog, post (blog post hero + blog card covers), contact, faq, privacy, terms, auth (login side panel, register background). Always `next/image`, WebP ≤ ~180 KB; dashboard pages stay photo-free on purpose
- **New images:** the Runway key is `RUNWAYML_API_SECRET` in the local `.env.local` only (never committed, not on the server). API: `POST https://api.dev.runwayml.com/v1/text_to_image` (`X-Runway-Version: 2024-11-06`, model `gen4_image`, ~8 credits per 1080p image), then poll `GET /v1/tasks/{id}`; confirm the credit cost with the owner before generating
- **Blog:** posts are plain text (`whitespace-pre-wrap`, no Markdown) managed in Admin → Blog; every category shows as a filter on `/blog` even with no published post. Source of the first post (draft «تعرّف على نصيبك», category `tips`): `docs/blog/ta3arraf-ala-naseebak.txt`

## SMS (Broadnet)

Gateway: `gwjo1s.broadnet.me:8443`. Arabic SMS requires `type=2` (Unicode) with UTF-16BE hex encoding via `toUnicodeHex()`.

Rate limits: send 3/phone/5min, 10/IP/15min; verify 5/phone and 30/IP per 15min — kept in Postgres (`rateLimitDb`, `src/lib/rate-limit-db.ts`, table `rate_limit_buckets`, purged by the daily job; falls back to memory if the DB call fails). The IP is `clientIp()` (`src/lib/rate-limit.ts`): `X-Real-IP` from Nginx, else the last `X-Forwarded-For` hop — never the first. Sign-in (member and admin) counts **failed** attempts only, 5 per 15 min, also in Postgres (`src/lib/auth-authorize.ts`: `rateLimitDbBlocked` check first, `rateLimitDb` after a failure); when blocked `signIn()` returns code `rate_limited:<minutes>` and the login pages say how long to wait (`rateLimitedMinutes`, `src/lib/login-limit.ts`). Other limits (chat, contact) are still in memory. **Test accounts** (`src/lib/test-accounts.ts`): the numbers in the server setting `EXTRA_TEST_PHONES` (comma separated) form a test group — fixed code `111111`, only ever suggested to each other (auto-suggest, admin Generate and hand-picks), never to real users, no SMS notices. Outside production (and in local Docker via `ALLOW_BUILTIN_TEST_PHONES=true`) the built-in numbers (`962796922292`, `962777000001/2` → `111111`) and the seeded demo numbers join the group too; **on production (NODE_ENV=production) only `EXTRA_TEST_PHONES` count** (server `.env`: `962770970971,962796922292` since 2026-10-18).

One-off SMS campaigns to users (owner approves text and recipients first) run as a node script on the server with the app's `.env`; scripts are kept in `/root/one-off/` (2026-10-18: «أبدى اهتمامه بك» to 31 users). `sendSms` is in `src/lib/sms.ts` (OTP + SMS notices).

**SMS notice fallback** (`src/lib/sms-notice.ts`, owner decision 2026-10-18): `notify()` also texts a member when the event is a mutual match («توافق متبادل!»), the «شخص أبدى اهتمامه بك» reveal, the «اقتراح بانتظار قرارك» expiry reminder or the waiting nudge (`sms: "waiting"`) (matched by type + title; callers can pass `sms: "<event>"` / `sms: false`) — only if OneSignal has no push subscription for them (404 / none enabled; unknown = no SMS), the member allows that notification type, is a real active `USER` (not a test number), and got no SMS notice yet that Amman day (`User.lastSmsNoticeAt`). Texts carry no names.

Config via env: `BROADNET_USER`, `BROADNET_PASS`, `BROADNET_SENDER_ID` (`naseebak` since 2026-10-18; was `SRVnaseebak`), `BROADNET_API_URL` (default `https://gwjo1s.broadnet.me:8443/websmpp/websms`). Never hardcode credentials. Provider portal: `http://82.212.81.40:8080/websmpp`

## Stripe Payments

Prices are shown in JOD but charged in **USD** — one package list in `src/lib/payments/packages.ts` (`priceJod`, `priceUsdCents`; the payments page shows the USD amount; owner's choice, Oct 2026). Flow: `POST /api/payments/checkout` → embedded Stripe Checkout Session (metadata `app: "naseebak"`, `paymentId`, `userId`, `credits`; expires after `CHECKOUT_TTL_MS` = 35 min) → the PENDING `Payment` row (with `stripeSessionId`) is written only after Stripe returns the session (a Stripe error → 502, logged as `[payments] Stripe checkout session failed`, no row) → credits are added by `fulfilCheckoutSession()` (`src/lib/payments/fulfil.ts`) only when `payment_status === "paid"`, once (claims the Payment row in the same transaction, also a FAILED/timed-out one), from three places: the webhook (`checkout.session.completed` / `async_payment_succeeded`), the return page (`session-status`, owner only) and the daily job (`reconcileStripePayments`, sessions of the last 3 days). **The Stripe account is shared with other sites:** anything without our metadata is ignored (`isOurSession`). «رجوع» / «إلغاء» (`POST /api/payments/cancel` with `paymentId`) expires the Stripe session and fails the row (credits it instead if it was paid meanwhile); `checkout.session.expired` / `async_payment_failed` fail it too. `charge.refunded` (full) → `applyRefund()` (`src/lib/payments/refund.ts`, also used by the admin refund route: REFUNDED once, package credits taken back floored at 0, ledger REFUND, notice in USD); partial refund → admin email only; `charge.dispute.created` → `Payment.disputedAt` + admin email. Payment and CreditLedger rows survive account deletion (`userId` set null). Webhook events to enable on the naseebak.com endpoint: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`. Lazy-init client in `src/lib/stripe.ts`.

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Image Storage (Bunny.net CDN)

All uploads stored on Bunny.net, served via `https://cdn.naseebak.com`. Key file: `src/lib/bunny.ts`.

```
naseebak/{photos,identity,avatars}/{userId}/...
```

Env vars: `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE` (`naseebak`), `BUNNY_STORAGE_ENDPOINT` (`storage.bunnycdn.com`), `BUNNY_CDN_URL` (`https://cdn.naseebak.com`). `next.config.ts` includes `cdn.naseebak.com` in `images.remotePatterns`.

## Production Deployment

**Server (since 2026-10-17):** VPS `146.103.57.224` (Ubuntu), domain `naseebak.com`, Let's Encrypt, Nginx → `127.0.0.1:3000`, PM2 **fork mode** (`pm2-naseebak` unit, user `naseebak`), local PostgreSQL (db `naseeb`, migrated from Neon). SSH with the deploy key only: `ssh -i ~/.ssh/naseebak_vps_ed25519 -o IdentitiesOnly=yes root@146.103.57.224`. Env in `/var/www/naseebak/.env` (`NEXT_PUBLIC_*` need a rebuild). Cron `/etc/cron.d/naseebak` (`CRON_TZ=Asia/Amman`): daily job 06:00, DB backup 03:30 (`/usr/local/bin/naseebak-db-backup`): kept in `/root/backups` for 14 days, plus a gpg AES-256 copy uploaded to the Bunny storage zone in the folder named in `/root/.naseebak-backup-dir` (14 days; passphrase in `/root/.naseebak-backup-pass`, which must also be kept off the server); log `/var/log/naseebak/backup.log`. Hardening: ufw (SSH + Nginx only), fail2ban on SSH, `server_tokens off`, gzip, security headers (HSTS, nosniff, X-Frame-Options, Referrer/Permissions-Policy), `X-Powered-By` hidden; Postgres localhost-only with scram and tuned memory (shared_buffers 4GB). SSH password login is still on (owner's choice).

**Deploy (from GitLab, near-zero downtime):** push to `main` on GitLab, then run `ssh root@146.103.57.224 naseebak-deploy` (`/usr/local/bin/naseebak-deploy`). It fetches into `/opt/naseebak-repo` using a read-only GitLab deploy key (`/root/.ssh/naseebak_gitlab_deploy`), copies the live app to `/var/www/naseebak-next` (keeps `node_modules`, `.env`, `ecosystem.config.cjs`), syncs the code, writes `REVISION`, then runs `pnpm install --frozen-lockfile && npx prisma generate && pnpm build` as `naseebak`. After that it swaps the copy in (`naseebak` → `naseebak-prev`) and checks `127.0.0.1:3000` answers 200. A failed build leaves the live site untouched; a failed check rolls back on its own. Options: `--db-push` (pg_dump to `/root/backups`, then `prisma db push`, additive changes only), `--ref <branch|commit>`, `--rollback` (swap with `naseebak-prev`; run it again to undo). A lock stops two deploys at once. Log: `/var/log/naseebak/deploy.log`. Only committed and pushed code is deployed. The live version is in `/var/www/naseebak/REVISION`.

**Git remotes:** GitHub `origin` and GitLab `gitlab` (`git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git`), branch `main`; push both.

**App path:** `/var/www/naseebak` | **Logs:** `/var/log/naseebak/` (`out-0.log`, `error-0.log`)

## Matching Algorithm

Weighted scoring in `src/lib/matching/score.ts`: Preference match (50%), Personality similarity (30% — cosine on 5D vectors, redistributed if no quiz), Profile quality (20%). Admin generate (shared suggestions off) creates top-3 per user (score >= 30); with `new_suggestions_flow` on it runs `autoSuggestForUser` for every eligible user active in 30 days (same rules and once-a-day notices as the automatic top-up). **Automatic suggestions** (`src/lib/matching/auto-suggest.ts`): once a user passes `meetsSuggestionGate` with no pending suggestions, top-3 (score ≥ `minSuggestionScore(flags)` = 30, or 60 with `credit_on_interest` where it tops up to 5 open instead; opposite gender, excluding past suggestions/matches/blocks) are created on profile save and whenever `/api/suggestions` page 1 loads (dashboard + suggestions page). Concurrent calls share one run; an empty run retries after 30 min. Only `role: USER` accounts get or are given suggestions: an admin who fills in a profile from the dashboard never sees any (test the cycle with the test accounts instead).

## New User Cycle (switches on)

Spec: `docs/superpowers/specs/2026-10-16-new-cycle-design.md`. After a mutual match (`createMutualMatch` in `src/lib/intro/match.ts` — no admin `VisitRequest` in new mode) the match card shows `MatchIntroPanel` with two requests (rules in `src/lib/intro/requests.ts`, errors as `IntroError` codes):

- **FAMILY** → accepted: both see the other's guardian contact (`GuardianContactCard`). Legacy visits in FAMILIES_CONTACTED/SCHEDULED/COMPLETED hide this option; a REQUESTED legacy visit is closed when a family intro is accepted
- **CHAT** → accepted: `Conversation` for 14 days (+7 once in the last 3 days). Free chat→family move once. Day 7: one "ready for a family introduction?" push to both (`Conversation.familyNudgeAt`); at expiry: one "move to family? it's free until <date>" push (chat expiry + `CHAT_STALE_DAYS`, `familyMoveOpenUntil()` in `matches/state.ts`, same rule as `family.openUntil`) and a button in the read-only chat footer — both only while the family path is open (no pending/accepted family request, chat not ended by a user)
- Requests expire after 7 days (lazily, and the daily scheduler notifies the sender); a declined request is final for that type on that match
- Chat: `src/lib/chat/service.ts` + `src/lib/chat/filter.ts` (blocks phones incl. Arabic digits/words, links, handles, social keywords; also a number hidden among words — 6+ spelled digits or 9+ digits in total anywhere in one message, years 1950–2039 and round amounts ending in 00 not counted — and look-alike letters inside a number (O→0, I/l/i→1, other letters between digits dropped); runs before rate limits: 5/5s, 50/day). Real time via Ably (`src/lib/ably.ts`, env `ABLY_API_KEY`): only the server publishes to `chat:<id>`; browsers get subscribe-only tokens from `/api/chats/ably-token`. Without the key the page polls every 4s. Admins can read full chat history at `/admin/chats/[id]` (`GET /api/admin/chats/[id]/messages`; every view logged as `[admin-chat-view]`); the privacy policy and terms say the team may review chats for safety and moderation
- On phones the chat room is full screen (`max-md:fixed`, sized to `visualViewport` so the keyboard never covers the box) and the dashboard bottom bar is hidden there
- Expiry + "2 days left" warning run lazily (counts poll `/api/me/counts`, chat reads) and again in the daily scheduler (below)
- Admin: Settings → "New user cycle" switches; `/admin/introductions` overview

## Account & Match Safety

- **Deactivation / deletion grace:** deactivated users (incl. the 30-day deletion grace) can still sign in; the dashboard layout shows only `/dashboard/reactivate` (`DeactivatedGate`), and `requireUser()` rejects them with 403 `DEACTIVATED` unless a route opts in with `{ allowDeactivated: true }` (`/api/profile/reactivate`, `/delete`, `/deactivate`). `POST /api/profile/reactivate` clears the flag and cancels a pending deletion. `POST /api/profile/deactivate` takes an explicit `{ action: "pause" | "resume" }` (never a toggle; no body = pause); resume also cancels a pending deletion, and `processAccountDeletions` re-checks each row (not cancelled, due, account still paused) right before deleting. Suspended users stay blocked everywhere
- **Match states** (`src/lib/matches/state.ts`, `MatchClosure` = `blocked` | `inactive` | `finished` | `ended` (someone said «لم يحصل نصيب») | `engaged` (I said «تمت الخطبة»)); a chat that ran out more than `CHAT_STALE_DAYS` (14) ago with no family request counts as finished; a block hides the match from the blocked person (404s) and shows the blocker a closed card with unblock (photos 403, no guardian contact, pending requests CANCELLED, no refund); a deactivated/suspended partner is skipped in the feed, can't be matched, requested or messaged; a match with both paths used up (declined, or a user-ended chat) is "finished". `/api/me/counts` → `actionableMatches` drives the next-step card
- A block ends the open chat for good (ENDED by the blocker, so unblocking never silently reopens it). The blocked person loses the match but keeps the chat **read-only** (`loadForUser(…, { readOnly: true })` for reading, marking read and reporting; sending/extending 404; no Ably token, no read receipts across a block; `ChatSummary.matchHidden` hides the match link) so a harasser who blocks first can't erase what was said or stop a report («إبلاغ» on an ended chat). Numbers sent in pieces are caught across the sender's consecutive number-only messages (`completesSplitNumber`, 10-minute window)
- A user-ended chat closes the family path on that match (expired / admin-ended chats keep the free move). Only an open chat (ACTIVE, not run out, no block either way) can be ended: «إنهاء المحادثة» is hidden otherwise and `endConversation` without a report refuses (NOT_ALLOWED); «إبلاغ» works on any chat and ends/notifies only an open one. Senders can cancel a PENDING request (`POST /api/intro-requests/[id]/cancel`, no refund; the receiver is told it was withdrawn). Match cards offer حظر / إبلاغ وحظر and «إنهاء التوافق» (= NOT_A_MATCH); blocked users list at `/dashboard/blocks`
- **Leaving:** pausing (`/api/profile/deactivate`), a deletion request and the final deletion call `closeActivityForLeaving()` (`src/lib/matches/leave.ts`): open chats end (with `endedByAdminId = "system:left"`, `CHAT_LEFT_MARKER`, not `endedById`, so they don't count as "ended by a user" and the free family move stays open), pending requests are cancelled, partners are told (on final deletion, every open match's partner). No "ends soon" push for a blocked/inactive chat and no extension with an inactive partner
- **Reports** go through `fileReport()` (`src/lib/reports.ts`) from both the match card (`POST /api/reports`, needs a prior suggestion or match: 403 otherwise; details ≤ 1000 chars; an optional `conversationId` is kept only if that chat is between the two) and the chat («إنهاء وإبلاغ»): a repeat report reopens the earlier one and appends the new account; every report emails the admins (`sendAdminAlert`) and recounts the auto-flag (3+ people, PENDING + REVIEWED). **Paused for review:** when a member reaches 3 PENDING reports their open chats are paused (ENDED with `endedByAdminId = "system:report-review"`, `REPORT_PAUSE_MARKER`; both told) and intro requests / guardian sharing on their matches are refused (`assertMatchOpen` → `pausedForReview`), a new match opens no chat or family outcome (`applyIntroOutcome` → NONE, request buttons) and `sendMessage` refuses. Admin review (`refreshReportFlag`) recounts the flag (an auto-flag is cleared when dismissals bring it under 3; a hand-set flag stays) and, once fewer than 3 are pending, resumes paused chats with the paused days added back to `expiresAt` — except a chat whose match closed meanwhile (block, «لم يحصل نصيب» / «تمت الخطبة», a side engaged elsewhere, a partner who left or was suspended): it ends for good (`PAUSED_MATCH_CLOSED_MARKER`). Block, «لم يحصل نصيب», engagement (other matches) and leaving also end paused rows for good (`endPausedChats`) (`endPausedChat` = admin ends a paused chat for good). Withdrawn guardian consent notifies partners on accepted family introductions
- **Account deletion keeps reports:** `processAccountDeletions` first runs `snapshotReportEvidence()` (both people's name/phone + the chat between them, latest 1000 messages, into `Report.evidence`), then deletes; `Report.reporterId`/`reportedId` are nullable with `onDelete: SetNull`. A failed snapshot skips that deletion until the next run. Admin → Reports shows a deleted side by its saved name/phone and the saved chat
- **Profile edits after setup:** `PUT /api/profile` and `PATCH /api/profile/draft` apply `reviewedChanges()` (`src/lib/profile-review.ts`) once `isComplete`: empty fields may be filled, identical values resent, but changing/clearing a stored value → 409 `PROFILE_EDIT_NEEDS_REVIEW` (use the edit page → review request). Legacy only: finishing the setup needs the guardian saved first (`PUT /api/profile` → 400 `GUARDIAN_REQUIRED`); the setup sends `dealbreakers` in the same save so the first suggestions respect them
- **Flagged users** (`isFlagged`: auto at 3+ PENDING/REVIEWED reports from different people, `flagReason` "Auto-flagged…", or set by an admin) get no new automatic/admin-generated suggestions and are not suggested; existing matches untouched (but chats/requests pause while 3+ reports are PENDING, above). Admin "Manage User" still shows them with a Flagged badge
- **Verified badge** is hidden everywhere user-facing when `intro_requests_enabled` is on

## Credit on interest (switch `credit_on_interest`)

Spec: `docs/superpowers/specs/2026-10-16-credit-on-interest-design.md`. `CycleFlags.creditOnInterest` = `mutualSuggestions` && setting (Admin → Settings → New user cycle; needs Shared suggestions on — turning Shared suggestions or intro requests off also sets `credit_on_interest` to false, so it never comes back on by itself). Off = the per-request behaviour above, unchanged; matches/chats opened under the flag keep working after a switch-off.

- **Cost:** only "مهتم" costs 1 credit (ledger reason `INTEREST`), "لا" is free. **Refund only when the other side never answered:** when the suggestion closes (7 days, or early: block, dealbreaker sweep, profile refresh, engagement) with one side INTERESTED and the other undecided, `refundUnansweredInterests` (`mutual.ts`; lazy expiry + daily job) gives the credit back once (`Suggestion.interestRefundedAt`, ledger `REFUND`, PAYMENT notice with neutral wording «أُغلق اقتراح أبديت اهتمامك به قبل أن يكتمل التوافق…», never the reason), only for a real `INTEREST` charge and only for rows closed in the last 7 days. A "لا" closes the row as REJECTED at once and is never refunded — the owner accepted that "no refund" lets people infer a "لا". Claim + `reserveCredits` + `recordCredit` run in one transaction in `decideSuggestion` (`mutual.ts`): a lost claim (double tap, expired, blocked) charges nothing. Legacy rows: `/api/suggestions/[id]/like` and `/api/interests/[id]/accept` are the "مهتم" and charge the same. Balance reaching 0 → one PAYMENT notice "انتهى رصيدك — اشحن لتتابع" (`notifyInterestCreditsExhausted`). The match, intro requests, chat and chat → family are free while the flag is on (`requests.ts` reads the current flag when charging, so this also covers pre-flag matches; after a switch-off requests cost 1 credit again)
- **Blocking closes the open shared suggestions between the two** (`closeSuggestionsBetween`, EXPIRED now, refund rule applies), and a partner who deactivated or was suspended doesn't fill one of the 5 open slots (`openMutualWhere`, `openCounts`). The per-user refund check has no time limit; the daily job looks back 7 days. A match lost at the last moment (partner left) refunds both «مهتم» (same PAYMENT notice)
- **Terms page** (`src/app/(ar)/terms/terms-view.tsx`) follows the switches (`buildSections(creditOnInterest)`), like the FAQ
- **Older-style cards close when credit on interest goes live** (owner decision): switching it on runs `closeLegacyInFlight()` (LEGACY PENDING suggestions → EXPIRED); while the flag is on the feed hides legacy items and `/api/interests/[id]/accept` refuses (404), so nothing older is ever charged
- **Refresh after a profile change** (`refreshOpenSuggestions` in `src/lib/suggestions/refresh.ts`, fire-and-forget): an admin-approved profile edit, `PUT /api/profile`, saved partner preferences (`update-request`) and the personality quiz recalculate the match % on the person's shared suggestions they haven't answered, close the ones that no longer fit (either side's dealbreakers, or under the minimum score; admin hand-picks only for dealbreakers), also when the other side already said «مهتم» (their credit is refunded, same rule as the dealbreaker sweep), then top up. Answered rows are untouched; with shared suggestions off it is only the usual top-up
- **Admin hand-picks** respect the 5-open cap for both people while credit on interest is on (409), but not the minimum score (an admin may pick a lower-scoring pair on purpose)
- **Secrecy wording** everywhere: "لا نُطلع أحداً على قرار «لا»" (header, landing, guide, FAQ, toasts, next-step card), and the header says a «مهتم» may show at 0 credits — never "nobody learns your decision". No suggestion reminder is sent on a row the other side already declined
- **Split-number chat filter** only joins the sender's own consecutive number-only messages; two people alternating can still pass a number — accepted by the owner (stricter would block normal messages)
- **0 credits:** cards stay fully visible and «لا» stays free; only «مهتم» is refused (`NO_CREDITS`, disabled in the UI with a recharge link). The "new" tab marks `likedYou` on cards where the other side already said "مهتم" (owner's recharge incentive; a "لا" looks like no decision)
- **Introduction choice:** "مهتم" opens `InterestDialog`, which stays open (busy) until the server answers and shows fixable errors (`GUARDIAN_REQUIRED`, `CONSENT_REQUIRED`, `NO_CREDITS`, network) inside it; consent is stored in the same transaction as the charge, only when the «مهتم» goes through (the dialog's quick form saves the guardian without consent, `shareConsent={false}`) (CHAT hidden if chat is off; FAMILY needs the guardian consent checkbox, guardian missing → `GUARDIAN_REQUIRED`); stored as `Suggestion.recipientIntroPreference` / `candidateIntroPreference` (`IntroPreference` CHAT|FAMILY, validated before charging; errors `PREFERENCE_REQUIRED`, `CONSENT_REQUIRED`)
- **Mutual match** (`createMutualMatch` → `openMatch`, sets `MutualMatch.openedAt`): `applyIntroOutcome` (`src/lib/intro/outcome.ts`) opens it straight into the choice — CHAT+CHAT → `Conversation` (14 days), FAMILY+FAMILY or mixed → family introduction accepted; both as an auto-accepted `IntroRequest` row (`respondedAt === expiresAt`, see `isOutcomeRow`) so `getMatchIntroState` stays the one source. Any null preference (legacy rows) or CHAT+CHAT with chat off → the (free) request buttons. After a FAMILY outcome either side may still send a free chat request
- **Guardian contact per match** (`openedAt` set): shown only for a side with `femaleGuardianShareAt` / `maleGuardianShareAt` AND `ParentInfo.shareConsentAt`. FAMILY choosers are stamped at match creation; the CHAT side of a mixed match is asked and stamped via `POST /api/matches/[id]/guardian-share` (`shareGuardianForMatch`: needs an ACCEPTED FAMILY intro row on the match and the partner's `shareConsentAt`, else 409 with the same wording as accepting a family request); accepting a later family request stamps both. A mixed match shows neither guardian until both sides have shared; a closed match (blocked, inactive, «لم يحصل نصيب», «تمت الخطبة», finished) never returns contacts. Consent (`shareConsentAt`) is stored only when the send / accept / share it was given for completes. Pre-flag matches keep the global-consent rule
- **Suggestions:** no weekly cap — at most `MAX_OPEN_SUGGESTIONS` = 5 undecided per person (MUTUAL row counts for both), topped up on page open / save, after a decision and on expiry (lazy + scheduler). Slots are counted with `slotMutualWhere` (`mutual.ts`; the feed still uses `openMutualWhere`): a card older than `SLOT_IDLE_DAYS` (2) whose other person hasn't been seen for 2 days stops filling my slot but stays visible, and a card still hidden from the candidate fills neither side's slot (2026-10-19). **A full candidate is never skipped** (owner decision 2026-10-18), but candidates with a free slot are ranked first (score order within each group; 2026-10-19, production had 300 of 698 open cards hidden): the card is created with `Suggestion.hiddenFromCandidate` (hidden from them, no slot, no notice, no reminder, decide → 404) until the recipient says «مهتم» (shown at once above their 5, full 7-day window, reminder reset, notice «شخص أبدى اهتمامه بك») or they have room again (`revealHiddenFor`, best score first, before anyone new is added; revealed cards count in the "new suggestions" notice); a «لا» closes it unseen and a card the recipient refused is never revealed. Pairs: one row per direction (`@@unique`); a pair whose card closed EXPIRED with neither side answering may be suggested again after `RESUGGEST_AFTER_DAYS` (30), in the free direction (`pairAvailability`/`isResuggestable` in `auto-suggest.ts`); min score `minSuggestionScore(flags)` (60 since 2026-10-19, owner decision on production data; 30 off); order `compatibilityScore desc, createdAt desc` (`suggestionOrder`, feed + `GET /api/suggestions`), and in the feed's "new" tab cards the other side already said «مهتم» to come first, silently (no tag; owner decision 2026-10-19)
- **Waiting nudge** (owner decision 2026-10-18, production showed most «مهتم» cards stalled on an absent other side): a «مهتم» on a card the other person hasn't answered (and can see) sends them «اقتراح بانتظار قرارك» (neutral body, never says someone is interested; `notifyWaitingDecision` in `mutual.ts`), at most once per Amman day (any notice with that title today counts, the expiry reminder too; `startOfAmmanDay` in `src/lib/amman-day.ts`), with the SMS fallback event `waiting`. Never for a «لا»; not on a card just revealed from hidden (that got «شخص أبدى اهتمامه بك»)
- **Candidates must be recently seen:** with shared suggestions on, people are suggested to others only if `lastActiveAt` is within `CANDIDATE_ACTIVE_DAYS` (7, `recentlySeenWhere()` in `src/lib/activity.ts`, no `updatedAt` fallback) — so a «مهتم» lands on someone who will answer; legacy mode keeps the 30-day `activeWhere()`
- **Notifications** (one per person per event, none for a «لا»; a «مهتم» only triggers the neutral waiting nudge above): CHAT+CHAT "توافق متبادل! المحادثة مفتوحة الآن" (url = chat); FAMILY+FAMILY "توافق متبادل! تم مشاركة بيانات التواصل العائلي" (url = match); mixed: the CHAT side is told the other preferred family and is asked to share, the FAMILY side is told it waits for the other's guardian contact (and is notified when `shareGuardianForMatch` stamps it; the card shows an amber waiting banner); null preference = the request-buttons text. Copy is flag-aware everywhere (payments, cards, match page, onboarding, landing, FAQ) — never say requests cost credit when the flag is on

## Family introduction follow-up

`src/lib/intro/followup.ts`, `POST /api/matches/[id]/outcome`. On the match card once both guardian contacts are out («كيف يسير التعارف العائلي؟»): ما زلنا نتعارف (CONTINUING) / تمت الخطبة (ENGAGED, confirm) / لم يحصل نصيب (NOT_A_MATCH, confirm). NOT_A_MATCH from either side closes the match for both (open chat ended, pending requests cancelled, partner told gently, photos locked 403) and resets the partner's ENGAGED on that match. ENGAGED is accepted only once the families were introduced (`familiesIntroduced`: accepted FAMILY intro with both guardian stamps on an `openedAt` match, or a legacy visit — the same condition as the question; else 409). ENGAGED closes all my PENDING shared suggestions, also ones I said «مهتم» to (EXPIRED, unanswered «مهتم» refunded), closes my other open matches (chats ended, requests cancelled, partners told) and pauses new suggestions (`isEngaged` / `NOT_ENGAGED` in auto-suggest), asks the partner to confirm; undo = CONTINUING (ended chats stay ended). The daily job asks 7 days after the family introduction (or a legacy visit in FAMILIES_CONTACTED/SCHEDULED/COMPLETED), then every 14 days while someone hasn't answered or is CONTINUING, at most 3 times, oldest first (`runFamilyFollowUps`); a mixed match's CHAT side is reminded once after 2 days to share (`remindGuardianShare`). Admin matches shows each side's outcome, follow-ups sent, automatic outcome rows and guardian sharing.

## Last Activity & Daily Scheduler

- **Activity:** `User.lastActiveAt` (null for users from before it) is touched at most once per hour by `/api/me/counts`, `/api/suggestions` and sign-in (`touchLastActive()` in `src/lib/activity.ts`). "Active" = `COALESCE(lastActiveAt, updatedAt)` within 30 days (`isActive()` / `activeWhere()`). Idle users are never suggested to others and get no new suggestions until they come back (lazily). Any write to a `User` row bumps `updatedAt`, so scheduler writes on idle users must preserve "last seen" (see `runReengagement`)
- **Empty suggestions:** page 1 of `GET /api/suggestions` returns `emptyReason` (`weekly_cap` | `no_candidates` | `pending` | null) + `nextSuggestionsAt` (oldest suggestion of the rolling 7 days + 7 days; with `credit_on_interest` there is no weekly cap: `pending` = 5 open, else `no_candidates`, and `nextSuggestionsAt` is null) from `autoSuggestWithReason()`; `MutualSuggestionsView` shows "اقتراحاتك القادمة يوم …" or a "no one fits" state linking to شروطي الأساسية / preferences
- **Scheduler:** `GET|POST /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` (401 otherwise; `isCronAuthorized` in `src/lib/cron/auth.ts`) runs `runDailyJobs()` (`src/lib/cron/daily.ts`). Tasks in `src/lib/cron/*`, each isolated and idempotent (claim a marker with a conditional `updateMany` before notifying): intro requests expire + sender notice once (`IntroRequest.expiryNotifiedAt`, only for requests expired in the last 3 days, no refund) and a receiver reminder at ≤2 days (`IntroRequest.reminderSentAt`); MUTUAL suggestions expire (+ unanswered-«مهتم» refunds; rows one side declined → REJECTED) + one reminder to the undecided side(s) at ≤2 days (`Suggestion.reminderSentAt`; one per person per run and per Amman day, `oncePerDay: "waiting-decision"`, skipped when they already got «اقتراح بانتظار قرارك» or «شخص أبدى اهتمامه بك» that day); all due chats go through the same housekeeping as the lazy path (`chatHousekeepingAll`); weekly suggestions via `autoSuggestForUser` for active, eligible users under the cap (per-request mode only, 150 per run; with `credit_on_interest` it tops up to 5 open for users with fewer); re-engagement push for users idle 7–30 days with something waiting (`User.reengagedAt`, once per 7 days); guardian-share reminders and family follow-ups (`src/lib/intro/followup.ts`); `healMissingMatches` (both said «مهتم» but the match wasn't created; oldest first, left/suspended people filtered in the query, pages past matched/blocked pairs); `cancelClosedLegacyVisits` (REQUESTED visits whose match closed, and with `intro_requests_enabled` any REQUESTED visit untouched for 30 days, `LEGACY_VISIT_STALE_DAYS`); account deletions (`processAccountDeletions`); Stripe reconcile; rate-limit clean-up. A failed task emails the admins (`alertFailedTasks` → `sendAdminAlert`). The summary is stored in `SystemSetting` `cron_daily_last_run` and shown in Admin → Settings → Daily jobs ("Run now" = `POST /api/admin/cron/run`)
- **Local:** the `scheduler` service in `docker-compose.yml` calls it 60s after start and then every `CRON_INTERVAL_SECONDS` (3600 in compose, default 86400; secret `local-cron-secret`)
- **Production:** set up — `/etc/cron.d/naseebak` runs `/usr/local/bin/naseebak-daily-job` at 06:00 Amman time (reads `CRON_SECRET` from the app's `.env`, appends to `/var/log/naseebak/cron.log`)

## Notifications

Push (OneSignal): `OneSignalProvider` logs the device in as the user (`external_id`) and calls `markOneSignalReady()`; ask permission with `requestPushPermission()` and sign users out with `signOutAndUnlinkPush()` (`src/lib/push-client.ts`) — never the bare browser prompt or `signOut()`, or the device isn't registered / a shared phone keeps the previous person's pushes. Always use `notify()` / `notifyMany()` from `src/lib/notify.ts`: stores the in-app row with `metadata.url` and sends push only when the user's preference allows (SYSTEM always; `preference:` overrides the type's key). Chat status notices (expiry, 2 days left, day-7 nudge, extended, ended, paused) are CHAT rows but pass `preference: CHAT_NOTICE_PREFERENCE` (`introRequests`, `src/lib/notification-prefs.ts`), so turning off «رسائل المحادثات» only mutes message pushes. Links resolve via `notificationUrl()` in `src/lib/notification-links.ts`. Chat messages are push-only (no in-app row), collapsed per conversation and throttled to 1 per 3 minutes; the push reads «رسالة جديدة من <name>», never the message text (lock screens). `sendPushNotification` turns same-site paths into full `https://naseebak.com/...` URLs (OneSignal needs one for a tap to open the page). Only devices that allowed notifications are reachable (check with OneSignal's `GET /apps/{app}/users/by/external_id/{userId}`); test accounts are excluded from announcements.

## Notification Routing

| Type | Route |
|---|---|
| SUGGESTION, INTEREST | `/dashboard/suggestions` |
| MATCH, VISIT_UPDATE, INTRO_REQUEST | `/dashboard/matches` (or `metadata.url`, e.g. `?match=<id>`) |
| CHAT | `/dashboard/chats` (or the chat) |
| PAYMENT | `/dashboard/payments` |
| IDENTITY | `/dashboard` (page removed) |
| SUPPORT | `/dashboard/support` |
| SYSTEM | `/dashboard` |

## Dashboard Data Context

`DashboardDataProvider` in dashboard layout deduplicates API calls. Provides `profile`, `completeness`, `unreadCount`, `profileFailed` (the last `/api/profile` load failed; an earlier profile is kept, and with none the home page shows `LoadError` + retry instead of "finish your setup") and `counts` (`/api/me/counts`: switch flags, pending intro requests, unread chats, guardian consent). Polls every 30s, only while the tab is visible (`document.visibilityState`; a background tab would keep the member "recently seen" via `/api/me/counts`), and refreshes once when the tab is shown again. Listens for `naseeb:notifications-read` custom DOM event for instant badge updates.

Dashboard home shows one `NextStepCard` (`src/components/dashboard/next-step-card.tsx`) plus one helper card at a time (guardian consent, else `InstallAppCard`, which only opens the guided setup). `OnboardingGuide` follows the switches, never covers `/dashboard/profile/setup`, and fires `naseeb:onboarding-done`. **Notifications setup (2026-10-19):** most members come from Instagram ads and browse inside Instagram's browser (no install, no push), so everything goes through one guided flow, `PushSetupFlow` (`src/components/shared/push-setup.tsx`): `pushStage()` (`install-env.ts`) picks the one next step — `browser` (one-tap «افتح في Safari/Chrome» via `openInBrowserUrl()`: `x-safari-https://…` on iPhone, a Chrome `intent://` on Android, landing on `/dashboard/install`, plus the manual ⋯ menu drawing and copy link), `install` (iPhone share → «إضافة إلى الشاشة الرئيسية» drawings), `allow` (big button + drawing of the system prompt), `blocked`, `done` — with a progress row. Android fallbacks: an Android browser without push gets `browser` (open Chrome); if the page is still visible 2.5s after «افتح في…» (or Chrome's intent fell back with `?nochrome=1`), it offers «افتح في متصفح آخر» (`openInAnyBrowserUrl`, default browser / chooser) and opens the manual steps; «تفعيل» with no pop-up (Chrome's quiet bell) shows the address-bar bell drawing + «حاول مرة أخرى»; blocked in Android Chrome shows the site-settings drawing. `OneSignalProvider` opts a device in when the browser already allows notifications but OneSignal isn't subscribed, and again on OneSignal's `permissionChange` to granted; a «تفعيل» answered by the browser prompt before the SDK was ready waits up to 10 s (`READY_WAIT_MS`) for `markOneSignalReady()` and then opts in (`push-client.ts`). Drawings, never screenshots. `NotificationBar` (`src/components/shared/notification-bar.tsx`) hosts `PushSetupSheet` (bottom sheet): a bar on every dashboard page except home (home has `InstallAppCard`), chat rooms, setup and the guide, whose button opens the sheet; on phones the sheet also opens by itself on home at most once a day after the onboarding guide; `openPushSetup()` opens it from anywhere. «لاحقاً» on the bar = this browser session. Measure adoption with OneSignal's `messageable_players` (42 on 2026-10-19). iPhone web push only works when installed to the Home Screen — `InstallAppCard` and `/dashboard/install` (device-aware steps incl. Instagram/Facebook browsers, Samsung Internet, unblocking; `src/lib/install-env.ts`, `src/components/shared/install-guide.tsx`) handle it.

**Mobile:** a bottom tab bar (home, suggestions, matches, chats, «المزيد» = the full menu sheet) in `DashboardSidebar`; main has bottom padding for it; the top bar shows the credit balance with credit on interest. Small text fields (`text-sm`/`text-xs`) are bumped to 16px on phones in `globals.css` so iPhone never zooms on focus — keep chat/inputs ≥ 16px.

**Dashboard look (2026-10-18, matches the landing):** page titles always via `PageHeader` (`src/components/shared/page-header.tsx`: gold-ringed icon, `font-display` title = Reem Kufi loaded as `--font-display` in the dashboard layout, optional count pill, actions as children) — never hand-built gradient boxes or gradient text. Home = one navy `.landing-night` + `.landing-khatam` header with the greeting, `NextStepCard variant="hero"` (gold action) and the three counts; profile strength is a ring + the top tip, details folded in `<details>`. `PersonCard`: gold conic `ScoreRing`, names in `font-display`. Sidebar active marker is gold.

**Dashboard UI rules** (UI/UX audit 2026-10-18): buttons grow to 44px on touch (`pointer-coarse:min-h-11` in `ui/button.tsx`) — keep tap targets ≥ 44px; dialog/sheet close ✕ sits at `end-2` (left in Arabic) and dialogs scroll on short screens; a failed load shows `LoadError` (`src/components/shared/load-error.tsx`, message + «إعادة المحاولة») — never a fake empty state, and never let a form save after its data failed to load; dashboard pages wait for the first `/api/me/counts` switch flags before rendering (no legacy-flow flash); gendered copy via `forViewer()` / `forPartner()` / `blockConfirmText()` (`src/lib/gendered-copy.ts`); onboarding storage through `src/lib/onboarding.ts` (try/catch, Safari private mode); use the shadcn `DropdownMenu`/`Dialog`, never `window.confirm` or hand-made overlays; member photos use `next/image` with `unoptimized` (private photos aren't cached by the image optimizer); «إعدادات الحساب» in the menu jumps to pause/delete (pause amber, delete red); «إنهاء التوافق» is the one term for ending a match.

UI gotchas: profile setup drafts in localStorage are keyed to their owner (`useAutoSave` — never restore another user's draft); photos go through `compressImage()` (`src/lib/image-compress.ts`) before `/api/profile/photos` (5MB limit; `PATCH /api/profile/photos/[id]` sets the main photo); call `maybeAwardReferral()` (`src/lib/referral.ts`) after any save that raises completeness (new cycle: paid once the short setup is finished, no guardian needed — owner decision 2026-10-18; legacy: 100%; the referrer's +2 stops after `MAX_REWARDED_REFERRALS` = 10, the friend's +1 always); login → register hands phone + OTP via `sessionStorage` (never in the URL); use `arabicCount()` for counted nouns and gender-aware copy (partner gender = opposite of the viewer's). **Client components ("use client") must never import a runtime value from a module that imports `@/lib/db`** (feed.ts, settings.ts, credits.ts, intro/*, matching/*) — it breaks `next build` (pg pulls `fs`) even though tsc/vitest pass; put shared types/pure helpers in a db-free module (e.g. `src/lib/suggestions/feed-types.ts`) and use `import type`. Run `pnpm build` (or the Docker build) before calling UI work done.

## Profile Completeness Weights

| Section | Weight |
|---------|--------|
| Basic info (10 fields) | 35% |
| Preferences (7 fields) | 25% |
| Personality quiz | 15% |
| Photos (≥1) | 15% |
| Family & Guardian | 10% |

## Admin Panel

Pages at `/admin` (incl. new-cycle Matches, Chats, Introductions), mobile-friendly (layout `main` has `min-w-0` so tables scroll inside their card; secondary table columns use `hidden md:table-cell`). Users list shows photo thumbnails + a Photos quick-view dialog. All use `"use client"`, `useState`+`useEffect`, admin auth check. Sidebar in `src/components/shared/admin-sidebar.tsx`. Profile request approval applies all field types (strings, ints, bools, arrays, dates).

**New-cycle admin views** (spec `docs/superpowers/specs/2026-10-16-admin-new-cycle-design.md`): with `intro_requests_enabled` on, the dashboard (`/api/admin/stats` → `cycle`) shows intro requests by type/status, active chats, credits spent on requests this week and a registered → introduction-accepted funnel; the sidebar groups Identity Review / Visit Requests / Profile Requests under a collapsed "Legacy" section (layout passes `legacyGrouped`). User page loads `GET /api/admin/users/[id]/cycle` (intro requests, chats with message counts and a «View» link to the full history, credit history). Account status PENDING is labelled «Unverified» (an active account without an approved ID; only an approved ID makes it VERIFIED). Reports show "From chat" via `Report.conversationId` (set by `endConversation`). Lazily-expired rows: use `effectiveRequestStatus` / `effectiveConversationStatus` from `src/lib/admin/cycle-stats.ts`.

**Moderation** (`src/lib/admin/moderation.ts`): `setSuspended()` stores `User.statusBeforeSuspension` and restores it on unsuspend (never blanket VERIFIED), ends the user's active chats and notifies; suspended users get no suggestions, can't send/accept requests or messages, and `requireUser()` rejects their sessions (403). `adminEndConversation()` sets `Conversation.endedByAdminId` (status only, never content) — used by the user page, `/admin/chats` and report review (which also records `Report.reviewedById`). Admin pages: `/admin/matches`, `/admin/chats` (list + `/admin/chats/[id]` full history), introductions filter by name/phone. Hand-picked suggestions are checked server-side (`checkSuggestionPair`: also refuses with 409 a pair that breaks either side's dealbreakers (`mutuallyAcceptable`), an engaged (`isEngaged`) or a flagged person). Removing a shared (MUTUAL) suggestion closes it instead of deleting it (PENDING → EXPIRED now, `refundUnansweredInterests` for both; an already-closed one → 409); legacy rows are still deleted. Credit top-up can run from Settings (`src/lib/admin/credit-migration.ts`, same marker as the script). Credits are edited as a +/- delta with a required reason. Admin list routes validate query params (`safePagination`/`enumParam` in `src/lib/admin/query.ts`).

**Credit history:** every change to `matchCredits` must call `recordCredit()` (`src/lib/credits.ts`) → `CreditLedger` row with a `CreditReason` (REGISTRATION, PURCHASE, REQUEST, INTEREST, SUGGESTION, ADMIN_ADJUST, MIGRATION_GIFT, REFUND, REFERRAL). Best-effort outside a transaction client, so a history write never blocks a purchase or request. History starts with this release (no backfill).

## Contact Page

`/contact` posts to `POST /api/contact` (`contactSchema` in `src/lib/validations/contact.ts`: a Jordanian mobile or an email, at least one; honeypot `website`, 5/hour per IP, 3/hour per email / phone) → `ContactMessage` row (`phone` stored normalised) (additive table `contact_messages`) + best-effort admin email (`sendContactNotification`). Read and mark handled in Admin → Contact Messages (`/admin/messages`). Footer social icons show only for the `NEXT_PUBLIC_SOCIAL_*` env vars that are set.

## Registration Toggle

`SystemSetting` key `registration_open`. Default: open (fail-open on error). When closed: banner on landing pages, register page shows alert, `send-otp` blocks new phones, `register` returns 403.

## Maintenance Mode

Admin → Settings → Maintenance Mode (`SystemSetting` keys `maintenance_mode`, `maintenance_message`; API `/api/admin/settings/maintenance`). When on, `src/app/(ar)/layout.tsx` renders `MaintenanceScreen` for everyone except admins (admins see the site + an amber banner); `send-otp` and `register` return 503. Admin panel, APIs and the Stripe webhook keep working. The layout calls `connection()` so all `(ar)` pages render per request. Takes effect within 30s (settings cache).

## Analytics & Logs

Google Analytics 4 (`G-39EEZNJBYD`, override with `NEXT_PUBLIC_GA_ID`), GTM and the Meta Pixel load through `PublicTracking` (`src/components/shared/public-tracking.tsx`) on public pages only — never under `/dashboard`, chats or `/admin` (`isPrivatePath()`; after a client-side move into the dashboard GA is switched off with `ga-disable-<id>`), so dashboard events (begin_checkout, payment_success …) are not sent. Fire custom events with `trackEvent()` from `src/lib/analytics.ts` (sign_up, login, otp_requested, profile_completed, personality_quiz_completed, photo_uploaded, verification_submitted, suggestion_response, interest_response, begin_checkout, payment_success). Never send personal data in event params.

Production logs: `/var/log/naseebak/out-0.log` and `error-0.log` (PM2). `src/instrumentation.ts` turns Error objects into text so Prisma errors are readable there.

## Known Limitations

- Email is admin-only: `src/lib/email.ts` (Hostinger SMTP, env `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`) sends a new-registration notice to `ADMIN_NOTIFY_EMAIL`. No emails to users
- OneSignal requires domain config in dashboard (Site URL: `https://naseebak.com`)

<!-- gitnexus:start -->
# GitNexus MCP

Indexed as **naseeb** (1009 symbols, 2031 relationships, 49 execution flows).

1. Read `gitnexus://repo/{name}/context` — overview + freshness check
2. Match task to skill → read skill file
3. Follow workflow

| Task | Skill |
|------|-------|
| Architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools / schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
<!-- gitnexus:end -->
