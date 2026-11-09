# Pro Membership — Flutter App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App version 1.1.0 supports Pro. Members can see and buy plans through Stripe in the browser and manage «اشتراكي». Pro members send photos and voice notes in chat. Everyone sees and hears the media sent to them, and the Pro badge.

**Architecture:**
- **Server:** no changes. Everything the app needs already exists on branch `feature/pro-membership`.
- **New feature folder:** `lib/features/pro/` holds the repository, state, plans section and badge.
- **Chat:** gains a media model, authenticated media widgets, a photo/voice composer and a recorder.
- **Platform:** media loads send the Bearer token. Voice plays through `just_audio` with headers and records with `record`, AAC in `.m4a`.

**Tech Stack:** Flutter, Riverpod, Dio, `image_picker` (existing), new `record` and `just_audio`; tests with `test/helpers/fake_api.dart` (FakeAdapter).

**Spec:** `docs/superpowers/specs/2026-11-09-pro-membership-design.md`. Read the owner decisions table and §3, §5, §6, §7 and §8. The app rules are in `naseebak_app/CLAUDE.md`; read them first.

## Global Constraints

- Work in `naseebak_app/` on branch `feature/pro-membership` (worktree `~/Documents/EvoKey-Projects/naseebak-pro`). `flutter analyze` must report 0 issues and `flutter test` must be green, with no network in tests.
- **Version:** `version: 1.1.0+4` in `pubspec.yaml`. 1.0.2+3 is already built.
- **Server API, used as is:**
  - `GET /api/pro` returns `{ enabled, isPro, plan, renewsAt, cancelAtPeriodEnd, pastDue, canBuy, offers[] }`. Each offer is `{ id: weekly|monthly|yearly, price, currency: JOD|SAR, chargeCurrency, chargeAmount, credits, interval }`.
  - `POST /api/pro/checkout {plan}` returns `{url}`. Errors: `APP_PURCHASES_DISABLED` 403, `ALREADY_PRO` 409, `UNAVAILABLE`/`DISABLED` 403, `UNKNOWN_PLAN` 400.
  - `POST /api/pro/cancel` and `POST /api/pro/resume`: 404 when there is no subscription, 502 on a Stripe failure.
  - `POST /api/chats/{id}/media` takes multipart `file`, `kind` (`IMAGE`|`VOICE`), `durationSec` (integer 1–185, voice only) and `clientNonce`, and returns `{message}`.
  - `GET` on a message's `media.url` (relative `/api/chats/<cid>/media/<mid>`) needs `Authorization: Bearer` and supports Range.
  - `ChatMessage` adds `kind: TEXT|IMAGE|VOICE` and `media: {url, type, durationSec, width, height} | null`. `body` holds the old-app fallback text and is never shown for media.
- **Pro badge sources:** `partner.isPro` in `/api/chats`, `/api/chats/{id}` and matches; `isPro` on feed items (absent means false); `pro.isPro` and `pro.cancelAtPeriodEnd` in `/api/me/counts`. The badge never depends on `enabled`.
- **Limits:**
  - Photo: picked with `maxWidth: 2048, maxHeight: 2048, imageQuality: 85`, which makes iOS write JPEG and turns HEIC into JPEG. Send it as `image/jpeg`, `photo.jpg`, at most 10 MB.
  - Voice: AAC-LC, 64 kbps, `.m4a`, sent as `audio/mp4`. It stops at 180 s and **waits** for send or cancel; never auto-send. `durationSec` is the elapsed time rounded up, minimum 1.
  - Media uploads use their own 120 s send/receive timeout.
- **Visibility:**
  - Media buttons are enabled when the member is Pro and the chat is ACTIVE.
  - They are greyed, with a small «Pro» tag that opens the plans section, when the member is not Pro, `appPaymentsProvider` is true, `canBuy` is true and the chat is ACTIVE.
  - Otherwise they are hidden. Test and review accounts never see them, because `/api/pro` returns `canBuy: false` for them.
- **Plans section:** shown only when (`appPaymentsProvider` && `canBuy`) or `isPro`. Checkout opens with `launchUrl(..., LaunchMode.externalApplication)` and https only.
- **Copy:**
  - Arabic, with gendered copy via `home/gendered_copy.dart`, Western digits and the `ar-JO-u-nu-latn` style dates already used in the app.
  - Price lines: «4 د.أ في الشهر»; for Jordan also «تدفع $5.64 بالدولار» (`chargeAmount/100`).
  - Features: «إرسال الصور في المحادثة», «الرسائل الصوتية في المحادثة», «شارة Pro على بطاقتك».
  - Credits line: «N رصيد مجاناً كل أسبوع|شهر», with yearly reading «كل شهر».
- **Owner rules:** cancelling stops the renewal only and never refunds. Refunds are made only by an admin, so the app has no refund button.
- **App rules:**
  - Chats stay a `SecureArea`.
  - After every `await` in a State, check `mounted`.
  - `heroTag: null` on FABs.
  - Links stay https.
  - No ids in analytics screen names.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by path.

## Review Focus

1. **A media message cached by 1.0.x (`ChatCache` v1) on a phone that then updates.** Expected: the cache version bump drops it, and the message re-renders as media. *Test in Task 2.*
2. **Media URL 404 (file gone) or 401 (signed out) while scrolling.** Expected: an «تعذّر عرض الصورة» / «تعذّر تشغيل الرسالة» placeholder; 401 still triggers the existing sign-out path; no crash. *Test in Task 5.*
3. **Leaving the chat during the mic permission prompt, or mid-recording.** Expected: the mic is released, nothing uploads and there is no `setState` after dispose. *Test in Task 7.*
4. **`PRO_REQUIRED` from the media route** (Pro lapsed while the screen was open). Expected: the failed bubble shows the server's Arabic message, the Pro state reloads, and the buttons switch to greyed or hidden. *Test in Task 6.*
5. **Returning from the Stripe browser before the webhook lands.** Expected: re-fetch `/api/pro` and counts for up to 10 s on resume, then a neutral «سيتم تفعيل العضوية خلال لحظات» line; no false error. *Test in Task 4.*

---

### Task 1: Version, packages, permissions

**Files:** `naseebak_app/pubspec.yaml`, `ios/Runner/Info.plist`, `ios/Runner/PrivacyInfo.xcprivacy`, `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1:** Set `version: 1.1.0+4`, then add the latest stable `record` and `just_audio` that build with this Flutter SDK and Kotlin 2.3 (`flutter pub add record just_audio`).
- [ ] **Step 2:** iOS permission texts:
  - Add `NSMicrophoneUsageDescription` = «لتسجيل رسالة صوتية في المحادثة».
  - Change `NSPhotoLibraryUsageDescription` to «لاختيار صورك لملفك الشخصي ولإرسال الصور في المحادثة».
  - The camera is not offered in this version, so add no camera key.
- [ ] **Step 3:** Android: add `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`. iOS privacy manifest: add `NSPrivacyCollectedDataTypeAudioData` (linked to the user, purpose App Functionality, not tracking). Check that `PhotosorVideos` lists App Functionality.
- [ ] **Step 4:** Run `flutter pub get && flutter analyze` (expect 0 issues), plus `cd ios && LANG=en_US.UTF-8 pod install` and `flutter build apk --debug` to prove the plugins compile.
- [ ] **Step 5:** Commit with message `App 1.1.0: record + just_audio, microphone permission, photo text covers chat`.

### Task 2: Models and cache

**Files:** `lib/features/chat/chat_models.dart`, `lib/features/chat/chat_cache.dart`, `lib/features/home/counts.dart`, the feed item model in `lib/features/discovery/`, the match partner model in `lib/features/matches/`. **Test:** `test/pro_models_test.dart`, `test/chat_cache_test.dart`.

**Interfaces (produces):**
- `enum MessageKind { text, image, voice }`
- `class ChatMedia { String url; String type; int? durationSec; int? width; int? height; }` with `fromJson`/`toJson`.
- `ChatMessage` gets `kind`, `media`, and `localPath` (a local file shown while sending; never serialized).
- `sameAs` compares `kind` and `media?.url` too.
- `ChatSummary.partnerIsPro`.
- Feed item and match partner each get `isPro`.
- `Counts.isPro` and `Counts.proCancelAtPeriodEnd`.
- `ChatCache` writes `'v': 2` and ignores any other version.

- [ ] **Step 1: Failing tests:**
  - An IMAGE message JSON parses to `kind == image` with `media.width == 1600`.
  - `toJson` round-trips `kind` and `media`.
  - A cached `v: 1` payload is ignored (returns empty).
  - A missing `kind` means `text`.
  - A feed item without `isPro` gives false.
  - Counts `{pro: {isPro: true}}` gives `isPro` true.
- [ ] **Step 2:** `flutter test test/pro_models_test.dart test/chat_cache_test.dart` (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests and then the full `flutter test` (expect PASS).
- [ ] **Step 5:** Commit with message `App: chat media model, cache v2, isPro fields`.

### Task 3: Pro repository and state

**Files:** create `lib/features/pro/pro_repository.dart`. **Test:** `test/pro_repository_test.dart`.

**Interfaces (produces):**
- `class ProOffer { String id; double price; String currency; String chargeCurrency; int chargeAmount; int credits; String interval; }`
- `class MyProState { bool enabled, isPro, cancelAtPeriodEnd, pastDue, canBuy; String? plan; DateTime? renewsAt; List<ProOffer> offers; }`
- `ProRepository`:
  - `Future<MyProState> state()`
  - `Future<Uri> checkout(String plan)`: https only, otherwise throws.
  - `Future<void> cancel()`
  - `Future<void> resume()`
- `final proStateProvider = FutureProvider.autoDispose<MyProState>`
- `bool showPlans(MyProState s, bool appPayments) => (appPayments && s.canBuy) || s.isPro;`
- `MediaButtons mediaButtonsMode(...)` returns `enabled | locked | hidden`, following the Global Constraints visibility rule.

- [ ] **Step 1: Failing tests:**
  - Parse a full `MyProState`.
  - `checkout` refuses an `http:` URL.
  - A 409 `ALREADY_PRO` becomes an `ApiException` carrying the Arabic message.
  - `showPlans` and `mediaButtonsMode` truth tables, including a test account (`canBuy` false, not Pro) → hidden, and Pro with an ENDED chat → hidden.
- [ ] **Step 2:** Run the tests (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests (expect PASS).
- [ ] **Step 5:** Commit with message `App: Pro repository, state and visibility rules`.

### Task 4: Plans section and «اشتراكي» on the credits screen

**Files:**
- Create `lib/features/pro/pro_section.dart`, holding `ProPlansCard` (a segmented weekly/monthly/yearly selector, default monthly, matching the website's compact card) and `MyProCard`.
- Modify `lib/features/credits/credits_screen.dart` to render the section above the packages when `showPlans`.
- **Test:** `test/pro_plans_test.dart`.

**Behaviour:**
- **Subscribe:** «اشتراكي الآن» calls `checkout`, then `openCheckout`. Reuse the screen's existing injectable `openCheckout` for tests.
- **Coming back from the browser:** on resume after a checkout, re-fetch `proStateProvider` and `countsProvider` every 2 s for up to 10 s. When `isPro` turns true, show a success SnackBar. Otherwise show the neutral line from Review Focus 5.
- **«اشتراكي» card:**
  - Shows the plan and «يتجدد في <date>», or «ينتهي في <date>» when cancelling.
  - Past due shows an amber note: «تعذّر تجديد الاشتراك، يمكنك تحديث بطاقتك من الموقع».
  - «إلغاء التجديد» opens a confirm dialog: «سيتوقف التجديد وتبقى العضوية حتى <date>. لا يُسترد مبلغ المدة الحالية.»
  - «متابعة الاشتراك» resumes it.
- A failed load shows the existing error widget and never hides the credit packages.

- [ ] **Step 1: Failing widget tests:**
  - Plans visible for `canBuy`, hidden for a test account.
  - Selecting «سنوي» shows the yearly price and «كل شهر».
  - Subscribe opens the returned https URL.
  - Resume polling flips to the success SnackBar.
  - The cancel dialog text includes «لا يُسترد».
  - A Pro member sees `MyProCard` even when `canBuy` is false.
- [ ] **Step 2:** Run the tests (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests (expect PASS).
- [ ] **Step 5:** Commit with message `App: Pro plans and «اشتراكي» on the credits screen`.

### Task 5: Showing media (authenticated)

**Files:** create `lib/features/chat/media_bubbles.dart` (`PhotoBubble`, `VoiceBubble`) and `lib/core/network/authed_media.dart`. Modify `chat_bubble.dart` to render by `kind`. **Test:** `test/chat_media_view_test.dart`.

**Interfaces:**
- `Future<({Uri uri, Map<String,String> headers})> authedMedia(WidgetRef ref, String url)`: `resolveMediaUrl` plus the Bearer token from `tokenStore`.
- `PhotoBubble`:
  - An `Image.network` with headers, sized by `width`/`height`, rounded corners.
  - Tap opens a full-screen viewer (`InteractiveViewer`).
  - On error, shows the «تعذّر عرض الصورة» placeholder.
- `VoiceBubble`:
  - A `just_audio` `AudioPlayer` with `AudioSource.uri(uri, headers:)`, created lazily on the first play.
  - Play/pause button ≥44, a progress bar, and `m:ss` from `media.durationSec`.
  - Only one voice plays at a time (a small shared controller).
  - Disposed with the bubble.
  - On error, shows «تعذّر تشغيل الرسالة».
- Media messages never render `body`.

- [ ] **Step 1: Failing tests:**
  - An IMAGE message renders a `PhotoBubble`, not the fallback body text.
  - The `authedMedia` headers contain the Bearer token and the URL is resolved against the base URL.
  - A VOICE bubble shows `0:11` for `durationSec: 11`.
  - The photo error builder shows the placeholder.
  - Inject a fake player factory so tests need no platform channels.
- [ ] **Step 2:** Run the tests (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests (expect PASS).
- [ ] **Step 5:** Commit with message `App: photo and voice bubbles load with the Bearer token`.

### Task 6: Sending photos and the composer buttons

**Files:**
- Modify `chat_models.dart` to add `ChatRepository.sendMedia(String id, {required String kind, required String filePath, required String mime, int? durationSec, String? nonce})`. It sends a Dio `FormData` with `Options(sendTimeout: 120s, receiveTimeout: 120s)`.
- Modify `chat_room_screen.dart` to add the media buttons next to the text field, plus the optimistic media message and retry.
- **Test:** `test/chat_send_media_test.dart`.

**Behaviour:**
- **Button mode:** from `mediaButtonsMode`. Locked mode opens the credits screen scrolled to the plans section.
- **Photo button:** `ImagePicker().pickImage(source: gallery, maxWidth: 2048, maxHeight: 2048, imageQuality: 85)`.
  - Over 10 MB: show «الصورة كبيرة جداً».
  - Otherwise add an optimistic bubble using `localPath`, then call `sendMedia`. The server copy replaces the bubble.
- **Failure:** a failed send shows the existing failed/retry state, and retry reuses the same nonce. The picker sits behind an injectable function for tests.
- **`PRO_REQUIRED` 403:** mark the bubble failed with the server message, then `ref.invalidate(proStateProvider)` and `countsProvider`.

- [ ] **Step 1: Failing tests:**
  - Locked mode shows the Pro tag and tapping it navigates to credits.
  - Hidden for a test account.
  - Hidden when the chat has ENDED.
  - The sent multipart has `kind=IMAGE`, the `clientNonce`, and the file named `photo.jpg` as `image/jpeg`.
  - Retry sends the same nonce.
  - `PRO_REQUIRED` marks the bubble failed and reloads the Pro state.
  - Leaving mid-upload (`FakeAdapter.hold`) causes no `setState` after dispose.
- [ ] **Step 2:** Run the tests (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests (expect PASS).
- [ ] **Step 5:** Commit with message `App: send photos in chat (Pro), composer buttons follow Pro state`.

### Task 7: Voice recorder

**Files:** create `lib/features/chat/voice_recorder.dart`, a thin interface over `record` so tests can fake it. Modify `chat_room_screen.dart` to add the mic button and a recording bar. **Test:** `test/chat_voice_test.dart`.

**Behaviour:**
- **Starting:** tapping the mic asks for permission on the first tap only.
  - If refused: a SnackBar «يمكنك السماح باستخدام الميكروفون من إعدادات الهاتف لإرسال رسالة صوتية».
  - If allowed: record with `RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100)` to a temp `.m4a`.
- **Recording bar:** shows `m:ss`, «إرسال» and «إلغاء».
- **At 180 s:** recording stops; the bar shows «بلغ التسجيل الحد الأقصى» and waits.
- **Send:** goes through `sendMedia(kind: 'VOICE', mime: 'audio/mp4', durationSec: ceil, min 1)`.
- **Cancel or dispose:** stops and deletes the temp file.
- **Leaving the screen** (or the chat ending) during the permission prompt or mid-recording cancels the recording and releases the mic.

- [ ] **Step 1: Failing tests (fake recorder):**
  - Permission is refused, so the SnackBar shows and nothing records.
  - The limit stops recording and nothing uploads until send.
  - Send uploads `kind=VOICE`, `durationSec=11` for a 10.2 s recording, MIME `audio/mp4`.
  - Disposing during the permission await cancels the recording and never uploads.
  - Cancel deletes the file.
- [ ] **Step 2:** Run the tests (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests (expect PASS).
- [ ] **Step 5:** Commit with message `App: voice notes in chat (Pro), stop at 3 minutes and wait`.

### Task 8: Pro badge and sign-out hygiene

**Files:**
- Create `lib/features/pro/pro_badge.dart`, with a gold pill «Pro», `Semantics(label: 'عضو Pro')` and an `onDark` variant.
- Use it in `lib/features/discovery/suggestion_card.dart`, the match card and detail, `chats_screen.dart`, the chat room header, and the home greeting (the `onDark` variant on navy).
- On sign-out, clear `PaintingBinding.instance.imageCache` next to `ChatCache.clearAll()`.
- **Test:** `test/pro_badge_test.dart`.

- [ ] **Step 1: Failing tests:**
  - The badge shows on a feed card with `isPro: true` and not without it.
  - The chat list and header show it for `partnerIsPro`.
  - The home greeting uses the on-dark variant.
  - Sign-out clears the image cache (use a spy).
- [ ] **Step 2:** Run the tests (expect FAIL).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests (expect PASS).
- [ ] **Step 5:** Commit with message `App: Pro badge on cards, chats, home; clear image cache on sign-out`.

### Task 9: Docs, full check, simulator QA

**Files:** `naseebak_app/CLAUDE.md` (an «1.1.0+4» entry under Store release, Pro under Integrations/API, the store privacy answers to update: audio + photos in chat, the review account never sees Pro) and `naseebak_app/README.md` if run steps changed.

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `flutter analyze && flutter test` (expect 0 issues and all tests passing).
- [ ] **Step 3: QA on the iOS Simulator and an Android emulator** against a local backend (`--dart-define=API_BASE_URL=http://localhost:3031` for iOS, `http://10.0.2.2:3031` for Android) running `next start -p 3031` from this worktree, with `pro_enabled` on locally and member `0777000001` made Pro through the mock flow:
  1. Send a photo from the gallery and a 10 s voice note.
  2. Play a voice note sent from the website (now AAC).
  3. View the photo full screen.
  4. Check the badge on the chat header.
  5. As `0777000002`, check the locked buttons open the plans section.
  6. Cancel the subscription, then resume it.
  7. Afterwards restore `pro_enabled` to off and remove the QA rows.
  8. Screenshots go to the SDD workspace.
- [ ] **Step 4:** Commit with message `Docs: app 1.1.0 Pro`.
- [ ] **Step 5:** Mirror sync and store builds happen **only after the owner approves** (`naseebak_app/CLAUDE.md` "Where the code lives").
