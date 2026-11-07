# CLAUDE.md

Rules for working on Naseebak (نصيبك). This file holds what you need in every session.

- Long detail by area: [docs/reference/](docs/reference/README.md)
- Dated history, past deploys and audit notes: [docs/project-history.md](docs/project-history.md)
- Open work: [docs/platform-review-2026-11-06.md](docs/platform-review-2026-11-06.md)
- Mobile app rules: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md)

## Working rules

- The repo is `~/Documents/EvoKey-Projects/naseebak` (website + `naseebak_app/`).
- `~/Desktop/Evokey-APPS/Naseebak/naseebak` is a stale checkout. Never work or deploy from it.
- Plans go through Superpowers: `superpowers:brainstorming` for a new feature or refactor, then `superpowers:writing-plans`. No ad-hoc plans.
- This is a live site with real members: keep changes additive and behind a switch when they change behaviour.
- Every schema change must be additive.
- Ask the owner before each deploy.
- Before building, tell the owner if a change needs a new app version ([list](#what-needs-an-app-version)).
- Parallel sessions may share this checkout: stage files by path, never `git add -A`, and don't switch branches. Prefer a separate `git worktree`.
- Never run the seed against production.

## Project overview

- Traditional marriage facilitation platform for Jordan and Saudi Arabia. **Not** a dating app.
- Production: https://naseebak.com. Full spec: `SRS.md` (parts superseded). Specs: `docs/superpowers/specs/`. QA notes: `docs/qa/`.
- Flow map and gaps register: `docs/platform-flow.html` (some numbers are older than the code; update it when a flow changes).
- The cycle: free shared suggestions → both say «مهتم» → match → family introduction or a short filtered in-app chat. No admin work.
- Each «مهتم» costs 1 credit. The match, requests and chat are free.
- Four switches run it, all **on** in production since 2026-10-17: `intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, `credit_on_interest`.
- All four default to off. Off = the [legacy flow](#legacy-flow).
- Two more switches, both **on** in production since 2026-11-07, both off by default: `feed_active_first` (the «جديدة» order, Admin → Settings) and `sms_notices_enabled` (notice SMS, set in `system_settings`: no admin button yet, Admin → Notifications → Automatic only shows it).

## Commands

```bash
pnpm dev -p 3020                  # Dev server (Turbopack). Local AUTH_URL is http://localhost:3020
pnpm build                        # next build --webpack, same as the server
pnpm test                         # All tests (vitest run)
pnpm test:watch                   # Tests in watch mode
npx vitest run src/__tests__/suggestions/slots.test.ts   # One test file
pnpm lint                         # eslint . (must stay at 0 problems)
npx tsc --noEmit                  # Type check
pnpm db:generate                  # Regenerate the Prisma client
pnpm db:push                      # Push the schema to the database
pnpm db:studio                    # Prisma Studio
node prisma/seed.mjs              # Seed local test users
```

```bash
# Before calling work done
pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build
```

```bash
# After changing prisma/schema.prisma (pass DATABASE_URL explicitly in this checkout)
DATABASE_URL=postgresql://<user>@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate

# Stale Prisma errors
rm -rf .next && pnpm dev -p 3020
```

```bash
# Real-flow QA: use a production build (Playwright against next dev gets truncated chunks)
set -a; . ./.env.development.local; set +a
NODE_ENV=production pnpm build
NEXT_PUBLIC_APP_URL=http://localhost:3030 npx next start -p 3030
```

```bash
docker compose up -d --build      # http://localhost:3001, app + Postgres 17
docker compose down -v            # Reset the Docker database
node scripts/score-distribution.ts   # Read-only score buckets. Run on a prod copy before changing the minimum
```

## Local development

- Database: `naseeb_push` on localhost:5432 (Homebrew Postgres).
- Env: git-ignored `.env.development.local`. It sets port 3020, `SMS_MOCK`, `PAYMENTS_MOCK` and `UPLOADS_LOCAL`.
- Test logins: `0777000001`, `0777000002` with code `111111`.
- Fresh sign-up test: the number in `EXTRA_TEST_PHONES` in `.env.development.local`, code `111111`.
- Other numbers: read the code from `GET /api/dev/sms-outbox` (newest first).
- OTP limits live in Postgres. If scripted logins land on the login page, switch test phone or run `delete from rate_limit_buckets;` locally.
- Switches: `system_settings`, or Admin → Settings. All four are on locally. They are cached for 30s.
- Local payments: `PAYMENTS_MOCK=true`, `/api/dev/mock-checkout/[id]`. Local photos: `.dev-uploads/`.
- Tests mock the DB with `vi.hoisted()` + `vi.mock("@/lib/db")`; mock `$transaction` as `fn => fn(db)`. Example: `src/__tests__/intro/requests.test.ts`.
- Local app runs: `--dart-define=API_BASE_URL=http://10.0.2.2:3020`. Every app build defaults to production.
- More: [docs/reference/local-development.md](docs/reference/local-development.md), `docs/local-testing.md`.

## Tech stack

- Next.js 16.1.6, React 19, Node 22, pnpm 10.24 (dev Turbopack, production webpack)
- Tailwind CSS v4 (oklch), shadcn/ui, lucide-react
- PostgreSQL, Prisma 7.4 (`@prisma/adapter-pg`), 41 models
- NextAuth.js 5 beta.30, Zod v4 (import from `zod/v4`)
- Stripe, Ably (chat), OneSignal (website push), Firebase Cloud Messaging (app push)
- Vitest. Flutter app in `naseebak_app/`

## Architecture

```
src/
├── app/
│   ├── (ar)/         # Arabic RTL: public pages, register, login, dashboard, /pay
│   ├── (en)/admin/   # English LTR admin panel
│   └── api/          # All API routes
├── components/       # shared, ui, landing, dashboard, suggestions, matches, intro, chat,
│                     # payments, profile, blog, engagement, admin
├── contexts/         # dashboard-context (profile, counts, unread)
├── hooks/            # use-auto-save, use-in-view
├── lib/              # auth, db, settings, notify, credits, sms, stripe, bunny, activity
│   ├── suggestions/  # mutual (decide, slots), feed, refresh, dealbreaker-sweep
│   ├── matching/     # score, auto-suggest (generate), reasons, filter-tip
│   ├── intro/        # match, requests, outcome, followup
│   ├── matches/      # state, leave, links
│   ├── chat/         # service, filter
│   ├── cron/         # daily and its tasks
│   ├── payments/     # packages, fulfil, intent, refund, checkout-branding
│   ├── countries/    # fixed facts + admin settings
│   ├── notifications/ # automatic (the list of automatic messages)
│   ├── engagement/   # polls
│   └── admin/        # stats, insights, members-suggest-reason, moderation
└── proxy.ts          # Next 16 name for middleware
```

- Route protection: `src/lib/auth.config.ts`, run by `src/proxy.ts`. `/admin/*` needs admin, `/dashboard/*` needs sign-in.
- `src/lib/settings.ts` reads `system_settings` with a 30s cache.
- `DashboardDataProvider` shares `profile`, `counts` and unread data, polling `/api/me/counts` every 30s while the tab is visible.
- Member cards share `src/components/shared/person-card.tsx`.
- `src/lib/auth.ts`: `requireUser()` accepts the web session or an app `Authorization: Bearer` token. Admin routes never accept Bearer.

## Brand and colours

- Only standalone "نصيبك" is the brand name.
- Logo: `public/images/logo.svg`, via `Image`, in nav and brand areas. In headings use the text "نصيبك" with a gradient. On the login panel use `brightness-0 invert` for a white logo.
- Palette: deep blue `#22476a` (primary), warm gold `#c19250` (accent), oklch in `globals.css`.
- One font: Cairo. Headlines use `.font-display`.
- **Never** use hardcoded Tailwind colours: `blue-`, `violet-`, `purple-`, `rose-`, `pink-`, `sky-`, `cyan-`, `indigo-`, `slate-`, `gray-`, `orange-`.

| Purpose | Token |
|---|---|
| Main UI, decorative | `primary`, `secondary`, `accent` |
| Success only | `emerald-`, `green-` |
| Pending or warning only | `amber-` |
| Error, destructive | `destructive` |
| Muted | `muted`, `muted-foreground` |

- Gradients: `from-primary to-secondary`, `from-accent to-accent/70`. Subtle: `bg-primary/5`, `bg-primary/10`.
- Photos: warm editorial, brand blue and gold, **never people's faces** (hands, homes, objects, Amman scenery). Always `next/image`, WebP ≤ ~180 KB. Dashboard pages have no photos.
- Page titles use `PageHeader`, never hand-built gradient boxes.

## Arabic and RTL

- Member pages are Arabic RTL. Admin is English LTR.
- Digits are Western (0-9) everywhere. Format dates with `"ar-JO-u-nu-latn"`.
- Phone and OTP inputs accept Arabic-Indic digits: convert with `toLatinDigits()` (`src/lib/digits.ts`).
- RTL chevrons: `ChevronRight` = السابق, `ChevronLeft` = التالي.
- Copy follows gender: `forViewer()`, `forPartner()` (`src/lib/gendered-copy.ts`). The partner is the opposite gender of the viewer.
- Shared messages use no masculine commands: say «يمكنك …».
- Counted nouns use `arabicCount()`.
- Stored option values never change (`"ملتزم"`). Show `selfLabel()` for my own profile and `describeOption()` / `partnerOptions()` for someone else (`src/lib/profile-options.ts`).
- Text inputs must be ≥ 16px on phones, so iPhone doesn't zoom. Tap targets ≥ 44px.
- Dialog close ✕ sits at `end-2`.
- Filter bars use `flex flex-wrap justify-center gap-2`, never `overflow-x-auto`.
- Never `<input type="date">`: use `BirthDateSelect` (it failed in Instagram's Android browser).
- Use `DropdownMenu` and `Dialog`, never `window.confirm` or hand-made overlays.
- A failed load shows `LoadError`, never a fake empty state. Never let a form save after its data failed to load.
- «إنهاء التوافق» is the one term for ending a match.

## Build and code traps

- **Client components must never import a runtime value from a module that imports `@/lib/db`** (`feed.ts`, `settings.ts`, `credits.ts`, `intro/*`, `matching/*`). It breaks `next build` while tsc and vitest pass. Use `import type` and db-free modules such as `src/lib/suggestions/feed-types.ts`.
- Never name a top-level `const` helper `short`, `long`, `int`, `float`, `char`, `byte` or similar. The production minifier drops it and the page crashes with "X is not defined".
- After touching code that client pages import at load (schemas, option tables), test a production build.
- `pnpm lint` stays at 0 problems. A targeted `eslint-disable-next-line <rule> -- <reason>` is only for blob:/data: image previews.
- Raw SQL must state instants as UTC (`::timestamptz AT TIME ZONE 'UTC'`): production Postgres runs in Europe/Berlin, columns are UTC without a zone.
- Any write to a `User` row bumps `updatedAt`, so scheduler writes on idle users must preserve "last seen" (see `runReengagement`).
- Every change to `matchCredits` calls `recordCredit()`.
- A new file in `public/` is served only after the app restarts.
- PM2 stays one fork process on purpose: auto-suggest locks and the chat limits live in memory.
- In a server `.env`, a `$` in a value is written `\$`, or Next expands it.

## Countries and `/sa` routing

- Countries: JO and SA. Fixed facts in `src/lib/countries/index.ts`, admin settings in `country_settings` (Admin → Countries, 30s cache).
- A member's country follows the phone number and never changes. Members are paired only within one country.
- Jordan sits at the root, Saudi Arabia under `/sa`.
- `/sa/...` reaches its page through `rewrites()` in `next.config.ts`. `src/proxy.ts` only sets `x-site-country`.
- **Never `NextResponse.rewrite` in `src/proxy.ts`.** On production it carries the public host, so Next fetches naseebak.com as an external site and the header is lost. It works on localhost, so test with `Host: naseebak.com` against `next start`.
- A new localized path goes in both `LOCALIZED_PATHS` (`src/lib/site-paths.ts`) and `next.config.ts`.
- The country switcher does a full page load: `/sa` and `/` are one route to the client router.
- Blog posts and polls belong to a country. A post opens only under its own country.
- The dashboard follows the member's country, not the last public page.
- Saudi purchases stay off until «Prices approved» is on in Admin → Countries. SAR prices are drafts until then.
- More: [docs/reference/countries-and-app.md](docs/reference/countries-and-app.md).

## Money and credits

- New members get 3 credits (`getRegistrationCredits()`).
- Only «مهتم» costs: 1 credit (ledger `INTEREST`). «لا» is free. The match, requests, chat and chat → family are free.
- Refund only when the other side never answered and the card closed. A «لا» is never refunded.
- `refundUnansweredInterests` refunds once, stamped by `Suggestion.interestRefundedAt`.
- A blocker's own unanswered «مهتم» on an open card stays spent. The person blocked gets theirs back.
- A match lost at the last moment refunds both.
- Charge, claim and ledger run in one transaction in `decideSuggestion`: a lost claim charges nothing.
- At 0 credits cards stay visible and «لا» stays free. Only «مهتم» is refused (`NO_CREDITS`).
- No pricing on the landing page. Packages show only in dashboard payments.
- Copy follows the switches: never say requests cost credit while `credit_on_interest` is on. Never describe a switched-off feature.
- Referral: friend +1, referrer +2 after the friend finishes short setup, referrer's reward stops after 10 (`maybeAwardReferral()`).
- Jordan: shown in JOD, charged in USD (dinar × 1.41). Saudi Arabia: shown and charged in SAR.
- Prices are set in Admin → Countries. A package id's credits stay in code, because refunds read them, so a different size needs a new package id.
- Credits are added only by `fulfilCheckoutSession()` / `fulfilPaymentIntent`, once, when paid.
- **The Stripe account is shared with other sites.** Ignore anything without our metadata (`isOurSession`).
- Past payments report their own amount (`formatPaidCharge`), never today's price.
- `arabic_checkout` (Payment Element on `/pay/<id>`) is off by default. Its state on production is set in Admin → Settings.
- Test accounts never see payments in the app.
- More: [docs/reference/payments.md](docs/reference/payments.md), [docs/reference/suggestions-and-credits.md](docs/reference/suggestions-and-credits.md).

## Privacy and domain rules

- No contact between members except chat after a mutual match and an accepted request: text only, filtered.
- Photos stay hidden until a mutual like. Member photos use `next/image` with `unoptimized`.
- Parent/guardian data is admin-only, except after an accepted family introduction with consent (`ParentInfo.shareConsentAt`).
- A closed match never returns guardian contacts.
- Members are 18+.
- No guardian at setup: it is asked for only at a family step, and the server refuses without it (`GUARDIAN_REQUIRED`).
- Suggestion gate: always `meetsSuggestionGate()` (server) or `qualifiesForSuggestions()` (client). Matches are never gated.
- Only `role: USER` accounts get or receive suggestions.
- Test accounts (`src/lib/test-accounts.ts`) meet only each other. On production only `EXTRA_TEST_PHONES` count.
- Never put a real or review phone number in a doc, and never send personal data in analytics params. Dashboard page titles stay fixed labels.
- Sign-up never reveals whether a number is registered.
- GA runs on public pages and the dashboard with ids stripped, never in `/admin`. GTM and the Pixel are off the dashboard, admin, `/pay`, `/payments` and login.
- Identity verification is removed for members. `VerifiedBadge` is hidden while `intro_requests_enabled` is on.
- Profile edits after setup go through review, except partner preferences and filling an empty field.
- Sign-in, reports, moderation and leaving: [docs/reference/member-rules.md](docs/reference/member-rules.md), [docs/reference/matches-and-safety.md](docs/reference/matches-and-safety.md).

## Notifications

- Always use `notify()` / `notifyMany()` (`src/lib/notify.ts`). It writes the bell row, respects preferences and pushes to OneSignal and FCM.
- **Guard test:** the list of automatic messages is `src/lib/notifications/automatic.ts`, and the texts stay at their call sites. `src/__tests__/lib/automatic-notifications.test.ts` fails when they differ, so change both.
- Keep `UNPAID_TITLE` and the «صفر: اشح» top-up line. Admin Insights count them by text.
- **Notice SMS, narrowed** (owner, 2026-11-07; off 2026-10-29 to 11-07). `sms_notices_enabled` is **on** in production since 2026-11-07: only a match or a «مهتم» (`SMS_NOTICE_EVENTS`), only to members with no push seen in the last 14 days, one per day, each text one Arabic SMS (≤ 70 characters). No automatic chat or expiry SMS. Admin «send now» is not narrowed.
- Saudi sign-in codes go by WhatsApp (`sendOtpCode`, VerifyWay). The reply repeats the code, so it is never logged.
- A chat push reads «رسالة جديدة من <name>», never the message text.
- Ask push permission with `requestPushPermission()` and sign out with `signOutAndUnlinkPush()`, never the bare browser prompt or `signOut()`.
- More: [docs/reference/notifications-and-sms.md](docs/reference/notifications-and-sms.md).

## Suggestion flow

Feed tabs: `new` = «جديدة» (website «الجديد»), `interested` = «مهتمون بك» (website «مهتمون بالتحدث معك»), `waiting` = «بانتظار ردهم» (website «أنا مهتم بالتحدث معهم»). A fourth website tab, «توافق متبادل», lists matches.

| Constant | Value | Where |
|---|---|---|
| `MAX_OPEN_SUGGESTIONS` | 10 per person, only «جديدة» counts | `matching/auto-suggest.ts` |
| `minSuggestionScore()` | 60 (30 with `credit_on_interest` off) | `matching/auto-suggest.ts` |
| `PREFERRED_SCORE` | 70 | `matching/auto-suggest.ts` |
| `MUTUAL_SUGGESTION_DAYS` | 7, card life | `suggestions/mutual.ts` |
| `SLOT_IDLE_DAYS` | 2 | `suggestions/mutual.ts` |
| `NEW_TAB_LIMIT` | 15 cards shown in «جديدة» | `suggestions/feed.ts` |
| `CANDIDATE_ACTIVE_DAYS` | 7 | `activity.ts` |
| `CANDIDATE_FALLBACK_DAYS` | 14 | `activity.ts` |
| `RESUGGEST_AFTER_DAYS` | 30 | `matching/auto-suggest.ts` |
| `SECOND_CHANCE_DAYS` | 30 | `matching/auto-suggest.ts` |
| `RETRY_COOLDOWN_MS` | 30 minutes | `matching/auto-suggest.ts` |

- One `Suggestion` row with `flow: MUTUAL` is shown to both people. Each decides once through `decideSuggestion` (`POST /api/suggestions/[id]/decide`).
- Both «مهتم» → `createMutualMatch`. If that fails after the charge, `healMissingMatches` creates it in the daily job.
- A «لا» closes the row at once (REJECTED). Read the two decisions: REJECTED means someone said «لا», not that both answered.
- Nobody is told about a «لا», except someone who already said «مهتم»: their card shows «لم يحصل توافق» (`declined`), no refund.
- Every «مهتم» on an undecided visible card tells the other person «شخص أبدى اهتمامه بك» (`notifyInterestShown`, once per Amman day).
- `lastActiveAt` is used for sorting and never sent to clients. `activityLabel` sends only «نشط اليوم» or «نشط هذا الأسبوع».
- **`memberSuggestStatus`** (`src/lib/admin/members-suggest-reason.ts`) is read-only and **must mirror `generate`** (`src/lib/matching/auto-suggest.ts`). Change one, change the other.
- Cards top up on page open, on save, after a decision, on expiry and in the daily job. The morning job handles up to `WEEKLY_SUGGEST_LIMIT` (600, `cron/suggestions.ts`) members, most recently active first; the top-up also reveals their hidden cards.

Current notes:

- **Which cards go first:** `orderForSlots`: `PREFERRED_SCORE` (70) and up first, 60–69 only fill what's left, then people with a free slot, then score. The floor stays 60.
- **«جديدة» order:** activity groups (3 days, 7 days, older), then score. Switch `feed_active_first` (Admin → Settings, off by default, **on** in production since 2026-11-07) makes it 1 day, 3, 7, older, and puts someone with `BUSY_WAITING` (5) «مهتم» waiting on them last in their group. Order only: nobody is hidden, nothing sent to clients (`src/lib/suggestions/feed.ts`).
- **Expiry reminders:** `remindMutualSuggestions` walks every due card in pages (`MAX_REMINDER_PAGES`), still one notice per person per day.
- **Card buildup:** a hidden card fills the recipient's slot (`slotMutualWhere`, `openCounts`), never the candidate's. Members away 7 days get no new cards and no reveals until they return. The 14-day candidate fallback stays, so active members aren't left empty. Old piles shrink by expiry only: no bulk closing.
- **Second chance:** a «مهتم» left unanswered because the other person was away (no `activity_days` row during the wait) comes back to them once (`secondChanceCards`, `reopenedAt`): full 7 days, in «مهتمون بك» so it takes no slot, up to `SECOND_CHANCE_PER_DAY` (3) a day whatever «جديدة» holds (until 2026-11-07 it waited for room there, which blocked 120 of 165), with the «مهتم» notice. Both must still fit, with neither blocked, matched, engaged or gone. The first person keeps their refund and pays nothing more if it matches. Cards closed by a change never come back this way (`closedByChange`).
- **After the match (evening job, push + bell, never SMS):** `nudgeQuietChats` nudges a chat once, 48 hours on, if nobody wrote (both) or a message is unread (the silent one). `closeUnsharedMatches`: a mixed choice gets a last call on day 5 and closes 2 days later; the side that didn't share carries `NOT_A_MATCH`, no refund, no chat. Win-back: `runReengagement` invites members away 7–30 days with nothing waiting (finished profile, not flagged, not engaged), same weekly limit.
- **Empty search wait:** after a run finds nobody, `generate` waits 30 minutes. Any change to a member's data, preferences or «شروط أساسية» clears it (`clearSuggestCooldown`).
- **Cards closed by a member's change:** a change closes only cards nobody answered (`closedByChange`); the pair can meet again at once on the same row. A card either side said «مهتم» on stays open whatever either changes (owner, 2026-11-07). Natural expiries keep the 30 days.

Detail: [docs/reference/suggestions-and-credits.md](docs/reference/suggestions-and-credits.md).

## After a match

- `createMutualMatch` → `openMatch` → `applyIntroOutcome` opens the match straight into what both chose.
- CHAT + CHAT → `Conversation`, 14 days (+7 once in the last 3 days). FAMILY + FAMILY or mixed → family introduction.
- Choosing FAMILY needs a guardian and consent. Consent is stored only when the action completes.
- Mixed match: neither guardian shows until both shared.
- Requests expire after 7 days. A declined request is final for that type on that match.
- The chat filter blocks phones, links and handles, including spelled-out or split numbers (`src/lib/chat/filter.ts`).
- Only the server publishes to Ably `chat:<id>`. Browsers get subscribe-only tokens.
- Admin chat views are logged (`[admin-chat-view]`).
- A block ends the chat for good and keeps it read-only for the blocked person, so reports stay possible.
- Reports never act on their own (owner, 2026-11-07): no automatic flag, no automatic chat pause. Every report emails the admins, who flag, end the chat or suspend by hand. Report evidence survives account deletion.
- Detail: [docs/reference/matches-and-safety.md](docs/reference/matches-and-safety.md).

## Scheduler

- `GET|POST /api/cron/daily?part=morning|evening|frequent` with `Authorization: Bearer $CRON_SECRET`. No part = morning + evening, as Admin «Run now».
- `runDailyJobs()` (`src/lib/cron/daily.ts`): each task is isolated and idempotent. A failed task emails the admins.
- Morning 06:00 Amman: expiry, refunds, new suggestions, chats, deletions, payments, clean-up. No pushes.
- Evening 18:00, the online peak: reminders, filter tips, follow-ups, re-engagement.
- Frequent, every 15 minutes: the unpaid-checkout reminder.
- Also every 15 minutes, `/api/cron/unread-sms`: sends SMS held overnight (match and «مهتم» only). Its chat SMS stop at once (`chat_sms_off`).
- 03:30: database backup, local plus an encrypted copy off the server (`/var/log/naseebak/backup.log`).
- Schedule: `/etc/cron.d/naseebak` (Amman time). Results: `/var/log/naseebak/cron.log`.
- The scheduler's request times out at 5 minutes (curl and Nginx). The first evening run with every expiry reminder (2026-11-07, about 4,500 cards) took 2.5 minutes. To run a part by hand, call the live slot's port directly with `Host: naseebak.com`, so the timeout doesn't apply.

## Deployment

**Production: `d4cd85d` (daily top-up reaches every active member; narrowed notice SMS, `sms_notices_enabled` on), deployed 2026-11-07, slot b.**

Update that one line after each deploy. Don't list past versions. The live revision is in `/var/www/naseebak/REVISION`.

```bash
# 1. Push to GitLab main (the working checkout has only GitHub https as origin)
git push git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git HEAD:main
git push git@github.com:Mohalnatsheh/naseebak.git HEAD:main   # needs SSH keys; the https origin has no saved login

# 2. If new Tailwind classes were added or look missing, clear the idle slot's cache
ssh -i ~/.ssh/naseebak_vps_ed25519 -o IdentitiesOnly=yes root@146.103.57.224 'rm -rf /var/www/naseebak-b/.next/cache'   # idle slot: a or b

# 3. Deploy
ssh -i ~/.ssh/naseebak_vps_ed25519 -o IdentitiesOnly=yes root@146.103.57.224 naseebak-deploy

# Options: --db-push (dump, then prisma db push, additive only), --ref <branch|commit>, --rollback
```

- Only committed and pushed code is deployed.
- Blue/green: slots `/var/www/naseebak-a` (port 3000) and `/var/www/naseebak-b` (port 3010). `/var/www/naseebak` is a symlink to the live slot.
- A deploy builds in the idle slot, checks it (`/` = 200 and `/api/mobile/config` contains `"android"`), reloads Nginx, then stops the old process. A failed build or check leaves the live site untouched.
- `--rollback` switches to the other slot. Run it again to undo.
- Ports 3001–3003 belong to shabaah.com, which shares the server. Leave it alone.
- **Stale `.next` cache trap:** `naseebak-deploy` keeps `.next` between runs, and a stale webpack cache silently drops new Tailwind classes. The cure is step 2 above.
- A build failing with `Cannot read properties of null (reading '1')` under `nextFontGoogleFontLoader` is a bad Google Fonts download. The live site is untouched: run the deploy again.
- Before `--db-push`, check what it will run: `npx prisma migrate diff --from-config-datasource --to-schema <file> --script` in `/var/www/naseebak` with `.env` loaded (read-only).
- Env: `/var/www/naseebak/.env`. `NEXT_PUBLIC_*` needs a rebuild. Any other `.env` change: `sudo -u naseebak pm2 restart naseebak-a --update-env` (use the live slot).
- Logs: `/var/log/naseebak/out.log`, `error.log`, `deploy.log`, `cron.log`. Requests: `/var/log/nginx/naseebak.access.log` (`rt=`, `urt=`).
- Never use `/root/backups/naseebak-deploy-20261103-2112.bak`: it no longer works.
- Server, Nginx, backups and performance: [docs/reference/operations.md](docs/reference/operations.md).

## Owner decisions in force

- Not a dating app: no contact outside the cycle, no faces in site photos.
- Minimum score stays 60. Card life stays 7 days.
- A full candidate is never skipped: the card is created hidden.
- «لا» closes the card at once. "No refund" lets people infer a «لا»: accepted.
- Interest is shown. A «لا» is shown only to someone who said «مهتم».
- Cards the other side already said «مهتم» to come first in `new`, silently.
- Education preferences mean "this level or higher".
- Guardian is asked for only when needed. Sign-up stays short.
- Referral pays after the short setup.
- Two people alternating can still pass a number through chat: accepted, stricter would block normal messages.
- Notices are push + bell. SMS only for a match or a «مهتم», to members with no push active in the last 14 days (2026-11-07).
- Stripe stays in the app, with the known Play and Apple billing risk.
- Old card piles shrink by expiry only.
- Public pages never mention poll credits. Visitors never earn.
- PM2 stays one fork process. SSH password login stays on.
- Dashboard home has no welcome pop-up. Every match is managed on the suggestions page.

Parked, or waiting for the owner:

- A woman's free «مهتم» reply to a man's «مهتم»: needs an app version.
- The cap on hidden cards per recipient (G53) and a popular member at 0 credits holding many paid «مهتم» cards (G57).
- Comparing «مهتم» → match by feed order on or after 2026-11-18, and by score band.
- About 2026-11-14, measure `feed_active_first` and the SMS: «مهتم» → match by how many «مهتم» already waited on the other side (before, 24 Oct – 4 Nov: 32% with none, 12% with 1–4, 6% with 5–9, 3% with 20+), and the answer rate for members without push (before: 25%, 44% with push). 64% of «مهتم» went unanswered.
- Everything else open: [docs/platform-review-2026-11-06.md](docs/platform-review-2026-11-06.md).

## What needs an app version

Reach the app at once, no version: list contents and order, limits, prices, API texts, notices, pushes, Admin popups, the force-update and maintenance switches, «Payments in the app».

Needs a new app version:

- Anything the app decides itself, such as the «مهتم» lock at 0 credits.
- New screens, new fields the app sends, analytics events, push channels, deep links.
- Free «مهتم» reply for women, a `purchase` event, popup tap actions.
- The filter tip on the app's empty «جديدة» page.
- The website's «الرصيد أرخص» saving line. A live chat widget in the app.
- A niqab profile option in the app.

In `naseebak_app/` code, waiting for the next store build: `X-App-Platform`, two Crashlytics fixes, the activity label on cards, the WhatsApp wording for Saudi codes. Details: [naseebak_app/CLAUDE.md](naseebak_app/CLAUDE.md).

API changes must keep old app versions working. Members update slowly.

## Legacy flow

- Applies only with the switches off, and to old rows. Production does not use it.
- Admin-arranged family visits, 2 free credits, 1 credit per suggestion received, no chat.
- Keep its code paths intact: the switches must still restore it.
- Detail: [docs/reference/suggestions-and-credits.md](docs/reference/suggestions-and-credits.md#legacy-flow-switches-off).
