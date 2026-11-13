# Website Small Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sign-out confirm, «شروطي الأساسية» as a window, and a separate «إعدادات الحساب» page, behind `dashboard_redesign`.
**Architecture:** Three independent UI changes, each reading `counts.dashboardRedesign` from `useDashboardData()`.
**Tech Stack:** Next.js 16, React 19, shadcn Dialog, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-13-web-small-fixes-design.md`

## Global Constraints
- Switch off = today exactly. No server change. Brand tokens only, no raw hex, ≥ 12 px, tap ≥ 44, RTL, gendered copy. `Dialog`, never `window.confirm`.
- Done = `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` green.

## Review Focus
1. Switch off: sign-out immediate, card on the page, row → `/dashboard/profile#account-settings`. Tests in each task.
2. Cancelling the sign-out dialog does nothing (no request). Task 1.
3. `#dealbreakers` deep link opens the window once and saving still reloads the list. Task 2.
4. Pause/delete keep their dialogs, Pro lines and deletion-status states on the new page. Task 3.
5. Existing tests for these surfaces still pass (`account-load-error`, `x4a-review-fixes`, `dealbreakers-reload`, `tab-from-url`). All tasks.

---
### Task 1: Sign-out confirm
**Files:** create `src/components/shared/sign-out-dialog.tsx` (`SignOutDialog({ open, onOpenChange })` calling `signOutAndUnlinkPush("/login")` on confirm, button busy state); modify account page and dashboard sidebar; test `src/__tests__/components/sign-out-confirm.test.tsx`.
- [ ] Tests: switch on → clicking «تسجيل الخروج» (account page and sidebar) opens the dialog with the spec's title/body; «إلغاء» closes with no call; confirm calls `signOutAndUnlinkPush("/login")` once; switch off → immediate call as today.
- [ ] Implement → pass → commit.

### Task 2: «شروطي الأساسية» window
**Files:** modify `src/components/suggestions/mutual-suggestions-view.tsx` (and `dealbreakers-card.tsx` only if it needs a `variant`/`inDialog` prop), account page row; test `src/__tests__/suggestions/dealbreakers-window.test.tsx`.
- [ ] Tests: switch on → no card on the «جديدة» page; the «شروطي الأساسية» trigger opens a Dialog containing the card; `#dealbreakers` in the URL opens it on load; saving calls the same reload (`onDealbreakersSaved`); switch off → card on the page and `#dealbreakers` anchor as today.
- [ ] Implement → pass → commit.

### Task 3: «إعدادات الحساب» page
**Files:** create `src/components/profile/account-settings-section.tsx` (moved verbatim from the profile page's `#account-settings` block with its state/handlers), `src/app/(ar)/dashboard/account/settings/page.tsx` (PageHeader «إعدادات الحساب» + the section); modify profile page (render the section only when the switch is off) and the account page row; test `src/__tests__/components/account-settings-page.test.tsx`.
- [ ] Tests: the new page shows pause and delete with their dialogs and Pro lines and the deletion-pending state; switch on → «حسابي» row links to `/dashboard/account/settings` and the profile page has no `#account-settings`; switch off → row → `/dashboard/profile#account-settings` and the section is there.
- [ ] Implement → full checks → commit. Add one line to CLAUDE.md's `dashboard_redesign` bullet listing these three.
