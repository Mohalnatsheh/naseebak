# WhatsApp-style chat (website + app)

Date: 2026-11-13. Status: approved by the owner (2026-11-13), after a mockup of the chat, long-press and chats list.

## Intent

The owner wants the chat to look and behave like WhatsApp, so members feel at home the moment they open it. The model
is WhatsApp **for Android** in light mode, copied in layout, gestures and behaviour, but in Naseebak's own colours and
the Cairo font. The chat is the platform's most important feature. Most members already use WhatsApp every day, so
every place where our chat behaves differently is friction.

## Owner decisions (2026-11-13)

- **Rebuild what members see, keep the engine.** The header, message list, bubbles, input bar, menus and the chats
  list are new. These stay exactly as they work today:
  - sending and the send queue, nonces, live updates (Ably) and polling;
  - the filter, expiry and extension, the status-bar logic, the family offer;
  - Pro media, delete/clear, report/block/end.
- **One layout everywhere**, modelled on WhatsApp for Android: the app on Android and iPhone, and the website on phone
  and desktop.
- **Not WhatsApp's colours.** Naseebak's tokens only (CLAUDE.md → Brand and colours, design system).
- **Website behind a switch**, off by default (Admin → Settings). The app ships it in a new app version.
- **The app has no switch: a hard cut.** The new app version contains only the new chat, tested on TestFlight and the
  Play test track first. Rollback means another app release.
- **The app goes in a later version**, built on top of the app work already queued: the «مهتم» paywall after 1.2.1,
  and chat delete in 1.3.0+8. Those releases go out as planned and are not held up by this work.

## Goals

- A member who knows WhatsApp can use every chat action without learning anything: reply, react, copy, delete,
  record, send a photo, find older messages, jump to the newest.
- The same layout and gestures on the website and the app.
- The two important app bugs found in the 2026-11-13 chat audit are fixed in the same pass
  (`docs/qa/2026-11-13-chat-audit.md` B1 and B2), since that code is rewritten anyway.

## Non-goals

- New chat features that need the server: editing a message, forwarding, starring, pinning, message info,
  «آخر ظهور» or online, calls, documents, location, contacts, polls, link previews, dark mode. Several of these are
  forbidden by product rules (no contact outside the cycle).
- Changing what a member may do: Pro rules, filter rules, expiry, guardian and family steps stay as they are.
- API or schema changes. None are needed. If the builder finds one is unavoidable, it must be additive and keep old
  apps working.
- The other audit findings. They are separate fixes, not part of this change.

## Anti-goals (a failure even if it works)

- Anything that looks like WhatsApp's brand: its green, its doodle wallpaper, its logo or icons copied as images.
  Layout and behaviour only.
- A regression in sending: a lost message, a double send, the old-iPhone crash (`13c49e2`, no regex lookbehind, no
  `findLast` in client code).
- Hiding or weakening safety: the «محادثة خاصة» safety note, the report entry, the filter's refusal note and the family
  route must stay as easy to find as today.
- An old app that breaks. The server answers stay the same.

## The layout (Android WhatsApp → Naseebak)

RTL throughout: everything WhatsApp puts on the left sits on the right, and swipe directions mirror.

### Chats list
- **Top bar:** white, with the title «المحادثات» and nothing else (no search, no ⋮: there are few chats).
- **Filter chips** in place of the tabs, like WhatsApp's «All / Unread»: «الكل», «غير مقروءة», «المنتهية». «الكل» shows the
  active chats. «المنتهية» replaces today's ended tab.
- **Rows:**
  - avatar, then the name with the Pro badge;
  - the last message preview with my ✓/✓✓. «يكتب الآن…» is not shown in the list: the list API has no typing data,
    and subscribing to every chat live isn't worth it. Typing shows in the chat's top bar, as today. *(Designer's
    call.)*
  - on the end side, the time («أمس», a date) and a round navy unread badge;
  - a line under the name for days left when it is 3 or fewer.
- **Ended rows:** greyed, with no unread badge.

### Chat screen: top bar
- **Bar:** white, height as WhatsApp's.
- **Contents:**
  - back arrow (the app; the website only on phone);
  - avatar, then name with the Pro badge, then a subtitle;
  - one ⋮ menu at the end.
- **Subtitle:** «يكتب الآن…» while typing, else the activity label («نشط اليوم»).
- **Taps:** the avatar or name opens the match page. On the app that is «صفحة التوافق».
- **⋮ menu:** today's actions, with today's rules, in one order on both platforms. Destructive items come last, in
  red. No new entries; the family step stays in the status bar and on the match page, as today.
  - a «متبقي N أيام» label at the top (not tappable, as on the website today)
  - «صفحة التوافق» (the website's «عرض التوافق» uses the app's name)
  - «تمديد 7 أيام» when allowed
  - «مسح المحادثة» for Pro, per today's rules
  - «إبلاغ»
  - «إنهاء المحادثة»
- **Days left:** today's gold time arc around the header avatar stays (a shared design-system element), along with
  the menu label. *(Builder's call recorded by the designer.)*
- No call or video icons.

### Chat screen: under the top bar
- **Status bar:** today's one-line status bar (`chatStatusBar`: expiry, family offer, request, push chip). It is
  restyled as a slim strip under the top bar, in the spot where WhatsApp shows business and security strips. Its logic
  is unchanged.

### Chat screen: message area
- **Background:** the `sand` chat background (`#efe7da` in the app mockup). A subtle brand pattern is optional, but
  never a doodle that imitates WhatsApp's.
- **Safety note at the top:** today's «محادثة خاصة · لا تشارك الأرقام أو الحسابات», shaped like WhatsApp's encryption
  note: a centred rounded chip in a pale gold tint with `accent-ink` text and a shield icon.
- **Date chips:** centred and rounded, floating at the top while scrolling, then fading out after a second of no
  scrolling, as on Android.
- **Unread divider:** a full-width pale strip reading «N رسائل غير مقروءة» (`arabicCount`) at the first unread message.
  The chat opens there.
- **Bubbles:**
  - **Partner's messages:** white bubbles with ink text.
  - **My messages:** a pale navy tint with ink text, in the spot where WhatsApp has its pale green. This replaces
    today's solid navy, and is the main visual change. The exact shade is a design-system token (proposed:
    `--bubble-mine`, about `primary` at 10–12% on white). It must pass contrast with ink text and with the time and
    ticks.
  - **Tail:** on the first bubble of a run only. The gap is 2 px inside a run and 8 px between runs (as today).
  - **Inside the bubble:** time and ticks at the bottom end corner, inside. ✓ means sent, ✓✓ in grey means sent and
    not read, ✓✓ in navy (or the existing read colour) means read. Keep today's read meaning: there is no "delivered"
    state.
  - **Reply quote:** inside the bubble on top, with a coloured bar on the start side, the sender's name («أنت» or the
    partner's name) and one line of the quoted text, a photo thumbnail, or «رسالة صوتية». Tapping it scrolls to the
    original and flashes it.
  - **Reactions:** a small white pill overlapping the bubble's bottom edge, showing the emoji(s). Tapping it shows who
    reacted, and I can remove mine.
  - **Deleted:** «تم حذف الرسالة» in italic muted text with a 🚫-style icon (drawn, not an emoji image).
  - **Failed send:** a red ⓘ beside the bubble. Tapping it gives «إعادة المحاولة» / «حذف». A failed item can now be
    dismissed (audit U5).
  - **Filter refusal:** today's gold note stays in the thread, with the family button.
- **Photos:** the image fills the bubble with rounded corners. The time and ticks sit over the image on a dark scrim at
  the bottom end. Tapping it opens the full-screen viewer: top bar with the sender and date, swipe between the chat's
  photos, pinch to zoom.
- **Voice notes:**
  - play/pause, a waveform you can drag along, and the duration that becomes the position while playing;
  - a speed chip (1× / 1.5× / 2×) that appears while playing and holds across chats for the app run;
  - a small mic mark on notes I haven't played yet.
- **Jump to newest:** a round white button at the bottom end with a ⌄ arrow and a navy unread-count badge. It appears
  when scrolled up, and the count is the number of messages that arrived since (audit B22: correct count).

### Chat screen: input bar
- **Text pill:** a white rounded pill. Inside it, from the start side:
  - an emoji button;
  - the text field, which grows up to about 6 lines, then scrolls;
  - a paperclip button;
  - a camera button.
- **Round button:** outside the pill. It shows the mic when the field is empty and «إرسال» (paper plane) when there is
  text. Navy fill with a white icon.
- **Emoji button:**
  - It swaps the keyboard for an emoji panel and back, as on Android.
  - Website on desktop: it opens a popover picker.
  - It inserts at the cursor.
  - The panel is a client-side library, no server change. Builder picks a light library with Arabic-safe RTL layout.
- **Paperclip** (Pro media, today's rules):
  - It opens a small sheet with two items: «المعرض» and «الكاميرا».
  - Shown only where today's photo button is shown.
  - Where Pro can be bought, it opens today's «Pro» offer instead.
  - Where neither applies, the paperclip and camera are hidden.
- **Camera:** a shortcut straight to the camera, same rules. On the website it uses the file input with
  `capture="environment"` on phones, and is hidden on desktop.
- **Enter key:** on phones it inserts a new line, and the round button sends, as in WhatsApp. On desktop Enter sends
  and Shift+Enter adds a line (audit U4).
- **Voice, hold to record:** same gestures as today:
  - hold to record;
  - slide towards the start edge to cancel, with «‹ اسحب للإلغاء»;
  - slide up to the lock;
  - when locked: a bar with delete, pause/resume (new, client-only, if the recorder supports it; otherwise
    stop-to-preview) and send;
  - the 3-minute stop and the background stop as today.

  The first press after the microphone permission prompt shows a hint instead of doing nothing (audit U3).
- **Reply strip:** above the pill, inside the same white card, as WhatsApp. It shows a coloured bar, the name, one line
  of the quote, and ✕.
- **Read-only footer:** when the chat can't be written to (expired, ended, blocked), the input bar is replaced by
  today's notice and actions in a full-width bar, like WhatsApp's "You can't send messages" bar. The family links and
  «إبلاغ وحظر» stay there as today.

### Gestures and selection (the main behaviour change)
- **Swipe to reply:** swipe a bubble towards the inside of the screen and it springs back. On the app this exists
  today. On the website it is new on touch screens; on desktop a reply arrow shows on hover.
- **Long-press (desktop: hover chevron or right-click) selects the message, as on Android:**
  - The bubble gets a highlight across the full row width.
  - A reaction pill floats above it with the four emoji (❤️ 👍 😊 🤲). There is no "+": we keep four.
  - The top bar turns into an action bar with ✕, «1», and icons for reply, copy (text only), delete (Pro rules as
    today) and ⋮ → «إبلاغ عن الرسالة» (the partner's message only).
  - Delete opens today's choice of «حذف لديّ» / «حذف لدى الجميع» as an Android-style dialog.
- **One message at a time.** No multi-select, because delete-for-everyone and report are per message on the server.
- Back or tapping elsewhere clears the selection.

### Desktop website
- Two panes as today: the chats list on the start side and the chat on the end side. This is WhatsApp Web's layout.
  Both panes use the designs above.
- The back arrow is hidden on desktop.

## Constraints

- **Colours:** design-system tokens only. The guard test must stay green: no raw hex, no forbidden palettes, no text
  under 12 px. New tokens get the same names on the website and the app (`docs/reference/design-system.md`).
- **Layout and tap targets:** RTL with logical properties. Western digits, gendered copy (`forViewer` / `forPartner`).
  Tap targets ≥ 44 px, text inputs ≥ 16 px on phones. Reduced motion makes every animation instant.
- **Old Safari:** no lookbehind and no `findLast`/`findLastIndex` in client code. Test on Safari 15.
- **Website switch:** `chat_whatsapp_layout`, Admin → Settings, default off. Off means today's chat exactly. The
  builder chooses how the client learns the setting (server component prop or the chat GET); the setting is cached for
  30 s like the others.
  - Keep both layouts in the code while the switch exists. They share the engine (hooks, data, send queue), so only the
    presentation forks.
  - Remove the old layout in a later change once the switch has been on for a while.
- **App:** a new app version. No server change is required, so old apps keep their current chat.
  - Today the app's chat screen is one 2,877-line file (`chat_room_screen.dart`). Splitting the presentation out of it
    is the builder's call, and is likely needed.
  - B1: mark read only while the chat is the screen on top, and mark read again on returning to it.
  - B2: a text failing after leaving the chat is saved as failed, never lost.
- **Live site:** additive only, behind the switch. No schema change.
- **Mockup:** the 2026-11-12 app redesign mockup (`docs/design-mockup/`) is iOS-style. Its chat screens are superseded
  by this design. The builder may update them later, as design only.

## Approaches considered

1. **New look, same engine (chosen).** Only the presentation is rebuilt. The tested sending, live-update and safety
   logic is kept, and the two app bugs are fixed while that code is open. Lowest risk, and members get the whole visible
   change.
2. **Rewrite the whole chat, logic included.** Rejected: weeks longer, and it would likely bring back fixed bugs
   (old-iPhone send, duplicate sends, ordering) with no visible benefit.
3. **Website only.** Rejected: the app carries most chatting (about 9.7k of 16.9k messages on 11–13 November 2026).

Layout model:
- **Android everywhere (chosen):** most members are on Android, and one design keeps the website and app the same.
- **Per-platform WhatsApp:** rejected, about twice the app work.
- **iPhone-style everywhere:** rejected; it fits the iOS mockup, but most members use Android WhatsApp.

## Order of work

1. **Design tokens:** the new tokens (`bubble-mine`, selection highlight, date chip, safety chip) on the website and
   the app.
2. **Website, behind the switch:** the chats list, then the chat screen, then the gestures and selection. Walk a real chat
   between the test accounts (`0777000001`/`0777000002`) on a local production build, including an iPhone on Safari 15
   or older and an Android phone browser. The switch is global, so a check on production means turning it on for
   everyone; do that only with the owner, outside the evening peak.
3. **App:** the same design, with B1/B2, in the app version after the queued ones. Build it on the branch that holds
   the queued app work. Then TestFlight and the Play test track.
4. **Turn the website switch on** (owner), then release the app (owner).

## Left to the builder

- Component and widget structure, and how the old and new website layouts share the engine.
- The emoji picker library (light, RTL-safe, Arabic search not needed).
- Exact sizes and spacing, within the tokens.
- Whether voice pause/resume is possible on each platform; if not, the locked bar has delete and send only.
- How the date chip fades, and the swipe thresholds.
- Updating `docs/reference/design-system.md` and CLAUDE.md (the chat section and the new switch).
