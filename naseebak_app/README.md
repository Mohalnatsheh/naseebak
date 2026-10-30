# Naseebak mobile app (نصيبك)

Flutter app for Android (iOS-ready code, not built yet) that talks to the **same Next.js API as the website**
(`../src/app/api`). Arabic-first, right-to-left. The server decides matches, credits and privacy; the app only
shows what the API returns.

## Requirements

- Flutter 3.41.x / Dart 3.11.x (`flutter --version`)
- Android SDK + an emulator or a phone (Android 7+)
- A running backend: locally the Next.js app on port 3020 (see `../docs/api-mobile.md`, `../docs/local-testing.md`)

## Setup

```bash
cd naseebak_app
flutter pub get
```

If a build complains about licenses: `yes | flutter doctor --android-licenses`.

## Choosing the API (`--dart-define=API_BASE_URL=...`)

| Where the app runs | Command |
|---|---|
| Production (default, every build) | `flutter run` / `flutter build apk --release` → `https://naseebak.com` |
| Android emulator → local backend | `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3020` |
| Physical phone on the same Wi-Fi | `flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3020` (your PC's LAN IP) — also add that IP to `android/app/src/debug/res/xml/network_security_config.xml`, debug builds only allow plain HTTP to 10.0.2.2 / localhost / 127.0.0.1 |
| Phone over USB without Wi-Fi | `adb reverse tcp:3020 tcp:3020` then `flutter run --dart-define=API_BASE_URL=http://localhost:3020` |

Release builds never allow cleartext HTTP (the network security config lives in `src/debug` only).

## Run

```bash
flutter emulators --launch Pixel_8_Pro_API_31
flutter run                                                   # production (naseebak.com)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3020   # local backend
flutter build apk --release                                   # test APK on production
```

On production, sign in with a real number (a real SMS code is sent). Local backend test accounts (code is always `111111`, no SMS): Jordan `0796922292` (سارة), `0777000001`, `0777000002`,
`0790000004`; Saudi Arabia `0500000771` (ريم), `0500000772` (فهد). Other numbers: read the code from
`GET http://localhost:3020/api/dev/sms-outbox?phone=05xxxxxxxx`.

Local payments are a mock: «شراء» → a dialog «دفع تجريبي» (debug builds on a local backend only) → `POST /api/dev/mock-checkout/{id}` →
the app polls `GET /api/payments/{id}/status`. Saudi Arabia has `purchasesEnabled: false`, so packages show as
«غير متاح».

## Test, analyze, build

```bash
flutter analyze            # 0 issues
flutter test               # unit + widget tests, fake HTTP adapter, no network
flutter build apk --debug  # build/app/outputs/flutter-apk/app-debug.apk
```

Tests inject a fake Dio adapter through `httpAdapterProvider` (`test/helpers/fake_api.dart`); nothing touches the
network or the real secure storage.

## Structure

```
lib/
  app/            app widget, providers (API client, storage), bottom-nav shell
  core/           config (env), network (ApiClient, ApiException, json readers), auth (session controller),
                  storage (secure token, country), localization (digits/dates), routing (go_router + guards), theme
  shared/         person model + option labels, common widgets (buttons, states, banners, person details)
  features/
    welcome            animated splash (gold ring + khatam pattern), three intro pages on first launch
                       (intro_seen in shared preferences), shared brand visuals for the sign-in screens
    country_selection  picker + repository (GET /api/countries)
    auth               phone / code / sign-up / paused screens, phone validation
    onboarding         the short setup (same fields the web wizard requires; cities and nationalities from
                       GET /api/countries/{code} → lists)
    home               counts, next step, «سؤال نصيبك»
    discovery          suggestions feed (new / interested / waiting), card, «مهتم» sheet
    matches            list, detail with the introduction panel
    chat               list, room, bubbles; live events through Ably SSE (chat_live.dart) when the server has
                       ABLY_API_KEY, else 4 s polling
    notifications      list + routing to screens
    credits            balance, packages, checkout, history
    profile            my profile, «تعديل ملفي» (every website field: empty ones save at once, stored ones go to
                       review; pending request + «سحب الطلب»), guardian, photos (image_picker, ≤ 5, main photo),
                       partner preferences + «شروطي الأساسية», personality quiz
    support            tickets (type, subject, details) and the team's reply
    referral           my invitation code / link (share_plus); sign-up takes an optional invitation code
    settings           account, notification preferences, blocks, pause/delete
```

Routing guard (`core/routing/router.dart` → `guardRedirect`): the splash plays once; first launch → intro pages; no
country → country picker; restoring the session →
splash; signed out → phone screen; paused account → paused screen; short setup not finished → setup; otherwise the
5-tab shell. A 401 from any authenticated call clears the token and signs out.

Fonts: Cairo (variable TTF, SIL OFL — `assets/fonts/OFL.txt`). Logo: `assets/images/logo.svg` (copied from the web,
CSS classes inlined so flutter_svg renders it).

## Troubleshooting

- **Nothing loads on the emulator:** the backend must listen on port 3020 on the host; check
  `curl http://localhost:3020/api/countries` on the PC. The emulator reaches the host at `10.0.2.2`.
- **"Cleartext HTTP traffic not permitted"** on a phone: add its backend IP to the debug network security config.
- **429 on «إرسال رمز التحقق»:** 3 codes per number per 5 minutes. Wait, or use another test number.
- **`INSTALL_FAILED_INSUFFICIENT_STORAGE`:** `adb uninstall com.naseebak.naseebak_app` and reinstall, or wipe the emulator.
- **Arabic text via `adb shell input text`** does not work (adb limitation) — type on the emulator keyboard.
- **Photos on a local backend:** without Bunny keys the server keeps uploads in `.dev-uploads/` and returns
  relative `/api/dev/uploads/...` URLs; the app resolves them against the API base (`core/network/media_url.dart`).
  To test the picker on the emulator, `adb push` an image to `/sdcard/Pictures/` first.
- **Dates show Arabic-Indic digits:** `DateFormat.useNativeDigitsByDefaultFor('ar', false)` runs in `main()`; keep it.
