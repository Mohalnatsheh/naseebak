# New cycle UX to-dos 6–10 Implementation Plan

> **Historical document.** It records a decision or plan at the time it was written. The live behaviour has changed since. The current rules (as of 2026-10-17) are in `CLAUDE.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close QA items 6–10 of `docs/qa/2026-10-16-new-cycle-qa.md`: short onboarding, dealbreakers in the wizards, gendered option labels, match deep links, small copy/UI fixes.

**Architecture:** Option lists move into one module with value/label pairs per gender (stored values never change, so matching and existing rows keep working). Dealbreaker summaries move out of `DealbreakersCard` into a lib used by the card and by an inline "شرط أساسي" toggle in both wizards. `/api/matches` learns a `focus=<matchId>` param that returns the page holding that match.

**Tech Stack:** Next.js 16, React 19, Zod v4, Prisma 7, Vitest.

**Spec:** `docs/qa/2026-10-16-new-cycle-qa.md` (items 6–10) and the agreed short start in `docs/superpowers/specs/2026-10-16-new-cycle-design.md`.

## Global Constraints

- No schema changes (live site, ~200 users). Stored option values stay as they are today (`"لا أدخن"`, `"ملتزم"`, `"مهندس"` …); only labels change.
- Brand tokens only (`primary`, `accent`, `muted`, `destructive`, `amber-`, `emerald-`); RTL (`ms-/me-`, `text-start`).
- Dealbreaker UI shows only when `counts.flags.mutualSuggestions` is on (legacy flow unchanged). Dealbreakers save directly via `PUT /api/profile/dealbreakers`, never through the admin review request.
- `SUGGESTIONS_MIN_COMPLETENESS` (50) stays; the minimum wizard + photo + quiz must reach it.

## Review Focus

- Existing profile saved with an old free-text job (not in the list) still loads as "أخرى" + custom text.
- Optional fields left empty must not be sent as `""` and must not overwrite saved values with empty strings.
- A dealbreaker ticked for a preference left empty is dropped on save (it could never be a filter).
- `?match=<id>` for a match that isn't mine → page 1, no error.
- A female user editing a profile whose stored religiosity is `"ملتزم"` sees `"ملتزمة"` selected (value match, not label match).

---

### Task 1: Short onboarding (item 6)

**Files:** Modify `src/lib/validations/profile.ts`, `src/app/(ar)/dashboard/profile/setup/page.tsx`, `src/app/(ar)/dashboard/profile/edit/page.tsx`, `src/__tests__/validations/profile.test.ts`

- Required in `profileSchema` and both wizards: `dateOfBirth`, `nationality`, `city`, `education`, `maritalStatus` (+`childrenCount` when not single), `religiosity`, `prefAgeMin`/`prefAgeMax`; guardian step unchanged. Everything else `.optional()` (keeping length/range limits). Optional labels get "(اختياري)".
- Setup submit sends `buildServerPayload()` (drops empties) instead of `...form`.
- Tests: schema accepts the minimum payload; still rejects missing `city`, out-of-range `height`, `aboutMe` > 500.

### Task 2: Gendered option labels (item 8)

**Files:** Create `src/lib/profile-options.ts`, `src/__tests__/lib/profile-options.test.ts`; modify both wizards, `src/components/suggestions/dealbreakers-card.tsx`.

- `type Opt = { value: string; label: string }`; `ownOptions(field, gender)` for `job | religiosity | lifestyle | smokingStatus | cookingAbility` (female labels feminine); `partnerOptions(field, myGender)` for `religiosity | smokingStatus` written about the partner (third person, partner's gender); `optionLabel(field, value, gender)` for display.
- Tests: female job `"صيدلي"` → label `"صيدلانية"`, value unchanged; partner smoking for a male user: `"لا أدخن"` → `"غير مدخنة"`; unknown value returns itself.

### Task 3: Dealbreakers in the wizards (item 7)

**Files:** Create `src/lib/matching/dealbreaker-summary.ts`, `src/components/profile/dealbreaker-toggle.tsx`, `src/__tests__/matching/dealbreaker-summary.test.ts`; modify `dealbreakers-card.tsx`, both wizards.

- `dealbreakerSummary(key, prefs, myGender)` (moved from the card) and `activeDealbreakers(keys, prefs)` → keys whose preference is filled.
- `DealbreakerToggle({ checked, onChange, label })`: small checkbox chip "شرط أساسي" next to each preference in step 3.
- On submit (setup after profile PUT; edit independently of the review request) `PUT /api/profile/dealbreakers` with `activeDealbreakers(...)`. Edit page: dealbreaker-only changes are a valid submit.
- Tests: empty preference dropped; `children` only when `"no_children"`.

### Task 4: Match deep links (item 9)

**Files:** Create `src/lib/matches/focus.ts`, `src/__tests__/lib/match-focus.test.ts`; modify `src/app/api/matches/route.ts`, `src/app/(ar)/dashboard/matches/page.tsx`, `src/app/api/me/counts/route.ts`, `src/contexts/dashboard-context.tsx`, `src/components/intro/pending-intros-card.tsx`.

- `pageForMatch(userId, matchId, pageSize): Promise<number | null>` — counts my matches ordered before it (`createdAt desc, id desc`); route uses it when `focus` is given and returns that `page`. List order gets the `id` tiebreak.
- Matches page: first fetch passes `focus` from `?match=`; adopts the returned page.
- Counts: `pendingIntroMatchId` (soonest-expiring pending request); card links to `/dashboard/matches?match=<id>`.
- Tests: match on page 2 → 2; not mine → null.

### Task 5: Small fixes (item 10)

- `حقل` → `arabicCount` style plural ("حقل واحد", "حقلان", "N حقول", 11+ "حقلاً").
- Notifications sheet: system row without `opacity-50`; switch `disabled:opacity-100` so it reads as on.
- Setup wizard: every `Label` gets `htmlFor`, every input/select an `id`.

### Task 6: Verify and commit

- `npx vitest run`, `npx tsc --noEmit` clean; browser: new user setup minimum path at desktop + 375px, female labels, dealbreaker toggle saved, deep link to page-2 match, pending card link.
