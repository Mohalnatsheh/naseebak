# Full Sign-up Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The website setup asks every profile field across 7 named steps (6 when dealbreakers are off). Every multiple-choice question is required.

**Architecture:** A pure, db-free module maps the edit field table (`EDIT_SECTIONS`) onto the setup steps and decides which fields are required. `ShortSetup` renders the steps from that map using controls shared with the edit list's row editor.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 tokens, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-14-full-setup-design.md`. The base redesign spec is `docs/superpowers/specs/2026-11-13-auth-and-profile-edit-redesign-design.md`.

## Global Constraints

- **Server and switches:** no server, API or schema change. No new switch. With `auth_profile_redesign` off, `legacy-setup-page.tsx` stays untouched.
- **UI rules:**
  - Tokens only. The guard tests must pass.
  - Text ≥ 12px. Inputs ≥ 16px on phones. Tap targets ≥ 44px.
  - Use `BirthDateSelect` and `NumberInput`.
  - On a failed load, show `LoadError` and save nothing.
- **Arabic copy:**
  - Gendered copy via `forViewer`.
  - Option labels via the field table (`selfLabel`).
  - Exact step names: «عنك», «الدين ونمط الحياة», «التعليم والعمل», «العائلة», «عنّي», «من تبحث عنه», «شروط أساسية».
  - Progress: «الخطوة X من N».
- **Profile rules:** «الديانة» appears only with `counts.religionEnabled === true`. Christians never see Muslim-only fields. «المذهب» uses `sectAsked`. These rules come from the field table's `showIf`.
- **Saving:**
  - The save payload goes through `sendableChanges`.
  - Dealbreakers go through `dealbreakerKeysToSave`, saved with `PUT /api/profile/dealbreakers {keys}` after the profile `PUT`, as the legacy setup does.
  - Choosing single sets `childrenCount` to 0, as today.
- **Code hygiene:**
  - No `eslint-disable`.
  - No regex lookbehind.
  - Client code never imports runtime values from modules that import `@/lib/db`.
  - Don't edit `legacy-*.tsx`, dashboard home, suggestions, chat, or the dashboard layout/sidebar.

## Review Focus

1. **A Christian woman in Lebanon with religion on.** Step 2 hides hijab and «المذهب». Her required fields there are religiosity, smoking, cooking, lifestyle, licence and relocation. She can finish. (Task 2 test)
2. **A member resuming mid-setup from the old 3-step version** (basics filled, new choices empty). She opens on the first step that has an empty required field. (Task 2 test)
3. **Job «أخرى» with empty text.** The setup refuses it with an error under the field. (Task 2 test)
4. **Dealbreakers off** (`flags.mutualSuggestions` false). There are 6 steps. The progress bar reads «من 6». (Task 2 test)
5. **A failed draft autosave.** It never blocks «التالي». The final `PUT` error shows in the banner, and nothing is marked complete. (Task 2 test)

---

### Task 1: Setup step map and required rule (pure)

**Files:**
- Create: `src/lib/setup-steps.ts`
- Test: `src/__tests__/profile/setup-steps.test.ts`

**Interfaces:**
- Consumes `EDIT_SECTIONS`, `editField` and the `EditCtx` / `EditField` types from `src/lib/profile-edit-fields.ts`.
- Produces:

```ts
export type SetupStepId = "you" | "faith" | "work" | "family" | "about" | "looking" | "musts";
export interface SetupStep { id: SetupStepId; title: string; fieldKeys: string[] }
export function setupSteps(opts: { dealbreakers: boolean }): SetupStep[];            // 7, or 6 without "musts"
export function setupRequired(field: EditField, ctx: EditCtx): boolean;               // spec's required rule, incl. shown-ness
export function missingOnStep(step: SetupStep, values: Record<string, unknown>, ctx: EditCtx): string[]; // keys
export function firstIncompleteStep(steps: SetupStep[], values: Record<string, unknown>, ctx: EditCtx): number; // index, else last
```

`fieldKeys` per step follow the spec table exactly:
- "you": `dateOfBirth, nationality, city, maritalStatus, childrenCount, height, weight, skinColor`
- "faith": `religion, religiosity, sect, hijab, beard, smokingStatus, cookingAbility, lifestyle, drivingLicense, willingToRelocate`
- "work": `education, fieldOfStudy, job, incomeRange`
- "family": `tribe, familyOriginArea, numberOfSiblings, housingType, monthlyExpenses, healthConditions`
- "about": `aboutMe, partnerExpectations, hobbies, interests, familyValues`
- "looking": every `prefs` section key, in the field table's order
- "musts": none. The UI lists the filled prefs that have a `dealbreaker`.

**Rules:**
- A hidden field (`showIf` false) is never required.
- `required: true` fields are required.
- Own `choice` / `yesNo` / `picker` fields are required.
- `pref*` fields are optional, except `prefAgeMin` and `prefAgeMax`.
- `false` and `0` count as answers.

- [ ] **Step 1: Write the failing tests.**
  - `setupSteps({dealbreakers:true})` has 7 ids in order. `setupSteps({dealbreakers:false})` has 6, without "musts".
  - Every key of `EDIT_SECTIONS` appears in exactly one step.
  - `setupRequired`:
    - skinColor and drivingLicense: true.
    - aboutMe, height and prefCity: false.
    - prefAgeMin: true.
    - hijab for a Christian woman: false (hidden).
    - childrenCount: required when not single, not shown when single.
  - `missingOnStep`:
    - "faith" with drivingLicense `false` doesn't count it missing.
    - Job `"أخرى"` handling follows the field table's job rule; check `editField("job")`.
  - `firstIncompleteStep` with step-1 basics filled and smokingStatus empty → index 1.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/profile/setup-steps.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/setup-steps.ts` (db-free).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** with `git commit -m "Setup: 7-step map and required rule from the edit field table"`.

### Task 2: `ShortSetup` renders the 7 steps

**Files:**
- Modify: `src/components/profile/setup/short-setup.tsx`.
- Modify: `src/components/profile/edit/row-editor.tsx`. Extract a reusable `FieldControl({ field, ctx, value, onChange, error })` (plus companions such as area, niqab and job «أخرى») into `src/components/profile/edit/field-control.tsx`, and use it in both the row editor and setup.
- Test: `src/__tests__/components/short-setup.test.tsx`. Update and extend it; keep `src/__tests__/components/edit-list.test.tsx` green.

**Interfaces:**
- Consumes `setupSteps`, `setupRequired`, `missingOnStep`, `firstIncompleteStep` (Task 1), `sendableChanges` and `dealbreakerKeysToSave` (`profile-edit-state.ts`), and the `DealbreakerToggle`.
- Produces `<ShortSetup guardianStep={boolean} />`, with the props unchanged so the page wrapper stays as is.

**Behaviour:**
- **Progress bar.**
  - The progress bar has N segments and the line «الخطوة X من N».
  - Show the current step's name. Don't list all seven names on phones.
- **Steps 1–6:** each renders its step's shown fields with `FieldControl`.
- **Step 7 «شروط أساسية»:**
  - Lists each filled preference that has a `dealbreaker`, with a `DealbreakerToggle`.
  - Shows the line «لن نقترح عليك من لا يحققه.», gendered as in the edit list.
  - If no preference is filled in, it shows «لم تختر تفضيلات بعد، يمكنك إضافتها لاحقاً من «تعديل ملفي».», gendered.
- **«التالي» and «حفظ والبدء»:**
  - «التالي» validates `missingOnStep` and shows «{label} مطلوب/مطلوبة» under each field (`fem`). For a number out of range, it shows the field's range error.
  - «حفظ والبدء» on the last step does the final `PUT /api/profile` with `sendableChanges` of all values, then `PUT /api/profile/dealbreakers` with `dealbreakerKeysToSave` when the step exists, then «ملفك جاهز».
- **Unchanged from today:**
  - the start step, now `firstIncompleteStep`;
  - the draft autosave;
  - the single → children rule;
  - the legacy guardian step (last, only when `guardianStep`);
  - the fixed button row on phones.

- [ ] **Step 1: Write the failing tests.**
  - Step names and the «من 7» text appear, and «من 6» appears when `flags.mutualSuggestions` is false.
  - «التالي» on step 2 with smokingStatus empty shows the error under it and stays.
  - A Christian woman in Lebanon with religion on sees no hijab and no «المذهب», and can pass step 2.
  - The resume case opens step 2.
  - Job «أخرى» with empty text is refused.
  - The final `PUT` body contains fields from all steps and no Muslim-only keys for a Christian. The dealbreakers `PUT` carries the ticked keys.
  - A failed final `PUT` shows the error and not «ملفك جاهز».
  - The switch-off wrapper test still renders the legacy page.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/short-setup.test.tsx`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement** `FieldControl` (moved, with no behaviour change to the editor), then the setup.
- [ ] **Step 4: Run** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: all green, lint 0.
- [ ] **Step 5: Commit** with `git commit -m "Setup asks every profile field in 7 steps (website)"`.

### Task 3: Browser check and merge

- [ ] **Step 1: Run a local production build on port 3030.** Set `auth_profile_redesign` on in the local DB only.
- [ ] **Step 2: Sign up a fresh number at 390 and 1280.**
  - Walk all 7 steps.
  - Expected: errors appear under the right fields, the fixed row isn't hidden, and «ملفك جاهز» shows.
  - Check that the profile in the DB has the fields from every step.
- [ ] **Step 3: Update docs.**
  - `CLAUDE.md`: the `auth_profile_redesign` bullet describes the 7-step setup.
  - `docs/platform-flow.html`: the setup note.
  - Commit.
- [ ] **Step 4: Merge.** Fast-forward local `main` if it is an ancestor of the branch; otherwise merge `main` into the branch first, re-run the checks, then fast-forward. Don't push or deploy.
