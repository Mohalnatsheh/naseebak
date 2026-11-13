# App: account hub, credits, invite and family contacts (mockup gaps 1–3)

Date: 2026-11-13. Status: approved by the owner in chat (short design), not built. App only; ships in the next app
version with the home/suggestions redesign. No server change.

## Why

The owner asked to build what the 2026-11-12 app mockup shows but the app doesn't. The audit
(`.superpowers/mockup-inventory.md` in the home/suggestions worktree) found these app screens only partly match:
«حسابي» is a flat tile list; «الرصيد» lacks the mockup's layout and sale lines; «ادعُ صديقاً» shows counts only;
the shared guardian phone can only be copied (the website has call / WhatsApp).

Mockups: `docs/design-mockup/app-mockup/project/Account.dc.html`, `Credits.dc.html`, `Referral.dc.html`,
`ReferralProgress.dc.html`, `MatchFamilyContacts.dc.html` (main checkout). Style rules: `tools/BRIEF_COMMON.md`.

## Decisions

| Item | Decision |
|---|---|
| «حسابي» | Profile card (locked/own avatar, «الاسم، العمر», Pro badge, «الملف الشخصي · مكتمل N%» → `/profile`), then three white groups: [«الرصيد» N → `/credits`, «عضوية Pro» with plan name → `/pro`], [«ما أبحث عنه» → `/profile/preferences`, «صوري» «مخفية حتى التوافق» → `/profile/photos`, «ادعُ صديقاً» → `/referral`], [«الإعدادات» → `/settings`, «المساعدة والدعم» → `/support`]. Rows hide where they hide today (Pro row only where shown today; credits/payments rules as today). |
| «الإعدادات» | New screen `/settings`: notifications, blocked members, guardian details, personality quiz/edit links that sit on «حسابي» today, pause, delete, sign-out. Same actions and dialogs as today, moved. (Owner approved the move.) |
| «الرصيد» | Big balance + «رصيد متاح · «مهتم» برصيد واحد»; «شراء رصيد» list (name, price chip, `popular` → «الأكثر طلباً», lowest price per credit → «أقل سعر للرصيد», `wasPrice` struck, `bonusCredits` → «+N هدية»); a sale banner when `offer` is set (title + ends date); the payment note; Pro row; «آخر الحركات» = the last 3 payments from `/api/payments/history` with «السجل» → `/credits/history`. Payment flow, pending card, mock checkout and hidden-payments rules unchanged. |
| «ادعُ صديقاً» | Code with «نسخ», «مشاركة الدعوة», «كيف تعمل» 3 steps, «دعوات مكتملة N من 10», and a short list of invited friends from the existing `referrals` field (first name + «اكتمل» / «لم يكمل الإعداد بعد»), never more. |
| Family contacts | On the shared guardian card: «اتصال» (`tel:`) and «واتساب» (`https://wa.me/<digits>`) buttons next to the selectable number, same as the website's `guardian-contact-card.tsx`. |

## Non-goals / anti-goals

- No server or API change; old servers keep working (every new field read with a safe default).
- No change to payments logic, credits, refunds, the referral rules or who sees payments (test accounts, «Payments in the app»).
- Never show a friend's surname, phone or photo; never a member photo before a match.
- Profile edit and setup screens are out (another session redesigns them). Chat is out.

## Constraints

App design tokens only (no new hex), Cairo, text ≥ 12, tap ≥ 44, RTL, gendered copy, Western digits. Keep existing
widget keys tests rely on where screens keep the same actions.

## Left to the builder

File split, the exact widget for groups (a shared `GroupedSection` is fine), how «أقل سعر للرصيد» ties are broken,
and the empty state of «آخر الحركات» (hide the section when there are no payments).
