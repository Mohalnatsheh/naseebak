# Operations

Server, cron, backups, Nginx, images and performance. Deploy steps are in `CLAUDE.md`.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Server

- **Server (since 2026-10-17):** VPS `146.103.57.224` (Ubuntu), domain `naseebak.com`, Let's Encrypt, Nginx → the live slot's port, PM2 **fork mode** (`pm2-naseebak` unit, user `naseebak`), local PostgreSQL (db `naseeb`, migrated from Neon).
- SSH with the deploy key only: `ssh -i ~/.ssh/naseebak_vps_ed25519 -o IdentitiesOnly=yes root@146.103.57.224`.
- Env in `/var/www/naseebak/.env` (`NEXT_PUBLIC_*` need a rebuild).
- Cron `/etc/cron.d/naseebak` (`CRON_TZ=Asia/Amman`): daily job in two parts since 2026-11-04 — `naseebak-daily-job morning` at 06:00 (expiry, refunds, new suggestions, chats, deletions, payments, clean-up; no pushes) and `naseebak-daily-job evening` at 18:00, the online peak (introReminders, suggestionReminders, waitingInterestReminders «شخص ينتظر ردّك», guardian share, family follow-ups, re-engagement); the script calls `/api/cron/daily?part=…` (no part = all, as Admin «Run now»); the evening summary is stored in `cron_daily_last_run_evening`.
- Since 2026-11-05 also `*/15 * * * * naseebak-daily-job frequent` (part `frequent`: only the unpaid-checkout reminder, summary in `cron_daily_last_run_frequent`; cron file backed up in `/root/backups/cron-naseebak-*.bak`).
- DB backup 03:30 (`/usr/local/bin/naseebak-db-backup`): kept in `/root/backups` for 14 days, plus a gpg AES-256 copy uploaded to the Bunny storage zone in the folder named in `/root/.naseebak-backup-dir` (14 days; passphrase in `/root/.naseebak-backup-pass`, which must also be kept off the server); log `/var/log/naseebak/backup.log`.
- Nginx (2026-10-19, backup of the old site file in `/root/backups/nginx-naseebak-20261019-1620.conf`): `/_next/static/` (1 year, immutable), `/images/` and favicon / apple-touch-icon / `site.webmanifest` (7 days) are served from disk by Nginx, not Node; `OneSignalSDKWorker.js` stays with Node (never long-cached).
- Upstream `naseebak_app` keeps 32 keep-alive connections to Node. naseebak has its own access log `/var/log/nginx/naseebak.access.log` (format `naseebak_timed`: `rt=` whole request, `urt=` Node time) — the shared `access.log` is shabaah's.
- PM2 stays one fork process on purpose: in-process state (`pairsInFlight`/`inFlight` in auto-suggest, chat/contact rate limits in memory, chat push throttle) assumes a single process; Node uses ~25% of one core.
- Hardening: ufw (SSH + Nginx only), fail2ban on SSH, `server_tokens off`, gzip, security headers (HSTS, nosniff, X-Frame-Options, Referrer/Permissions-Policy), `X-Powered-By` hidden; Postgres localhost-only with scram and tuned memory (shared_buffers 4GB).
- SSH password login is still on (owner's choice).

## App push credentials and env

**App push:** `FCM_CREDENTIALS` in `/var/www/naseebak/.env` (Firebase service-account JSON, one line; set on production 2026-10-31, the previous `.env` is in `/root/backups/naseebak-env-before-fcm-*.bak`); without it app push is silently off. A change to `.env` needs `sudo -u naseebak pm2 restart naseebak-a --update-env` (or `naseebak-b`, whichever slot is live).

## Deploy hiccups

**Deploy hiccup:** a build that fails in `next/font` ("Cannot read properties of null (reading '1')") is a bad Google Fonts response during the build — the live site is untouched; run the deploy again. Before a `--db-push`, check what it will run: copy the schema to the server and run `npx prisma migrate diff --from-config-datasource --to-schema <file> --script` in `/var/www/naseebak` with `.env` loaded (read-only).

## Performance

- **Performance (audit 2026-11-02, notes in the commits `f16d607`, `cb7e520`):** rank routes from the nginx log (`urt=` per route, ids grouped); the hot ones are the 30s dashboard poll (`/api/me/counts` + `/api/notifications/unread-count`, ~190k calls each per 2 weeks) and `/api/suggestions/feed`.
- `pg_stat_statements` is not installed (needs a Postgres restart) — use read-only `EXPLAIN (ANALYZE, BUFFERS)` through `psql -f -` with SQL piped over ssh.
- Any "rows where I'm the candidate" query (`Suggestion.candidateId` = column `maleId`) needs `@@index([candidateId])`: the unique index leads with `recipientId`, and without it each lookup was a whole-index skip scan (6–10ms).
- Also indexed: `photos(userId)`, `mutual_matches(maleId)`, `blocks(blockedId)`.
- Chat send doesn't wait for the bell entry or the push (`void upsertChatBell` / `void notify`; one long-running process).
- `/api/suggestions/feed?count=1` returns only `total` (slim select, no cards): the suggestions page uses it for the two tabs not shown; the app never sends it.
- `countNewItems` uses `countMutualTabs` with credit on interest.
- The daily job logs each task's time (`[cron] task <name>: <ms>ms` in `out.log`, `out-0.log` before 5 Nov); a run takes 47–60s and `naseebak-daily-job` goes through nginx (`proxy_read_timeout 60s`), so curl can log a 504 while the job finishes in Node — point the script at `127.0.0.1:3000` or raise the timeout for `/api/cron/` (not done, needs the owner's OK).
- **Caching (2026-11-11, PA-L6, `next.config.ts` `headers()`):** every `/api/*` answer is `private, no-store` unless it is one of the public routes that set their own (countries, registration status, tracking, blog, public stats); `headers()` overrides a route's own header, so those are left out of the default. The blog and public stats cache briefly only on success (`src/lib/public-cache.ts`). `/images/*`: a week, revalidated in the background.
- **First load (PA-M1, PA-L11):** the dashboard layout preloads its first API calls while the HTML parses; nav links no longer prefetch every route; the Google tag and Tawk load when the browser is idle after load; Stripe.js loads only on pages with a checkout; the (ar) 404 is server-only (it used to ship the landing's client code to every dashboard page).
- Still slow but left: `/api/auth/send-otp` (Broadnet SMS, ~1.5s), `/api/admin/stats` (loads every suggestion row, admin only), weekly suggestions in the daily job (each `autoSuggestForUser` reloads the candidate pool).

## App path and logs

**App path:** `/var/www/naseebak` (symlink to the live slot) | **Logs:** `/var/log/naseebak/` (`out.log`, `error.log` since 5 Nov; `out-0.log`, `error-0.log` before)
Production logs: `/var/log/naseebak/out.log` and `error.log` (PM2, since the zero-downtime deploy of 5 Nov 2026; `out-0.log` / `error-0.log` before). `src/instrumentation.ts` turns Error objects into text so Prisma errors are readable there.

## Scheduler

- **Scheduler:** `GET|POST /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` (401 otherwise; `isCronAuthorized` in `src/lib/cron/auth.ts`) runs `runDailyJobs()` (`src/lib/cron/daily.ts`).
  - Tasks in `src/lib/cron/*`, each isolated and idempotent (claim a marker with a conditional `updateMany` before notifying): intro requests expire + sender notice once (`IntroRequest.expiryNotifiedAt`, only for requests expired in the last 3 days, no refund) and a receiver reminder at ≤2 days (`IntroRequest.reminderSentAt`); MUTUAL suggestions expire (+ unanswered-«مهتم» refunds; rows one side declined → REJECTED) + one reminder to the undecided side(s) at ≤2 days (`Suggestion.reminderSentAt`; one per person per run and per Amman day, `oncePerDay: "waiting-decision"`, skipped when they already got «اقتراح بانتظار قرارك» or «شخص أبدى اهتمامه بك» that day); all due chats go through the same housekeeping as the lazy path (`chatHousekeepingAll`); weekly suggestions via `autoSuggestForUser` for active, eligible users under the cap (per-request mode only, 150 per run; with `credit_on_interest` it tops up to 10 open for users with fewer); re-engagement push for users idle 7–30 days with something waiting (`User.reengagedAt`, once per 7 days); guardian-share reminders and family follow-ups (`src/lib/intro/followup.ts`); `healMissingMatches` (both said «مهتم» but the match wasn't created; oldest first, left/suspended people filtered in the query, pages past matched/blocked pairs); `cancelClosedLegacyVisits` (REQUESTED visits whose match closed, and with `intro_requests_enabled` any REQUESTED visit untouched for 30 days, `LEGACY_VISIT_STALE_DAYS`); account deletions (`processAccountDeletions`); Stripe reconcile; rate-limit clean-up.
  - A failed task emails the admins (`alertFailedTasks` → `sendAdminAlert`).
  - The summary is stored in `SystemSetting` `cron_daily_last_run` and shown in Admin → Settings → Daily jobs ("Run now" = `POST /api/admin/cron/run`)
- **Local:** the `scheduler` service in `docker-compose.yml` calls it 60s after start and then every `CRON_INTERVAL_SECONDS` (3600 in compose, default 86400; secret `local-cron-secret`)
- **Production:** set up — `/etc/cron.d/naseebak` runs `/usr/local/bin/naseebak-daily-job` with `morning` (06:00), `evening` (18:00) and `frequent` (every 15 minutes), Amman time (reads `CRON_SECRET` from the app's `.env`, appends to `/var/log/naseebak/cron.log`)

## Image storage (Bunny.net CDN)

All uploads stored on Bunny.net, served via `https://cdn.naseebak.com`. Key file: `src/lib/bunny.ts`.

```
naseebak/{photos,identity,avatars}/{userId}/...
```

Env vars: `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE` (`naseebak`), `BUNNY_STORAGE_ENDPOINT` (`storage.bunnycdn.com`), `BUNNY_CDN_URL` (`https://cdn.naseebak.com`). `next.config.ts` includes `cdn.naseebak.com` in `images.remotePatterns`.
