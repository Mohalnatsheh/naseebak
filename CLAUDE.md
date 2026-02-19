# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Naseebak (نصيبك)** is a web-based traditional marriage facilitation platform for Jordan. It is **not** a dating app — there is zero direct communication between users. The platform uses AI-powered matching, admin-mediated family visit coordination, and a freemium suggestion model. The full specification lives in `SRS.md`.

**Current status:** Core platform implemented and deployed to production at **https://naseebak.com**. Auth (phone+OTP for users, email+password for admins), profile management, identity verification, personality quiz, suggestions with sent interest tracking, matches, payments, notifications, full-featured admin panel (13 pages), dynamic blog system, push notifications (OneSignal), real matching algorithm, report/block system, field-level profile completeness, and account deletion with 30-day grace period are all functional.

## Commands

```bash
pnpm dev              # Start dev server (Turbopack) on localhost:3000
pnpm build            # Production build (next build)
pnpm test             # Run all tests (vitest run) — 159 tests across 9 files
pnpm test:watch       # Run tests in watch mode
pnpm db:generate      # Regenerate Prisma client after schema changes
pnpm db:push          # Push schema changes to database
pnpm db:studio        # Open Prisma Studio GUI
```

**Important:** After changing `prisma/schema.prisma`, run `pnpm db:push && pnpm db:generate`. If the dev server shows stale Prisma errors (e.g. model not found), clear cache and restart: `rm -rf .next && pnpm dev`.

## Technology Stack

- **Runtime:** Next.js 16.1.6 (Turbopack), React 19, Node.js 22
- **Styling:** Tailwind CSS v4 with oklch color system
- **Database:** PostgreSQL (Neon serverless) + Prisma 7.4 ORM with `@prisma/adapter-neon`
- **Auth:** NextAuth.js 5 (beta.30) — dual auth: phone+OTP for users, email+password for admins
- **Password Hashing:** bcryptjs 3.0
- **Validation:** Zod v4 (`zod/v4` import path)
- **UI Components:** shadcn/ui (Radix primitives)
- **Icons:** lucide-react
- **Payments:** Stripe Checkout (one-time payments, JOD currency)
- **Push Notifications:** OneSignal (react-onesignal SDK + REST API)
- **Testing:** Vitest + Testing Library
- **Package Manager:** pnpm 10.24

## Architecture

```
src/
├── app/
│   ├── (ar)/              # Arabic RTL user-facing pages
│   │   ├── page.tsx       # Landing page
│   │   ├── login/         # Phone + OTP login
│   │   ├── register/      # 3-step wizard (info+OTP, identity docs, success)
│   │   ├── blog/          # Dynamic blog listing + detail (/blog, /blog/[slug])
│   │   └── dashboard/     # Protected dashboard pages
│   │       ├── page.tsx           # Main dashboard (stats, actions, timeline)
│   │       ├── profile/setup/     # 5-step profile wizard
│   │       ├── profile/edit/      # Profile editing
│   │       ├── identity/          # ID document upload + status
│   │       ├── suggestions/       # 3-tab: new suggestions, sent requests, received interests
│   │       ├── matches/           # Mutual matches with full profile details + photos + visits
│   │       ├── photos/            # Photo upload/manage (max 5, base64)
│   │       ├── personality-quiz/  # 20-question quiz (5 dimensions)
│   │       ├── payments/          # Plans + payment history
│   │       └── notifications/     # Notification center
│   ├── (en)/              # English LTR admin panel
│   │   └── admin/
│   │       ├── login/     # Admin email+password login (separate layout, no sidebar)
│   │       ├── page.tsx   # Admin dashboard (stats, quick actions, trends, activity)
│   │       ├── users/     # User management (search, filters, suspend)
│   │       ├── users/[id] # User detail page (full profile, photos, actions)
│   │       ├── identity/  # Identity review (pending + history tabs, image preview)
│   │       ├── suggestions/ # Suggestion management (browse + create/generate tabs)
│   │       ├── visits/    # Visit request management (filters, date/location/notes)
│   │       ├── reports/   # Report review
│   │       ├── profile-requests/ # Profile update request review (diff view)
│   │       ├── payments/  # Payment management (revenue stats, filters)
│   │       ├── notifications/ # Send system notifications (single/broadcast)
│   │       ├── blocks/    # Block management (view/remove)
│   │       ├── deletions/ # Account deletion request management
│   │       ├── settings/  # Admin accounts management
│   │       └── blog/      # Blog post + category management
│   └── api/               # All API routes
├── components/
│   ├── shared/            # Navbar, DashboardNavbar, AdminSidebar, Footer, etc.
│   └── ui/                # shadcn/ui components (Button, Card, Input, etc.)
├── hooks/
│   ├── use-auto-save.ts   # Profile setup auto-save (localStorage + server draft)
│   └── use-in-view.ts     # Intersection observer hook
├── lib/
│   ├── auth.ts            # NextAuth config (two Credentials providers)
│   ├── auth.config.ts     # Auth callbacks (JWT, session, route protection)
│   ├── db.ts              # Prisma client singleton (PrismaNeon adapter)
│   ├── stripe.ts          # Stripe client singleton (lazy-initialized)
│   ├── onesignal.ts       # OneSignal push notification helpers (server-side)
│   ├── rate-limit.ts      # In-memory rate limiter
│   ├── profile-completeness.ts  # Field-level profile completeness calculator
│   ├── matching/
│   │   └── score.ts       # Weighted compatibility scoring engine
│   ├── validations/       # Zod schemas (auth.ts, profile.ts, blog.ts)
│   └── data/
│       └── jordan-areas.ts  # Jordan cities + neighborhoods for cascading dropdown
└── __tests__/             # Vitest test files
```

## Auth System

Two authentication methods exist — phone+OTP for regular users, email+password for admins.

### User Auth (Phone + OTP)

**Flow:**
1. Client calls `POST /api/auth/send-otp` with `{ phone }` → returns OTP (dev mode shows OTP in response) + `userExists` flag
2. Client calls `POST /api/auth/verify-otp` with `{ phone, code }` → marks OTP verified in DB
3. For registration: `POST /api/auth/register` with `{ firstName, lastName, phone, gender, otp }` → creates user with `email: phone_${phone}@naseeb.local`
4. For login: `signIn("credentials", { phone, otp })` via NextAuth → verifies OTP in DB, looks up user by phone
5. If login fails and `userExists` is false → redirects to `/register`; if true → shows error (account may be suspended)

### Admin Auth (Email + Password)

**Flow:**
1. Admin navigates to `/admin/login` (dedicated page, no sidebar)
2. Submits email + password → `signIn("admin-credentials", { email, password })`
3. NextAuth verifies: user exists, `role === "ADMIN"`, `passwordHash` present, bcrypt password match
4. Success → redirects to `/admin`

**Seed credentials:** `admin@naseeb.jo` / `Admin123!`

### Auth Providers in `src/lib/auth.ts`

- `credentials` (id: `"credentials"`) — phone+OTP for users
- `admin-credentials` (id: `"admin-credentials"`) — email+password for admins

### Route Protection (`src/lib/auth.config.ts`)

- `/admin/login` → public (redirects to `/admin` if already logged in as admin)
- `/admin/*` → requires auth + `role === "ADMIN"` (unauthenticated → `/admin/login`, non-admin → `/dashboard`)
- `/dashboard/*` → requires auth (unauthenticated → `/login`)
- `/login`, `/register` → redirects to `/dashboard` if already logged in

**Key files:**
- `src/lib/validations/auth.ts` — exports `sendOtpSchema`, `verifyOtpSchema`, `registerSchema`, `loginSchema`
- `src/lib/auth.ts` — NextAuth config with both Credentials providers
- `src/lib/auth.config.ts` — Route protection, JWT/session callbacks
- `src/app/api/auth/send-otp/route.ts` — OTP generation (6-digit, 5-min expiry, rate limited 3/phone/5min + 10/IP/15min), returns `userExists`
- `src/app/api/auth/verify-otp/route.ts` — OTP verification
- `src/app/api/auth/register/route.ts` — Registration (verifies OTP, creates user)
- `src/app/(en)/admin/login/page.tsx` — Admin login page (email+password)
- `src/app/(en)/admin/login/layout.tsx` — Admin login layout (no sidebar)
- Forgot/reset password routes return 410 (not supported)

## Database Schema

20 models in `prisma/schema.prisma`: User, Profile, PersonalityResult, ParentInfo, IdentityDoc, Photo, Suggestion, Like, MutualMatch, VisitRequest, Payment, Subscription, Notification, ProfileUpdateRequest, Otp, BlogCategory, BlogPost, **Report**, **Block**, **AccountDeletionRequest**.

Key points:
- `User.passwordHash` is optional (`String?`) — set for admin accounts (bcrypt), null for regular users
- `User.phone` stored in international format `962XXXXXXXXX` (not `07...`). `normalizePhone()` in `src/lib/validations/auth.ts` converts any input format to `962...`
- `User.email` is required by NextAuth but populated as `phone_962xx@naseeb.local` for users, real email for admins
- `User.oneSignalPlayerId` stores the push notification player ID
- `Profile` has 40+ fields including location (lat/lng), tribe, preferences (prefAge*, prefCity, prefHijab, prefBeard, prefReligiosity, prefSmokingStatus, prefChildrenAcceptance), gender-specific fields (beard, hijab), `profileImageUrl` (personal avatar, visible only to the user themselves), `setupStep` (Int, tracks which wizard step the user reached, default 1)
- `Otp` model stores codes with phone, expiry, and verified status
- `Suggestion` uses `recipientId`/`candidateId` in Prisma code (mapped to `femaleId`/`maleId` DB columns via `@map`). Both genders can be recipient or candidate
- `MutualMatch` keeps `femaleId`/`maleId` columns — assigned dynamically based on actual user genders at creation time
- `ProfileUpdateRequest` stores user-submitted profile edit requests for admin review
- `BlogCategory` has slug, nameAr, nameEn; `BlogPost` has title, slug, excerpt, content (Text), status (DRAFT/PUBLISHED), categoryId, readTime, publishedAt
- `Report` stores user-submitted reports (reason enum: FAKE_PROFILE, INAPPROPRIATE_CONTENT, HARASSMENT, SPAM, OTHER; status: PENDING/REVIEWED/DISMISSED). Unique per reporter+reported pair
- `Block` stores bidirectional blocks between users. Blocked users are filtered from suggestions, interests, and matching candidates
- `AccountDeletionRequest` tracks 30-day grace period deletion requests (scheduledAt, cancelledAt). Account is deactivated immediately, permanently deleted after 30 days via cron

## API Routes

| Group | Endpoints |
|---|---|
| Auth | `send-otp`, `verify-otp`, `register`, `[...nextauth]`, `logout`, `forgot-password` (410), `reset-password` (410) |
| Identity | `upload` (supports both FormData + JSON/base64), `status` |
| Profile | GET/PUT profile (GET includes `completeness` field), `draft` (PATCH — partial auto-save for setup wizard), `avatar` (POST/DELETE — personal profile image, base64), `parent-info`, `personality-quiz` (20 Qs, 5 dimensions, 3-month retake cooldown), `photos` (max 5), `photos/[id]`, `deactivate`, `delete` (POST/DELETE/GET — 30-day grace period deletion), `update-request` |
| Reports | POST `/api/reports` (create report with reason enum) |
| Blocks | GET/POST `/api/blocks` (list/create blocks), DELETE `/api/blocks/[id]` (unblock) |
| Cron | GET `/api/cron/process-deletions?token=SECRET` (process expired deletion requests) |
| Suggestions | GET list, `[id]/like`, `[id]/reject`, `sent` (GET — sent interest tracking) |
| Matches | GET list (full profile details + compatibility score), `[id]/photos`, `[id]/reveal` (no-op), `[id]/visit-status` |
| Payments | `plans`, `checkout`, `history`, `webhook` |
| Notifications | GET list, `[id]/read`, `read-all`, `unread-count` |
| Push | `register` (POST — save OneSignal player ID) |
| Blog (public) | GET `/api/blog` (list published, filter by `?category=`, `?page=`), GET `/api/blog/[slug]` (single post), GET `/api/blog/categories` (categories with published counts) |
| Admin | `stats` (enhanced with revenue, trends, activity), `identity` review (pending/history tabs), `suggestions` (GET list + POST create + DELETE `[id]`), `suggestions/generate`, `reports` (GET/PATCH), `visits` management, `users` (GET with search/gender/status filters) + `users/[id]` (GET + PATCH credits) + `users/[id]/suspend`, `profile-requests` (with profile diff data), `payments` (GET paginated with status filter + revenue summary), `notifications` (GET recent + POST send to one/all), `blocks` (GET paginated) + `blocks/[id]` (DELETE), `deletions` (GET pending) + `deletions/[id]` (DELETE cancel), `settings/admins` (GET list + POST create) |
| Admin Blog | GET/POST `/api/admin/blog` (list all + create), PUT/DELETE `/api/admin/blog/[id]`, GET/POST `/api/admin/blog/categories`, PUT/DELETE `/api/admin/blog/categories/[id]` |

## Branding & Colors

**Brand name:** نصيبك (Naseebak) — note: Arabic words like "النصيب" (fate) and "نصيبها" (her destiny) are regular vocabulary, not the brand name. Only standalone "نصيبك" is the brand.

The color palette is **deep blue + warm gold** using oklch values in `globals.css`:
- **Primary:** Deep blue `oklch(0.35 0.08 250)`
- **Secondary:** Muted blue `oklch(0.45 0.06 250)`
- **Accent:** Warm gold `oklch(0.72 0.12 75)`

Green/emerald is used **only** for semantic success states (verified badges, completed payments, approved identity). Never use green for branding or decorative elements.

## Critical Domain Rules

These are hard constraints that must never be violated:

- **No messaging/chat/communication** between users — ever
- **Photos are hidden** until both users mutually like each other
- **Gender-neutral access** — both genders receive suggestions, can accept/reject, receive interests, and purchase credits. The same workflow applies to all users
- **Identity verification** (government ID upload + admin review) is mandatory before platform usage
- **Parent/guardian data** is visible to admin only, never to the other user
- **Free tier:** 5 lifetime suggestions per account; paid packages for more
- **No credit gate on matches** — mutual match details are always fully visible (no reveal/credit cost)
- **No pricing on landing page** — packages are only visible in the dashboard payments section
- **Suggestion cards** show full profile details (expandable): personal info, education/work, religion/lifestyle, family, hobbies
- **Match cards** show same full profile details as suggestions, plus compatibility score, visit status, and photo toggle

## Matching Workflow

```
User receives suggestion → accepts/rejects (full profile, no photos) →
  if accepted: other user gets interest notification → accepts/rejects (full profile, no photos) →
    if mutual like: full details + photos revealed immediately (no credit cost) →
      visit request created → admin contacts families → arranges in-person visit
```

Both genders follow the same flow. The Suggestion model uses `recipientId`/`candidateId` fields (mapped to `femaleId`/`maleId` DB columns via Prisma `@map`). MutualMatch keeps `femaleId`/`maleId` — assigned dynamically based on actual user genders at match creation time.

## Suggestions Page (3-Tab Layout)

All users (both genders) see the same 3-tab suggestions page:

1. **"اقتراحات جديدة" (New Suggestions)** — pending suggestions where user is the recipient
2. **"الطلبات المرسلة" (Sent Requests)** — tracks status of accepted suggestions (sent interests)
3. **"طلبات الاهتمام" (Received Interests)** — incoming likes from other users

**Sent interest status logic** (derived from existing DB data, no schema changes):
| Status | Arabic | Badge Color | Condition |
|---|---|---|---|
| Waiting | بانتظار الاطلاع | Amber | INTEREST notification to other user has `isRead: false` |
| Seen | تم الاطلاع | Blue | Notification `isRead: true`, no `MutualMatch` exists |
| Matched | توافق متبادل | Green | A `MutualMatch` record exists for this pair |

**Key files:**
- `src/app/api/suggestions/route.ts` — Suggestions list (uses `recipientId`/`candidate`)
- `src/app/api/suggestions/sent/route.ts` — Sent interests with status
- `src/app/api/interests/received/route.ts` — Received interests
- `src/app/(ar)/dashboard/suggestions/page.tsx` — 3-tab UI for all users

## Push Notifications (OneSignal)

Web push notifications via OneSignal SDK. Sends real-time alerts for suggestions, matches, visits, identity status, and payments.

**Architecture:**
- `src/components/shared/onesignal-provider.tsx` — Client-side SDK init (rendered in dashboard layout), registers user by session ID
- `src/components/shared/push-permission-prompt.tsx` — Arabic UI prompt shown 5s after dashboard load
- `src/lib/onesignal.ts` — Server-side `sendPushNotification()` and `sendPushNotificationToMany()` helpers
- `src/app/api/push/register/route.ts` — Saves OneSignal player ID to `User.oneSignalPlayerId`
- `public/OneSignalSDKWorker.js` — Service worker required by OneSignal

**OneSignal setup required:** In the OneSignal dashboard, set Site URL to `https://naseebak.com` under Settings → Platforms → Web.

## Profile Setup (5 Steps)

The profile wizard (`dashboard/profile/setup`) has 5 steps:
1. **Personal Info** — DOB, nationality, city (grid), area (cascading from `jordan-areas.ts`), height, weight, education, job (dropdown with 24 options + "أخرى" custom input)
2. **Lifestyle & Religion** — Marital status, religiosity, smoking, hijab (women), beard (men), cooking ability, driving license, children count (conditional — only shown for divorced/widowed, hidden for single)
3. **About Me & Preferences** — Bio, partner expectations, hobbies, family values, preferred age/city/education/marital status, prefHijab (males only), prefBeard (females only), prefReligiosity (multi-select), prefSmokingStatus (multi-select), prefChildrenAcceptance
4. **Family Info** — Tribe, family origin area, siblings count, housing type, monthly expenses, health conditions
5. **Guardian Info** — Parent/guardian name, phone, relationship, address

### Auto-Save

The setup wizard auto-saves progress so users can leave mid-form and return later without losing data. Two persistence layers work together:

- **localStorage** — Debounced (1s) save of form state + parent form + current step on every field change. Key: `naseeb_profile_draft`. 30-day expiry. Works offline.
- **Server draft** — `PATCH /api/profile/draft` fires on each "Next" step transition (fire-and-forget). Validates with `profileDraftSchema` (all fields optional, ranges still enforced). Upserts profile with `isComplete: false`. Saves `setupStep` to track progress.

**On page load:** Fetches server profile data, then checks localStorage draft. Whichever is fresher (comparing `savedAt` vs `profile.updatedAt`) wins. Restores form state + step from the chosen source.

**On final submit:** Existing PUT to `/api/profile` + `/api/profile/parent-info` (sets `isComplete: true`). Clears localStorage draft on success.

**Visual indicator:** "تم الحفظ التلقائي" text with Save icon appears below the progress bar for 2s after each localStorage save.

**Key files:**
- `src/hooks/use-auto-save.ts` — `useAutoSave(enabled)` hook: localStorage debounce, restore, clear, server save, indicator state
- `src/app/api/profile/draft/route.ts` — PATCH endpoint with `profileDraftSchema` validation
- `src/lib/validations/profile.ts` — `profileDraftSchema` (all fields optional, value ranges enforced)

## Profile Avatar

Personal profile image visible only to the user on their own profile page. Never shared with other users, never included in suggestion/match API responses.

- `POST /api/profile/avatar` — Upload base64 data URL (JPG/PNG/WebP, max 5MB), saves to `Profile.profileImageUrl`
- `DELETE /api/profile/avatar` — Remove the profile image (sets to null)
- Profile page shows the avatar in the header (or initial letter fallback), with a camera overlay for inline upload
- Privacy note displayed under the header: "صورة الملف الشخصي تظهر لك فقط ولن يراها أي مستخدم آخر"

**Key files:**
- `src/app/api/profile/avatar/route.ts` — POST/DELETE avatar endpoint
- `src/app/(ar)/dashboard/profile/page.tsx` — Avatar display + upload UI

## Photo Management

Photo upload page at `/dashboard/photos`. Uses existing API endpoints:
- `GET /api/profile/photos` → list photos
- `POST /api/profile/photos` → upload (base64 data URL, `isPrimary` flag)
- `DELETE /api/profile/photos/[id]` → delete

**Constraints:** Max 5 photos per user. Photos are only visible to mutual matches. First uploaded photo is auto-set as primary.

**Key files:**
- `src/app/(ar)/dashboard/photos/page.tsx` — Photo upload/manage UI
- Accessible from sidebar ("صوري") and profile page quick links

## Notification Routing

All notification types navigate to the correct page on click:
| Type | Route |
|---|---|
| SUGGESTION | `/dashboard/suggestions` |
| INTEREST | `/dashboard/suggestions` |
| MATCH | `/dashboard/matches` |
| VISIT_UPDATE | `/dashboard/matches` (status shown in Arabic via `visitStatusLabels` map in `api/admin/visits/route.ts`) |
| PAYMENT | `/dashboard/payments` |
| IDENTITY | `/dashboard/identity` |
| SYSTEM | `/dashboard` |

## Testing

Tests are in `src/__tests__/`. Run with `pnpm test`. **159 tests across 9 files.**
- `validations/auth.test.ts` — OTP schema validation (sendOtp, verifyOtp, login, register) — 38 tests
- `validations/profile.test.ts` — Profile + parent info + draft schema validation — 18 tests
- `validations/blog.test.ts` — Blog post + category schema validation — 19 tests
- `api/matching.test.ts` — Matching workflow domain logic — 19 tests
- `api/plans.test.ts` — Payment plans logic — 3 tests
- `domain-rules.test.ts` — Core domain rule enforcement — 23 tests
- `lib/utils.test.ts` — Utility function tests — 6 tests
- `matching/score.test.ts` — Compatibility scoring (cosine similarity, preference matching, quality score) — 20 tests
- `profile-completeness.test.ts` — Field-level completeness calculator — 13 tests

## Blog System

Database-backed blog with admin management. No direct communication — blog is public content only.

**Public pages:**
- `/blog` — Dynamic listing with category filter, pagination, shimmer loading states
- `/blog/[slug]` — Detail page with mini hero, back link, 404 handling

**Admin page:**
- `/admin/blog` — Two-tab layout (Posts + Categories)
  - Posts tab: table with CRUD via dialog, pagination, status badges (DRAFT/PUBLISHED)
  - Categories tab: inline add form + table with delete (blocked if posts exist)

**Category icon/gradient mapping:** Category slugs (`tips`, `stories`, `development`, `family`) map to specific icons and gradient colors in the blog listing page via lookup objects. New categories get a default gradient.

**Key files:**
- `src/lib/validations/blog.ts` — `createBlogPostSchema`, `createCategorySchema`
- `src/app/api/blog/` — Public endpoints (list, single, categories)
- `src/app/api/admin/blog/` — Admin CRUD endpoints (auth guarded)
- `src/app/(en)/admin/blog/page.tsx` — Admin blog management page
- `src/app/(ar)/blog/page.tsx` — Public blog listing (dynamic)
- `src/app/(ar)/blog/[slug]/page.tsx` — Public blog detail page

## Stripe Payments

Real payment processing via Stripe Checkout Sessions. Currency is JOD (Jordanian Dinar, 3-decimal — fils = price × 1000).

**Flow:**
```
User clicks "Buy" → POST /api/payments/checkout → creates PENDING Payment + Stripe Checkout Session →
  returns session URL → client redirects to Stripe hosted page →
    user pays → Stripe sends webhook → POST /api/payments/webhook →
      verifies signature → fulfills order (COMPLETED, add credits, notification, push) →
        Stripe redirects user to /dashboard/payments?success=true
```

**Key files:**
- `src/lib/stripe.ts` — Lazy-initialized Stripe client (`getStripe()`) — avoids build-time errors when env vars aren't set
- `src/app/api/payments/checkout/route.ts` — Creates PENDING payment + Stripe Checkout Session, returns `{ url }` for client redirect
- `src/app/api/payments/webhook/route.ts` — Verifies Stripe signature, handles `checkout.session.completed` (credits + notification + push) and `checkout.session.expired` (marks FAILED)
- `src/app/(ar)/dashboard/payments/page.tsx` — Redirects to Stripe on purchase, shows success/cancel toast on return

**Webhook events handled:**
- `checkout.session.completed` — Fulfills order: updates Payment to COMPLETED, increments `User.matchCredits`, creates PAYMENT notification, sends push
- `checkout.session.expired` — Updates Payment to FAILED

**Environment variables required:**
- `STRIPE_SECRET_KEY` — Stripe secret key (starts with `sk_test_` or `sk_live_`)
- `STRIPE_WEBHOOK_SECRET` — Webhook signing secret (starts with `whsec_`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Publishable key (starts with `pk_test_` or `pk_live_`)

## Production Deployment

### Infrastructure

| Component | Details |
|---|---|
| **Server** | DigitalOcean droplet, Ubuntu 24.04 LTS, 2 vCPU, 4GB RAM, 120GB SSD |
| **IP** | 64.226.64.239 |
| **Domain** | naseebak.com (+ www.naseebak.com → redirects to non-www) |
| **SSL** | Let's Encrypt, auto-renews via certbot timer |
| **Process Manager** | PM2 (fork mode — Next.js manages its own workers internally) |
| **Reverse Proxy** | Nginx with HTTP2, gzip, security headers, rate limiting |
| **App Path** | `/var/www/naseebak` |
| **Logs** | `/var/log/naseebak/` (PM2 logs, deploy logs) |
| **Config** | `/var/www/naseebak/ecosystem.config.cjs` (PM2), `/etc/nginx/sites-available/naseebak` (Nginx) |

### Deploy to Production

```bash
ssh root@64.226.64.239 "/var/www/naseebak/deploy.sh"
```

Or manually:
```bash
ssh root@64.226.64.239
cd /var/www/naseebak
git pull origin main
pnpm install --frozen-lockfile
npx prisma generate
npx prisma db push
pnpm build
pm2 restart ecosystem.config.cjs
```

### Git Remote

- **GitLab:** `git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git`
- **Branch:** `main`
- Server SSH key (Ed25519) is registered as a deploy key in GitLab

### Server Security & Performance

- **Firewall (UFW):** Only SSH + Nginx (80/443)
- **Fail2ban:** SSH (3 retries / 2h ban), Nginx rate-limit + bot protection
- **Rate Limiting (Nginx):** Auth endpoints: 5/min, API: 10/s, General: 30/s
- **Security Headers:** HSTS (2yr preload), X-Frame-Options, X-Content-Type-Options, XSS Protection, Referrer-Policy, Permissions-Policy
- **Kernel Tuning:** `somaxconn=65535`, `tcp_tw_reuse=1`, `swappiness=10`, file descriptors 65535
- **Swap:** 2GB
- **Log Rotation:** Daily, 14 days retention, compressed
- **Auto Security Updates:** `unattended-upgrades` enabled

### Important: PM2 Mode

**Use fork mode, NOT cluster mode** for Next.js. Next.js manages its own internal workers. PM2 cluster mode causes port conflicts during restarts, leading to 503 errors. The `ecosystem.config.cjs` is set to `exec_mode: 'fork'` with `instances: 1`.

### Scaling Path

1. **Vertical:** Resize droplet → more RAM/CPU, Next.js uses workers automatically
2. **Horizontal:** Add more droplets behind a DigitalOcean Load Balancer
3. **CDN:** Add Cloudflare in front for static asset caching + DDoS protection

## SMS (Broadnet)

OTP SMS sent via Broadnet gateway (`gwjo1s.broadnet.me:8443`).

**Important:** Arabic text requires `type=2` (Unicode) with UTF-16BE hex encoding. `type=1` only works for ASCII/English text. The `toUnicodeHex()` helper in `send-otp/route.ts` handles this conversion.

**Rate limiting (send-otp):**
- Per phone: 3 requests / 5 minutes
- Per IP: 10 requests / 15 minutes (extracted from `x-forwarded-for` header)

**Test number:** `962796922292` (input as `0796922292`) uses fixed OTP `111111` — bypasses SMS entirely.

**Broadnet credentials:** user=`naseebak6`, pass=`954N@LtoK`, sid=`naseebak`

## Privacy Notes (User-Facing)

Privacy reassurance banners are displayed across key pages:

| Page | Message |
|---|---|
| **Identity** (`dashboard/identity`) | وثائق الهوية تُستخدم فقط للتحقق من هويتك ولن يطّلع عليها أي مستخدم آخر. يتم مراجعتها بسرية تامة من قبل الإدارة |
| **Photos** (`dashboard/photos`) | صورك الشخصية لن تظهر لأي مستخدم إلا بعد التوافق المتبادل بينكما (Lock icon) |
| **Registration** (Step 1) | اسمك الكامل ورقم هاتفك محميان بالكامل ولن يظهرا لأي مستخدم آخر على المنصة. يُعرض فقط الاسم الأول (Shield icon) |
| **Registration** (Step 2) | Same identity privacy message as the identity page |
| **Profile** (`dashboard/profile`) | صورة الملف الشخصي تظهر لك فقط ولن يراها أي مستخدم آخر (Lock icon) |

## Matching Algorithm

Weighted compatibility scoring engine in `src/lib/matching/score.ts`. Replaces the old hardcoded 85% score.

**Scoring weights:**
- **Preference match (50%)**: Bidirectional — checks if each user meets the other's preferences (age range, city, education, marital status, religiosity, smoking, hijab/beard, children acceptance). Missing preferences = full score for that dimension.
- **Personality similarity (30%)**: Cosine similarity on 5D personality vectors (from `PersonalityResult.vector`). If either user hasn't taken the quiz, weight is redistributed to preferences (65%) and quality (35%).
- **Profile quality bonus (20%)**: Both users have complete profiles, photos, quiz done, and identity verified.

**Admin integration:**
- Manual suggestion creation (`POST /api/admin/suggestions`) auto-computes the score when no manual score is provided
- "Generate Suggestions" button (`POST /api/admin/suggestions/generate`) finds all eligible users, scores all opposite-gender candidates, creates top-3 per user (score ≥ 30), excluding existing suggestions/matches/blocks

**Key files:**
- `src/lib/matching/score.ts` — `calculateCompatibility()`, `checkPreferenceMatch()`, `cosineSimilarity()`, `profileQualityScore()`
- `src/app/api/admin/suggestions/generate/route.ts` — Bulk suggestion generation endpoint
- `src/app/(en)/admin/suggestions/page.tsx` — Generate button UI

## Report & Block System

User safety features — report profiles and block users.

**Report flow:** User clicks three-dot menu on suggestion/interest/match card → selects "إبلاغ" → dialog with reason enum + optional details → `POST /api/reports` → admin reviews in `/admin/reports` (mark as REVIEWED or DISMISSED with note).

**Block flow:** User clicks "حظر" from the three-dot menu → `POST /api/blocks` → user is immediately removed from the card list. Blocked users are filtered out of:
- `GET /api/suggestions` — excludes blocked candidates
- `GET /api/interests/received` — excludes blocked senders
- Matching algorithm — excludes blocked pairs from candidate generation

**Admin reports page** (`/admin/reports`): Filterable by status (All/PENDING/REVIEWED/DISMISSED), paginated, review dialog with admin note.

**Key files:**
- `src/app/api/reports/route.ts` — POST (create report)
- `src/app/api/blocks/route.ts` — GET/POST (list/create blocks)
- `src/app/api/blocks/[id]/route.ts` — DELETE (unblock)
- `src/app/api/admin/reports/route.ts` — GET/PATCH (admin review)
- `src/app/(en)/admin/reports/page.tsx` — Admin reports page
- Three-dot menu added to suggestion cards, interest cards, and match cards

## Admin Panel (Complete Feature Set)

The admin panel at `/admin` has 13 pages providing full platform management. All pages use the same patterns: `"use client"`, `useState`+`useEffect`, admin auth check via API, shadcn/ui components.

### Sidebar Navigation (`src/components/shared/admin-sidebar.tsx`)
13 links: Dashboard, Users, Identity Review, Suggestions, Visit Requests, Reports, Profile Requests, Payments, Notifications, Blocks, Deletions, Blog, Settings. Active link matching uses `pathname === href || (href !== "/admin" && pathname.startsWith(href))` to highlight parent links for sub-routes like `/admin/users/[id]`.

### Admin Pages Summary

| Page | Path | Features |
|------|------|----------|
| **Dashboard** | `/admin` | 8 stat cards (incl. revenue), quick action links with pending counts, registration trend (this week vs last), recent activity timeline (registrations, matches, payments) |
| **Users** | `/admin/users` | Search by name/phone, gender/status filter dropdowns, credits column, clickable rows → detail page, inline suspend/unsuspend button |
| **User Detail** | `/admin/users/[id]` | Full user profile (40+ fields), identity doc image preview, photos grid, personality quiz results, parent/guardian info, subscriptions, account stats, suspend/unsuspend + credit adjustment actions |
| **Identity** | `/admin/identity` | Pending/History tabs, document image preview (front+back), predefined rejection reasons dropdown (Blurry, Wrong Doc, Expired, Mismatch, Other), history table with reviewer info + pagination |
| **Suggestions** | `/admin/suggestions` | Browse/Create tabs. Browse: status filter, paginated table with score color coding (>70 green, 50-70 amber, <50 red), delete action. Create: auto-generate + manual create |
| **Visits** | `/admin/visits` | Status filter buttons with counts, date picker (datetime-local), location input, admin notes per visit, "Save Details" button, status transition buttons |
| **Reports** | `/admin/reports` | Status filter (All/PENDING/REVIEWED/DISMISSED), review dialog with admin note, pagination |
| **Profile Requests** | `/admin/profile-requests` | Change diff table (Field / Current Value / Proposed Value), user message display, admin note + approve/reject |
| **Payments** | `/admin/payments` | 3 summary cards (Total Revenue, This Month, Completed Count), status filter (All/PENDING/COMPLETED/FAILED/REFUNDED), paginated table |
| **Notifications** | `/admin/notifications` | Send form with All Users / Specific User toggle, user dropdown, title + body inputs. Recent system notifications list below |
| **Blocks** | `/admin/blocks` | Paginated table (Blocker / Blocked / Date / Remove), confirmation before removal |
| **Deletions** | `/admin/deletions` | Cards with user info, reason, countdown badge ("X days remaining"), cancel deletion button with account reactivation |
| **Settings** | `/admin/settings` | Admin accounts table (Name / Email / Created), "Add Admin" form (firstName, lastName, email, password with bcrypt hash) |

### Admin API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/admin/stats` | GET | Enhanced stats: user counts, revenue, pending items, registration trends, recent activity timeline |
| `/api/admin/users` | GET | Paginated users with `?search=&gender=&status=` filters, includes `matchCredits` |
| `/api/admin/users/[id]` | GET, PATCH | GET: full user detail with all relations. PATCH: `{ matchCredits }` to adjust credits |
| `/api/admin/users/[id]/suspend` | PUT | Toggle suspend/unsuspend with notification + push |
| `/api/admin/identity` | GET, PATCH | GET: `?tab=pending\|history&page=` with reviewer info for history. PATCH: approve/reject with rejectionReason |
| `/api/admin/suggestions` | GET, POST | GET: paginated with `?status=` filter. POST: create suggestion (existing) |
| `/api/admin/suggestions/[id]` | DELETE | Delete a suggestion |
| `/api/admin/suggestions/generate` | POST | Auto-generate scored suggestions (existing) |
| `/api/admin/profile-requests` | GET, PATCH | GET: pending requests with user profile for diff. PATCH: approve/reject (existing) |
| `/api/admin/payments` | GET | Paginated with `?status=` filter, includes revenue summary (total, monthly, count) |
| `/api/admin/notifications` | GET, POST | GET: last 50 SYSTEM notifications. POST: `{ userId?, title, body }` send to one or all users + push |
| `/api/admin/blocks` | GET | Paginated blocks with blocker/blocked user info |
| `/api/admin/blocks/[id]` | DELETE | Remove a block |
| `/api/admin/deletions` | GET | Pending (non-cancelled) deletion requests with user info |
| `/api/admin/deletions/[id]` | DELETE | Cancel deletion + reactivate user |
| `/api/admin/settings/admins` | GET, POST | GET: list admin accounts. POST: create new admin (bcrypt password hash) |
| `/api/admin/reports` | GET, PATCH | Existing report review |
| `/api/admin/visits` | GET, PATCH | Existing visit management with scheduledDate, location, adminNotes |
| `/api/admin/blog/*` | Various | Blog CRUD + category management (now includes PUT for category edit) |

## Profile Completeness Score

Field-level completeness calculator replacing the old 3-item checklist (identity/profile/quiz).

**Sections and weights:**
| Section | Weight | Fields checked |
|---------|--------|---------------|
| Identity verification | 15% | `identityDoc.status === "APPROVED"` |
| Basic info | 30% | DOB, city, area, nationality, education, job, height, weight, maritalStatus, aboutMe |
| Preferences | 20% | prefAgeMin, prefAgeMax, prefCity, prefEducation, prefMaritalStatus, prefReligiosity, prefSmokingStatus |
| Personality quiz | 15% | `personalityResult` exists |
| Photos | 10% | At least 1 photo uploaded |
| Family & Guardian | 10% | tribe, familyOriginArea, numberOfSiblings, parentInfo exists |

**Integration:** `GET /api/profile` returns `completeness: { total, sections }`. Dashboard and profile pages show section-level progress bars with percentages, missing field hints, and action links (links to `/dashboard/profile/edit` when profile is complete, `/dashboard/profile/setup` otherwise).

**Key files:**
- `src/lib/profile-completeness.ts` — `calculateCompleteness()` pure function
- `src/app/(ar)/dashboard/page.tsx` — Section-based completeness widget
- `src/app/(ar)/dashboard/profile/page.tsx` — Same widget on profile page

## Account Deletion (30-day Grace Period)

Users can request permanent account deletion with a 30-day cooling-off period.

**Flow:**
1. User clicks "حذف الحساب" on profile page → confirmation dialog with optional reason
2. `POST /api/profile/delete` → creates `AccountDeletionRequest` (scheduledAt = now + 30 days), deactivates account immediately
3. Profile page shows countdown to deletion date + "إلغاء طلب الحذف" button
4. `DELETE /api/profile/delete` → cancels request, reactivates account
5. Cron (`GET /api/cron/process-deletions?token=CRON_SECRET`) processes expired requests — cascades delete all user data

**Environment variable:** `CRON_SECRET` — token to protect the cron endpoint.

**Key files:**
- `src/app/api/profile/delete/route.ts` — POST/DELETE/GET endpoints
- `src/app/api/cron/process-deletions/route.ts` — Cron processor
- `src/app/(ar)/dashboard/profile/page.tsx` — Deletion UI (request + countdown + cancel)

## Known Limitations / TODOs

- Photo and identity document storage uses base64 in DB — needs cloud storage (S3/R2) for production
- No email notification service connected
- OneSignal web push requires domain configuration in OneSignal dashboard (Settings → Platforms → Web → Site URL: `https://naseebak.com`)
- Account deletion cron needs external scheduler (e.g. cron job on server, Vercel cron, or similar)
