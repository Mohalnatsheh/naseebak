# Website small fixes: sign-out confirm, «شروطي الأساسية» window, «إعدادات الحساب» page (mockup gap 5)

Date: 2026-11-13. Status: approved by the owner in chat. Website only, behind `dashboard_redesign` (off). No server change.

## Decisions
1. **Sign-out confirm.** «تسجيل الخروج» on «حسابي» (`src/app/(ar)/dashboard/account/page.tsx`) and in the sidebar
   (`src/components/shared/dashboard-sidebar.tsx`) open a `Dialog` first: title «تسجيل الخروج؟», body «سيتم تسجيل
   خروجك من هذا المتصفح ومن كل المتصفحات الأخرى. التطبيق على هاتفك لا يتأثر.» (gendered where needed), buttons
   «تسجيل الخروج» (calls `signOutAndUnlinkPush("/login")` as today) and «إلغاء». Switch off: signs out at once, as today.
2. **«شروطي الأساسية» window.** `DealbreakersCard` (`src/components/suggestions/dealbreakers-card.tsx`) renders inside
   a `Dialog` instead of on the «جديدة» page; opened by the existing «شروطي الأساسية» button/links, by the «حسابي» row
   and by `#dealbreakers` in the URL. Same content, saving and `onSaved` reload. Switch off: the card on the page, as today.
3. **«إعدادات الحساب» page.** New route `/dashboard/account/settings` with the pause and delete section now at the bottom of
   `src/app/(ar)/dashboard/profile/page.tsx` (`#account-settings`), extracted into a shared component with the same dialogs,
   deletion status and Pro lines. The «حسابي» row links there when the switch is on; the profile page hides that section
   then. Switch off: today's link and section.

## Non-goals
No change to what pause, delete, sign-out or the conditions do; no server change. The login/register/edit session
(branch `claude/auth-edit-redesign-dbcdb3`) edits 6 lines of the profile page: keep the extraction a pure move to ease the merge.

## Constraints
Brand tokens, ≥ 12 px, tap ≥ 44, RTL, gendered copy («يمكنك …» in shared lines), `Dialog` never `window.confirm`.
