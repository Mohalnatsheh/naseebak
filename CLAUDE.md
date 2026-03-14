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

Next.js 16.1.6 (Turbopack), React 19, Node 22 | Tailwind CSS v4 (oklch) | PostgreSQL (Neon) + Prisma 7.4 (`@prisma/adapter-neon`) | NextAuth.js 5 (beta.30) | Zod v4 (`zod/v4` import) | shadcn/ui + lucide-react | Stripe Checkout (JOD) | OneSignal push | Vitest | pnpm 10.24

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

- **No messaging/chat/communication** between users — ever
- **Photos hidden** until mutual like
- **Gender-neutral access** — same workflow for all users
- **Identity verification** (gov ID + admin review) mandatory before platform usage
- **100% profile completeness required** for suggestions (enforced with alert banners)
- **Parent/guardian data** visible to admin only, never to other users
- **Free tier:** 5 lifetime suggestions; paid packages for more
- **No credit gate on matches** — mutual match details always fully visible
- **No pricing on landing page** — packages only in dashboard payments
- **Suggestion/match cards** show full expandable profile details

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

22 models in `prisma/schema.prisma`. Key points:
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

### Suggestions Page (3 Tabs)

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

Credentials: user=`naseebak6`, pass=`954N@LtoK`, sid=`naseebak`

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

Weighted scoring in `src/lib/matching/score.ts`: Preference match (50%), Personality similarity (30% — cosine on 5D vectors, redistributed if no quiz), Profile quality (20%). Admin generate creates top-3 per user (score >= 30).

## Notification Routing

| Type | Route |
|---|---|
| SUGGESTION, INTEREST | `/dashboard/suggestions` |
| MATCH, VISIT_UPDATE | `/dashboard/matches` |
| PAYMENT | `/dashboard/payments` |
| IDENTITY | `/dashboard/identity` |
| SUPPORT | `/dashboard/support` |
| SYSTEM | `/dashboard` |

## Dashboard Data Context

`DashboardDataProvider` in dashboard layout deduplicates API calls. Provides `profile`, `completeness`, `unreadCount`. Polls unread every 30s. Listens for `naseeb:notifications-read` custom DOM event for instant badge updates.

## Profile Completeness Weights

| Section | Weight |
|---------|--------|
| Identity verification | 15% |
| Basic info (10 fields) | 30% |
| Preferences (7 fields) | 20% |
| Personality quiz | 15% |
| Photos (≥1) | 10% |
| Family & Guardian | 10% |

## Admin Panel

14 pages at `/admin`. All use `"use client"`, `useState`+`useEffect`, admin auth check. Sidebar in `src/components/shared/admin-sidebar.tsx`. Profile request approval applies all field types (strings, ints, bools, arrays, dates).

## Registration Toggle

`SystemSetting` key `registration_open`. Default: open (fail-open on error). When closed: banner on landing pages, register page shows alert, `send-otp` blocks new phones, `register` returns 403.

## Known Limitations

- No email notification service
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
