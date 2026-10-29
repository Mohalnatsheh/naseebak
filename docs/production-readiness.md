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
| iOS | Needs a Mac with Xcode, Apple Developer account, bundle id, signing — not buildable on this Windows machine |
| Push | Not active. Needs a Firebase project (`google-services.json` / `GoogleService-Info.plist`), FCM server key on the backend and a device-token endpoint; the web keeps OneSignal |
| Payments in the app | The app opens Stripe's hosted page and polls the payment; review app-store rules for selling digital credits (Google Play / Apple may require their in-app purchase for digital goods) — **owner/legal decision before release** |
| Real time chat | The app uses the same subscribe-only Ably tokens as the web (SSE, read-only) with polling as the fallback. **Not tested end to end** — no `ABLY_API_KEY` locally; check on a staging server with the key before release |
| Photos | Production uploads go to Bunny as today; the local `.dev-uploads/` fallback is refused on any server whose address isn’t localhost |

## Known limitations
- The admin country settings are global per country; the new-cycle switches, blog and `سؤال نصيبك` questions are
  still shared by all countries (polls can be switched off per country).
- Members can't change country (it follows the phone number by design).
- English is used in the admin only; the public site and the app are Arabic.
