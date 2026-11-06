# Local development

Everything about running and testing the site on a Mac.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Local notes

- Local DB: Postgres 17 via Homebrew (`brew services start postgresql@17`, database `naseeb_push`, see Local setup); `node prisma/seed.mjs` seeds users (test phones `0777000001` / `0777000002` → OTP `111111`). `prisma/seed-blog.sql` is stale (missing `categoryId`).
- Other phones: with `SMS_MOCK=true` the code is in `GET /api/dev/sms-outbox`; without the mock or working SMS, `send-otp` returns 502 and deletes the code — use the test phones above (or add yours to `EXTRA_TEST_PHONES`). The local `.env.development.local` has `EXTRA_TEST_PHONES=0790000777` for a fresh-signup test (code `111111`); the local account «تجربة» uses it.
- Run the dev server on port 3020: `AUTH_URL` in `.env.development.local` is `http://localhost:3020`, so sign-out on another port redirects there. If pnpm isn't 10.24 locally, use `npx pnpm@10.24.0 …`.
- Local switches: all four new-cycle switches are on in the local DB (`credit_on_interest` turned on 2026-10-18 so local screens match production).
- OTP limits are in Postgres now (`rate_limit_buckets`), so repeated scripted logins with one test phone hit "send 3/phone/5min" and land on the login page: reuse a saved browser session, switch to the other test phone, or `delete from rate_limit_buckets;` locally.
- **Dev is Turbopack, production is webpack** (`pnpm build` = `next build --webpack`, same as the server): the minifier drops top-level `const` helpers named with legacy reserved words (`short`, `long`, `int`, `float`, `char`, `byte`…) and the page then crashes with "X is not defined" only in production (2026-10-19, G68). Never use those names; after touching code that client pages import at module load (validation schemas, option tables), grep `.next/static/chunks` for the helper or load the page with `npx next start -p 3100`.
- `pnpm lint` = `eslint .` (flat config; React Compiler rules are warnings). **0 problems** (errors and warnings, cleaned 2026-10-18) — fix new ones properly (derive state in render, `useEffectEvent`, `useSyncExternalStore` for localStorage/device reads); a targeted `eslint-disable-next-line <rule> -- <reason>` only for blob:/data: image previews. Also run `tsc --noEmit` + `npx vitest run`. `pnpm build` has no warnings (Ably is in `serverExternalPackages` in `next.config.ts`).
- Docker: `docker compose up -d --build` → http://localhost:3001 (app + Postgres 17, reads `.env`, seeds once, turns 3 new-cycle switches on, not `credit_on_interest`, runs the credit top-up). `docker compose down -v` resets the DB.
- Digits: Western (0-9) everywhere; format dates with `"ar-JO-u-nu-latn"`. Inputs accept Arabic-Indic/Persian digits: phone and OTP fields and their schemas convert with `toLatinDigits()` (`src/lib/digits.ts`).
- Admin enum labels: `src/lib/admin/enum-labels.ts` (English). Suggestion & match cards share `src/components/shared/person-card.tsx`.
- `node scripts/score-distribution.ts` (read-only; `DATABASE_URL=… ` to target another DB): compatibility score buckets for all eligible pairs and how many users would have 0 candidates per minimum score — run it on a prod copy before changing the minimum
- Switches for local testing: `system_settings` keys `intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, `credit_on_interest` (or Admin → Settings); 30s cache.
- Tests mock the DB with `vi.hoisted()` + `vi.mock("@/lib/db")` (see `src/__tests__/intro/requests.test.ts`); mock `@/lib/settings` for switch-dependent code and `$transaction` as `fn => fn(db)`.
- Parallel sessions sharing this checkout: stage files by path (never `git add -A`) and don't switch branches; prefer separate `git worktree`s.

## Browser QA

- **Local browser QA (2026-11-04):** Playwright against `next dev` can get truncated chunks (`ERR_CONTENT_LENGTH_MISMATCH`, «Invalid or unexpected token») and the page reloads before hydration, so taps do a native form submit — test real flows on a production build instead: `set -a; . ./.env.development.local; set +a; NODE_ENV=production pnpm build` (retry once if `next/font` fails), then `npx next start -p 3030` with `NEXT_PUBLIC_APP_URL=http://localhost:3030` (`SMS_MOCK=true`; codes from `GET /api/dev/sms-outbox`).
  - The desktop app's preview tool can't read `.env.development.local` in ~/Documents, so start it from a shell.
  - `~/Desktop/Evokey-APPS/Naseebak/.claude/launch.json` has `naseebak-docs-dev` (port 3020) for this repo.

## Local setup

- **Local setup:** database `naseeb_push` on localhost:5432 (Homebrew Postgres; the older `naseeb_mobile` on 5434 is no longer used), dev server `next dev -p 3020`; git-ignored `.env.development.local` / `.env.production.local` override `.env` / `.env.local` (Neon + real SMS) — always pass `DATABASE_URL` explicitly to Prisma CLI commands here. Local sign-up codes: `GET /api/dev/sms-outbox` (newest first). The app talks to production unless built with `--dart-define=API_BASE_URL=http://10.0.2.2:3020` (Android emulator) — never test against production by accident.
