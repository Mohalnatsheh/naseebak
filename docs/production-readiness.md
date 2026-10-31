# Production readiness — multi-country + mobile app

Nothing on branch `feature/multi-country-mobile` is deployed. This is what must happen before it can be.

## Safe to deploy as is (no behaviour change for Jordan)
- New tables `country_settings`, `mobile_sessions` and enum `SmsProviderKind` are **additive** →
  `naseebak-deploy --db-push --ref <branch>` after review. Existing members stay `country = "JO"` (all 1110 production
  members have 962 numbers — checked 2026-10-29).
- With no `country_settings` rows, Jordan behaves exactly as today and **Saudi Arabia stays closed** (inactive, no
  purchases). After deploy run `node prisma/seed-countries.mjs` (without `--dev`) to create the Jordan row.
- Mock SMS and mock checkout can't run on naseebak.com (they require a localhost `NEXT_PUBLIC_APP_URL`); keep
  `SMS_MOCK` / `PAYMENTS_MOCK` unset on the server anyway.
- Notice SMS stay off (`sms_notices_enabled`); only sign-in codes are sent.

## Before opening Saudi Arabia
| Item | Owner action |
|---|---|
| Saudi SMS | Unifonic (or another provider) account; sender name registered with the CST; set `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID` in the server `.env`; Admin → Countries → «Send test SMS» to a Saudi number |
| Prices | Approve SAR prices; set `PRICES_APPROVED.SA = true` in `src/lib/payments/packages.ts`; confirm the Stripe account can charge SAR (presentment currency) — or charge in USD like Jordan |
| Legal | Saudi terms / privacy / refund text marked `[NEEDS LEGAL REVIEW: KSA]`; operator details (commercial registration, VAT/ZATCA) |
| Flag | The Saudi flag carries the Shahada: the site shows a plain green badge, not the flag graphic — confirm |
| Geo | Optional: Nginx GeoIP2 (MaxMind) to add `x-country-code`, so visitors from Saudi Arabia get the Saudi suggestion banner |
| Switch on | Admin → Countries → Saudi Arabia → Active, Registration open (purchases only after the price step) |

## Mobile app release
| Item | Status / action |
|---|---|
| API | Same server; app talks to `https://naseebak.com` (`--dart-define=API_BASE_URL=https://naseebak.com`) |
| Android signing | Create an upload keystore, `android/key.properties` (never committed), Play Console app, privacy policy URL, data-safety form |
| iOS | `ios/` exists (2026-10-30): bundle `com.naseebak.naseebakApp`, team `4S958MQTCR`, min iOS 15, iPhone only, privacy manifest, push entitlement. Builds and runs on the simulator; a real-device push test is still to do (APNs key uploaded in Firebase for development and production) |
| Push | Built (FCM, Firebase project `naseebak-app`): deploy with `--db-push` (table `push_devices`) and set `FCM_CREDENTIALS` in the server `.env`. Tested end to end on Android against a local backend |
| Payments in the app | Owner decision: Stripe's hosted page, not Apple/Google in-app purchase (store-review risk). Admin → Settings → «Mobile app» → «Payments in the app» hides buying in the app at once; test accounts (the review login `0796922292`) never see payments or payment history in the app |
| Force update | Admin → Settings → «Mobile app»: required / optional version per platform + store links (set the App Store link once listed) |
| Crash reports | Firebase Crashlytics in release builds; iOS dSYMs uploaded by an Xcode build phase |
| App Links | After the Play upload: copy the App signing key SHA-256 (Play Console → App integrity) into Admin → Settings → «Mobile app». iOS Universal Links work from the deploy (Associated Domains on the App ID is added by Xcode automatic signing) |
| Store review account | `0796922292` (code `111111`, in `EXTRA_TEST_PHONES`): test accounts are only suggested to each other — add one or two complete opposite-gender test profiles and credits so reviewers see suggestions, a match and the chat |
| Real time chat | The app uses the same subscribe-only Ably tokens as the web (SSE, read-only) with polling as the fallback. **Not tested end to end** — no `ABLY_API_KEY` locally; check on a staging server with the key before release |
| Photos | Production uploads go to Bunny as today; the local `.dev-uploads/` fallback is refused on any server whose address isn’t localhost |

## Known limitations
- The admin country settings are global per country; the new-cycle switches, blog and `سؤال نصيبك` questions are
  still shared by all countries (polls can be switched off per country).
- Members can't change country (it follows the phone number by design).
- English is used in the admin only; the public site and the app are Arabic.
