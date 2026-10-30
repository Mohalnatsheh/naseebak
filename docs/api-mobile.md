# Naseebak mobile API

The Flutter app (`naseebak_app/`) talks to the **same Next.js API as the website** — there is no second backend.
Base URL: `https://naseebak.com` in production; locally `http://localhost:3020` (Android emulator:
`http://10.0.2.2:3020`). All bodies are JSON (UTF-8). Arabic messages are meant to be shown to the member as is.

## Conventions

- **Auth:** `Authorization: Bearer <token>` on every member endpoint (the web uses a cookie; both work everywhere
  `requireUser()` is used). Tokens come from `POST /api/mobile/auth/token`, last 60 days, and are revoked on logout.
- **Errors:** non-2xx answers are `{ "error": "<Arabic message>", "code"?: "<MACHINE_CODE>" }`. Common statuses:
  400 invalid input · 401 not signed in / token invalid → sign out locally · 403 `DEACTIVATED` (account paused: only
  `/api/profile/reactivate` works) or forbidden · 404 not found · 409 conflict (already done) · 429 rate limited ·
  502 provider failure (SMS / Stripe) · 503 maintenance.
- **Pagination:** list endpoints take `?page=1` (1-based) and answer `page`, `total`, `totalPages`.
- **Country:** a member's country is fixed by their phone number at registration (962 → JO, 966 → SA). The app sends
  the picked country with sign-up (`country`), and the server checks it matches the number. Members only ever see
  people of their own country; packages and currency follow the member's country.
- **Digits:** Western digits everywhere; phone and code fields also accept Arabic-Indic digits.

## Countries (public, no auth)

### `GET /api/countries`
Active countries only.
```json
{
  "defaultCountry": "JO",
  "countries": [{
    "code": "JO", "name": { "ar": "الأردن", "en": "Jordan" }, "inName": "في الأردن",
    "flag": { "emoji": "🇯🇴", "id": "jo" }, "dialCode": "+962",
    "phone": { "placeholder": "7XXXXXXXX", "example": "0791234567", "nationalPattern": "^7[789]\\d{7}$" },
    "currency": { "code": "JOD", "symbol": "د.أ" },
    "locales": ["ar"], "defaultLocale": "ar", "direction": "rtl",
    "timeZone": "Asia/Amman", "dateLocale": "ar-JO-u-nu-latn",
    "isDefault": true, "active": true, "registrationOpen": true, "purchasesEnabled": true,
    "features": { "polls": true },
    "words": { "phone": "هاتف", "tribe": "العشيرة", "nationalityMale": "أردني", "nationalityFemale": "أردنية" }
  }]
}
```
`nationalPattern` validates the number after the dial code (without the leading 0).

### `GET /api/countries/{code}`
One active country with page text and links; 404 `COUNTRY_UNKNOWN` / `COUNTRY_INACTIVE`.
Adds `content { heroTitle, heroSubtitle, seoTitle, seoDescription }`, `support { email, phone, whatsapp }` and
`links { home, terms, privacy, refundPolicy, faq, contact, register }` (absolute URLs), and `lists { cities, areas, nationalities: { male, female } }` — the same choices the web setup wizard offers for that country.

Never returned: SMS provider, sender ids, credentials, Stripe keys, internal settings.

## Sign-up and sign-in

1. `POST /api/auth/send-otp` `{ phone, context: "register" | "login", country? }` → `200 { message, userExists? }`.
   Sign-up (`register`) never reveals whether the number exists. Errors: 403 `COUNTRY_INACTIVE` /
   `COUNTRY_REGISTRATION_CLOSED` (or the global registration switch), 400 `COUNTRY_MISMATCH` (number not of the picked
   country), 429 (3 codes per number per 5 min, 10 per IP per 15 min), 502 (SMS could not be sent — locally, use the
   mock outbox), 503 maintenance.
2. `POST /api/auth/verify-otp` `{ phone, code }` → `200 { verified: true }`. 5 tries per number, then the code is gone.
3. New member only: `POST /api/auth/register`
   `{ firstName, lastName, phone, gender: "MALE"|"FEMALE", otp, termsAccepted: true, country? }` → `201`.
   409 `PHONE_EXISTS` = already a member → just do step 4.
4. `POST /api/mobile/auth/token` `{ phone, code, device? }` → `201 { token, expiresAt, user }`.
   401 `INVALID_CODE` (wrong/expired/already used), 429 `RATE_LIMITED` (`retryAfterMinutes`). The code is used up here.
5. `GET /api/mobile/me` → `{ user }` (works for paused accounts too):
   `{ id, firstName, lastName, gender, phone, country: <country>, credits, status, deactivated, profile: { exists, complete }, createdAt }`.
6. `POST /api/mobile/auth/logout` (Bearer) → `{ ok: true }`; the token stops working at once.

Test numbers (fixed code `111111`, never an SMS): see `docs/local-testing.md`.

## Push notifications (Firebase Cloud Messaging)

The app gets push straight from FCM (`src/lib/fcm.ts`); the website stays on OneSignal. Every `notify()` sends to both.

- The device is its Firebase Installation ID (FID, FCM direct send: `FirebaseMessaging.register()` → `onRegistered`;
  the old registration tokens are deprecated in firebase_messaging 17 / firebase-admin 14).
- `POST /api/mobile/push` (Bearer only) `{ fid, platform: "android" | "ios" }` → `{ ok: true }`. Call it after sign-in
  and on every `onRegistered`. The FID is tied to this sign-in: after logout / revoke / expiry it gets no pushes.
  403 `APP_ONLY` (website cookie, or a token of another sign-in), 400 `INVALID`.
- `DELETE /api/mobile/push` `{ fid }` → `{ ok: true }`. Call it before `/api/mobile/auth/logout`.
- Message: `notification { title, body }` + `data { url? }` — `url` is the website path (`/dashboard/chats/<id>`,
  `/dashboard/matches?match=<id>`, …); the app maps it to a screen like the in-app notifications list (`appRouteFor`).
  Android channel `naseebak_default`; chat pushes replace each other (same `tag` / `collapseKey`).
- Server env: `FCM_CREDENTIALS` = the Firebase service-account JSON on one line. Unset → no FCM pushes.
- A member with the app and a valid sign-in counts as reachable for the SMS fallback (no notice SMS).

## App config (public, no auth)

- `GET /api/mobile/config` → `{ android: { minVersion, latestVersion, storeUrl }, ios: { … } }` (Admin → Settings →
  «Mobile app»). Below `minVersion` the app shows a full-screen «حدّث التطبيق»; below `latestVersion` a dismissible
  notice; empty = no gate. Read on start and every resume; a failed request never blocks the app.
- `GET /api/mobile/me` → `user.appPayments`: buying shown in the app (the admin switch; always false for test
  accounts). The app checkout (`mode: "hosted"`) answers 403 `APP_PURCHASES_DISABLED` when it is false.

## Chat paging

- `GET /api/chats/{id}` → the newest 30. Older: `?before=<createdAt>&beforeId=<id>` of the oldest message held (exact
  cursor, ordered by time then id). Newer: `?after=<createdAt>` (inclusive — drop messages you already have).

## Payments

- `GET /api/payments/plans` → `{ country, purchasesEnabled, packages: [{ id, name, credits, price, currency, currencySymbol, chargeUsd?, chargeLabel, popular?, wasPrice? }] }`.
  When `purchasesEnabled` is false (country not selling yet — Saudi Arabia today) show the packages as unavailable.
- `POST /api/payments/checkout` `{ packageId, mode: "hosted" }` →
  `{ checkoutUrl, paymentId }` (open in the browser) or, locally with mock payments, `{ mock: true, paymentId }`.
  403 `PURCHASES_DISABLED`, 400 `INVALID_PACKAGE`, 502 Stripe unavailable.
- `GET /api/payments/{paymentId}/status` → `{ payment: { id, status: "PENDING"|"COMPLETED"|"FAILED"|"REFUNDED", packageId, amount, currency, createdAt }, credits }`.
  Poll every 2–3 s for up to ~2 min after returning from the checkout page. The server adds credits only after Stripe
  confirms the payment (and only once) — the app never adds credits itself.
- Local only: `POST /api/dev/mock-checkout/{paymentId}` `{ outcome: "paid" | "cancelled" }` → `{ result }` (404 on real servers).
- `GET /api/payments/history?page=1` → the member's payments (web shape: `amount` is a decimal string; prefer `/api/payments/{id}/status` for one payment).

## Member endpoints the app uses (existing, unchanged)

All take the Bearer token. Source of truth for each shape: the route file under `src/app/api/<path>/route.ts`.

| Feature | Endpoints |
|---|---|
| Counts / badges | `GET /api/me/counts` (flags, credits, new suggestions, liked-you, unread chats, pending intros) |
| Profile | `GET/PUT /api/profile`, `PATCH /api/profile/draft`, `POST /api/profile/update-request` (only `pref*` keys = saved at once, no review), `GET/PUT /api/profile/dealbreakers` (GET returns the `pref*` fields + `dealbreakers`), `GET/POST /api/profile/personality-quiz` (20 statements, answers 1–5, retake after 3 months), `GET/POST /api/profile/photos`, `PATCH/DELETE /api/profile/photos/{id}`, `GET/PUT /api/profile/parent-info` |
| Suggestions (discovery) | `GET /api/suggestions` (tops up, `emptyReason` — **call it before the feed**: `/feed` only reads, it never creates new cards), `GET /api/suggestions/feed?tab=new|interested|waiting&page=`, `POST /api/suggestions/{id}/decide` `{ interested: boolean, introPreference?: "CHAT"|"FAMILY", guardianConsent?: boolean }` («مهتم» needs `introPreference`; FAMILY needs the guardian saved + consent; errors carry `code`: `NO_CREDITS`, `GUARDIAN_REQUIRED`, `CONSENT_REQUIRED`, `PREFERENCE_REQUIRED`) |
| Matches | `GET /api/matches` (`?focus=<matchId>` to open one; there is no `GET /api/matches/{id}`), `POST /api/matches/{id}/intro`, `POST /api/intro-requests/{id}/respond`, `POST /api/intro-requests/{id}/cancel`, `POST /api/matches/{id}/outcome`, `GET /api/matches/{id}/photos` |
| Chats | `GET /api/chats`, `GET /api/chats/{id}?before=<iso>|after=<iso>` (conversation + a page of messages), `POST /api/chats/{id}/messages`, `POST /api/chats/{id}/read`, `POST /api/chats/{id}/end`, `POST /api/chats/{id}/extend` (live updates: `GET /api/chats/ably-token` → an Ably token request (404 without `ABLY_API_KEY`); the app exchanges it at `https://rest.ably.io/keys/{keyName}/requestToken` and listens on `https://realtime.ably.io/sse?v=1.2&channels=chat:{id}&accessToken=…`; each event only triggers `GET /api/chats/{id}?after=`; polling every 4 s without Ably, every 20 s with it) |
| Profile lists | `GET /api/countries/{code}` → `country.lists` (cities, areas, nationalities, `incomeRanges`, `expenseRanges`, `tribeLabel`) and `country.options` (education, job, maritalStatus, religiosity, smokingStatus, cookingAbility, lifestyle, skinColor, housingType) — the app keeps no copies |
| Review requests | `GET /api/profile/update-request` (newest 10; `status` PENDING / APPROVED / REJECTED / WITHDRAWN), `POST /api/profile/update-request/withdraw` |
| Support | `GET /api/support?page=` (tickets with `status`, `adminNote`), `POST /api/support` `{type: ISSUE|SUGGESTION|CHANGE_REQUEST, subject 5–200, description 20–2000}` (5 open at most) |
| Referral | `GET /api/referral` (`referralCode`, `totalReferrals`, `completedReferrals`), `POST /api/referral/apply {code}` (8 characters, before the setup is finished) |
| Photos (local) | Photo URLs are CDN links in production; a local backend without Bunny stores files in `.dev-uploads/` and returns relative `/api/dev/uploads/...` URLs (404 on real servers) — resolve them against the API base |
| Notifications | `GET /api/notifications?page=`, `PATCH /api/notifications/{id}/read`, `PUT /api/notifications/read-all`, `GET /api/notifications/unread-count`, `GET/PATCH /api/notifications/preferences` |
| سؤال نصيبك | `GET /api/polls/current`, `POST /api/polls/vote` `{ pollId, optionId, source: "dashboard" }` |
| Safety | `GET/POST /api/blocks`, `DELETE /api/blocks/{id}`, `POST /api/reports` |
| Account | `POST /api/profile/deactivate` `{ action: "pause"|"resume" }`, `POST /api/profile/reactivate`, `POST /api/profile/delete` |

The business rules (credits on «مهتم», refunds, matching, privacy of «لا», photos hidden until a match) all live on
the server; the app only shows what these endpoints return.
