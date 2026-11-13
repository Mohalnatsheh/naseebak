# Chat audit: website, server and app (2026-11-13)

Read-only audit of the chat at production `main` (`d031d82`; live revision `9fff281`, same chat code, including the
iOS < 16.4 lookbehind fix `13c49e2`). Nothing was changed, deployed or written to production.

How it was done:

- Three code reads in parallel: website UI (`src/components/chat/`, `src/app/(ar)/dashboard/chats/`), server
  (`src/lib/chat/`, `src/app/api/chats/`, chat cron tasks), app (`naseebak_app/lib/features/chat/`).
- The top findings were re-checked line by line.
- The number filter was run on about 80 sample messages, using a copy of `filter.ts` outside the repo.
- Production logs were read (read-only): `/var/log/naseebak/*.log` and `/var/log/nginx/naseebak.access.log*`. Nginx only
  keeps the last two days (2026-11-11 00:50 to 2026-11-13 14:51).
- No local walk-through of a live chat was done. Every finding comes from the code and the logs.

Paths are relative to the repo root. Severity: **critical** (members lose data or safety broken at scale), **important**
(a member will hit it in normal use, or a safety rule leaks), **minor** (edge case or polish).

## Summary

No critical bugs. Membership is checked on every route, media paths never leak, push text never shows the message,
and old apps keep working. The status bar order and the family offer match CLAUDE.md, and so do report «إبلاغ فقط»,
`endedBy` and the delete/clear rules.

Most important:

| # | Severity | Platform | Finding |
|---|---|---|---|
| B1 | important | app | Messages are marked read (✓✓, bell cleared) while the member is on another screen |
| B2 | important | app | A text sent just before leaving the chat is lost if the send fails |
| B3 | important | web | A chat tab whose session ended goes silently dead (no sign-in prompt) |
| B4 | important | server | Filter: "fancy" letters and superscript digits pass (`𝐰𝐡𝐚𝐭𝐬𝐚𝐩𝐩`, `0⁷⁹…`) |
| B5 | important | server | Filter: a number split over several messages with a word in each passes |
| B6 | important | server/ops | Report emails to admins fail on the Hostinger rate limit (15 in 6 days) |
| B7 | important | web | A partner message arriving during a read request can stay unread |
| U1 | important | server | Filter blocks ordinary talk: dates `15-06-2026`, times, sums, ages |

## Production log readout

- **No chat errors** in `error.log` (PM2) since 2026-11-08. The noise there is old-deployment server actions, SMTP rate
  limits and SMS config for SA/LB.
- **Requests, last two days.**
  - App: 49.6k chat GETs, 46.2k of them polls (`after` + `reactionsSince`), and 9.7k sends.
  - Website: 8.4k chat GETs and 7.2k sends.
  - Typing: about 3 POSTs per message on both platforms.
  - Ably tokens: 6.2k on the website and 4.0k in the app, so Ably is in use.
- **Refused sends:** 256 × 422 on `POST /messages` (215 app, 41 web), about 1.5 % of 16.9k sends. These are filter
  refusals. The access log can't tell which were real contact attempts and which were false positives (see U1). Other
  errors are negligible: 499 client aborts, 2 media 404s and 1 read timeout of 60 s.
- **Report emails:** the admins' «بلاغ جديد» email failed 15 times between 2026-11-08 and 2026-11-12 (Hostinger
  `hostinger_out_ratelimit`) (B6).
- **Unread SMS:** `unread-sms.log` shows `chat_sms_off` on every run, as intended. One chat-SMS failure line is from
  2026-11-09.
- **Chat cron tasks are healthy.** Morning: 3–5 expired, up to 5 warned. Evening `quietChats`: 16–35 nudged, 9 s.
- **Aside (not chat):** the evening job is getting slower: 151 s, 131 s, 163 s, then 185 s on 2026-11-12, against a
  300 s request timeout. Worth watching.

---

## Bugs

### B1. App: messages are marked read while the member is on another screen
- **Severity:** important. **Platform:** app.
- **Where:** `naseebak_app/lib/features/chat/chat_room_screen.dart:598`, `:811`, `:1072`.
- **What a member experiences:**
  - The member opens «صفحة التوافق» from the chat header, the Pro page, the photo viewer, or another chat from a notice.
    The chat underneath stays mounted, keeps polling (4 s) and listening on Ably, and marks each new partner message
    read.
  - The partner sees gold ✓✓ for messages nobody saw.
  - On the server, `markRead` clears the chat bell and push throttle, so the member gets no badge. Nudges and SMS
    treat the messages as read too.
- **Cause:** `_markRead()` runs after every poll with partner messages. Nothing checks that the route is on top
  (only app paused/hidden is checked).
- **Suggested fix:** mark read only while `ModalRoute.of(context)?.isCurrent` is true, and mark read again in
  `RouteAware.didPopNext`. Ideally also slow polling while covered.
- **Needs an app version:** yes.

### B2. App: a text sent just before leaving the chat is lost if the send fails
- **Severity:** important. **Platform:** app.
- **Where:** `chat_room_screen.dart:1095-1103` (box and draft cleared before the request), `:1126` (`if (!mounted) return;`
  in the catch).
- **What a member experiences:** on a weak network the member sends a long message and goes back at once. 30 s later
  the request fails. The text is in neither the chat, the failed list nor the draft. `naseebak_app/CLAUDE.md` promises
  a failed text is never lost.
- **Cause:** a "sending" bubble is never written to `ChatCache`. The failure path returns before saving when the
  screen is gone.
- **Suggested fix:** read `ChatCache` and the member id before the await. On failure while unmounted, write the text to
  the cache as failed with `maybeSent: e.isNetwork`, so the next open reconciles or offers retry.
- **Needs an app version:** yes.

### B3. Web: a chat tab whose session ended goes silently dead
- **Severity:** important. **Platform:** web.
- **Where:** `src/components/chat/chat-room.tsx:162-170` (`requestLatest`), `:662-671` (`deliver`),
  `src/components/chat/use-chat-channel.ts:127-141`.
- **What a member experiences:**
  - Signing out on the phone revokes every web session by design (`sessionsRevokedAt`). The open chat on the laptop
    keeps looking live, but nothing new arrives.
  - On send, the bubble disappears, the text returns to the box and a bare «غير مصرح» shows. There is no way back to
    sign-in except reloading.
- **Cause:** no 401 handling in the chat. A poll treats 401 as a generic error and drops it. The Ably token fails, the
  room falls back to polling, and the 401 repeats.
- **Suggested fix:** treat 401 in `requestLatest`, `postJson` and `sendMedia` as "signed out": stop polling and show a
  sign-in banner or redirect to `/login?callbackUrl=…`, keeping the typed text in the draft. The same applies to
  `DashboardDataProvider` if it doesn't already handle 401.

### B4. Server: the filter misses styled letters and superscript digits
- **Severity:** important (safety rule). **Platform:** server.
- **Where:** `src/lib/chat/filter.ts:224-242` (`normaliseDigits`, `forChecks`).
- **What happens:** confirmed by running the filter.
  - These pass: `0⁷⁹¹²³⁴⁵⁶⁷` (superscript), `𝐰𝐡𝐚𝐭𝐬𝐚𝐩𝐩` (maths bold), `𝘪𝘯𝘴𝘵𝘢𝘨𝘳𝘢𝘮`, `ｗｈａｔｓａｐｐ` (full-width
    letters), `ⓦⓗⓐⓣⓢⓐⓟⓟ`, `ﻭﺍﺗﺲ` (Arabic presentation forms), and Cyrillic look-alikes `wһatsapp` and `іnstagram`.
  - These are already caught: Arabic-Indic, Persian, full-width, keycap, circled and maths digits, and zero-width
    characters between digits.
  - "Fancy text" keyboards are common, so this is an easy way round the filter.
- **Cause:** only certain digit ranges are mapped by hand. Letters are never normalised, and superscripts aren't
  covered.
- **Suggested fix:** `s.normalize("NFKC")` first in `forChecks`, then a small Cyrillic/Greek look-alike map
  (а е о р с у х і һ ԁ → Latin) before the keyword checks. Re-run the 206 filter tests and the 300k random-message
  comparison used in `13c49e2`.

### B5. Server: a number split over messages with a word in each passes
- **Severity:** important (safety rule). **Platform:** server.
- **Where:** `src/lib/chat/filter.ts:500-503` (`mayBePartOfNumber`), `:537-552` (`completesSplitNumber`); called at
  `src/lib/chat/service.ts:829-840`.
- **What happens:** confirmed by running the filter. One sender, with no partner reply in between, sends «اول اشي 07»,
  «بعدها 91», «وبعدها 23», «ثم 45», «واخر اشي 67». Every message passes and the split check never runs. The same
  pieces without words are caught.
- **Cause:** a message only counts as a piece if it is all number, has a group of 3 or more digits, or has 4 or more
  spelled numbers in a row.
- **Suggested fix:** once the sender's own run holds a phone-like start (`0x`, `07`, `05`, `03`, `962`, `966`, `961`),
  count any message with a digit group as a piece. Add the example above as a test. Mind U1: don't add false
  positives.

### B6. Server/ops: report emails to the admins are being dropped
- **Severity:** important. **Platform:** server/ops.
- **Where:** `src/lib/admin-alert.ts:19-29` (best-effort, only logs). Logged as `[admin-alert] failed to send "بلاغ جديد"`.
- **What happens:**
  - CLAUDE.md: reports never act on their own, and every report emails the admins, who act by hand. That email
    failed 15 times between 2026-11-08 and 2026-11-12 (Hostinger outbound rate limit).
  - In the same log, «طلب تعديل ملف جديد» failed 152 times and new-user mails 345 times. They share the same limit and
    crowd out the reports.
  - The reports are still stored and visible in Admin → Reports, but the admins aren't alerted.
- **Suggested fix:**
  - Short term: an admin checks Admin → Reports daily.
  - Proper fix: stop or batch the high-volume mails (new user, profile edit request) into a daily digest so reports
    get through. Retry a failed report alert from the morning job, keyed by report id. Or add a report count badge in
    the admin nav.

### B7. Web: a partner message arriving during a read request can stay unread
- **Severity:** important. **Platform:** web. **Confidence:** likely (timing race).
- **Where:** `src/components/chat/chat-room.tsx:487-510`.
- **What a member experiences:**
  - Two quick partner messages arrive over Ably. The second arrives while the first `POST /read` is in flight, and
    the effect returns early (`markingRead.current`).
  - In live mode nothing re-runs the effect, so the partner sees ✓ instead of ✓✓, and my list badge keeps «1» for a
    chat I'm reading.
  - A failed read (`!res.ok`) is also never retried.
- **Suggested fix:** in `.finally`, if an unread partner message is newer than the `upTo` sent, or the request failed,
  bump `visibleTick` so the effect runs again.

### B8. Web (and server shape): a lost send answer shows a false «لم تُرسل» next to the real message
- **Severity:** minor to important. **Platform:** web + server.
- **Where:** `src/components/chat/chat-room.tsx:385-396`, `:654-666`; `src/components/chat/chat-utils.ts:54`;
  `src/lib/chat/service.ts` (`toMessage` has no `clientNonce`).
- **What a member experiences:** the server saves the message but the answer is lost (mobile drop, 5xx). The bubble
  becomes «لم تُرسل · إعادة المحاولة», and the next poll adds the saved copy beside it. The member thinks it failed and
  may send it again (the nonce prevents a second copy only on retry, not on retyping).
- **Cause:** GET/poll messages carry no nonce, so the optimistic copy can only be matched through the Ably echo.
- **Suggested fix:** add `clientNonce` to the member's own messages in GET/poll (additive, so old apps ignore it).
  Merge by nonce on the website. The app can use it too in a later version (see B10).

### B9. Web: `Array.prototype.findLast` breaks polling and «مسح المحادثة» on iOS 15.0–15.3
- **Severity:** minor (small share). **Platform:** web.
- **Where:** `src/components/chat/chat-room.tsx:376` (`fetchNewer`), `src/components/chat/delete-dialogs.tsx:146`.
- **What a member experiences:** on Safari before 15.4, `fetchNewer` throws inside a try/catch:
  - new messages never arrive in polling mode or on the catch-up when returning to the tab;
  - «مسح المحادثة» closes its dialog and does nothing.

  Next's polyfills don't cover `findLast`, and browserslist is "last 2 Safari". This is the same kind of problem as
  the lookbehind fix. `md:h-[calc(100dvh-4rem)]` (`chats-shell.tsx:37`) also has no height on iPads before 15.4.
- **Suggested fix:** replace both with a reverse loop, and add `findLast`/`findLastIndex` to the guard test from
  `13c49e2`.

### B10. App: a failed text can be silently dropped as "already sent"
- **Severity:** minor. **Platform:** app.
- **Where:** `chat_room_screen.dart:575`, `_reconcile` at `:852-878`.
- **What a member experiences:** the member sends «تمام» (it goes), then sends «تمام» again offline (it fails). On
  reopening, the failed one disappears, matched against the earlier real one (same text within a minute).
- **Suggested fix:** in `_load`, reconcile only against server messages newer than the failed bubble. Better: match on
  `clientNonce` once B8 adds it.
- **Needs an app version:** yes.

### B11. Server: read receipts cross a block
- **Severity:** minor (privacy). **Platform:** server.
- **Where:** `src/lib/chat/service.ts:1047-1063` (`markRead`), `toMessage` (`:365-392`), `summarise` (`:341`),
  `readUpTo` (`:705-707`).
- **What happens:** A blocks B. B can still open the read-only chat, and `/read` stamps A's messages. A then sees ✓✓,
  so A learns B looked after the block. The code comment says "No read receipts across a block", but only the Ably
  event is suppressed.
- **Suggested fix:** when there is a block, return `readAt: null` / `read: false` / `readUpTo: null` for the viewer's
  own messages. Keep the stamp for unread counts.

### B12. Server: ending a chat is an unconditional write
- **Severity:** minor. **Platform:** server.
- **Where:** `src/lib/chat/service.ts:1141-1160` (`db.conversation.update`, no `status: "ACTIVE"` condition).
- **What happens:** both members end the chat at the same moment, and each gets «أنهى الطرف الآخر المحادثة». An
  expiry or admin end at the same moment gets overwritten, and both notices go out.
- **Suggested fix:** `updateMany({ where: { id, status: "ACTIVE" } })`, and only cancel requests, publish and notify
  when `count === 1`. This matches `adminEndConversation` and `followup.ts`.

### B13. Server: a slow media message can be saved after the chat was ended or blocked
- **Severity:** minor. **Platform:** server. **Confidence:** likely.
- **Where:** `src/lib/chat/service.ts:920-978`.
- **What happens:** a voice note passes `assertCanSend`, then waits in the ffmpeg queue (up to 4 × 30 s). If the
  partner blocks meanwhile, the message is still saved and pushed, and the blocker gets «رسالة جديدة من …».
- **Suggested fix:** re-check status and block after processing, before `db.message.create`. Delete the upload if the
  check fails.

### B14. Server: photo decoding can exhaust memory on the single PM2 process
- **Severity:** minor (low likelihood, site-wide impact). **Platform:** server. **Confidence:** likely.
- **Where:** `src/lib/chat/media.ts:26` (`IMAGE_MAX_INPUT_PIXELS` = 100 MP), `:209-221`;
  `src/app/api/chats/[id]/media/route.ts:21-40`.
- **What happens:**
  - JPEG/PNG have no decode queue (HEIC has one). A highly compressible 100 MP PNG decodes to about 300–400 MB, and a
    few at once could take the site down.
  - The route also buffers up to 10.5 MB before checking membership, Pro or the rate limit.
- **Suggested fix:** a decode queue of 2 like HEIC, a 50 MP limit, `sharp.cache(false)`. Run `assertCanSend` / `isPro`
  / the rate limit before `request.formData()`.

### B15. Web: the partner's extension leaves «تمديد 7 أيام» in my menu
- **Severity:** minor. **Platform:** web.
- **Where:** `src/components/chat/chat-room.tsx:475-480` (the status event updates `expiresAt` but not `canExtend`; no
  refetch for ACTIVE).
- **What a member experiences:** the member taps «تمديد 7 أيام» and gets «تم تمديد هذه المحادثة مسبقاً».
- **Suggested fix:** call `fetchNewer()` on every status event, or set `canExtend: false` when `expiresAt` changes.

### B16. Web: a failed end or report closes the dialog and loses the typed reason
- **Severity:** minor. **Platform:** web.
- **Where:** `src/components/chat/chat-room.tsx:814-821` (`setEndDialog(null)` before checking `res.ok`).
- **Suggested fix:** close the dialog only on success.

### B17. App: «إبلاغ فقط» still shows the store rating prompt on leaving
- **Severity:** minor. **Platform:** app.
- **Where:** `chat_room_screen.dart:1745` (`if (end) _reportedOrEnded = true;`).
- **What a member experiences:** the member reports an abusive message, goes back, and the App Store / Play rating sheet
  appears.
- **Suggested fix:** `if (report || end)`. **Needs an app version:** yes.

### B18. App: the chats badge and home's unread card stay stale after reading
- **Severity:** minor. **Platform:** app.
- **Where:** `chat_room_screen.dart:1072-1077` (no counts refresh after `markRead`).
- **What a member experiences:** the member opens a chat from a push or the home card, reads it and goes back. The
  «المحادثات» badge and the home card still show unread until a tab switch or resume.
- **Suggested fix:** invalidate `countsProvider` and `chatListProvider` after a `markRead` that marked something, or in
  `dispose`. **Needs an app version:** yes.

### B19. App: offline open shows the saved copy with no warning, and can show a fake empty state
- **Severity:** minor. **Platform:** app.
- **Where:** `chat_room_screen.dart:620-625`.
- **What a member experiences:** opening offline shows the saved copy and polls fail silently. A message deleted for
  everyone keeps its text for the visit, «رسائل جديدة» never shows, and an empty saved copy shows
  «ابدأ المحادثة بالسلام». CLAUDE.md forbids a fake empty state.
- **Suggested fix:** an offline strip with retry when the load fails over a saved copy. No greeting empty state until
  the server answered once. **Needs an app version:** yes.

### B20. App and web: a failed older-page load retries on every scroll
- **Severity:** minor. **Platform:** app + web.
- **Where:**
  - App: `chat_room_screen.dart:1018`, `:1028-1070`. Snackbar on each try; `_fillScreen` can loop on its own.
  - Web: `src/components/chat/chat-room.tsx:554`, `:576-589`. Silent.
- **Suggested fix:** back off about 10 s and show one inline «إعادة المحاولة» row.

### B21. App: the chats list becomes a full error screen on one failed background refresh
- **Severity:** minor. **Platform:** app.
- **Where:** `naseebak_app/lib/features/chat/chats_screen.dart:116` (15 s refresh, `AsyncValue.when` without
  `skipError`).
- **Suggested fix:** keep the loaded list and show a small inline notice. **Needs an app version:** yes.

### B22. Smaller bugs (one line each)
- **Web, start-up:** an Ably message that arrives before the first load is dropped (`if (!partnerId) return`, `chat-room.tsx:421-429`,
  `:446-447`), and in live mode nothing polls. Fix: one `fetchNewer()` after the first load.
- **Web, unread count:** the ⌄ "newest" button counts every loaded partner message as unseen when the chat opens at
  «رسائل جديدة» (`chat-room.tsx:541-552`).
- **App, typing:** «يكتب الآن…» lasts up to about 13 s without Ably. The app shows 5 s after a poll that already lags
  up to 8 s, and the app and server values differ (`typing_signal.dart:8`, `src/lib/chat/typing.ts:6`).
- **App, clock:** the phone's clock decides expiry (`chat_models.dart:103`, `chat_format.dart`). A phone clock that runs
  ahead hides the composer of an active chat.
- **App, temp files:** a photo copy is left behind when its upload fails after leaving the chat (`chat_room_screen.dart:1283`).
- **App, sign-out:** a cache write during sign-out can leave the member's chats on the phone (`auth_controller.dart:175`,
  `chat_cache.dart`). It's per member, so nobody else reads it.
- **Server, races:** expiry can undo an extension made in the same second (`service.ts:245-246`, add
  `expiresAt <= now` to the where).
- **Server, bell:** the chat bell's «لديك 3 رسائل جديدة» isn't recounted after a delete for everyone (`delete.ts:44-49`).
- **Server, length:** a message over 2000 characters gets «بيانات غير صالحة» instead of the 1000-character message (route
  schema `max(2000)`, `src/app/api/chats/[id]/messages/route.ts:8`).
- **Server, reply quote:** the live reply quote shows the partner a message they hid or cleared for themselves until
  reload (`service.ts:856-871`).
- **Server, limits:** `/typing` has no rate limit (each call runs about 5 queries), and the `lastPush` map is never
  pruned (`service.ts:712`).

---

## UX issues

### U1. The filter blocks ordinary family talk
- **Severity:** important. **Platform:** server.
- **Where:** `src/lib/chat/filter.ts:405-433` (`hasScatteredNumber`, 9 digits in total), `:254-259` (7 or more digits
  joined by `-`, `.` or spaces).
- **What a member experiences:** each of these is refused as contact sharing (run against the filter):
  - «عمري 32 طولي 180 وزني 85 راتبي 900»
  - «دفعت 250 و 300 و 150 للأثاث»
  - «الإيجار 350 والسيارة 180 والقسط 220»
  - «أخواتي أعمارهم 34 32 29 27»
  - «تاريخ الزواج 15-06-2026», «يوم 2026-06-15», «15.06.2026», «١٥-٠٦-٢٠٢٦»
  - «الساعة 10:30 او 11:45 او 12:15»

  Correctly passed: «15/06/2026», «10:30», «عمري 28 وطولي 175 ووزني 70», «المهر 5000…», «سورة البقرة آية 255».

  Wedding dates, rent and salary are exactly what families discuss. This may explain part of the 256 refusals in two
  days.
- **Suggested fix:**
  - Recognise and remove dates (`d{1,2}[-.]d{1,2}[-.](19|20)dd`, ISO) and `hh:mm` times before counting.
  - Don't count groups that follow a measurement or money word (عمر, طول, وزن, راتب, دينار, ريال, سم, كغ …).
  - Raise the scattered threshold when no group starts with 0 or a country code.
  - Change it together with B4/B5, with the same before/after comparison on random and real samples.

### U2. Contact sharing that still passes
- **Severity:** minor. **Platform:** server.
- **Where:** `src/lib/chat/filter.ts:70-79`, `:101-125`.
- **What passes:** «ضيفني عالفيس», «ابحث عني بالفيس احمد خالد», «تك توك», `tele gram ahmad`, `X: ahmad_k`,
  `kik ahmad`, `line ahmad`, «ahmad99 هذا حسابي».
- **Suggested fix:** «فيس» as a whole word with بال/عال/ال, «تك توك», `x:` as a handle marker, «حسابي» next to a Latin
  word.

### U3. Web: the first hold on the mic records nothing after the permission prompt
- **Severity:** minor. **Platform:** web.
- **Where:** `src/components/chat/chat-composer.tsx:106-110`, `:142-146`; `src/components/chat/media-buttons.tsx:223`.
- **What a member experiences:** the system prompt ends the press, and on iOS no hint shows. The first try after
  allowing does nothing.
- **Suggested fix:** if starting took long (a prompt was shown), show «تم السماح بالميكروفون، اضغط مطولاً للتسجيل».

### U4. Web: Enter always sends on phones
- **Severity:** minor (a design choice to confirm). **Platform:** web.
- **Where:** `src/components/chat/chat-composer.tsx:345-350`.
- **What a member experiences:** a member can't write a multi-line message on a touch keyboard.
- **Suggested fix:** on `(pointer: coarse)`, Enter inserts a new line and the send button sends.

### U5. Web: failed media bubbles can't be dismissed and vanish on leaving
- **Severity:** minor. **Platform:** web.
- **Where:** `src/components/chat/message-menu.tsx:47-56`, `src/components/chat/message-bubble.tsx:241`.
- **What a member experiences:** a photo or voice note the server keeps refusing sits with only a retry button. Failed
  items live in memory only.
- **Suggested fix:** a «حذف» entry for failed local items. Optionally keep failed text in the draft.

### U6. Web: the photo viewer closes by itself on a just-sent photo
- **Severity:** minor. **Platform:** web.
- **Where:** `src/components/chat/photo-viewer.tsx:39`, `src/components/chat/chat-room.tsx:724`. The temporary id is
  replaced by the saved id.
- **Suggested fix:** move `viewerId` over to the saved id when it is replaced.

### U7. Web: tapping the quote of a deleted message loads about 300 messages first
- **Severity:** minor. **Platform:** web.
- **Where:** `src/components/chat/chat-room.tsx:592-600`.
- **Suggested fix:** stop at once when the snippet is the deleted trace.

### U8. App: «تعديل الرسالة» overwrites what is being typed
- **Severity:** minor. **Platform:** app.
- **Where:** `chat_room_screen.dart:1688-1694`.
- **Suggested fix:** ask first if the box isn't empty, and put the cursor at the end.

### U9. App: the list shifts while reading history
- **Severity:** minor. **Platform:** app. **Confidence:** likely.
- **Where:** `chat_room_screen.dart:2290-2310` (`reverse: true`).
- **What a member experiences:** a new message, a reaction chip or a failed row added below shifts what the member is
  reading.
- **Suggested fix:** keep the place when scrolled away.

### U10. App: smaller polish
- **Voice speed:** resets per chat, though the comment and `naseebak_app/CLAUDE.md` say it holds for the app run
  (`voice_playback.dart:355`).
- **Animation:** the rise-in motion replays when rows scroll back into view (`chat_room_screen.dart:2466`).
- **Rebuilds:** every typing event and the 250 ms mic level tick rebuild every visible bubble
  (`chat_room_screen.dart:2202`, `:1436`), which may drop frames on low-end Android in long chats.

### U11. Web copy
- **Severity:** minor. **Platform:** web.
- `src/components/chat/chats-shell.tsx:49`: «والمحادثة نصية» is no longer true now that Pro sends photos and
  voice notes.
- `src/components/chat/chat-list.tsx:246-250`: an ended or expired chat with no messages shows «ابدأ المحادثة».

---

## Checked and found correct

- **Access and privacy**
  - Membership is checked on every member route (`loadForUser`).
  - Send, reaction, typing and «لدى الجميع» need an open, unblocked chat. Read and report stay possible for the
    blocked person.
  - Admin chat routes never accept Bearer.
  - `replyToId` must be in the same chat. A reported `messageId` must be the partner's.
- **Media**
  - The route answers 401 when signed out, and 404 for non-members and for deleted or hidden media.
  - Range requests are supported, so Safari plays voice notes.
  - The storage path never reaches a client, Ably, push or the logs.
  - ffmpeg: demuxer pinned, stdin only, queue cap 4, 30 s kill. HEIC: queue 3, 50 MP, 20 s.
- **Notifications:** the push reads «رسالة جديدة من …» and never the text. One bell row per chat. Chat SMS are off
  (`chat_sms_off` in the log).
- **Polling and Ably**
  - Website: 4 s → 6 → 8 s, paused when hidden, catch-up on reconnect.
  - App: 4 s, 20 s with Ably, 60 s for a closed chat. Stops in the background. Timers are cancelled and `mounted` is
    checked after awaits.
- **Sending:** retries reuse the nonce and the server dedupes it. Sends are queued at the server's 5-in-5 s pace.
- **Reply, reactions and typing:** typing pace is 3 s and shows for 8 s on the website. `polledAt`, `reactionsSince`,
  `deletedIds`, `hiddenIds` and the first page widening to 100 all work.
- **Report:** «إبلاغ فقط» sends `end:false` on both platforms. A closed chat offers «إبلاغ وحظر». `endedBy` copy is right.
- **Status bar and expiry:** the status bar order and the family offer after `bothWrote` match CLAUDE.md. Extension is
  one-time, in the last 3 days, as a conditional write.
- **Delete and clear:** entries follow `deleteEntryMode` on the website and `deleteEnabled && appPayments &&
  (isPro || canBuy)` in the app. They are shown at once and undone on refusal.
- **Recorder:** hold, slide-cancel, lock, the 3-minute stop and background stop work on both platforms. A refused
  microphone offers Settings in the app.
- **Old Safari:** no regex lookbehind or named groups left in client chat code. The on-device filter is wrapped in
  try/catch (`13c49e2`).
- **Layout and copy:** inputs are 16 px and tap targets 44 px. Gendered copy and Western digits are right on both
  platforms. The app composer stays above the keyboard.

## Suggested fix order

1. **Server only, no app version:**
   - B6 (report alerts), as an ops fix.
   - The filter as one change: B4 + B5 + U1, with before/after samples.
   - Server-side safety: B11, B12, B13, B14.
2. **Website:** B3, B7, B9 (same kind as `13c49e2`), B8 (adds `clientNonce`, which helps the app later), then B15–B16
   and U3–U7.
3. **Next app version:** B1, B2, B17, B18, then B10 and B19–B21 and the U items.
