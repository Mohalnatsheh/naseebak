# CLAUDE.md

## Planning & Implementation

**Always use Superpowers skills for planning.** When creating implementation plans, use `superpowers:writing-plans`. When starting a new feature or refactor, use `superpowers:brainstorming` first. Never write ad-hoc plans — always go through the Superpowers skill workflow.

## Project Overview

**Naseebak (نصيبك)** — web-based traditional marriage facilitation platform for Jordan. **Not** a dating app — zero direct communication between users. AI-powered matching, admin-mediated family visit coordination, freemium suggestion model. Full spec in `SRS.md`. Production at **https://naseebak.com**.

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
├── hooks/                  # use-auto-save, use-in-view
├── contexts/               # dashboard-context (shared profile + unread count)
└── lib/                    # auth, db, stripe, onesignal, rate-limit, settings, matching/score, validations/, data/jordan-areas
```

## Critical Domain Rules

- **No messaging/chat/communication** between users — except the in-app chat of the new cycle (below): only after a mutual match **and** an accepted chat request, text only, filtered
- **New user cycle is behind switches** (`intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, default off) — when off, the site behaves exactly as the legacy flow. Live site: every schema change must stay additive
- **Photos hidden** until mutual like
- **Gender-neutral access** — same workflow for all users
- **Identity verification removed for users** (Oct 2026): no `/dashboard/identity` page or `/api/identity/*` routes (`/dashboard/identity` redirects to `/dashboard`). Existing `IdentityDoc` data is kept; `VerifiedBadge` shows "موثّق" only for already-verified users and renders nothing otherwise. Admin Identity Review page stays for pending docs
- **Short onboarding:** the setup wizard (and `profileSchema`) requires only birth date, nationality, city, education, marital status (+children if not single), religiosity, partner age range and the guardian step; everything else is optional ("(اختياري)")
- **Option labels per gender** (`src/lib/profile-options.ts`): stored values never change (`"ملتزم"`, `"لا أدخن"`, `"مهندس"`); show `selfLabel()` for my own profile (feminine for women) and `describeOption()` / `partnerOptions()` when describing someone else (third person)
- **50% profile completeness required** for suggestions (`SUGGESTIONS_MIN_COMPLETENESS` in `src/lib/profile-completeness.ts`, enforced with alert banners)
- **Parent/guardian data** visible to admin only — except name/relationship/phone shown to the other family after an **accepted family introduction**, and only if that user consented (`ParentInfo.shareConsentAt`)
- **Credits, per-request mode (switch on):** suggestions are free (3 per rolling 7 days, `WEEKLY_FREE_SUGGESTIONS`); each family/chat request costs the sender 1 credit, never refunded; new users get 3 (`getRegistrationCredits()`). One-time top-up: `node scripts/new-cycle-migrate.mjs` right after turning the switch on
- **Suggestion credits (legacy, switch off):** new users get 2 (`FREE_MATCH_CREDITS` in `src/lib/credits.ts`). Each suggestion received uses 1 credit (`reserveCredits`, atomic) — auto-suggest and admin Generate only create as many as the balance allows; admin hand-picked suggestions are free. At 0 the user gets a PAYMENT notification and a recharge alert (dashboard + suggestions page). Packages (3/5/10 suggestions) in `/dashboard/payments`
- **No credit gate on matches** — mutual match details always fully visible
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

**User flow:** `POST /api/auth/send-otp` → `POST /api/auth/verify-otp` → `signIn("credentials")` or `POST /api/auth/register`. Registration checks `userExists` first — if true, redirects to `/login?exists=true`. User email = `phone_${phone}@naseeb.local`. Names must be Arabic-only (`/^[\u0600-\u06FF\s]+$/`).

**Admin:** `signIn("admin-credentials", { email, password })` → bcrypt verify → `/admin`. Seed: `admin@naseeb.jo` / `Admin123!`

**Route protection** (`src/lib/auth.config.ts`): `/admin/*` → admin role required. `/dashboard/*` → auth required. `/login`, `/register` → redirect if logged in.

## Database Schema

29 models in `prisma/schema.prisma`. Key points:
- `User.phone` stored as `962XXXXXXXXX`. `normalizePhone()` converts input formats
- `User.email` = `phone_962xx@naseeb.local` for users, real email for admins
- `User.passwordHash` optional — set for admins only (bcrypt)
- `Suggestion` uses `recipientId`/`candidateId` (mapped to `femaleId`/`maleId` DB columns via `@map`)
- `MutualMatch` `femaleId`/`maleId` — assigned dynamically based on actual genders
- `SystemSetting` — key-value store, read via `src/lib/settings.ts` (30s cache)
- `ProfileUpdateRequest` — user profile edits require admin review (steps 1-4); step 5 guardian info saves directly

## Matching Workflow

```
Suggestion → recipient accepts/rejects (no photos) →
  accepted: other user gets interest → accepts/rejects →
    mutual like: photos + full details revealed → visit request → admin arranges family visit
```

### Simultaneous suggestions (switch `new_suggestions_flow`, needs `intro_requests_enabled`)

Spec: `docs/superpowers/specs/2026-10-16-simultaneous-suggestions-design.md`. `CycleFlags.mutualSuggestions`. One `Suggestion` row with `flow: MUTUAL` is shown to both people; each records `recipientDecision`/`candidateDecision` once via `POST /api/suggestions/[id]/decide` (`decideSuggestion` in `src/lib/suggestions/mutual.ts`); both INTERESTED → `createMutualMatch`. Rows expire after 14 days (lazily). **No leak:** no notification on a "لا", and the feed (`src/lib/suggestions/feed.ts`, `GET /api/suggestions/feed?tab=new|waiting`) never returns the other side's decision or the row status — "waiting" shows my INTERESTED rows until expiry whether the other said no or nothing. Two tabs (`MutualSuggestionsView`): اقتراحات جديدة / بانتظار الطرف الآخر; legacy suggestions and interests in flight show in the same tabs and use their old endpoints (which refuse MUTUAL rows). `GET /api/suggestions` returns `mutualView` (flag on, or the user still has an open MUTUAL row after a switch-off). Weekly cap counts either side; busy candidates skipped. Dealbreakers: `Profile.dealbreakers` (`DEALBREAKER_KEYS`, `passesDealbreakers`/`mutuallyAcceptable` in `score.ts`; missing value fails), edited in "شروطي الأساسية" and as "شرط أساسي" chips in the setup/edit wizards (shown when `mutualSuggestions` is on; `PUT /api/profile/dealbreakers`, saved directly, never via the review request; summaries in `src/lib/matching/dealbreaker-summary.ts`). Yes/no preferences are stored as "نعم"/"لا"/"لا يهم" by the wizards: read them with `prefYesNo()` / `wantsNoChildren()` from `score.ts`. "لماذا هذا الاقتراح": `suggestionReason()` in `src/lib/matching/reasons.ts` (viewer's preferences only).

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

## SMS (Broadnet)

Gateway: `gwjo1s.broadnet.me:8443`. Arabic SMS requires `type=2` (Unicode) with UTF-16BE hex encoding via `toUnicodeHex()`.

Rate limits: 3/phone/5min, 10/IP/15min. Test number: `962796922292` → fixed OTP `111111`.

Config via env: `BROADNET_USER`, `BROADNET_PASS`, `BROADNET_SENDER_ID` (`SRVnaseebak`), `BROADNET_API_URL` (default `https://gwjo1s.broadnet.me:8443/websmpp/websms`). Never hardcode credentials. Provider portal: `http://82.212.81.40:8080/websmpp`

## Stripe Payments

JOD currency (3-decimal — fils = price × 1000). Flow: `POST /api/payments/checkout` → Stripe Checkout Session → webhook fulfills order. Lazy-init client in `src/lib/stripe.ts`.

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Image Storage (Bunny.net CDN)

All uploads stored on Bunny.net, served via `https://cdn.naseebak.com`. Key file: `src/lib/bunny.ts`.

```
naseebak/{photos,identity,avatars}/{userId}/...
```

Env vars: `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE` (`naseebak`), `BUNNY_STORAGE_ENDPOINT` (`storage.bunnycdn.com`), `BUNNY_CDN_URL` (`https://cdn.naseebak.com`). `next.config.ts` includes `cdn.naseebak.com` in `images.remotePatterns`.

## Production Deployment

**Server:** DigitalOcean droplet (Ubuntu 24.04, 2 vCPU, 4GB RAM) at `64.226.64.239`. Domain: `naseebak.com`. SSL: Let's Encrypt. Reverse proxy: Nginx. Process manager: PM2 (**fork mode, NOT cluster** — Next.js manages own workers).

**Deploy:** `ssh root@64.226.64.239 "/var/www/naseebak/deploy.sh"`

**Git remote:** `git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git` (branch: `main`)

**App path:** `/var/www/naseebak` | **Logs:** `/var/log/naseebak/`

## Matching Algorithm

Weighted scoring in `src/lib/matching/score.ts`: Preference match (50%), Personality similarity (30% — cosine on 5D vectors, redistributed if no quiz), Profile quality (20%). Admin generate creates top-3 per user (score >= 30). **Automatic suggestions** (`src/lib/matching/auto-suggest.ts`): once a user is at ≥50% completeness with no pending suggestions, top-3 (score ≥ 30, opposite gender, excluding past suggestions/matches/blocks) are created on profile save and whenever `/api/suggestions` page 1 loads (dashboard + suggestions page). Concurrent calls share one run; an empty run retries after 30 min.

## New User Cycle (switches on)

Spec: `docs/superpowers/specs/2026-10-16-new-cycle-design.md`. After a mutual match (`createMutualMatch` in `src/lib/intro/match.ts` — no admin `VisitRequest` in new mode) the match card shows `MatchIntroPanel` with two requests (rules in `src/lib/intro/requests.ts`, errors as `IntroError` codes):

- **FAMILY** → accepted: both see the other's guardian contact (`GuardianContactCard`). Legacy visits in FAMILIES_CONTACTED/SCHEDULED/COMPLETED hide this option; a REQUESTED legacy visit is closed when a family intro is accepted
- **CHAT** → accepted: `Conversation` for 14 days (+7 once in the last 3 days). Free chat→family move once
- Requests expire after 7 days (lazily); a declined request is final for that type on that match
- Chat: `src/lib/chat/service.ts` + `src/lib/chat/filter.ts` (blocks phones incl. Arabic digits/words, links, handles, social keywords; runs before rate limits: 5/5s, 50/day). Real time via Ably (`src/lib/ably.ts`, env `ABLY_API_KEY`): only the server publishes to `chat:<id>`; browsers get subscribe-only tokens from `/api/chats/ably-token`. Without the key the page polls every 4s. Admins never see message content
- Expiry + "2 days left" warning run lazily (counts poll `/api/me/counts`, chat reads) — no cron
- Admin: Settings → "New user cycle" switches; `/admin/introductions` overview

## Notifications

Always use `notify()` / `notifyMany()` from `src/lib/notify.ts`: stores the in-app row with `metadata.url` and sends push only when the user's preference allows (SYSTEM always). Links resolve via `notificationUrl()` in `src/lib/notification-links.ts`. Chat messages are push-only (no in-app row), collapsed per conversation and throttled to 1 per 3 minutes.

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

`DashboardDataProvider` in dashboard layout deduplicates API calls. Provides `profile`, `completeness`, `unreadCount`. Polls unread every 30s. Listens for `naseeb:notifications-read` custom DOM event for instant badge updates.

## Profile Completeness Weights

| Section | Weight |
|---------|--------|
| Basic info (10 fields) | 35% |
| Preferences (7 fields) | 25% |
| Personality quiz | 15% |
| Photos (≥1) | 15% |
| Family & Guardian | 10% |

## Admin Panel

14 pages at `/admin`, mobile-friendly (layout `main` has `min-w-0` so tables scroll inside their card; secondary table columns use `hidden md:table-cell`). Users list shows photo thumbnails + a Photos quick-view dialog. All use `"use client"`, `useState`+`useEffect`, admin auth check. Sidebar in `src/components/shared/admin-sidebar.tsx`. Profile request approval applies all field types (strings, ints, bools, arrays, dates).

**New-cycle admin views** (spec `docs/superpowers/specs/2026-10-16-admin-new-cycle-design.md`): with `intro_requests_enabled` on, the dashboard (`/api/admin/stats` → `cycle`) shows intro requests by type/status, active chats, credits spent on requests this week and a registered → introduction-accepted funnel; the sidebar groups Identity Review / Visit Requests / Profile Requests under a collapsed "Legacy" section (layout passes `legacyGrouped`). User page loads `GET /api/admin/users/[id]/cycle` (intro requests, chats with message **counts only**, credit history). Reports show "From chat" via `Report.conversationId` (set by `endConversation`). Lazily-expired rows: use `effectiveRequestStatus` / `effectiveConversationStatus` from `src/lib/admin/cycle-stats.ts`.

**Moderation** (`src/lib/admin/moderation.ts`): `setSuspended()` stores `User.statusBeforeSuspension` and restores it on unsuspend (never blanket VERIFIED), ends the user's active chats and notifies; suspended users get no suggestions, can't send/accept requests or messages, and `requireUser()` rejects their sessions (403). `adminEndConversation()` sets `Conversation.endedByAdminId` (status only, never content) — used by the user page, `/admin/chats` and report review (which also records `Report.reviewedById`). Admin pages: `/admin/matches`, `/admin/chats` (metadata only), introductions filter by name/phone. Hand-picked suggestions are checked server-side (`checkSuggestionPair`). Credit top-up can run from Settings (`src/lib/admin/credit-migration.ts`, same marker as the script). Credits are edited as a +/- delta with a required reason. Admin list routes validate query params (`safePagination`/`enumParam` in `src/lib/admin/query.ts`).

**Credit history:** every change to `matchCredits` must call `recordCredit()` (`src/lib/credits.ts`) → `CreditLedger` row with a `CreditReason` (REGISTRATION, PURCHASE, REQUEST, SUGGESTION, ADMIN_ADJUST, MIGRATION_GIFT, REFUND, REFERRAL). Best-effort outside a transaction client, so a history write never blocks a purchase or request. History starts with this release (no backfill).

## Registration Toggle

`SystemSetting` key `registration_open`. Default: open (fail-open on error). When closed: banner on landing pages, register page shows alert, `send-otp` blocks new phones, `register` returns 403.

## Maintenance Mode

Admin → Settings → Maintenance Mode (`SystemSetting` keys `maintenance_mode`, `maintenance_message`; API `/api/admin/settings/maintenance`). When on, `src/app/(ar)/layout.tsx` renders `MaintenanceScreen` for everyone except admins (admins see the site + an amber banner); `send-otp` and `register` return 503. Admin panel, APIs and the Stripe webhook keep working. The layout calls `connection()` so all `(ar)` pages render per request. Takes effect within 30s (settings cache).

## Analytics & Logs

Google Analytics 4 (`G-39EEZNJBYD`, override with `NEXT_PUBLIC_GA_ID`) loads in `src/app/(ar)/layout.tsx` only (admin not tracked). Fire custom events with `trackEvent()` from `src/lib/analytics.ts` (sign_up, login, otp_requested, profile_completed, personality_quiz_completed, photo_uploaded, verification_submitted, suggestion_response, interest_response, begin_checkout, payment_success). Never send personal data in event params.

Production (Hostinger) logs: `~/domains/naseebak.com/hbuilds/current/nodejs/console.log`. `src/instrumentation.ts` turns Error objects into text so Prisma errors are readable there.

## Known Limitations

- Email is admin-only: `src/lib/email.ts` (Hostinger SMTP, env `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`) sends a new-registration notice to `ADMIN_NOTIFY_EMAIL`. No emails to users
- OneSignal requires domain config in dashboard (Site URL: `https://naseebak.com`)
- Account deletion cron needs external scheduler

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
