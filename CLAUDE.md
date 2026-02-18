# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Naseeb (نصيب)** is a web-based traditional marriage facilitation platform for Jordan. It is **not** a dating app — there is zero direct communication between users. The platform uses AI-powered matching, admin-mediated family visit coordination, and a freemium suggestion model. The full specification lives in `SRS.md`.

**Current status:** Core platform implemented. Auth (phone+OTP for users, email+password for admins), profile management, identity verification, personality quiz, suggestions, matches, payments, notifications, admin panel, and dynamic blog system are all functional.

## Commands

```bash
pnpm dev              # Start dev server (Turbopack) on localhost:3000
pnpm build            # Production build (next build)
pnpm test             # Run all tests (vitest run) — 108 tests across 7 files
pnpm test:watch       # Run tests in watch mode
pnpm db:generate      # Regenerate Prisma client after schema changes
pnpm db:push          # Push schema changes to database
pnpm db:studio        # Open Prisma Studio GUI
```

**Important:** After changing `prisma/schema.prisma`, run `pnpm db:push && pnpm db:generate`. If the dev server shows stale Prisma errors (e.g. model not found), clear cache and restart: `rm -rf .next && pnpm dev`.

## Technology Stack

- **Runtime:** Next.js 16.1.6 (Turbopack), React 19, Node.js
- **Styling:** Tailwind CSS v4 with oklch color system
- **Database:** PostgreSQL (Neon serverless) + Prisma 7.4 ORM with `@prisma/adapter-neon`
- **Auth:** NextAuth.js 5 (beta.30) — dual auth: phone+OTP for users, email+password for admins
- **Password Hashing:** bcryptjs 3.0
- **Validation:** Zod v4 (`zod/v4` import path)
- **UI Components:** shadcn/ui (Radix primitives)
- **Icons:** lucide-react
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
│   │       ├── suggestions/       # View/accept/reject suggestions
│   │       ├── matches/           # Mutual matches + photos + visits
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
- `src/app/api/auth/send-otp/route.ts` — OTP generation (6-digit, 5-min expiry, rate limited 3/5min), returns `userExists`
- `src/app/api/auth/verify-otp/route.ts` — OTP verification
- `src/app/api/auth/register/route.ts` — Registration (verifies OTP, creates user)
- `src/app/(en)/admin/login/page.tsx` — Admin login page (email+password)
- `src/app/(en)/admin/login/layout.tsx` — Admin login layout (no sidebar)
- Forgot/reset password routes return 410 (not supported)

## Database Schema

17 models in `prisma/schema.prisma`: User, Profile, PersonalityResult, ParentInfo, IdentityDoc, Photo, Suggestion, Like, MutualMatch, VisitRequest, Payment, Subscription, Notification, ProfileUpdateRequest, Otp, **BlogCategory**, **BlogPost**.

Key points:
- `User.passwordHash` is optional (`String?`) — set for admin accounts (bcrypt), null for regular users
- `User.email` is required by NextAuth but populated as `phone_07xx@naseeb.local` for users, real email for admins
- `Profile` has 35+ fields including location (lat/lng), tribe, preferences (prefAge*, prefCity, etc.), gender-specific fields (beard, hijab)
- `Otp` model stores codes with phone, expiry, and verified status
- `ProfileUpdateRequest` stores user-submitted profile edit requests for admin review
- `BlogCategory` has slug, nameAr, nameEn; `BlogPost` has title, slug, excerpt, content (Text), status (DRAFT/PUBLISHED), categoryId, readTime, publishedAt

## API Routes

| Group | Endpoints |
|---|---|
| Auth | `send-otp`, `verify-otp`, `register`, `[...nextauth]`, `logout`, `forgot-password` (410), `reset-password` (410) |
| Identity | `upload` (supports both FormData + JSON/base64), `status` |
| Profile | GET/PUT profile, `parent-info`, `personality-quiz` (20 Qs, 5 dimensions, 3-month retake cooldown), `photos` (max 5), `photos/[id]`, `deactivate`, `update-request` |
| Suggestions | GET list, `[id]/like`, `[id]/reject` |
| Matches | GET list, `[id]/photos`, `[id]/reveal`, `[id]/visit-status` |
| Payments | `plans`, `checkout`, `history`, `webhook` |
| Notifications | GET list, `[id]/read`, `read-all` |
| Blog (public) | GET `/api/blog` (list published, filter by `?category=`, `?page=`), GET `/api/blog/[slug]` (single post), GET `/api/blog/categories` (categories with published counts) |
| Admin | `stats`, `identity` review, `suggestions` manual send, `visits` management, `users` + `users/[id]` + `users/[id]/suspend`, `profile-requests` |
| Admin Blog | GET/POST `/api/admin/blog` (list all + create), PUT/DELETE `/api/admin/blog/[id]`, GET/POST `/api/admin/blog/categories`, DELETE `/api/admin/blog/categories/[id]` |

## Branding & Colors

The color palette is **deep blue + warm gold** using oklch values in `globals.css`:
- **Primary:** Deep blue `oklch(0.35 0.08 250)`
- **Secondary:** Muted blue `oklch(0.45 0.06 250)`
- **Accent:** Warm gold `oklch(0.72 0.12 75)`

Green/emerald is used **only** for semantic success states (verified badges, completed payments, approved identity). Never use green for branding or decorative elements.

## Critical Domain Rules

These are hard constraints that must never be violated:

- **No messaging/chat/communication** between users — ever
- **Photos are hidden** until both users mutually like each other
- **Only female users receive suggestions**; males only respond to interest notifications
- **Identity verification** (government ID upload + admin review) is mandatory before platform usage
- **Parent/guardian data** is visible to admin only, never to the other user
- **Free tier:** 5 lifetime suggestions per account; paid packages/subscriptions for more
- **No pricing on landing page** — packages are only visible in the dashboard payments section
- **Suggestion cards** show only: first name, age, city, education, job, compatibility %

## Matching Workflow

```
Female receives suggestion → accepts/rejects (no photos) →
  if accepted: male gets notified → accepts/rejects (no photos) →
    if mutual like: photos revealed + visit request created →
      admin contacts families → arranges in-person visit
```

## Profile Setup (5 Steps)

The profile wizard (`dashboard/profile/setup`) has 5 steps:
1. **Personal Info** — DOB, nationality, city (grid), area (cascading from `jordan-areas.ts`), height, weight, education, job
2. **Lifestyle & Religion** — Marital status, religiosity, smoking, hijab (women), beard (men), cooking ability, driving license
3. **About Me & Preferences** — Bio, partner expectations, hobbies, family values, preferred age/city/education/marital status
4. **Family Info** — Tribe, family origin area, siblings count, housing type, monthly expenses, health conditions
5. **Guardian Info** — Parent/guardian name, phone, relationship, address

## Testing

Tests are in `src/__tests__/`. Run with `pnpm test`.
- `validations/auth.test.ts` — OTP schema validation (sendOtp, verifyOtp, login, register) — 24 tests
- `validations/profile.test.ts` — Profile + parent info schema validation — 13 tests
- `validations/blog.test.ts` — Blog post + category schema validation — 19 tests
- `api/matching.test.ts` — Matching workflow domain logic — 20 tests
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

## Known Limitations / TODOs

- OTP is returned in API response (mock/dev mode) — needs SMS gateway integration for production
- Photo and identity document storage uses base64 in DB — needs cloud storage (S3/R2) for production
- Payment checkout is simulated — needs real Stripe/PayPal/eFAWATEERcom integration
- Suggestion algorithm returns mock data — needs Python ML microservice integration
- No email notification service connected
