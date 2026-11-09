# Project history

Dated notes moved out of `CLAUDE.md` on 2026-11-06, grouped by topic and kept word for word where practical. Nothing here is a current rule: facts may be out of date, and `CLAUDE.md` wins. Phone numbers and passwords were left out.

## Deploy log

- **2026-11-09:** production `f523654` in slot a (14:04 Amman, `--db-push`: `profiles.niqab`; backup `naseeb-before-deploy-f523654-20261109-1400.dump`), then `dba0a4e` in slot b (15:19: sign-up terms links follow the chosen country, «الاسم الأول مطلوب»). Same day, set directly in `system_settings` (not through Admin, so no admin change log): `free_interest_reply` = true, `mobile_android_min_version` and `mobile_android_latest_version` = 1.0.1 (iPhone left empty: the App Store still had 1.0.0, 3 iPhone app members). Broadcast «الرد على الاهتمام أصبح مجانياً 🎉» to all 1520 active members (bell + web + app push, no SMS; `/root/one-off/2026-11-09-free-reply-broadcast.mjs`). Popup alert `free-reply-popup-20261109` for everyone, both countries, website + app, until 2026-11-23. App 1.0.1+2 live on Play; 1.0.2+3 built for Play and uploaded to TestFlight.
- **Open items (2026-11-06):** production runs `32fe443` in slot b (`--db-push`: second chance for a missed «مهتم», 48-hour chat nudge, mixed-choice limit, win-back), before it `1139bee` (better cards first, all expiry reminders, no card buildup), before it `5437a0e` (activity label on suggestion cards; the app needs its next version), before it `ee4d7f3` in slot a (21:25, `--db-push`: closed cards can return; 61 rows of one account marked `closedByChange` by hand), before it `8944251` in slot b (21:20: search again after a change), `c062a0c` in slot a (20:39: SEO and AI search; the Saudi post got its «المصادر» list in `blog_posts`), before it `35d11bf` in slot b (20:27: Instagram per country in `publicCopy`, no env var), before it `99e108f` in slot a (20:19: wording, Admin → Automatic messages, «القبيلة أو الأسرة»), before it `70739cf` in slot b (19:58: Jordan terms fix), before it `a17867e` in slot a (`--db-push`: polls per country, dashboard follows the member's country, Saudi fixes), before it `e0f81fb` in slot b (17:09: 43 Saudi cities), before it `0fa1bd1` in slot a (16:57: Saudi home screens), before it `53b763c` in slot b (`--db-push`: blog per country, `/sa` header, Saudi wording and links), before it `2461276` in slot a (`/sa` behind Nginx, country menu), before it `410257b` in slot b (16:10, `--db-push`, backup `naseeb-before-deploy-410257b-*.dump`: package prices and admin emails per country in Admin → Countries, see Money and Admin emails), before it `9755100` in slot a (15:54: blog headings and links).
- Earlier: `2f34044` in slot b (15:15: Saudi sign-in codes by WhatsApp, Pixel sends later page views; `14dbbbf` at 15:03 in slot a: Pixel sign-up event, public page views, off payment and login pages; `7fd22c8` at 14:52 in slot b: Tawk bubble clears the phone bottom bars and hides over menus and popups; Meta Pixel set by the owner in Admin → Settings; `959db51` at 14:28 in slot a: Tawk.to live chat; `155eaf3` at 14:14 in slot b: admin name edit on the member page, no refund for whoever blocks while waiting).
- **Open items (2026-11-05):** production ran `850db57` in slot a (19:08; `765eaf9` at 18:54, `47272e6` at 18:43; earlier that day `05a5a42`, `209b201`, first zero-downtime deploy) (4 Nov ~20:10: admin users «Uses» column + website/app filter; before it `e7708dc`, see 4 Nov below).
- **Open items (2026-11-04):** production runs `e7708dc` (~19:45, `--db-push`, backup `naseeb-before-deploy-e7708dc-*.dump`: admin growth card, payment failure reasons, member devices card, popup seen/tapped — see Admin additions; past failed payments back-filled from Stripe by `/root/one-off/2026-11-04-payment-failure-backfill.mjs`, dry run by default, `--write`: all 256 with a Stripe session → `NOT_PAID` — none of them had a payment attempt (no PaymentIntent = no card entered), so failures are people leaving the checkout, not declines; 38 older rows without a `cs_` session stay «Reason not recorded».
  - All payments then: 54 COMPLETED, 294 FAILED, 4 REFUNDED, 2 PENDING), before it `c3cc0e0` (19:10: the evening «رجع لك رصيد» removed again, see below), before it `31aa676` (18:55: daily job in morning/evening parts + «شخص ينتظر ردّك»; server cron changed the same minute), `45a7255` (18:26: «جديدة» limited to 15), `4562fe6` (17:34: feed activity order), `0947dac` (16:58: «العودة إلى التطبيق» on `/payments/return`), `87c41a7` (16:39, `--db-push`, backup `naseeb-before-deploy-87c41a7-20261104-1635.dump`: «Active by device», see Admin), before it `eee46f9` (16:18: Android get-the-app bar + popups per website device, see App Links and Popup alerts).
- **Open items (2026-11-03):** production runs `1aa364f` (deployed 2026-11-03: Admin → Referrals, see above), before it `96e933d` (Admin → Notifications route «Invite friends» → `/dashboard/referral`; the app already maps it to its referral screen) and `23ef631` (GA4 in the member dashboard with ids hidden + `callbackUrl` dropped — see Analytics & Logs; `aa6efd6` before it), and earlier the same day `1e55c85` (birth date as day/month/year lists — see Members are 18+).
- Before `1e55c85`: `cb7e520` (deployed 2026-11-02: performance — see Production Deployment → Performance; with `--db-push` for 4 indexes at `f16d607`). Before that `ad0ba15` (2026-11-02: SEO — server-rendered blog, per-page social cards, sitemap/robots; see Landing Page UI Patterns → SEO), and before that `dda2f16` (2026-11-01: profile-edit fix, analytics line in the privacy policy, admin approval upsert, Android package `com.naseebak.naseebakApp` in assetlinks + the default Play link).

## Deploy method before and during the move to blue/green

- **Deploy (from GitLab, near-zero downtime):** push to `main` on GitLab, then run `ssh root@146.103.57.224 naseebak-deploy` (`/usr/local/bin/naseebak-deploy`).
  - It fetches into `/opt/naseebak-repo` using a read-only GitLab deploy key (`/root/.ssh/naseebak_gitlab_deploy`), copies the live app to `/var/www/naseebak-next` (keeps `node_modules`, `.env`, `ecosystem.config.cjs`), syncs the code, writes `REVISION`, then runs `pnpm install --frozen-lockfile && npx prisma generate && pnpm build` as `naseebak`.
  - After that it swaps the copy in (`naseebak` → `naseebak-prev`) and checks `127.0.0.1:3000` answers 200.
  - A failed build leaves the live site untouched; a failed check rolls back on its own.
  - Options: `--db-push` (pg_dump to `/root/backups`, then `prisma db push`, additive changes only), `--ref <branch|commit>`, `--rollback` (swap with `naseebak-prev`; run it again to undo).
  - A lock stops two deploys at once.
  - Log: `/var/log/naseebak/deploy.log`.
  - Only committed and pushed code is deployed.
  - The live version is in `/var/www/naseebak/REVISION`.
  - **Zero-downtime (blue/green) deploys — in use since 2026-11-05:** `ssh root@146.103.57.224 naseebak-deploy` (options `--db-push`, `--ref`, `--rollback` as before).
  - Two slots: `/var/www/naseebak-a` on **port 3000** and `/var/www/naseebak-b` on **port 3010** (**3001–3003 belong to shabaah.com** — the script first had slot b on 3001, fixed 2026-11-05 before the first run); `/var/www/naseebak` is a **symlink** to the live slot; Nginx reads the live port from `/etc/nginx/naseebak-upstream.conf`; PM2 apps `naseebak-a` / `naseebak-b` (only the live one runs; `pm2 save` keeps it for reboots via `pm2-naseebak`).
  - A deploy builds in the idle slot, starts it, checks it (`/` = 200 **and** `/api/mobile/config` answers with `"android"`, so another site on the port can never pass), reloads Nginx gracefully, then stops the old process; a failed build or check leaves the live site untouched.
  - `--rollback` switches to the other slot (still built).
  - First run 5 Nov 14:11–14:15 (`209b201`, migrated the old directory into slot a): **0 errors in ~900 requests**; rollback tested both ways at 14:16–14:17: 0 errors in 183 requests.
  - **Logs moved:** `/var/log/naseebak/out.log` and `error.log` (were `out-0.log` / `error-0.log`, kept until rotated).
  - **The old script `/root/backups/naseebak-deploy-20261103-2112.bak` no longer works** (it expects a real directory and the PM2 app `naseebak`) — never use it again.
  - Backups of the script: `/root/backups/naseebak-deploy-v2-before-port-fix-20261105.bak`.
- **Git remotes:** GitHub `origin` and GitLab `gitlab` (`git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git`), branch `main`; push both.
  - The working checkout is `~/Documents/EvoKey-Projects/naseebak` (site + `naseebak_app/`); it only has `origin` (GitHub, https), so push GitLab by URL: `git push git@gitlab.evokeyit.com:gitlab-instance-54ffc071/naseebak.git HEAD:main`.
  - `~/Desktop/Evokey-APPS/Naseebak/naseebak` is an old checkout (68+ commits behind) — don't work or deploy from it.
  - On 2026-11-04 GitLab main got `eee46f9` and `87c41a7`; GitHub `main` caught up the same day (`2a255d3`).
  - Push GitHub over SSH (`git@github.com:Mohalnatsheh/naseebak.git`): the https `origin` has no saved login.

## Suggestion flow data and measures

- **Suggestion-flow numbers (4 Nov):** men a median of 24 open cards (max 132; now capped to 15 shown), ~14,000 cards a week expired undecided per gender, 14,278 women's cards hidden (`hiddenFromCandidate`, still an owner decision), women 529 «مهتم» vs 4,418 «لا» in 7 days (89% «لا»; men 53%), 48 active women at 0 credits held 242 «مهتم» from men they couldn't answer (free reply parked until an app version). Card length stays 7 days (owner, 4 Nov): of 263 matches from cards made 18–27 Oct, 34% came after day 2, 25% after day 3, 12% after day 5.
- Retention: of the 19–25 Oct sign-ups only 31% of men / 43% of women were seen in the last 7 days; DAU ≈ 307 of 1,289 open accounts.
- **Evening reminders (2026-11-04, owner: push + bell only, no SMS for anything):** members away 2–30 days with a card where the other side said «مهتم» get «شخص ينتظر ردّك» (`remindWaitingInterest` in `src/lib/cron/suggestions.ts`, once per 2 days per person, opens `?tab=interested`; on 4 Nov 96 women + 78 men away 3+ days had one) — the «رجع لك رصيد» refund notice built the same day was removed (`31aa676` → next commit): every refund already sends «أعدنا لك رصيداً» at once (`sendRefundNotice` in `src/lib/suggestions/mutual.ts`, 723 in 7 days), so the one evening run on 4 Nov sent ~120 members a second refund notice.
  - Online members by hour (nginx, 5 days): quietest 03–05, 06:00 ≈ 142, peak 15–18 (18:00 ≈ 403) and 21–00.
  - Re-engagement (7–30 days idle) brought back 11% of 344 nudged in 14 days.

## Rules that were replaced

- Waiting nudge, removed by `663ebe6` (2026-10-19) when «مهتمون بك» arrived. Every «مهتم» now sends «شخص أبدى اهتمامه بك»; the title below remains only on the cron expiry reminder.
- **Waiting nudge** (owner decision 2026-10-18, production showed most «مهتم» cards stalled on an absent other side): a «مهتم» on a card the other person hasn't answered (and can see) sends them «اقتراح بانتظار قرارك» (neutral body, never says someone is interested; `notifyWaitingDecision` in `mutual.ts`), at most once per Amman day (any notice with that title today counts, the expiry reminder too; `startOfAmmanDay` in `src/lib/amman-day.ts`), with the SMS fallback event `waiting`. Never for a «لا»; not on a card just revealed from hidden (that got «شخص أبدى اهتمامه بك»)

## Sign-ups, ads and traffic

- **Sign-up drop = ads stopped:** sign-ups follow visitors from the Instagram bio link (auto-tagged `utm_source=ig&utm_medium=social&utm_content=link_in_bio` + `fbclid`; count distinct IPs per day on landing URLs in the nginx log): 120 (21 Oct) → 342 (24 Oct) → ~260–310/day to 1 Nov → 196, 144, ~150 (2–4 Nov); direct visitors steady ~150/day; on-site funnel unchanged (~50% of sign-up page visitors request a code, ~80% verify).
  - The owner confirmed the Meta ads stopped around 1 Nov.
  - Cohorts on 4 Nov: before ads (8–21 Oct) 430 members, 41% women, 2.3% paid; during ads (22 Oct–1 Nov) 956, **29% women**, 3.3% paid (131 JOD so far); after 124.
  - If ads restart: target women.
  - Invites bring almost nothing (2 sign-ups in 16 days).
- **Sign-up flow checked 4 Nov:** full sign-up (landing quick start → code → account → 4 setup steps → suggestions) on a local `next build`/`next start` of the live code passed with no errors; live landing + `/register` load in 1–1.5 s on Android Chrome, Android Instagram and iPhone with no JS errors.

## Payments and Stripe

- Stripe webhook «signature verification failed» (4 on 2026-11-03, 00:42–05:45 server time): checked — the live account (shared with shabaah.com, endpoints `naseebak.com/api/payments/webhook` and `shabaah.com/api/shabah/store/webhook`) had zero failed deliveries, so they came from a test-mode or other webhook pointing at our URL; no payment affected (none left PENDING). Owner to remove any test-mode endpoint for naseebak.com in Stripe; optional: narrow the live endpoint from all 254 event types to the checkout/charge ones the handler uses. Read-only check script: `/root/one-off/2026-11-03-stripe-check.mjs`.
- «Payments in the app» was OFF 2026-11-02 → 2026-11-04 16:16 (for App Review after Apple's 2.1 request); since then **ON** (`mobile_payments_enabled` = true, saved from Admin → Settings → «Mobile app»), and on 2026-11-04 the owner chose to keep Stripe in the app on Android (Play live) knowing Play / Apple require their own billing for credits (store-removal risk); real members paid through it the same day. The switch covers both platforms, so it also applies to iPhone once approved (review accounts never see payments).
- `/payments/return` (2026-11-04): Android shows «العودة إلى التطبيق» (a plain `<a href="/dashboard/payments">`, a full navigation, so App Links open the app on its credits screen — the original credits screen and its result dialog are replaced), iPhone a hint to «◀ نصيبك» (Safari never opens Universal Links on the same site); on success the page retrieves the Stripe session and runs `fulfilCheckoutSession` (idempotent) so the balance is ready; the get-the-app bar is hidden there.

## Credit gifts

- **Credit gift (18:28):** 296 members at 0 credits (232 men, 64 women; not paused/suspended/deleting, not test phones) got +1 credit (ledger `ADMIN_ADJUST`, note `gift-1-credit-2026-11-04`), a SYSTEM bell «🎁 هدية من نصيبك» (gendered text, opens `/dashboard/suggestions`) and a push: website 117 sent / 179 without a device, app 11 of 11. Script `/root/one-off/2026-11-04-credit-gift.mjs` (dry run by default, `--send`; re-running gives nobody a second credit), list of 0-credit members before it in `/root/backups/2026-11-04-zero-credit-before-gift.csv`. 3 members spent it on «مهتم» within 80 s.

## Mobile app and stores

- Mobile push: iOS works since 2026-11-03 — the APNs `.p8` in Firebase must come from Apple team `4S958MQTCR` (the team that signs the app; a key from `G8G55DD7DP` gave `messaging/third-party-auth-error` «Invalid APNs credential»); test push to one device: `/root/one-off/2026-11-03-test-push.mjs <fid>`. Android push not yet confirmed on a real phone (no Android device registered on production at 2026-11-03).
- Play Console: advertising ID declared «Yes → Analytics» (the `.aab` has `com.google.android.gms.permission.AD_ID`, added by Firebase Analytics; the app shows no ads) — Data safety should list Device or other IDs collected for analytics.
- Store builds in `naseebak-release-1.0.0/` are current: the `.ipa` is the TestFlight upload, the `.aab` was rebuilt on 2026-11-01 with the new Android package and not yet uploaded to Play.
- Remove the review numbers from `EXTRA_TEST_PHONES` once both stores approve (fixed code 111111 on production).
- Push reach: OneSignal 386 messageable of 758 devices; 25 members with app push.
- **Stores:** Google Play is live (1.0.0); the App Store is still in review — once approved, set the iOS store link in Admin → Settings → «Mobile app» (empty), check Universal Links on an iPhone, add an iPhone get-the-app bar if wanted, and remove the review numbers from `EXTRA_TEST_PHONES`. The next app build sends `X-App-Platform` (already in `api_client.dart`; not yet in a store build).
- **Live popup** `android-app-popup-20261104` (inserted in SQL, not through the admin page; channel `WEB_ANDROID`, everyone, every country, no end): «تطبيق نصيبك صار على Google Play» with «تحميل التطبيق» → Play link `utm_medium=popup`; stop it in Admin → Popup Alerts.
- Assetlinks: Play's signing SHA-256 added (DB setting `mobile_android_cert_sha256`, old value in `/root/backups/mobile-android-cert-before-20261104.txt`), Google's check returned linked at 16:05.
- **To add in the next app version (owner, 2026-11-05):** the filter tip on the app's empty «جديدة» page (website shows it; app users get it by push + bell only).
- **Waiting for the next app store build** (all in code on `main` and in the `naseebak_app` mirror, not released; list in `naseebak_app/CLAUDE.md` → Store release): `X-App-Platform` header, the two Crashlytics fixes of 5 Nov (`naseebak@523e98a`: a lost connection — `ApiException(network)` from background calls in `ApiClient._send` — is no longer reported as a fatal crash; the sign-in code and phone fields use `SafeInputFormatter` instead of Filtering + LengthLimiting formatters, which threw `PlatformException … IndexOutOfBoundsException: invalid selection start: 6` on Android SMS code autofill).
  - Bump `version: 1.0.0+N` for that build; after it, check Crashlytics that both issues stop.
- Store review test data, 2026-11-01 (numbers removed from this doc; they are in the server `.env`): placeholder test men made by `/root/one-off/2026-11-01-review-test-data.ts` for store reviewers — a «جديدة» card, a card he already said «مهتم» to, and a family-intro match with a test account, whose chat runs to 2026-12-31; created ids in `/root/backups/2026-11-01-review-test-data.json`, env backup `/root/backups/naseebak-env-before-review-phones-*.bak`.

## Saudi launch

- Saudi launch still needs: real SAR purchase on Stripe, legal name / CR / VAT wording (`[NEEDS LEGAL REVIEW: KSA]`), more Saudi blog posts, owner decision on a niqab option (profile `hijab` is yes/no; the app needs a version for it, a website-only option is possible), Saudi in Play and App Store availability, the app's OTP text says SMS while Saudi codes go by WhatsApp (fixed in `naseebak_app`, reaches members with the next app version).
- Stale when moved: polls became per country on 2026-11-06, see `docs/reference/marketing-and-content.md`.
- Later: polls are one list for both countries, GTM and Pixel ids are shared.

## Open decisions as of 2026-11-05

- **Still open / owner decisions:** compare «مهتم» → match before vs after the activity order on or after 18 Nov (admin Growth card ««مهتم» → match, by the week it was given»); why members leave the Stripe checkout (none of 256 failed payments had a card attempt — offered, not started); an evening «كمّل ملفك» reminder for the 195 unfinished setups (owner: not now); free «مهتم» reply for women (parked, needs the app); the 14,278 hidden women's cards; restart ads aimed at women; delete the Stripe test-mode webhook endpoint (owner).

## Polls

- `/poll` and `/poll/<slug>` still have no share image (owner: not now).

## Email

- Admin/new-member emails hit Hostinger's outgoing limit daily (`hostinger_out_ratelimit` in the error log, up to 40 a day) — move to a transactional email service or a daily digest.

## Data fixes

- The 8 members with impossible birth dates (sign-ups of 9–12 Oct, before the 18+ check) were corrected on 2026-11-01 by `/root/one-off/2026-11-01-fix-birth-dates.mjs`: date cleared, profile unfinished (setup step 1) so they re-enter it; backup `/root/backups/2026-11-01-bad-birth-dates.csv`; notice sent the same day (`--notify`: 7 bell rows, 2 pushes; the deactivated member not notified).

## Production reviews and incidents

- **Production review 3–4 Nov:** healthy (backups, daily job 0 errors, only deploy 502s); sign-ups falling — ~80–93/day 26 Oct–1 Nov, then 54, 42 (3 Nov), 23 by 15:40 on 4 Nov; matches ~42/day → 31 (3 Nov); 3 Nov: 5 payments completed (22 JOD), 8 failed; 18 support tickets open (newest «الرصيد» 3 Nov 22:52, two ask to undo «إنهاء التوافق»), 8 reports pending (4 Nov «بطلب صور» first), 18 deletion requests pending (7–19/day is normal).
  - Stripe «signature verification failed» still arrives (3 Nov 19:53, HTTP 400) — the owner must delete the test-mode endpoint for naseebak.com in Stripe.
  - App push: 3 Android devices registered on 4 Nov (Android push still to confirm on a real phone).
- Past issues checked and closed: Stripe webhook signature failures 20–24 Oct (no paid checkout lost: all 42 paid sessions since 19 Oct are COMPLETED/REFUNDED), checkout 503 on 19–20 Oct, SMS outage 24 Oct; 502 bursts are deploy restarts; «Failed to find Server Action» / auth «UnknownAction» lines are bots.

## Flow map gaps register

- `docs/platform-flow.html` = the flow map of every member/system flow plus the gaps register (G01–G68, each marked fixed / partly fixed on 2026-10-18/19).
  - Update it when a flow changes; open gaps left: G11 (Stripe dashboard check), G15 (score check on a prod copy), G32 (signed CDN URLs), G34 (support reply thread), G37 (chat/contact limits in memory; the sign-in limit is in Postgres since 2026-10-19), G38 (SMS to the guardian), and from the 2026-10-19 QA round (`docs/qa/2026-10-19-cycle-qa.md`, G53–G68, all fixed and deployed on 2026-10-19 except): G57 (a popular member at 0 credits holding many paid «مهتم» cards — owner decision pending) and the G53 cap on hidden cards per recipient (owner decision pending).

## GitNexus MCP section

Removed from `CLAUDE.md` on 2026-11-06: there is no GitNexus index, no MCP entry, and none of the skill files below exist.

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

## Corrections made in the rewrite (2026-11-06)

Each was checked against the code at `5650d89`.

- Was: database `naseeb`)
  - Now: database `naseeb_push`, see Local setup)
  - Why: this checkout's env uses `naseeb_push`.
- the third number is a real phone, removed.
- Was: - Other phones: without working SMS locally `send-otp` returns 502 and deletes the code — use the test phones above (or add yours to `EXTRA_TEST_PHONES`). The local `.env.local` has `EXTRA_TEST_PHONES=0790000777` for a fresh-signup test (code `111111`)
  - Now: - Other phones: with `SMS_MOCK=true` the code is in `GET /api/dev/sms-outbox`; without the mock or working SMS, `send-otp` returns 502 and deletes the code — use the test phones above (or add yours to `EXTRA_TEST_PHONES`). The local `.env.development.local`…
  - Why: `.env.local` isn't in this checkout.
- Was: Run the dev server on port 3000: `AUTH_URL` is `http://localhost:3000`
  - Now: Run the dev server on port 3020: `AUTH_URL` in `.env.development.local` is `http://localhost:3020`
  - Why: this checkout's env uses 3020.
- Was: turns the 3 new-cycle switches on
  - Now: turns 3 new-cycle switches on, not `credit_on_interest`
  - Why: compose sets three switches.
- Was: `intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow` (or
  - Now: `intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, `credit_on_interest` (or
  - Why: there are four switches.
- Was: (never `git add -A`; `docs/cycle-v2-prompt.md` is never committed)
  - Now: (never `git add -A`)
  - Why: that file doesn't exist in this checkout.
- Was: **Guardian contact is validated** with `parentInfoSchema` (Arabic name, Jordanian mobile, stored normalised as `962…`, never the user's own number)
  - Now: **Guardian contact is validated** with `parentInfoSchemaFor(country)` (Arabic name, a mobile of the member's own country, stored normalised, never the user's own number)
  - Why: the schema is per country now.
- Was: Packages (3/5/10 suggestions) in `/dashboard/payments`
  - Now: Packages in `/dashboard/payments` (`src/lib/payments/packages.ts`)
  - Why: packages are 10/25/50 credits now.
- Was: (only for already-verified users) from `User.isVerified`
  - Now: (only for already-verified users) from `User.isVerified`; the badge is hidden while `intro_requests_enabled` is on, so it is hidden on production
  - Why: `verified-badge.tsx` hides it in the new cycle.
- seed password removed from the docs.
- Was: 30 models in
  - Now: 41 models in
  - Why: `prisma/schema.prisma` has 41.
- Was: **No leak:** no notification on a "لا", and the feed (`src/lib/suggestions/feed.ts`, `GET /api/suggestions/feed?tab=new|waiting`) never returns the other side's decision or the row status — "waiting" shows my INTERESTED rows until expiry whether the other s…
  - Now: **No leak:** no notification on a "لا", and the feed (`src/lib/suggestions/feed.ts`, `GET /api/suggestions/feed?tab=new|interested|waiting`) never returns the row status; the other side's «لا» reaches only someone who said «مهتم» (`declined` on the `waiting…
  - Why: replaced by the 2026-10-19 rule.
- Was: Two tabs (`MutualSuggestionsView`): اقتراحات جديدة / بانتظار الطرف الآخر;
  - Now: Tabs (`MutualSuggestionsView`): `new`, `interested`, `waiting`, plus «توافق متبادل»;
  - Why: there are more tabs now.
- Was: (replaced by the 5-open cap under `credit_on_interest`)
  - Now: (replaced by the 10-open cap under `credit_on_interest`)
  - Why: limit is 10.
- Was: Not done yet: stop *creating* cards for members already over the limit (the cards past 15 still exist and expire). 
  - Now: Cards past 15 still exist and expire. 
  - Why: card buildup is fixed (see Card buildup).
- Was: **Live numbers band** (`principles.tsx`,
  - Now: **Live numbers band** (`src/components/landing/reasons.tsx`,
  - Why: `principles.tsx` is gone.
- Was: shared by the hero and final `StartForm`s and the `DemoDeck` (example cards, never real members; «مهتم» plays the mutual-match reveal, «لا» shows the secrecy line).
  - Now: shared by the hero and final `StartForm`s.
  - Why: `DemoDeck` is gone.
- Was: Sections: hero → how it works (4 steps across on desktop) → «نصيبك ليس تطبيق تعارف» comparison (`content.compare`) + live numbers → FAQ → final CTA.
  - Now: Sections (`landing-body.tsx`): hero → steps → product tour → trust → reasons (live numbers) → FAQ → final CTA.
  - Why: the comparison section is gone.
- Was: - **Hero example card** mirrors the real suggestion card labels («مهتم» / «لا»)
  - Now: - **Hero and product tour** show real product screens in `PhoneFrame`
  - Why: the example card is gone.
- Was: the Runway key is `RUNWAYML_API_SECRET` in the local `.env.local` only (never committed, not on the server).
  - Now: the Runway key is `RUNWAYML_API_SECRET`, only in the `.env.local` of the old Desktop checkout (never committed, not on the server, not in this checkout's env).
  - Why: this checkout has no `.env.local`.
- Was: lists all 58 live messages per country
  - Now: lists all live messages per country
  - Why: the count changes (62 keys today).
- Was: `automatic-notifications.test.ts` fails
  - Now: `src/__tests__/lib/automatic-notifications.test.ts` fails
  - Why: full path.
- real phone removed.
- real phones removed; the rest is in Mobile app and stores.
- Was:  or the waiting nudge (`sms: "waiting"`)
  - Now: (removed)
  - Why: the waiting nudge was removed.
- Was: Prices are shown in JOD but charged in **USD** — one package list per country
  - Now: Jordan's prices are shown in JOD and charged in **USD**, Saudi Arabia's shown and charged in SAR — one package list per country
  - Why: Saudi Arabia charges in SAR.
- Was: Nginx → `127.0.0.1:3000`, PM2
  - Now: Nginx → the live slot's port, PM2
  - Why: two slots since 2026-11-05.
- Was: Before that: daily job 06:00, DB backup 03:30 (
  - Now: DB backup 03:30 (
  - Why: the daily job moved; the backup did not.
- Was: `sudo -u naseebak pm2 restart naseebak --update-env`
  - Now: `sudo -u naseebak pm2 restart naseebak-a --update-env` (or `naseebak-b`, whichever slot is live)
  - Why: PM2 apps are per slot since 2026-11-05.
- Was: where it tops up to 5 open instead
  - Now: where it tops up to 10 open instead
  - Why: limit is 10.
- Was: doesn't fill one of the 5 open slots
  - Now: doesn't fill one of the 10 open slots
  - Why: limit is 10.
- Was: respect the 5-open cap
  - Now: respect the 10-open cap
  - Why: limit is 10.
- Was: and a card still hidden from the candidate fills neither side's slot (2026-10-19).
  - Now: and a card still hidden from the candidate fills the recipient's slot, never the candidate's (since 2026-11-06).
  - Why: `slotMutualWhere`.
- Was: (shown at once above their 5, full 7-day window
  - Now: (shown at once, whatever their «جديدة» holds, full 7-day window
  - Why: limit is 10.
- Was: a «مهتم» only triggers the neutral waiting nudge above
  - Now: a «مهتم» sends «شخص أبدى اهتمامه بك», see Interest is shown
  - Why: the waiting nudge was removed.
- Was: Idle users are never suggested to others and get no new suggestions until they come back (lazily).
  - Now: Idle users are never suggested to others and get no new suggestions until they come back (lazily); shared suggestions use 7 days, see Candidates must be recently seen.
  - Why: 30 days is the legacy rule.
- Was: `pending` = 5 open
  - Now: `pending` = 10 open
  - Why: limit is 10.
- Was: it tops up to 5 open for users with fewer
  - Now: it tops up to 10 open for users with fewer
  - Why: limit is 10.
- Was: runs `/usr/local/bin/naseebak-daily-job` at 06:00 Amman time (reads
  - Now: runs `/usr/local/bin/naseebak-daily-job` with `morning` (06:00), `evening` (18:00) and `frequent` (every 15 minutes), Amman time (reads
  - Why: three parts since 2026-11-05.
- Was: onboarding storage through `src/lib/onboarding.ts` (try/catch, Safari private mode); 
  - Now: (removed)
  - Why: the file is gone.
- Was: ADMIN_ADJUST, MIGRATION_GIFT, REFUND, REFERRAL)
  - Now: ADMIN_ADJUST, MIGRATION_GIFT, REFUND, REFERRAL, POLL_REWARD)
  - Why: enum has POLL_REWARD.
- real phone removed.
- Was: turn «Payments in the app» off before an App Store submission (the switch covers both platforms).
  - Now: this older advice said to turn «Payments in the app» off before an App Store submission (the switch covers both platforms); since 2026-11-04 the owner keeps it on, so ask before the next submission.
  - Why: unsettled, flagged.
- Was: (`contactSchema` in `src/lib/validations/contact.ts`: a Jordanian mobile or an email, at least one;
  - Now: (`contactSchemaFor(country)` in `src/lib/validations/contact.ts`: a mobile of the visitor's country or an email, at least one;
  - Why: the schema is per country now.
- Was: GTM and the Meta Pixel stay public-only (`isPrivatePath()`; the Pixel's push-state page views are off).
  - Now: GTM and the Meta Pixel stay public-only (`isMarketingOffPath()`: `isPrivatePath()` plus `/pay`, `/payments`, `/login` and the password pages; the Pixel's automatic push-state page views are off and `PublicTracking` sends a `PageView` on moves to public page…
  - Why: changed 2026-11-06.
