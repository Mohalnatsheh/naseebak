# App Account, Credits, Invite and Family Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring four app screens in line with the 2026-11-12 mockup: «حسابي» hub, a separate «الإعدادات», «الرصيد», «ادعُ صديقاً», and call/WhatsApp on shared guardian phones.

**Architecture:** App-only (Flutter). Reuse existing repositories and providers; parse two extra fields the server already sends (`offer`, `bonusCredits`, `referrals`). No server change.

**Tech Stack:** Flutter, Riverpod, go_router, url_launcher (already a dependency), `flutter test`.

**Spec:** `docs/superpowers/specs/2026-11-13-app-account-credits-invite-design.md`

## Global Constraints

- App design tokens only (`AppColors`, `AppText`, `AppSpace`), no new hex; Cairo; text ≥ 12; tap targets ≥ 44; RTL; Western digits; gendered copy with the app's `g`/gendered helpers.
- No server/API change; every newly read field has a safe default (older servers).
- Payments rules unchanged: purchase UI only where `appPaymentsProvider` and today's rules show it (test accounts never see payments).
- Never show a referred friend's surname, phone or photo; never a member photo before a match.
- Don't touch `naseebak_app/lib/features/chat/`, profile edit/setup screens (another session), or home/discovery.
- Each task ends with `cd naseebak_app && flutter analyze && flutter test <its test files>`; the last task runs the full `flutter test`.

## Review Focus

1. A test account / «Payments in the app» off: «الرصيد» row, packages, sale banner and «آخر الحركات» stay hidden exactly as today. Test in Task 3.
2. Older server without `offer` / `bonusCredits` / `referrals`: screens render with no sale lines and no friends list. Tests in Tasks 3 and 4.
3. Moving actions to «الإعدادات» loses nothing: every action on today's «حسابي» is reachable from «حسابي» or «الإعدادات». Test in Task 1.
4. Guardian phone with spaces/«+» or a non-962 dial code builds correct `tel:` and `wa.me` links. Test in Task 5.
5. Pause / delete / sign-out keep their dialogs and Pro lines after the move. Test in Task 1.

---

### Task 1: «الإعدادات» screen (move, no behaviour change)

**Files:** Create `naseebak_app/lib/features/settings/settings_list_screen.dart`; modify `settings_screen.dart`, `core/routing/router.dart` (`GoRoute(path: '/settings', …)` — keep `/settings/notifications`, `/settings/blocks` as children or siblings); test `naseebak_app/test/settings_list_test.dart`.

**Produces:** `SettingsListScreen` at `/settings` holding, in this order: «إعدادات الإشعارات», «المحظورون», «بيانات وليّ الأمر», «تعديل ملفي», «اختبار الشخصية» (if on «حسابي» today), «الشروط والأحكام», «سياسة الخصوصية», «الأسئلة الشائعة», then «إيقاف الحساب مؤقتاً», «حذف الحساب», «تسجيل الخروج» — same handlers/dialogs (`_pause`, `_delete`, `DeleteAccountDialog`, sign-out) moved, not rewritten.

- [ ] Test: every listed row exists and routes/opens what it did; pause and delete open their dialogs with the Pro line for a renewing Pro member; sign-out calls the same controller method.
- [ ] Run test → FAIL. Implement (move code; old screen keeps compiling). Run → PASS. Commit.

### Task 2: «حسابي» hub

**Files:** modify `naseebak_app/lib/features/settings/settings_screen.dart` (the `/account` tab screen); test `naseebak_app/test/account_hub_test.dart`.

**Consumes:** Task 1 route `/settings`; existing `authControllerProvider` (me: name, age, credits, Pro), profile completeness (whatever `strengthSubtitle` in `features/home/profile_strength_card.dart` reads), Pro state/plan name (`features/pro/`).

- [ ] Test: profile card shows «الاسم، العمر», Pro badge only for Pro, «الملف الشخصي · مكتمل N%» and opens `/profile`; groups and rows in the spec order with values («الرصيد» N, Pro plan name, «مخفية حتى التوافق»); «الرصيد» and «عضوية Pro» rows hidden where they are hidden today; «الإعدادات» → `/settings`, «المساعدة والدعم» → `/support`; the avatar never shows another member's photo (own avatar or initial).
- [ ] FAIL → implement (white grouped sections radius 12 with hairlines; a small `GroupedSection`/`GroupedRow` widget in `shared/widgets/` if none exists) → PASS → commit.

### Task 3: «الرصيد» restyle with sale lines

**Files:** modify `features/credits/credits_repository.dart` (parse `Plans.offer` → `{percent, title, endsAt}` nullable, `CreditPackage.bonusCredits` int default 0), `features/credits/credits_screen.dart`; test `naseebak_app/test/credits_redesign_test.dart`.

- [ ] Test: big balance and «رصيد متاح · «مهتم» برصيد واحد»; packages list shows price chip, «الأكثر طلباً» for `popular`, «أقل سعر للرصيد» on the lowest price/credit (one package only), `wasPrice` struck, «+N هدية» when `bonusCredits` > 0; sale banner with `offer.title` and the end date only when `offer` != null; «آخر الحركات» = last 3 payments with «السجل» → `/credits/history`, hidden when none; JSON without `offer`/`bonusCredits` parses with defaults; payments hidden (test account or switch off) → none of the purchase UI, banner or «آخر الحركات», as today; the existing `credits_payment_test.dart` still passes.
- [ ] FAIL → implement (keep the pending-payment card, cancel, mock checkout untouched) → PASS → commit.

### Task 4: «ادعُ صديقاً» restyle with friends list

**Files:** modify `features/referral/referral_screen.dart` (`ReferralInfo` parses `referrals: [{id, creditsAwarded, referee:{firstName}}]`, default empty); test `naseebak_app/test/referral_redesign_test.dart`.

- [ ] Test: code with «نسخ» (copies), «مشاركة الدعوة» (share), three «كيف تعمل» steps, «دعوات مكتملة N من 10»; friends list shows first names with «اكتمل» / «لم يكمل الإعداد بعد»; no list when `referrals` absent or empty; only `firstName` is ever rendered; `referral_signup_test.dart` still passes.
- [ ] FAIL → implement → PASS → commit.

### Task 5: Call / WhatsApp on the shared guardian phone

**Files:** modify `features/matches/match_detail_screen.dart` (`_GuardianCard`), add a pure helper `guardianLinks(String phone, String dialCode) → ({Uri tel, Uri wa})` next to `formatGuardianPhone`; test `naseebak_app/test/guardian_links_test.dart`.

- [ ] Test: helper builds `tel:+962791234567` and `https://wa.me/962791234567` from local, `+`, spaced and `00` forms and for dial codes 966 / 961; card shows «اتصال» and «واتساب» buttons (≥ 44 high) that call `launchUrl` with those URIs (mock the launcher as existing tests do); the number stays selectable.
- [ ] FAIL → implement (mirror `src/components/intro/guardian-contact-card.tsx`) → PASS → run full `flutter analyze && flutter test` → commit.
- [ ] Add one line to `naseebak_app/CLAUDE.md` under the next-version note listing these four screens. Commit.
