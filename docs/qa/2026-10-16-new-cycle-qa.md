# New cycle QA — 2026-10-16

Branch `feature/new-cycle`, local database, all three switches on (`intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`). Browser walkthrough plus a code audit of every dashboard, admin and public page.

## What was tested end to end

| Step | Result |
|---|---|
| Register a brand-new user (phone + code) | ✅ account created with 3 credits |
| Profile setup wizard (5 steps, validation, guardian consent) | ✅ saved at 70% |
| Suggestions appear automatically (simultaneous flow) | ✅ 3 suggestions with "لماذا هذا الاقتراح" |
| First person taps "مهتم" — no hint to the other side | ✅ |
| Second person taps "مهتم" → mutual match | ✅ success banner + link |
| Match card: family / chat requests, credit dialog, consent | ✅ (tested earlier today) |
| Family intro accepted → guardian contact card | ✅ |
| Chat: send, phone-number filter, live updates (polling), read receipts, end chat | ✅ |
| Switches off → old flow, results stay visible | ✅ |
| Admin: switches, introductions page, settings | ✅ |
| Landing / FAQ follow the switches | ✅ |
| Phone layout (landing, chat) | ✅ |

## Fixed in this pass (commit `17a0658`)

- Match card showed a red "visit cancelled" banner next to "family intro accepted".
- Guardian-data notes said "never shown to other users" (wrong once a family intro is accepted).
- Setup / edit wizard stayed scrolled at the bottom when moving to the next step.
- Chat page spun forever on a server error; "end and report" navigated away even when it failed; failed consent was ignored; extend had no double-tap guard; family button showed while requests were off.
- Suggestions: deciding the last card on a page showed the empty state while more existed.
- Notification settings listed legacy kinds (interests, visit updates) in the new cycle.
- Register gender cards and unread badge used forbidden colours (blue / pink / rose).
- Admin: rejecting a selfie asked users to re-upload (no longer possible) and linked to the removed page.
- Admin: visits page didn't explain that new matches no longer create visits.
- Admin: introduction stats counted overdue requests as "waiting".
- FAQ: Google's FAQ data (JSON-LD) was fixed legacy text; three answers were wrong in any mode (payment methods, "subscription", scoring weights).
- About page claimed "no contact at all" while chat exists.

## To do — before going live

1. **Terms and Privacy pages** (`src/app/(ar)/terms`, `src/app/(ar)/privacy`) still describe the old rules: selfie verification, "no direct contact", guardian data admin-only, admins arranging visits, 2 free suggestions, and terms say suggestions go "to females only". Privacy doesn't mention that chat messages are stored. These are legal texts — needs your wording.
2. **Production checks**: test the `pg` adapter against a staging copy of the production DB, back up, deploy with switches off, `pnpm db:push`, then switch on and run `node scripts/new-cycle-migrate.mjs`.
3. **Ably key** (`ABLY_API_KEY`) for instant chat; without it chat polls every 4 seconds.
4. **Not testable locally**: Stripe payments, OneSignal push (the local app id is a placeholder), real SMS, Ably live mode.
5. **Linting is broken in the repo**: `pnpm lint` uses `next lint` (removed in Next 16) and ESLint's config needs the missing `@eslint/eslintrc` package.

## To do — UX improvements (recommended next)

Items 6–10 done on branch `feature/new-cycle-ux` (plan: `docs/superpowers/plans/2026-10-16-new-cycle-ux-todos.md`).

6. **Onboarding is long**: the setup wizard requires every field, including tribe, family expenses and health conditions, before saving. We agreed on a short start (basics + dealbreakers, rest optional).
7. **Dealbreakers** ("شرط أساسي") can only be set from the suggestions page panel, not in the setup wizard or profile edit.
8. **Feminine forms**: job and lifestyle options are masculine for women (e.g. "صيدلي", "ملتزم", "لا أدخن"); partner-preference options are written in first person ("لا أدخن").
9. **Deep links to a match** (`/dashboard/matches?match=…`) only work if that match is on the current page; the "pending requests" card doesn't link to a specific match.
10. Small copy/UI: "(8 حقل)" should be "(8 حقول)"; the always-on "إشعارات النظام" switch looks switched off; setup labels aren't linked to their inputs (screen readers).

## To do — admin panel

11. Suggestions page: add a flow column (shared vs legacy), call both people "Person A / B" for shared suggestions, show "Expired" when past `expiresAt`, and explain the 3-per-week cap and dealbreakers next to "Generate".
12. Dashboard tiles "Pending Verifications / Identity Reviews" and the "Identity" item in the quality score should be marked legacy (new users can't earn it).

## Later phases (agreed earlier)

- Phase 5: instant profile edits (no admin review), automatic hiding after repeated reports.
- Phase 6: follow-up ~7 days after a family introduction.
- Guardian read-only access to a chat.
