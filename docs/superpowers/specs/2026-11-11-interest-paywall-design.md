# «مهتم» at 0 credits opens the paywall — design

Date: 2026-11-11. Owner request, decisions taken in chat the same day.

## Why

At 0 credits (`credit_on_interest` on) the «مهتم» button is greyed out. A greyed button sells nothing: the member doesn't
learn that one tap away they can recharge. The owner wants «مهتم» to stay tappable and open a short "out of credits"
step with a buy button.

## Decisions (owner)

- **The paywall is a short step, then buy.** Website: the existing «مهتم» dialog in its «انتهى رصيدك» state (no chat /
  family choice, no guardian form), one line, a «اشحن رصيدك للمتابعة» button to `/dashboard/payments`, and «إلغاء».
  App: a short bottom sheet with the same text and a «اشحن» button to `/credits` (Stripe in the browser, as today).
- **Members who can't buy stay as today** (greyed «مهتم», today's 0-credit line): test/review accounts
  (`isTestPhone`), app requests while "Payments in the app" is off, countries not selling (`purchasesAvailable` false:
  Lebanon, Saudi Arabia until prices are approved).
- **Behind a new switch** `interest_paywall` (Admin → Settings), off by default. Off = exactly today's behaviour.

## Unchanged

- «لا» stays free. The server still refuses a paid «مهتم» at 0 with `NO_CREDITS` (the safety net).
- `free_interest_reply`: a reply on a `likedYou` card at 0 credits is still a free «مهتم» that goes through; it never
  shows the paywall.
- Copy follows gender (`forViewer` / `g()`), and never mentions the switch.

## Shape

- One server decision: `/api/me/counts` returns `interestPaywall: boolean` =
  switch on ∧ `creditOnInterest` ∧ `purchasesAvailable(member's country)` ∧ ¬`isTestPhone(phone)` ∧
  (app request ⇒ `appPaymentsEnabled()`). Old apps ignore the field.
- Website and app read only that field. At 0 credits with it true, «مهتم» is enabled and its tap opens the paywall
  step; a `NO_CREDITS` answer while the dialog/sheet is open turns it into the same step.
- The legacy kinds (non-mutual cards) behave the same: the tap opens the paywall step instead of the credit confirm.

## Release

- Website: a normal deploy, then the owner turns the switch on.
- App: needs a new app version (the lock is decided in the app). No `pubspec` bump without the owner.
