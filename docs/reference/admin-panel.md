# Admin panel

Admin pages, moderation, dashboards and reports.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Overview

Pages at `/admin` (incl. new-cycle Matches, Chats, Introductions), mobile-friendly (layout `main` has `min-w-0` so tables scroll inside their card; secondary table columns use `hidden md:table-cell`). Users list shows photo thumbnails + a Photos quick-view dialog. All use `"use client"`, `useState`+`useEffect`, admin auth check. Sidebar in `src/components/shared/admin-sidebar.tsx`. Profile request approval applies all field types (strings, ints, bools, arrays, dates).

## New-cycle admin views

- **New-cycle admin views** (spec `docs/superpowers/specs/2026-10-16-admin-new-cycle-design.md`): with `intro_requests_enabled` on, the dashboard (`/api/admin/stats` → `cycle`) shows intro requests by type/status, active chats, credits spent on requests this week and a registered → introduction-accepted funnel; the sidebar groups Identity Review / Visit Requests / Profile Requests under a collapsed "Legacy" section (layout passes `legacyGrouped`).
- User page loads `GET /api/admin/users/[id]/cycle` (intro requests, chats with message counts and a «View» link to the full history, credit history).
- Account status PENDING is labelled «Unverified» (an active account without an approved ID; only an approved ID makes it VERIFIED).
- Reports show "From chat" via `Report.conversationId` (set by `endConversation`).
- Lazily-expired rows: use `effectiveRequestStatus` / `effectiveConversationStatus` from `src/lib/admin/cycle-stats.ts`.

## Moderation

- **Moderation** (`src/lib/admin/moderation.ts`): `setSuspended()` stores `User.statusBeforeSuspension` and restores it on unsuspend (never blanket VERIFIED), ends the user's active chats and notifies; suspended users get no suggestions, can't send/accept requests or messages, and `requireUser()` rejects their sessions (403).
- `adminEndConversation()` sets `Conversation.endedByAdminId` (status only, never content) — used by the user page, `/admin/chats` and report review (which also records `Report.reviewedById`).
- Admin pages: `/admin/matches`, `/admin/chats` (list + `/admin/chats/[id]` full history), introductions filter by name/phone.
- Hand-picked suggestions are checked server-side (`checkSuggestionPair`: also refuses with 409 a pair that breaks either side's dealbreakers (`mutuallyAcceptable`), an engaged (`isEngaged`) or a flagged person).
- Removing a shared (MUTUAL) suggestion closes it instead of deleting it (PENDING → EXPIRED now, `refundUnansweredInterests` for both; an already-closed one → 409); legacy rows are still deleted.
- Credit top-up can run from Settings (`src/lib/admin/credit-migration.ts`, same marker as the script).
- Credits are edited as a +/- delta with a required reason.
- Admin list routes validate query params (`safePagination`/`enumParam` in `src/lib/admin/query.ts`).

## Credit history

**Credit history:** every change to `matchCredits` must call `recordCredit()` (`src/lib/credits.ts`) → `CreditLedger` row with a `CreditReason` (REGISTRATION, PURCHASE, REQUEST, INTEREST, SUGGESTION, ADMIN_ADJUST, MIGRATION_GIFT, REFUND, REFERRAL, POLL_REWARD). Best-effort outside a transaction client, so a history write never blocks a purchase or request. History starts with this release (no backfill).

## Admin upgrade

- **Admin upgrade (2026-11-05, `47272e6`, live 18:43; admin files only, no app version):** home is **Today** (`TodayPanel`, `GET /api/admin/today`; `?todo=1` = sidebar badges): To do (`src/lib/admin/todo.ts`), numbers «so far» vs **usual by now** (same 7 days, each only up to this Amman hour, `usualByNow`; never scale by the share of the day, members peak in the evening), yesterday and full-day average, and scheduled-job health; all-time totals, funnel and recent activity load only when opened (`/api/admin/stats` reads every member and suggestion).
  - `src/lib/admin/pulse.ts` has `pulseFor`; `FIRST_TRACKED_DAY` = 2026-11-05: `activity_days` held one app member a day before 4 Nov and the website started on the afternoon of 4 Nov, so active-member averages start there (`trackedDays`).
  - Raw SQL must state instants as UTC (`::timestamptz AT TIME ZONE 'UTC'`): production Postgres runs in Europe/Berlin, columns are UTC without a zone.
  - **Inbox** `/admin/inbox` (reports, support, profile changes, contact, oldest first, `?id=` deep links).
  - **Insights** `/admin/insights` (`src/lib/admin/insights.ts`, `GET /api/admin/insights?tab=payments|stuck|supply|reasons|weekly`): notice results (paid within 24 h, by `Payment.updatedAt`), buyers, packages, revenue by sign-up week; stuck lists; men/women by city and age, why-no-suggestions for the 150 most recently active (`memberSuggestStatus` is read-only and must stay in step with `generate`); 7 vs 7 days and 8 weeks.
  - Member tables leave out admins and test phones, so they can be below Payments.
  - **CSV:** `/api/admin/users/export`, `/api/admin/payments/export` (same filters via `src/lib/admin/list-filters.ts`, formula-safe, BOM, logged).
  - Confirmations naming the change: registration, maintenance, Countries, Mobile app (`settings-changes.ts`, `settings-confirm-dialog.tsx`).
  - Admin toasts: sonner `Toaster` in the admin layout; dates: `fmtDate`, `fmtDateTime`, `fmtAgo` (`admin-list-bits.tsx`).
  - **Build cache trap:** a stale webpack cache dropped new Tailwind classes with no error, and `naseebak-deploy` keeps `.next` between runs (rsync excludes it): if new classes are missing, `rm -rf <idle slot>/.next/cache` before deploying (done for `47272e6`; the script itself is unchanged).
  - A clean build fetches Google Fonts, which can fail now and then: run it again, the live site isn't touched.
  - **Checking numbers on production:** bundle a script with the slot's esbuild (`--packages=external --tsconfig=tsconfig.json`), run it as user `naseebak` with `NODE_PATH`, compare with SQL frozen at the same instant.

## Admin additions

- **Admin additions (2026-11-04, website-only):** **Growth & retention** card on the dashboard (`GrowthPanel`, `GET /api/admin/growth`, admin's country): active today / 7 / 30 days of open accounts; sign-up weeks (last 8, Amman, weeks start Saturday) with % women, finished setup, first «مهتم», matched, chatted, paid, active this week; «مهتم» → match / answered per week of the «مهتم», weeks < 14 days old marked «still open».
  - **Payment failure reasons:** `Payment.failureReason` (needs `--db-push`) = `DECLINED:<Stripe decline_code|code>` (a card was refused — wins), `CANCELLED` (member's «رجوع», `/api/payments/cancel`), `EXPIRED` (webhook `checkout.session.expired`, or timed out in history/cancel), `ASYNC_FAILED`, `NOT_PAID` (back-filled older rows: cancel and expiry look the same); `failureReasonFor` (`src/lib/payments/failure.ts`, never throws; labels in `failure-labels.ts` for client code); admin → Payments shows it per row + «Why payments failed · last 30 days».
  - Checkout, status check, fulfil and credits were not changed.
  - **Member page «Devices & notifications»** (`MemberDevicesCard`, `GET /api/admin/users/[id]/devices`): last device + recent days (`activity_days`), app sign-ins and app push devices, website push live from OneSignal (on/off/can't check), notification types turned off; «Credits» (add/remove with a required reason, ledger `ADMIN_ADJUST`) already existed.
  - **Members list «Uses» (2026-11-04):** `/admin/users` shows App · Android / iPhone (signed in to the app at least once: platform from `activity_days`, else the push device, else «device unknown») and Web · Android / iPhone / Computer (`activity_days` since 4 Nov; «Web» alone = website before that), plus a filter `?uses=app|web` (app sign-in or none).
  - **Popup counts:** «Seen» = `alert_views` row (alertId, userId, platform) written when `currentAlertFor` hands a popup out (website and app, no app change); `alert_dismissals.action` = TAPPED / CLOSED from the website popup; the app sends none (null → "App or earlier (closed or tapped)"); admin → Popup Alerts shows Seen · Tapped · Closed · % tapped.
- **Admin → «Active by device» (2026-11-04):** dashboard card (`ActiveDevicesPanel`, `GET /api/admin/activity-devices`, admin's country): distinct members per source — website on Android / iPhone / computer (user agent), app on Android / iPhone (`X-App-Platform` header from app builds after 1.0.0, else the sign-in's push device platform, else `APP_OTHER`) — today / yesterday / 7 / 30 days / all time, registered vs seen vs not seen, last 14 days.
  - Table `activity_days` (userId, Amman day, source; needs `--db-push`), written by `recordActivityDay` (`src/lib/activity-days.ts`) from `/api/me/counts`, `/api/suggestions`, `/api/mobile/me`, once per member/day/source (in-memory set, one PM2 process).
  - Website history starts 2026-11-04; app history back-filled once by `scripts/backfill-app-activity.sql`.
- **Admin → Referrals (2026-11-03):** `/admin/referrals` (`GET /api/admin/referrals`, filtered by the new member's country; `?referrer=<userId>` = one inviter's) lists sign-ups from invitation links with totals (invited, rewarded, waiting for setup, inviters) and the top 5 inviters; a member's admin page shows «Invited by» and «Invited: N members». Read-only, from the `referrals` table.
- **QA round 2 (2026-11-11):** one `ConfirmDialog` (`useConfirm`, no `window.confirm`; a second confirm cancels the first), `AdminLoadError` with retry and no fake values on every page (Polls and Settings lock their saves until the real settings load), `<bdi>` around names, «Close» on dialogs. **Generate All** is a background run of at most `WEEKLY_SUGGEST_LIMIT` (600, `src/lib/cron/suggest-limit.ts`) members, most recently active first: `POST /api/admin/suggestions/generate` answers 202 (409 while one runs) and `GET` the job's progress, polled every 2 s. Hand-picked suggestions check the suggestion gate for both people (`recipientReady`). The chat detail pages from the server (`?limit=`, `?before=<messageId>`, `hasMore`/`nextBefore`) with a «Reported message» chip. Countries: readiness checklist first, long form in collapsible sections. Sign-in limits and removing an admin: `member-rules.md` → Auth.
