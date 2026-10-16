# نصيبك — Naseebak

Marriage facilitation platform for Jordan (Arabic RTL site + English admin panel). Live at https://naseebak.com.

**Stack:** Next.js 16 · React 19 · Prisma 7 + PostgreSQL · NextAuth 5 (phone + OTP, admin email/password) · Tailwind v4 + shadcn/ui · Ably (chat) · OneSignal (push) · Stripe (JOD) · Vitest · pnpm 10.24

Detailed rules, architecture and gotchas live in [`CLAUDE.md`](CLAUDE.md). Product specs: [`SRS.md`](SRS.md) and `docs/superpowers/specs/`.

## Run locally with Docker (everything on)

```bash
cp .env.example .env        # fill in what you have; ABLY_API_KEY enables live chat
docker compose up -d --build
```

Open http://localhost:3001. The container syncs the schema, seeds demo data once, turns the new-cycle switches on and runs the hourly scheduler. `docker compose down -v` resets the database.

Test accounts (local only): admin `admin@naseeb.jo` / `Admin123!` at `/admin/login`; users `0777000001`, `0777000002`, `0796922292` with OTP `111111`.

## Run locally without Docker

```bash
pnpm install
pnpm db:push && node prisma/seed.mjs   # needs DATABASE_URL in .env
pnpm dev                                # http://localhost:3000
```

## Checks

```bash
pnpm test          # vitest
pnpm lint          # eslint (0 errors expected)
pnpm build         # production build — run it before shipping UI work
```

## Feature switches (Admin → Settings)

| Switch | What it does |
|---|---|
| `intro_requests_enabled` | New cycle: family / chat requests after a match, no admin visits |
| `chat_enabled` | In-app chat (Ably) |
| `new_suggestions_flow` | Shared suggestions: both people decide on the same suggestion |
| `credit_on_interest` | Each «مهتم» costs 1 credit; match, requests and chat are free; 5 open suggestions, best first |

All default to off; off = previous behaviour. Deploy order: back up DB → `pnpm db:push` → deploy → switches one at a time (see `CLAUDE.md`).

## Daily scheduler

`GET|POST /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` — reminders, expiries, suggestions, re-engagement, account deletions. In production add a crontab line (see `CLAUDE.md` → "Last Activity & Daily Scheduler").
