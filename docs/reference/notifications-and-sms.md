# Notifications and SMS

Push, bell, SMS, WhatsApp codes and link routing.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## SMS (Broadnet)

Gateway: `gwjo1s.broadnet.me:8443`. Arabic SMS requires `type=2` (Unicode) with UTF-16BE hex encoding via `toUnicodeHex()`.
- Rate limits: send 3/phone/5min, 10/IP/15min; verify 5/phone and 30/IP per 15min — kept in Postgres (`rateLimitDb`, `src/lib/rate-limit-db.ts`, table `rate_limit_buckets`, purged by the daily job; falls back to memory if the DB call fails).
- The IP is `clientIp()` (`src/lib/rate-limit.ts`): `X-Real-IP` from Nginx, else the last `X-Forwarded-For` hop — never the first.
- Sign-in (member and admin) counts **failed** attempts only, 5 per 15 min, also in Postgres (`src/lib/auth-authorize.ts`: `rateLimitDbBlocked` check first, `rateLimitDb` after a failure); when blocked `signIn()` returns code `rate_limited:<minutes>` and the login pages say how long to wait (`rateLimitedMinutes`, `src/lib/login-limit.ts`).
- Other limits (chat, contact) are still in memory.
- **Test accounts** (`src/lib/test-accounts.ts`): the numbers in the server setting `EXTRA_TEST_PHONES` (comma separated) form a test group — fixed code `111111`, only ever suggested to each other (auto-suggest, admin Generate and hand-picks), never to real users, no SMS notices.
- Outside production (and in local Docker via `ALLOW_BUILTIN_TEST_PHONES=true`) the built-in numbers (`FIXED_OTP_PHONES` → `111111`) and the seeded demo numbers join the group too; **on production (NODE_ENV=production) only `EXTRA_TEST_PHONES` count** (the list is in the server `.env`; never copy the numbers into a doc).
One-off SMS campaigns to users (owner approves text and recipients first) run as a node script on the server with the app's `.env`; scripts are kept in `/root/one-off/` (2026-10-18: «أبدى اهتمامه بك» to 31 users). `sendSms` is in `src/lib/sms.ts` (OTP + SMS notices).
**Notice SMS are OFF since 2026-10-29 (owner): SMS only for sign-in codes.** Every notice SMS (below, the chat SMS job, the morning catch-up and the admin «Send SMS now») goes through `sendSmsNotice`, which returns `disabled` unless `system_settings` `sms_notices_enabled` = `"true"` (default `"false"`); `runUnreadSms` / `catchUpQuietSms` stop before doing anything. OTP (`send-otp` → `sendSms`) is never affected.
- **SMS notice fallback** (`src/lib/sms-notice.ts`, owner decision 2026-10-18): `notify()` also texts a member when the event is a mutual match («توافق متبادل!»), the «شخص أبدى اهتمامه بك» reveal, the «اقتراح بانتظار قرارك» expiry reminder (matched by type + title; callers can pass `sms: "<event>"` / `sms: false`) — only if OneSignal has no push subscription for them (404 / none enabled; unknown = no SMS), the member allows that notification type, is a real active `USER` (not a test number), and got no SMS notice yet that Amman day (`User.lastSmsNoticeAt`) — the cap covers admin «Send SMS now» too.
- **No notice SMS 23:00–09:00 Amman** (`isQuietHour`, returns `"quiet"` without claiming the day); `catchUpQuietSms()` (run by `/api/cron/unread-sms` every 15 min) sends the held match/interest/expiring SMS after 09:00 — one per member, the most important, only while the notice is unread.
- Texts carry no names.
**Saudi sign-in codes go by WhatsApp** (owner 2026-11-06): `sendOtpCode` in `src/lib/sms.ts` uses VerifyWay when `VERIFYWAY_API_KEY` is set (Arabic template, `+966…`; the reply repeats the code, so it is never logged). Jordan keeps Broadnet. In `.env` the key's `$` is written `\$`, or Next expands it. The app's code screens still say «برسالة نصية» until the next version. Saudi notices are unaffected (`sendSms`).
Config via env: `BROADNET_USER`, `BROADNET_PASS`, `BROADNET_SENDER_ID` (`naseebak` since 2026-10-18; was `SRVnaseebak`), `BROADNET_API_URL` (default `https://gwjo1s.broadnet.me:8443/websmpp/websms`). Never hardcode credentials. Provider portal: `http://82.212.81.40:8080/websmpp`

## Push

- **App push (FCM, 2026-10-30):** the mobile app gets push straight from Firebase (project `naseebak-app`), the website stays on OneSignal; `notify()` sends to both (`channel: "all" | "web" | "app"`, default all; Admin → Notifications has «Send to»: an app-only broadcast reaches only members with an active app device).
- Devices are Firebase Installation IDs (FCM direct send, firebase_messaging 17 `register()`/`onRegistered`) in `push_devices`, tied to the `mobile_sessions` row that registered them (`POST`/`DELETE /api/mobile/push`, Bearer only), so logout/revoke/expiry stops pushes at once; FIDs FCM reports gone are deleted (`src/lib/fcm.ts`; never on `invalid-argument`, which a bad payload also gives).
- Server env `FCM_CREDENTIALS` = the service-account JSON on one line (unset = no app push, website unaffected).
- A member with an app device counts as reachable for the SMS fallback.
- Push data carries `url` (website path); the app maps it with `appRouteForLink()` and opens it with `openAppRoute()` (tabs via `go`, never stacked; the screen already open is left alone; no banner for the chat being read).
- Push (OneSignal): `OneSignalProvider` logs the device in as the user (`external_id`) and calls `markOneSignalReady()`; ask permission with `requestPushPermission()` and sign users out with `signOutAndUnlinkPush()` (`src/lib/push-client.ts`) — never the bare browser prompt or `signOut()`, or the device isn't registered / a shared phone keeps the previous person's pushes.
- Always use `notify()` / `notifyMany()` from `src/lib/notify.ts`: stores the in-app row with `metadata.url` and sends push only when the user's preference allows (SYSTEM always; `preference:` overrides the type's key).
- Chat status notices (expiry, 2 days left, day-7 nudge, extended, ended, paused) are CHAT rows but pass `preference: CHAT_NOTICE_PREFERENCE` (`introRequests`, `src/lib/notification-prefs.ts`), so turning off «رسائل المحادثات» only mutes message pushes.
- Links resolve via `notificationUrl()` in `src/lib/notification-links.ts`.
- Chat messages are push-only (no in-app row), collapsed per conversation and throttled to 1 per 3 minutes; the push reads «رسالة جديدة من <name>», never the message text (lock screens).
- `sendPushNotification` turns same-site paths into full `https://naseebak.com/...` URLs (OneSignal needs one for a tap to open the page).
- Only devices that allowed notifications are reachable (check with OneSignal's `GET /apps/{app}/users/by/external_id/{userId}`); test accounts are excluded from announcements.

## Notification routing

| Type | Route |
|---|---|
| SUGGESTION, INTEREST | `/dashboard/suggestions` |
| MATCH, VISIT_UPDATE, INTRO_REQUEST | `/dashboard/matches` (or `metadata.url`, e.g. `?match=<id>`) |
| CHAT | `/dashboard/chats` (or the chat) |
| PAYMENT | `/dashboard/payments` |
| IDENTITY | `/dashboard` (page removed) |
| SUPPORT | `/dashboard/support` |
| SYSTEM | `/dashboard` |
