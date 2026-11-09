# Modern chat: design

Date: 2026-11-10. Status: owner's choices recorded; to be built on branch `feature/pro-qa` after the QA fixes.

## Intent
Members find the chat dated and hard to use on phones. Make it feel like the chat apps they already use (WhatsApp-style), on the website and in app 1.1.0, without changing any privacy rule: no contact sharing, text filtered, and photos and voice for Pro senders only.

## Owner decisions (2026-11-10)
| Topic | Decision |
|---|---|
| Look | WhatsApp-like: bubbles with tails, a soft patterned background, a round composer where one button switches between mic and send, and the time and ticks inside the bubble |
| Features | Reply to a message, typing indicator, conversation-starter suggestions, message reactions |
| Voice | Hold to record: release to send, slide to cancel, swipe up to lock for hands-free. Still stops at 3 minutes and waits for send or cancel; also stops when the app goes to the background |

## Look (website and app)
- **Background:** a soft brand pattern (navy at 4–6% on off-white) in a light tile. No photos and no faces.
- **Bubbles:**
  - My messages in brand navy with white text; the partner's in white with ink text. The bubble colour pairs are fixed brand tokens, never hardcoded Tailwind colours.
  - A tail only on the first bubble of a run from the same sender; 2 px between bubbles in a run, 8 px between runs.
  - Time and ticks sit inside the bubble, at the end corner.
  - `dir="auto"` per bubble, so Latin text reads left to right.
- **Header:** back, avatar initial, name, Pro badge, and a status line. The status line shows «يكتب الآن…» while typing, else the activity label («نشط اليوم»). One slim status bar under the header, chosen by priority:
  1. expiry soon
  2. family step
  3. push prompt, shown once as a dismissible chip

  This replaces today's stacked bars, which take about 42% of a phone screen.
- **Date chips:** stay at the top while scrolling. A «رسائل جديدة» divider marks the first unread message.
- **Website on desktop:** two panes, the chats list beside the open chat. The phone layout stays one pane.
- **Chats list:** «النشطة» / «المنتهية» tabs on the website, matching the app; the last-message preview; the unread badge.

## Composer
- A pill-shaped text field. The photo button sits inside the field at its end (Pro, or locked with the «Pro» tag where Pro can be bought, else hidden).
- One round button beside the field: mic when the field is empty, send when there's text.
- **Hold to record:**
  - Press and hold the mic to record, with a live waveform and timer.
  - Release to send.
  - Slide towards the start edge to cancel; the label reads «اسحب للإلغاء».
  - Slide up to lock; the bar then shows stop, cancel and send.
  - At 3 minutes, or when the app goes to the background, recording stops and waits (no auto-send).
  - Under 1 second is discarded with «الرسالة قصيرة جداً».
  - Website: pointer events, with the same gestures on touch and mouse.
- **Send queue:** a fast burst no longer drops refused bubbles. Sends queue one after another, and a refused one stays with retry.
- **Offline:** a banner «لا يوجد اتصال، سنرسل الرسائل عند عودته», and failed bubbles retry automatically when the connection returns.

## Reply to a message
- Swipe a bubble (app), or use the long-press / hover menu «رد» (both platforms). A quote strip appears above the composer with the original sender's name and a one-line snippet, or «📷 صورة» / «🎤 رسالة صوتية»; ✕ removes it.
- The sent bubble shows the quote at its top; tapping the quote scrolls to the original and highlights it briefly.
- **Data:** `Message.replyToId String?`, additive, same conversation only, validated on the server. The API returns `replyTo: { id, mine, kind, snippet }`, with the snippet built on the server from the stored text, already filtered. Old apps ignore the field.
- The reply text itself still goes through the full filter.

## Reactions
- Long-press (app) or hover/long-press (website) opens a small bar: ❤️ 👍 😊 🤲.
- One reaction per member per message; tapping the same one again removes it.
- It shows as a small chip under the bubble's corner.
- **Data:** a new table `MessageReaction { messageId, userId, emoji, createdAt }` with `@@unique([messageId, userId])`. This is a new table, so the unique constraint is fine.
- **API:** `POST /api/chats/[id]/messages/[messageId]/reaction { emoji | null }`. Message payloads gain `reactions: [{ emoji, mine }]`.
- Only the four emoji are accepted. No reactions in an ended or blocked chat. A reaction makes no push and no unread count.

## Typing indicator
- The client sends `POST /api/chats/[id]/typing` at most once every 3 seconds while the member types; nothing is stored in the database.
- **With Ably:** the server publishes a `typing` event on `chat:<id>`. Only the server publishes, as today.
- **Without Ably (polling):** the server keeps `lastTypingAt` per conversation and user in memory (one PM2 process, per CLAUDE.md), and the chat GET returns `partnerTyping: true` when it is under 5 seconds old.
- The header shows «يكتب الآن…», gendered via `forPartner()` («يكتب» / «تكتب»), for up to 5 seconds after the last signal.
- Never shown in an ended or blocked chat.

## Conversation starters
- When the chat has no messages, or only the opening system note, show 4 chips above the composer. Tapping a chip fills the field; the member can edit it before sending.
- They also show while I haven't sent anything yet.
- **Texts:** a fixed list in code, gendered by viewer and partner, respectful, about values and plans, never contact. For example:
  - «ما الذي تبحث عنه في شريكة حياتك؟» (gendered)
  - «كيف تحب أن تقضي يوم الجمعة؟»
  - «ما أهم شيء في العائلة بالنسبة لك؟»
  - «ما خططك للسنوات القادمة؟»
- They still pass through the filter like any message.

## Long-press / hover menu
- Options: «رد», reactions, «نسخ» (text only), «إبلاغ عن الرسالة» (opens the report flow with that message preselected).
- No delete-for-everyone, so evidence stays for reports.

## Media polish
- **Photo:** the time and ticks sit over the photo's corner. Full screen is a black viewer with pinch zoom and swipe between the chat's photos, and no download button.
- **Voice:**
  - A waveform drawn from the duration (no audio analysis needed) that can be scrubbed.
  - Speed 1× / 1.5× / 2×.
  - An unplayed dot for the partner's notes, tracked locally.

## Also fixes found by QA (web-chat findings)
- Pause polling in hidden tabs, and poll with `?after=`.
- Load older messages automatically when scrolled to the top.
- A refused message becomes an inline note with the family-introduction button, and the composer keeps the text.
- Nonce via `crypto.randomUUID()`.

## Old app versions
- 1.0.x keeps working:
  - New fields are additive.
  - A reply shows as plain text.
  - Reactions and typing are simply not shown.
- Starters are client-only.

## Out of scope
Delete or edit messages, forwarding, read receipts settings, group chats, stickers and GIFs, link previews (links are blocked anyway).

## Constraints
- CLAUDE.md applies: additive schema, `zod/v4`, gendered copy, Western digits, ≥44 px targets, ≥16 px inputs, no hardcoded colours, `Dialog` not `window.confirm`, `LoadError`, and the app rules (mounted after await, SecureArea, no Hero).
- Ably: only the server publishes.
- New automatic texts (if any) go in `automatic.ts`.
