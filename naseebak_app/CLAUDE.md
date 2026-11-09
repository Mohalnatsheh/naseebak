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
  saved login). In step with this copy since 2026-11-09 (mirror `20ad85f` = main `f523654`); find what to copy with
  `git diff --name-only <last synced main commit>..HEAD -- naseebak_app`.
- `~/Desktop/Evokey-APPS/Naseebak/naseebak` is an old website checkout — never work there.

## Before you change anything: does it need a store release?

Most product changes are **server-only** and reach the app at once (no new version): what a list contains and in which
order, limits, prices, texts that come from the API, notices and pushes, popups (Admin → Popup Alerts), the force-update
and maintenance switches, «Payments in the app». A change needs a **new app version** only when the app itself decides
something. Known cases:

- **Locks decided in the app:** «مهتم» is disabled at 0 credits on the phone (`_outOfCredits` in
  `features/discovery/suggestions_screen.dart`, `interestDisabled`). Since 1.0.1 a card that liked you stays usable at 0
  while `flags.freeInterestReply` is on (`_freeReply`).
- New screens, new fields the app must send, analytics events, push channel or deep-link changes.

Tell the owner which kind a change is before building it; on 2026-11-04 they parked a feature because its app part
needed a release.

## Rules

- **Never test against production by accident.** Every build defaults to `https://naseebak.com`; local runs need
  `--dart-define=API_BASE_URL=http://10.0.2.2:3020` (emulator) and a local backend (see README).
- **Parity with the website:** the app covers every member page. Form lists and options come from
  `GET /api/countries/{code}` (`lists` + `options`) — add an option on the server, never only in the app.
- **Arabic, RTL, gendered copy:** member-facing text follows the member's gender (`home/gendered_copy.dart`).
- **Notices are push + bell.** The app never sends SMS. The server's narrowed notice SMS (match or «مهتم», only to
  members with no push for 14 days, `sms_notices_enabled`) is decided on the server: see `../CLAUDE.md`.
- **Links from the server** open only as https / mailto / tel (`isSafeExternalLink` in `shared/widgets/common.dart`);
  store links also `itms-apps` / `market`; checkout only https.
- **Privacy:** chats and a match's photos are `SecureArea`s (`core/privacy/screen_privacy.dart`): Android
  `FLAG_SECURE`, iOS blur while recording. Analytics never sends ids in screen names (route patterns only).
- `flutter analyze` must stay at 0 issues and `flutter test` green (fake Dio adapter, no network).
- **After any `await` in a State**, check `mounted` before `setState`/`ref`/`context`, or take
  `ProviderScope.containerOf(context, listen: false)` before the request when a refresh must still happen. Leaving a
  screen mid-request crashed 1.0.0 («Cannot use "ref" after the widget was disposed», «Null check operator» in release).
  Test it with `FakeAdapter.hold` (`test/leave_mid_request_test.dart`).
- **No Hero animations:** a `FloatingActionButton` needs `heroTag: null` (its default Hero crashed between two support
  screens, `RenderBox was not laid out`).
- **Saudi sign-in code wording** («عبر واتساب») is chosen in the app from the country, not from the server's channel.
  If Saudi codes ever go back to SMS (VerifyWay key removed or provider changed), the app text needs a new version.

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
- **Pro membership (1.1.0):** `lib/features/pro/` (repository, `ProScreen`, plans card, «اشتراكي», badge). Pro has
  its own screen «عضوية Pro» at route `/pro` (`pro_screen.dart`, the website's `/dashboard/pro`; owner, 2026-11-10);
  the credits screen keeps packages + history and one small «عضوية Pro» link card (`ProLinkCard`), and «حسابي» has an
  «عضوية Pro» entry under «الرصيد والباقات». Links: `/dashboard/pro` → `/pro` (`appRouteForLink`, website links; matched
  exactly, `/dashboard/profile` starts with it too), old `/credits?section=pro` redirects to `/pro`
  (`creditsRedirect`). Plans are
  bought with Stripe in the phone's browser like credits (https only, `LaunchMode.externalApplication`); on the return
  the app re-reads `/api/pro` + counts for up to 10 s, then shows «سيتم تفعيل العضوية خلال لحظات». Cancel stops the
  renewal only (no refund button: refunds are admin-only); «متابعة الاشتراك» resumes. **Test-account rule (owner,
  2026-11-10):** every Pro purchase surface (the screen's content, the menu entry, the link card, «اشتراكي», the greyed
  media buttons and the «عضوية Pro» link under a `PRO_REQUIRED` failure) needs `appPaymentsProvider` true:
  `showPlans` = `appPayments && (canBuy || isPro)`. A test or review account (app payments off) sees none of it, even
  if it is Pro, and `/pro` opened directly shows «عضوية Pro غير متاحة حالياً.»; it doesn't even read `/api/pro` there.
  A Pro test account can still send media (sending is not a purchase). Never trust a server flag alone for this (e.g.
  `/api/me/counts` `pro.showPage` can be true for a Pro test account): always AND it with `appPaymentsProvider`.
  Pro members send photos (`image_picker`, ≤ 2048 px, JPEG q85, ≤ 10 MB) and
  voice notes (`record`, AAC-LC 64 kbps mono `.m4a`, `voiceRecordConfig`, stops at 180 s and waits, never auto-sent) in an ACTIVE chat; non-Pro
  members who can buy see the buttons greyed with a «Pro» tag that opens `/pro`; everyone else doesn't see them. A
  `PRO_REQUIRED` upload failure shows the server's message with no «إعادة الإرسال» (plus the `/pro` link where
  purchasable). A voice bubble shows the server's `durationSec`; the player's real length only drives the progress bar.
  Everyone sees and hears media sent to them. Media (`media.url`, relative) loads with the Bearer token, sent only to
  the API's own origin; voice plays through `just_audio` with `useProxyForRequestHeaders: false` (headers go straight
  to AVPlayer / ExoPlayer). **The server media route `GET /api/chats/{id}/media/{mid}` must never redirect** (players
  may re-send the Bearer header to the redirect target). The server's `canBuy: false` for test accounts
  (`EXTRA_TEST_PHONES`, and the built-in test numbers wherever `ALLOW_BUILTIN_TEST_PHONES` is on) is only a second
  layer: the rule above (`appPaymentsProvider`) is what hides Pro in the app.
  **Voice playback** (`features/chat/voice_playback.dart`): `VoicePlayback` owns the players, one note at a time, so a
  note keeps playing when its bubble scrolls away; the chat room pauses it when the app leaves the foreground, pauses
  and blocks it while recording, and closes every player when the chat is left. On iPhone each play first sets the
  audio session to playback / spoken audio (`audio_session`), so notes play with the silent switch on and after a
  recording (which leaves `playAndRecord`). **Pro state freshness:** `/pro` re-reads a state another screen kept alive
  (spinner, never stale plans) and on resume; the chat re-reads it on resume and when the counts poll's `pro.isPro`
  disagrees with it.
- **Config gate:** `GET /api/mobile/config` on start and every resume → force update / optional update / store links /
  maintenance (`core/update/app_update.dart`). Popup alerts: `GET /api/alerts/current?platform=app`.
- **Crashlytics:** release builds only.

## API the app uses

`/api/mobile/{auth/token, auth/logout, me, config, push}`, `/api/auth/{send-otp, verify-otp, register}`, `/api/countries`,
`/api/profile/*` (draft, update-request, photos, parent-info, dealbreakers, personality-quiz, deactivate/reactivate,
delete), `/api/suggestions` (top-up) and `/api/suggestions/feed?tab=new|interested|waiting`,
`/api/suggestions/{id}/decide`, `/api/matches/*`, `/api/intro-requests/*`, `/api/chats/*` (+ `ably-token`; since
1.1.0 `POST /api/chats/{id}/media` multipart `file` + `kind` IMAGE|VOICE + `durationSec` + `clientNonce`, and
`GET /api/chats/{id}/media/{mid}` with Bearer + Range), `/api/pro`, `/api/pro/{checkout, cancel, resume}` (1.1.0),
`/api/notifications/*` (incl. `read-for-page`), `/api/me/counts`, `/api/payments/{plans, checkout, {id}/status, cancel,
history}`, `/api/alerts/*`, `/api/polls/*`, `/api/referral/*`, `/api/blocks/*`, `/api/reports`, `/api/support`.
Changing one of these on the server must keep old app versions working (members update slowly).

## Store release

- **Ids:** Android `com.naseebak.naseebakApp` (the Play listing's fixed id since 2026-11-01; the Kotlin namespace and
  Firebase's first Android app `com.naseebak.naseebak_app` are leftovers), iOS bundle `com.naseebak.naseebakApp`,
  team `4S958MQTCR`, iPhone only, portrait, iOS 15+.
- **Status (2026-11-09):** Google Play live with 1.0.1 (required on Android since 2026-11-09); 1.0.2+3 built, not uploaded to Play, and in TestFlight. App Store: 1.0.0 (1) was in review (2026-11-04); no iPhone minimum version is set. Once Apple approves: set the iOS
  store link in Admin → Settings → «Mobile app», check Universal Links on an iPhone, remove the review numbers from
  `EXTRA_TEST_PHONES` on the server.
- **1.0.1+2 (Play, bundle rebuilt 2026-11-09 from `f523654`, not uploaded yet):** free «مهتم» reply (follows
  `free_interest_reply`), the niqab answer («الحجاب»: محجبة / منتقبة / غير محجبة) and the «منتقبة» partner preference, chat
  tabs «النشطة» / «المنتهية» (opens on active), chat keyboard stays open and the chats list refreshes itself, six
  Crashlytics fixes (lost connection reported as a crash, `core/analytics/crash_filter.dart` `isExpectedError`; SMS
  autofill `invalid selection start: 6`, `core/localization/safe_input_formatter.dart`; three screens closed
  mid-request; the support button's Hero), setup refreshes the cached profile, feminine and neutral copy, guardian
  number `+962 79 …`, `X-App-Platform`, the activity label on cards, the WhatsApp wording for Saudi codes. Bundle:
  `~/Documents/EvoKey-Projects/naseebak-release-1.0.1/naseebak-1.0.1-2.aab`. If build 2 was ever uploaded, bump to +3.
  Once live: force update to 1.0.1 (1.0.0 locks «مهتم» at 0 credits and has the crashes).
- **Builds:** bump `version: 1.0.x+N` in `pubspec.yaml` for every upload. Android signing reads
  `android/key.properties` (git-ignored; key `~/.naseebak-keys/naseebak-upload.jks`, alias `upload` — never commit it).
  iOS: `flutter build ipa` signs through Xcode's account («Apple Distribution: Evolution Key for Information
  Technology»). Run `flutter clean` (+ `pod install` with `LANG=en_US.UTF-8`) before a store build if the app ran on
  the simulator, or Apple refuses the upload (simulator `objective_c.framework`). Store texts, review login and privacy
  answers: `~/Documents/EvoKey-Projects/naseebak-release-1.0.0/store-listing.md`.
- **Next version, filter tip (owner, 2026-11-05):** the empty «جديدة» page (`suggestions_screen.dart`, `emptyReason == 'no_candidates'`) doesn't show the website's tip («لو خففت شرط «العمر» يظهر لك 43 شخصاً مناسباً.»); app users get it only by push + bell. To add: `GET /api/suggestions/filter-tip` returns `{ text }` (null = nothing to show), show it above «تعديل تفضيلاتي». The route uses `requireUser`, which accepts the app's Bearer sign-in, so the server needs no change.
- **1.0.2+3 (2026-11-09, from `6997f08`):** a registered number on «حساب جديد» signs in right after the code; setup
  errors clear as soon as they are answered. Play bundle: `~/Documents/EvoKey-Projects/naseebak-release-1.0.2/naseebak-1.0.2-3.aab`
  (not uploaded yet). iOS: uploaded to App Store Connect / TestFlight the same day with `xcodebuild -exportArchive`
  (ExportOptions from `flutter build ipa`, `destination` = `upload`, `manageAppVersionAndBuildNumber` = false; uses
  the Xcode account, no API key). The 1.0.1 notes above say Play has 1.0.1 live; the App Store had only 1.0.0 then.
- **1.1.0+4 (Pro, branch `feature/pro-membership`, not built for the stores yet):** Pro plans and «اشتراكي» on their
  own screen `/pro` (link card on the credits screen, entry in «حسابي»), photos and voice notes in chat (Pro to send, everyone to view and play), the Pro badge on cards,
  chats and home, `ChatCache` v2 (drops 1.0.x caches), image cache cleared on sign-out. New packages `record` and
  `just_audio`; new permissions: iOS `NSMicrophoneUsageDescription` («لتسجيل رسالة صوتية في المحادثة»), the photo text
  now covers chat, Android `RECORD_AUDIO`; privacy manifest adds `AudioData`. **Before upload, update the store privacy
  answers** (Play Data safety and App Store privacy labels): audio (voice notes) and photos are now collected in chat,
  linked to the user, for app functionality, not tracking. Give the review account no Pro: it never sees Pro (above).
  Ships only once the server's Pro branch is live (`pro_enabled` off: `canBuy` false and nobody is Pro, so nothing Pro
  shows). QA'd on the iOS Simulator (iOS 17.5) and an Android emulator against a local backend on 2026-11-09. Local
  QA note: the built-in test numbers count as test accounts locally, so start `next start` with
  `ALLOW_BUILTIN_TEST_PHONES=false` to see Pro in the app (codes then come from `/api/dev/sms-outbox`), and the mock
  Pro checkout returns a relative url the app refuses (https only), so finish it with
  `POST /api/dev/mock-checkout/<paymentId> {"outcome":"paid"}`.
- **Planned, not built (next version):** a `purchase` analytics event, and popup taps:
  `features/alerts/alert_gate.dart` posts `/api/alerts/{id}/dismiss` with no body, so admin → Popup Alerts can't tell an
  app tap from a close — send `{ "action": "TAPPED" | "CLOSED" }` like the website does (the server already accepts it;
  «Seen» is counted on the server and needs nothing from the app).

## Gotchas

- Android needs Kotlin 2.3 (`settings.gradle.kts`) for Play services built with Kotlin 2.4.
- iOS Podfile pins `$FirebaseSDKVersion = '12.19.0'`; Firebase stopped publishing CocoaPods after Oct 2026, so this pin
  still builds but no newer Firebase will come that way — move to Swift Package Manager before the next Firebase update.
- `flutter build ios --simulator` fails (no x86_64 engine): use `flutter run -d <simulator>`.
- The first launch after an install clears a keychain token (iOS keeps it after the app is deleted).
- Arabic text can't be typed with `adb shell input text`.
