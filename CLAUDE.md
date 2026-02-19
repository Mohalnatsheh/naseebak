# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Naseebak (نصيبك)** is a web-based traditional marriage facilitation platform for Jordan. It is **not** a dating app — there is zero direct communication between users. The platform uses AI-powered matching, admin-mediated family visit coordination, and a freemium suggestion model. The full specification lives in `SRS.md`.

**Current status:** Core platform implemented and deployed to production at **https://naseebak.com**. Auth (phone+OTP for users, email+password for admins), profile management, identity verification, personality quiz, suggestions with sent interest tracking, matches, payments, notifications, admin panel, dynamic blog system, and push notifications (OneSignal) are all functional.

## Commands

```bash
pnpm dev              # Start dev server (Turbopack) on localhost:3000
pnpm build            # Production build (next build)
pnpm test             # Run all tests (vitest run) — 121 tests across 7 files
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
│   │       ├── page.tsx   # Admin dashboard
│   │       ├── users/     # User management
│   │       ├── identity/  # Identity review
│   │       ├── suggestions/ # Manual suggestion management
│   │       ├── visits/    # Visit request management
│   │       └── blog/      # Blog post + category management
│   └── api/               # All API routes
├── components/
│   ├── shared/            # Navbar, DashboardNavbar, AdminSidebar, Footer, etc.
│   └── ui/                # shadcn/ui components (Button, Card, Input, etc.)
├── lib/
│   ├── auth.ts            # NextAuth config (two Credentials providers)
│   ├── auth.config.ts     # Auth callbacks (JWT, session, route protection)
│   ├── db.ts              # Prisma client singleton (PrismaNeon adapter)
│   ├── stripe.ts          # Stripe client singleton (lazy-initialized)
│   ├── onesignal.ts       # OneSignal push notification helpers (server-side)
│   ├── rate-limit.ts      # In-memory rate limiter
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

17 models in `prisma/schema.prisma`: User, Profile, PersonalityResult, ParentInfo, IdentityDoc, Photo, Suggestion, Like, MutualMatch, VisitRequest, Payment, Subscription, Notification, ProfileUpdateRequest, Otp, **BlogCategory**, **BlogPost**.

Key points:
- `User.passwordHash` is optional (`String?`) — set for admin accounts (bcrypt), null for regular users
- `User.phone` stored in international format `962XXXXXXXXX` (not `07...`). `normalizePhone()` in `src/lib/validations/auth.ts` converts any input format to `962...`
- `User.email` is required by NextAuth but populated as `phone_962xx@naseeb.local` for users, real email for admins
- `User.oneSignalPlayerId` stores the push notification player ID
- `Profile` has 35+ fields including location (lat/lng), tribe, preferences (prefAge*, prefCity, etc.), gender-specific fields (beard, hijab)
- `Otp` model stores codes with phone, expiry, and verified status
- `Suggestion` uses `recipientId`/`candidateId` in Prisma code (mapped to `femaleId`/`maleId` DB columns via `@map`). Both genders can be recipient or candidate
- `MutualMatch` keeps `femaleId`/`maleId` columns — assigned dynamically based on actual user genders at creation time
- `ProfileUpdateRequest` stores user-submitted profile edit requests for admin review
- `BlogCategory` has slug, nameAr, nameEn; `BlogPost` has title, slug, excerpt, content (Text), status (DRAFT/PUBLISHED), categoryId, readTime, publishedAt

## API Routes

| Group | Endpoints |
|---|---|
| Auth | `send-otp`, `verify-otp`, `register`, `[...nextauth]`, `logout`, `forgot-password` (410), `reset-password` (410) |
| Identity | `upload` (supports both FormData + JSON/base64), `status` |
| Profile | GET/PUT profile, `parent-info`, `personality-quiz` (20 Qs, 5 dimensions, 3-month retake cooldown), `photos` (max 5), `photos/[id]`, `deactivate`, `update-request` |
| Suggestions | GET list, `[id]/like`, `[id]/reject`, `sent` (GET — sent interest tracking) |
| Matches | GET list (full profile details + compatibility score), `[id]/photos`, `[id]/reveal` (no-op), `[id]/visit-status` |
| Payments | `plans`, `checkout`, `history`, `webhook` |
| Notifications | GET list, `[id]/read`, `read-all`, `unread-count` |
| Push | `register` (POST — save OneSignal player ID) |
| Blog (public) | GET `/api/blog` (list published, filter by `?category=`, `?page=`), GET `/api/blog/[slug]` (single post), GET `/api/blog/categories` (categories with published counts) |
| Admin | `stats`, `identity` review, `suggestions` manual send, `visits` management, `users` + `users/[id]` + `users/[id]/suspend`, `profile-requests` |
| Admin Blog | GET/POST `/api/admin/blog` (list all + create), PUT/DELETE `/api/admin/blog/[id]`, GET/POST `/api/admin/blog/categories`, DELETE `/api/admin/blog/categories/[id]` |

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
1. **Personal Info** — DOB, nationality, city (grid), area (cascading from `jordan-areas.ts`), height, weight, education, job
2. **Lifestyle & Religion** — Marital status, religiosity, smoking, hijab (women), beard (men), cooking ability, driving license
3. **About Me & Preferences** — Bio, partner expectations, hobbies, family values, preferred age/city/education/marital status
4. **Family Info** — Tribe, family origin area, siblings count, housing type, monthly expenses, health conditions
5. **Guardian Info** — Parent/guardian name, phone, relationship, address

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
| VISIT_UPDATE | `/dashboard/matches` |
| PAYMENT | `/dashboard/payments` |
| IDENTITY | `/dashboard/identity` |
| SYSTEM | `/dashboard` |

## Testing

Tests are in `src/__tests__/`. Run with `pnpm test`. **121 tests across 7 files.**
- `validations/auth.test.ts` — OTP schema validation (sendOtp, verifyOtp, login, register) — 38 tests
- `validations/profile.test.ts` — Profile + parent info schema validation — 13 tests
- `validations/blog.test.ts` — Blog post + category schema validation — 19 tests
- `api/matching.test.ts` — Matching workflow domain logic — 19 tests
- `api/plans.test.ts` — Payment plans logic — 3 tests
- `domain-rules.test.ts` — Core domain rule enforcement — 23 tests
- `lib/utils.test.ts` — Utility function tests — 6 tests

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

## Known Limitations / TODOs

- Photo and identity document storage uses base64 in DB — needs cloud storage (S3/R2) for production
- Suggestion algorithm returns mock data — needs Python ML microservice integration
- No email notification service connected
- OneSignal web push requires domain configuration in OneSignal dashboard (Settings → Platforms → Web → Site URL: `https://naseebak.com`)
