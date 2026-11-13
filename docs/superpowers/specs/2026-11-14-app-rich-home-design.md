# App: richer home (owner feedback "very basic")

Date: 2026-11-14. Status: approved by the owner (mockup `docs/design-mockup/app-rich-home-2026-11-14.html`, and
"open the card in «الاقتراحات»"). Flutter app only, next app version. No server change; production unaffected.

## Why
The owner saw the 2026-11-13 app home on the simulator and found it "very basic": a greeting, an «اليوم» list and a
«المزيد» row. They want the people and the account shown as real cards.

## Design (top to bottom; a block with nothing to show is hidden, never an empty box)
1. **Header** as today: greeting + first name, credits pill, bell. `PushAskGate` and the one `_BannerSlot` as today.
2. **«خطوتك التالية» navy card** (`AppColors.navy`, white text, gold CTA). One message by priority:
   pending family request («طلب تعارف بانتظار ردّك» → that match) › `likedYou` > 0 («N أشخاص أبدوا اهتمامهم بك» +
   free-reply line when `freeInterestReply`, CTA → suggestions tab «مهتمون بك») › `newSuggestions` > 0
   («N اقتراحات جديدة بانتظارك» → «جديدة») › `unreadChats` > 0 («رسائل جديدة في محادثاتك» → chats) › quiet
   («اقتراحات جديدة تصلك كل صباح», CTA «أكمل ملفك» → first unfinished profile step while < 100%, else «راجع شروطك
   الأساسية» → preferences). Below it three stats: «اقتراحات جديدة» `newSuggestions`, «مهتمون بك» `likedYou`,
   «محادثات» `unreadChats` (0 shown as 0). Arabic counted nouns, gendered copy.
3. **«بانتظار ردّك»** rows as today (only when something waits).
4. **«اقتراحات اليوم»**: horizontal cards from `homeSuggestionsProvider` (first 5 of «جديدة»): locked avatar,
   «الاسم، العمر», city + activity, score pill, up to 3 fact chips (from `cardFacts`), the reason line, «الملف كاملاً».
   Tap → switch to the suggestions tab on «جديدة» and open that person's `CandidateProfileScreen` there, so answers,
   credits and the paywall run through the suggestions screen exactly as today. «عرض الكل» → «جديدة». Hidden when empty.
5. **«مهتمون بك»**: up to 3 cards with a blurred placeholder tile (never a photo) and a «مخفية» tag, «الاسم، العمر»,
   city, and «ردّك مجاني» when `freeInterestReply`. Tap → «مهتمون بك» tab (open that card). Hidden when empty.
6. **«المحادثات»**: the latest 2 conversations from `chatListProvider` (partner name, last line or status, time,
   unread count), only when chat is on or the member has chats; «الكل» → chats tab. Read-only use of chat models.
7. **«حسابي» tiles**: «رصيدك» N with «اشحن» (only where payments are shown today; otherwise the number only);
   «عضوية Pro» (only where the Pro row shows today; «فعّالة» when Pro); «ملفك مكتمل N%» with a bar and the next step
   (only below 100%).
8. **«سؤال الأسبوع»** inline: the existing `PollCard` (only with an active question, as today).
Quiet member: after the navy card, a «نصائح لك» block with up to 2 tips (missing «نبذة» → profile edit; «شروطي
الأساسية» → preferences), then the tiles and the poll.

## Constraints / non-goals
Tokens only (no new hex), text ≥ 12, tap ≥ 44, RTL, gendered copy, Western digits; never a member photo before a
match; payments visibility rules unchanged; old servers (missing counts fields) degrade to hidden blocks; no change to
chat files or the suggestions screen's answer logic (only a request to open a given item). Keep `_Once` counts re-read.
