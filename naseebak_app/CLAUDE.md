# CLAUDE.md — Naseebak mobile app (نصيبك)

Flutter app (Android + iPhone) for **naseebak.com**. It talks to the **same Next.js API as the website** and shows
what the server returns: matches, credits, privacy and limits are decided on the server. Setup, run commands, test
accounts and troubleshooting are in `README.md`; the website/server rules are in `../CLAUDE.md` (read
`../docs/reference/countries-and-app.md` before changing anything that touches the API).

## Where the code lives (two repos — keep them identical)

- **Main copy:** `~/Documents/EvoKey-Projects/naseebak/naseebak_app/` inside the website repo
  (`github.com/Mohalnatsheh/naseebak` + GitLab `main`, which production deploys from). Work here.
- **Mirror:** `~/Documents/EvoKey-Projects/naseebak_app/` = `github.com/Mohalnatsheh/naseebak_app`
  (`main` and `feature/fcm-push`). After an app change, copy the changed files over and push
  (`git push git@github.com:Mohalnatsheh/naseebak_app.git HEAD:main HEAD:feature/fcm-push`; the https remote has no
  saved login). On 2026-11-06 the mirror (`d94b4b3`) was behind this copy in four files, still to copy over:
  `otp_screen.dart`, `phone_screen.dart`, `suggestion_card.dart`, `suggestion_models.dart`.
- `~/Desktop/Evokey-APPS/Naseebak/naseebak` is an old website checkout — never work there.

## Before you change anything: does it need a store release?

Most product changes are **server-only** and reach the app at once (no new version): what a list contains and in which
order, limits, prices, texts that come from the API, notices and pushes, popups (Admin → Popup Alerts), the force-update
and maintenance switches, «Payments in the app». A change needs a **new app version** only when the app itself decides
something. Known cases:

- **Locks decided in the app:** «مهتم» is disabled at 0 credits on the phone (`_outOfCredits` in
  `features/discovery/suggestions_screen.dart`, `interestDisabled`), so "free «مهتم» in some cases" needs an app change.
- New screens, new fields the app must send, analytics events, push channel or deep-link changes.

Tell the owner which kind a change is before building it; on 2026-11-04 they parked a feature because its app part
needed a release.

## Rules

- **Never test against production by accident.** Every build defaults to `https://naseebak.com`; local runs need
  `--dart-define=API_BASE_URL=http://10.0.2.2:3020` (emulator) and a local backend (see README).
- **Parity with the website:** the app covers every member page. Form lists and options come from
  `GET /api/countries/{code}` (`lists` + `options`) — add an option on the server, never only in the app.
- **Arabic, RTL, gendered copy:** member-facing text follows the member's gender (`home/gendered_copy.dart`).
- **No SMS for notices** (owner rule, 2026-11-04): notices are push + bell only; SMS is used for sign-in codes only.
- **Links from the server** open only as https / mailto / tel (`isSafeExternalLink` in `shared/widgets/common.dart`);
  store links also `itms-apps` / `market`; checkout only https.
- **Privacy:** chats and a match's photos are `SecureArea`s (`core/privacy/screen_privacy.dart`): Android
  `FLAG_SECURE`, iOS blur while recording. Analytics never sends ids in screen names (route patterns only).
- `flutter analyze` must stay at 0 issues and `flutter test` green (fake Dio adapter, no network).

## Integrations

- **Push:** Firebase project `naseebak-app`, FCM direct send to Firebase Installation IDs registered with
  `POST /api/mobile/push` (`core/push/push_service.dart`), Android channel `naseebak_default`. iOS needs the APNs `.p8`
  from Apple team `4S958MQTCR` in Firebase. Logout removes the device first.
- **Analytics (Firebase / GA4):** `core/analytics/analytics.dart`, release builds only (`--dart-define=ANALYTICS_DEBUG=true`
  + `adb shell setprop debug.firebase.analytics.app com.naseebak.naseebakApp` for DebugView). Member id + gender +
  country, screen views by route pattern, funnel events: `otp_requested`, `otp_verified`, `sign_up`, `login`,
  `invite_code_applied|failed`, `setup_step_completed`, `setup_completed`, `interest_sent`, `suggestion_declined`,
  `match_created`, `chat_request_sent`, `family_request_sent`, `intro_request_answered`, `chat_started`,
  `begin_checkout`. **No `purchase` event yet** (owner: not now). The website and both apps send to one GA property
  (558342209), so Realtime counts web + app together.
- **Every request** sends `X-App-Platform: android|ios` (`core/network/api_client.dart`, added 2026-11-04, not yet in a
  store build) for the admin «Active by device» card; older builds are told apart by their push device.
- **Website links (App Links / Universal Links):** naseebak.com `/dashboard`, `/dashboard/*` and `/register` open the
  app (`core/routing/website_links.dart`); any incoming link goes to home first, then pushes the mapped screen (so a
  screen already open is replaced). Android: verified since 2026-11-04 (Play signing + upload key in
  `/.well-known/assetlinks.json`, from Admin → Settings → «Mobile app»). iPhone: works once the App Store build is live.
- **Payments:** credits are bought with **Stripe** in the phone's browser (`launchUrl` external), not Google/Apple
  billing — the owner's choice, known store-review risk. The app polls `GET /api/payments/{id}/status` when it comes
  back; Stripe returns to `naseebak.com/payments/return` («العودة إلى التطبيق» on Android opens `/dashboard/payments`).
  «Payments in the app» (`mobile_payments_enabled`) is ON since 2026-11-04; review/test accounts (`EXTRA_TEST_PHONES`)
  never see payments.
- **Config gate:** `GET /api/mobile/config` on start and every resume → force update / optional update / store links /
  maintenance (`core/update/app_update.dart`). Popup alerts: `GET /api/alerts/current?platform=app`.
- **Crashlytics:** release builds only.

## API the app uses

`/api/mobile/{auth/token, auth/logout, me, config, push}`, `/api/auth/{send-otp, verify-otp, register}`, `/api/countries`,
`/api/profile/*` (draft, update-request, photos, parent-info, dealbreakers, personality-quiz, deactivate/reactivate,
delete), `/api/suggestions` (top-up) and `/api/suggestions/feed?tab=new|interested|waiting`,
`/api/suggestions/{id}/decide`, `/api/matches/*`, `/api/intro-requests/*`, `/api/chats/*` (+ `ably-token`),
`/api/notifications/*` (incl. `read-for-page`), `/api/me/counts`, `/api/payments/{plans, checkout, {id}/status, cancel,
history}`, `/api/alerts/*`, `/api/polls/*`, `/api/referral/*`, `/api/blocks/*`, `/api/reports`, `/api/support`.
Changing one of these on the server must keep old app versions working (members update slowly).

## Store release

- **Ids:** Android `com.naseebak.naseebakApp` (the Play listing's fixed id since 2026-11-01; the Kotlin namespace and
  Firebase's first Android app `com.naseebak.naseebak_app` are leftovers), iOS bundle `com.naseebak.naseebakApp`,
  team `4S958MQTCR`, iPhone only, portrait, iOS 15+.
- **Status (2026-11-04):** Google Play live with 1.0.0; App Store 1.0.0 (1) in review. Once Apple approves: set the iOS
  store link in Admin → Settings → «Mobile app», check Universal Links on an iPhone, remove the review numbers from
  `EXTRA_TEST_PHONES` on the server.
- **Builds:** bump `version: 1.0.0+N` in `pubspec.yaml` for every upload. Android signing reads
  `android/key.properties` (git-ignored; key `~/.naseebak-keys/naseebak-upload.jks`, alias `upload` — never commit it).
  iOS: `flutter build ipa` signs through Xcode's account («Apple Distribution: Evolution Key for Information
  Technology»). Run `flutter clean` (+ `pod install` with `LANG=en_US.UTF-8`) before a store build if the app ran on
  the simulator, or Apple refuses the upload (simulator `objective_c.framework`). Store texts, review login and privacy
  answers: `~/Documents/EvoKey-Projects/naseebak-release-1.0.0/store-listing.md`.
- **Next version, filter tip (owner, 2026-11-05):** the empty «جديدة» page (`suggestions_screen.dart`, `emptyReason == 'no_candidates'`) doesn't show the website's tip («لو خففت شرط «العمر» يظهر لك 43 شخصاً مناسباً.»); app users get it only by push + bell. To add: `GET /api/suggestions/filter-tip` returns `{ text }` (null = nothing to show), show it above «تعديل تفضيلاتي». The route uses `requireUser`, which accepts the app's Bearer sign-in, so the server needs no change.
- **Waiting for the next version:** the `X-App-Platform` header (done in code); the rough activity label on suggestion cards (done in code); the Saudi sign-in code wording, WhatsApp instead of «برسالة نصية» (done in code); two Crashlytics fixes (done in code, 2026-11-05): a lost connection is no longer reported as a fatal crash (`core/analytics/crash_filter.dart` → `isExpectedError`, used in `main.dart`'s handlers), and the sign-in code and phone fields use `SafeInputFormatter` (`core/localization/safe_input_formatter.dart`) instead of Filtering + LengthLimiting formatters, which crashed on Android SMS code autofill (`invalid selection start: 6`); planned, not built — women answering a
  man's «مهتم» for free (needs the app to stop locking those cards at 0 credits; design notes in `../docs/reference/suggestions-and-credits.md`), a
  `purchase` analytics event, and popup taps: `features/alerts/alert_gate.dart` posts `/api/alerts/{id}/dismiss` with
  no body, so admin → Popup Alerts can't tell an app tap from a close — send `{ "action": "TAPPED" | "CLOSED" }` like the
  website does (the server already accepts it; «Seen» is counted on the server and needs nothing from the app).

## Gotchas

- Android needs Kotlin 2.3 (`settings.gradle.kts`) for Play services built with Kotlin 2.4.
- iOS Podfile pins `$FirebaseSDKVersion = '12.19.0'`; Firebase stops publishing CocoaPods after Oct 2026 — plan a move to
  Swift Package Manager.
- `flutter build ios --simulator` fails (no x86_64 engine): use `flutter run -d <simulator>`.
- The first launch after an install clears a keychain token (iOS keeps it after the app is deleted).
- Arabic text can't be typed with `adb shell input text`.
