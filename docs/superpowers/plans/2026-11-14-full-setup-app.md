# Full Sign-up Setup (App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app's sign-up setup asks every profile field in the website's 7 steps (6 without «شروط أساسية»), so app profiles start as full as website ones.

**Architecture:** A pure Dart step map (`setup_steps.dart`) mirrors the website's `src/lib/setup-steps.ts`: steps, field keys, the required rule, missing fields per step and the resume step. The edit screen's per-field controls move into one shared widget used by both «تعديل ملفي» and setup; the preferences form is split so setup steps 6 and 7 reuse its fields and «شرط أساسي» toggles. `setup_screen.dart` renders steps from the map. No server change.

**Tech Stack:** Flutter (Riverpod 2.6, go_router), existing `ProfileRepository`, `ApiClient`.

**Spec:** `docs/superpowers/specs/2026-11-14-full-setup-design.md` (owner-approved; «The app follows in its next version»). Website reference: `src/lib/setup-steps.ts`, `src/components/profile/setup/short-setup.tsx`.

## Global Constraints

- Steps, titles and order exactly as the spec table: 1 «عنك», 2 «الدين ونمط الحياة», 3 «التعليم والعمل», 4 «العائلة», 5 «عنّي», 6 «من تبحث عنه» (gendered: «من تبحثين عنه» for a woman, as today), 7 «شروط أساسية». Progress reads «الخطوة X من 7» (or «من 6»).
- Step 7 shows only where `counts.flags.mutualSuggestions` is true; otherwise 6 steps.
- Field keys per step are the website's `STEPS` in `src/lib/setup-steps.ts`, verbatim; step 6 = every partner preference the app's «تفضيلات الشريك» screen edits, `prefReligion` and the age range first.
- Required rule: required fields (dob, nationality, city, education, maritalStatus, religion, religiosity, sect, childrenCount) plus every own (non-`pref*`) choice / yes-no / picker field that is shown: skinColor, smokingStatus, cookingAbility, lifestyle, drivingLicense, willingToRelocate, job, incomeRange, housingType, monthlyExpenses, hijab (women) / beard (men). Optional: free texts, short texts other than nationality, height, weight, numberOfSiblings, every `pref*` except the age range (min and max both required). `false` and 0 are answers; a job left on «أخرى» with no text is not.
- Shown-ness rules (same as edit): «الديانة» only when the server sends the religion list; «المذهب» only with a sect list and not for a Christian; hijab women / beard men, never for a Christian; childrenCount only when maritalStatus is not single (single sends `childrenCount: 0`); area only when the city has areas.
- Errors show under the field («… مطلوب» wording as today's setup), per step, on «التالي».
- Server unchanged: draft autosave `PATCH /api/profile/draft` after each finished step; final `PUT /api/profile` with every answer plus `dealbreakers` keys (as the website's final save). Payload goes through `withoutMuslimOnly` and never carries religion keys when no religion list was sent (old server).
- Resume at the first step with a missing required field (`firstIncompleteStep`); a member with `isComplete` never sees setup (unchanged).
- Unchanged: the legacy guardian step where today's setup shows it, the end of setup, sign-up itself. «تعديل ملفي» and «تفضيلات الشريك» behave exactly as before (their existing tests stay green unchanged, except moved finders noted in a task).
- App rules (`naseebak_app/CLAUDE.md`): AppColors / AppText tokens only, gendered copy via `forViewer`, ≥44 px targets, nothing under 12 px, `mounted` after every await, no opacity layers, number fields close the keypad on a tap outside (`onTapOutside`).
- Needs a new app version; works against production (78ee948e) and the older 92dc3e4.

## Review Focus

1. Old server / no religion or sect lists: no «الديانة» / «المذهب» questions, no such keys sent, every step still completes. (Task 4 test)
2. A member who started on the website (draft saved) opens the app: lands on the first step with a missing required field, earlier answers shown. (Task 4 test)
3. Picking «مسيحي/مسيحية» on step 2 hides hijab/beard/sect and drops them from required and from the payload; switching back makes them required again. (Task 1 + Task 4 tests)
4. iPhone SE with the keyboard open on the long steps (5 and 6): content scrolls, «التالي» reachable, keypad closes on a tap outside. (Task 4 widget test at 375×667)
5. Job «أخرى» with an empty text, and a single member (no children question, `childrenCount: 0` sent). (Task 1 test)

---

### Task 1: Pure step map `setup_steps.dart`

**Files:**
- Create: `naseebak_app/lib/features/onboarding/setup_steps.dart`
- Test: `naseebak_app/test/setup_steps_test.dart`

**Interfaces:**
- Produces:
  - `enum SetupStepId { you, faith, work, family, about, looking, musts }`
  - `class SetupStep { final SetupStepId id; final String title; final List<String> fieldKeys; }` (title for a man; `setupStepTitle(SetupStep, {required bool female})` returns «من تبحثين عنه» for her on `looking`)
  - `List<SetupStep> setupSteps({required bool dealbreakers})`
  - `class SetupCtx { final bool female; final bool religionAsked; final bool sectAsked; final Map<String, List<String>> areas; }`
  - `bool setupShown(String key, Map<String, Object?> values, SetupCtx ctx)`
  - `bool setupRequired(String key, Map<String, Object?> values, SetupCtx ctx)`
  - `List<String> missingOnStep(SetupStep step, Map<String, Object?> values, SetupCtx ctx)` (keys in step order; `prefAgeMax` listed after `prefAgeMin` when missing)
  - `int firstIncompleteStep(List<SetupStep> steps, Map<String, Object?> values, SetupCtx ctx)` (last index when none missing)
  - `const setupPrefKeys` = the step-6 keys in order (read the keys `PreferencesForm` edits; `prefReligion`, `prefAgeMin`, `prefAgeMax` first)

- [ ] **Step 1: Write the failing tests** in `test/setup_steps_test.dart`:
  - `setupSteps(dealbreakers: true)` has 7 ids in spec order; `dealbreakers: false` has 6 and no `musts`; step `you` keys == `['dateOfBirth','nationality','city','maritalStatus','childrenCount','height','weight','skinColor']`, `faith` == `['religion','religiosity','sect','hijab','beard','smokingStatus','cookingAbility','lifestyle','drivingLicense','willingToRelocate']`, `work` == `['education','fieldOfStudy','job','incomeRange']`, `family` == `['tribe','familyOriginArea','numberOfSiblings','housingType','monthlyExpenses','healthConditions']`, `about` == `['aboutMe','partnerExpectations','hobbies','interests','familyValues']`.
  - Empty values, woman, religion+sect asked: `missingOnStep(faith)` == `['religion','religiosity','sect','hijab','smokingStatus','cookingAbility','lifestyle','drivingLicense','willingToRelocate']`; for a man `beard` replaces `hijab`.
  - With `religion: 'مسيحي'`: `faith` missing has no `sect`, `hijab`, `beard`.
  - Without religion/sect lists: no `religion`, no `sect` in missing.
  - `drivingLicense: false` counts as answered; `childrenCount: 0` answered.
  - `maritalStatus: ProfileOptions.single`: `childrenCount` not shown, not missing; another status with no count: `childrenCount` missing.
  - `job: 'أخرى'` is missing; `job: 'مهندس'` is not.
  - `height`, `weight`, `numberOfSiblings`, `aboutMe`, `tribe` never missing.
  - `looking` with nothing: missing == `['prefAgeMin','prefAgeMax']`; with only min: `['prefAgeMax']`.
  - `firstIncompleteStep` returns 0 for empty values; 2 when steps 0–1 are complete and `education` empty; last index when all complete.

- [ ] **Step 2: Run** `cd naseebak_app && flutter test test/setup_steps_test.dart` — Expected: FAIL (file missing).
- [ ] **Step 3: Implement** `setup_steps.dart` (db-free, no widgets). Single = `ProfileOptions.single`; «مسيحي» detection via `isChristian` from `lib/shared/religion.dart`.
- [ ] **Step 4: Run** the test — Expected: PASS. `flutter analyze` clean.
- [ ] **Step 5: Commit** `git add naseebak_app/lib/features/onboarding/setup_steps.dart naseebak_app/test/setup_steps_test.dart && git commit -m "App setup: pure 7-step map and required rule (website setup-steps.ts)"`

### Task 2: Shared profile field control

**Files:**
- Create: `naseebak_app/lib/features/profile/profile_field_control.dart`
- Modify: `naseebak_app/lib/features/profile/profile_edit_screen.dart` (its `_choice/_yesNo/_hijab/_field`, job chips and date button become `ProfileFieldControl`)
- Test: `naseebak_app/test/profile_field_control_test.dart`; existing edit tests (`test/*profile_edit*`, `account_parity_test.dart`, `religion_test.dart`) stay green

**Interfaces:**
- Produces: `class ProfileFieldControl extends StatelessWidget` with
  `ProfileFieldControl({required String fieldKey, required Map<String, Object?> values, required void Function(String key, Object? value) onChanged, required ProfileLists lists, required bool female, TextEditingController? controller, String? error, bool clearable = true})`
  — renders the field's label (`profileFieldLabels`, same titles as edit today), its control (choice chips with self labels, yes/no, «الحجاب» three answers writing `hijab`+`niqab`, job chips + «أخرى» text, date button with the same picker range, number/short/long text with today's limits and `onTapOutside` unfocus) and `error` under it in `AppColors.danger`. The `city` control also renders the «المنطقة» chips under it when the chosen city has areas (optional, key `area`, as the website's companion field); a city change keeps the area per `areaAfterCityChange`. Widget keys unchanged from today (`'$key-$option'`, `'field-$key'`, `'hijab-…'`, `'field-jobCustom'`, `'field-dateOfBirth'`). `clearable: false` = tapping the chosen chip doesn't clear it (edit's `requiredChoices`).
- Consumes: `profileFieldLabels`, `OptionLabels.self`, `jobOptionsFor`, `areaAfterCityChange` (move helpers into the new file and re-export from `profile_edit_screen.dart` if other files import them).

- [ ] **Step 1: Write failing tests**: choice tap calls `onChanged('skinColor', 'قمحي')`; hijab «منتقبة» calls `onChanged` for `hijab: true` and `niqab: true`; job «أخرى» shows `field-jobCustom`; `error: 'مطلوب'` text shows; number field has `TextInputType.number`.
- [ ] **Step 2: Run** `flutter test test/profile_field_control_test.dart` — FAIL.
- [ ] **Step 3: Implement** the widget, then switch `profile_edit_screen.dart` to it with identical layout and section grouping.
- [ ] **Step 4: Run** the new test and all edit-related tests (`flutter test`) — PASS; analyze clean.
- [ ] **Step 5: Commit** `git commit -m "App: one ProfileFieldControl for «تعديل ملفي» and setup"` (stage the three files by path).

### Task 3: Reusable partner-preference fields and «شرط أساسي» toggles

**Files:**
- Modify: `naseebak_app/lib/features/profile/preferences_screen.dart`
- Test: `naseebak_app/test/partner_prefs_fields_test.dart`; existing preferences tests stay green

**Interfaces:**
- Produces:
  - `class PartnerPrefsFields extends StatelessWidget` — `PartnerPrefsFields({required PartnerPrefs value, required ValueChanged<PartnerPrefs> onChanged, required List<String> cities, required bool female, required bool christian, List<String> sectOptions = const [], List<String> religionOptions = const [], String? prefReligion, ValueChanged<String?>? onPrefReligion, String? ageError})` — the preference questions only (age range first, then «الديانة لدى الشريك», then the rest in today's order), no toggles, no save button.
  - `class DealbreakerToggles extends StatelessWidget` — `DealbreakerToggles({required PartnerPrefs value, required Set<String> selected, required ValueChanged<Set<String>> onChanged, required bool female, required bool christian})` — one row per filled preference that has a «شرط أساسي» key (`PartnerPrefs.dealbreakerFilled`), its toggle, the line «لن نقترح عليك من لا يحققه», and when none is filled the line «لم تحدّد/تحدّدي تفضيلات بعد، يمكنك المتابعة.» (gendered).
  - `PreferencesForm` keeps its public API and behaviour, built from these two.
- [ ] **Step 1: Write failing tests**: `PartnerPrefsFields` changing «المدينة» calls `onChanged` with the new prefs; age fields show `ageError`; `DealbreakerToggles` with no filled prefs shows the empty line; with `prefCity` filled shows the city toggle and toggling calls `onChanged({'city'})`; a Christian sees no hijab/beard/sect toggle.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** by extraction. **Step 4: Run** all tests — PASS; analyze clean.
- [ ] **Step 5: Commit** `git commit -m "App preferences: PartnerPrefsFields and DealbreakerToggles for reuse in setup"`

### Task 4: Setup screen in 7 steps

**Files:**
- Modify: `naseebak_app/lib/features/onboarding/setup_screen.dart`
- Test: `naseebak_app/test/full_setup_test.dart`; update existing setup tests that assumed 3 steps (keep their intent: religion, draft resume, errors, `/api/profile` failure handling)

**Interfaces:**
- Consumes: Task 1 (`setupSteps`, `setupStepTitle`, `SetupCtx`, `missingOnStep`, `firstIncompleteStep`), Task 2 (`ProfileFieldControl`), Task 3 (`PartnerPrefsFields`, `DealbreakerToggles`), `counts.flags.mutualSuggestions` for `dealbreakers`.

- [ ] **Step 1: Write failing widget tests** (FakeAdapter, 375×667 surface for the SE test):
  - Step count: «الخطوة 1 من 7» with `mutualSuggestions: true`, «من 6» without.
  - «التالي» on empty step 1 shows «… مطلوب» under dob, nationality, city, maritalStatus, skinColor and stays on step 1; height empty is fine.
  - Completing step 1 sends one `PATCH /api/profile/draft` containing exactly the step's filled keys and moves to «الخطوة 2».
  - Step 2 as a woman: picking «مسيحية» removes the hijab question; the final `PUT /api/profile` has no `hijab`, `niqab`, `beard`, `sect`.
  - Old server (no religion list): no «الديانة» on step 2 and no `religion`/`prefReligion` in any request.
  - Draft resume: `/api/profile` returns steps 1–2 answered → screen opens on «الخطوة 3».
  - Step 7: with `prefCity` set on step 6, the city toggle shows; ticking it puts `'city'` in the final PUT's `dealbreakers`.
  - Final «حفظ والبدء» sends one `PUT /api/profile` with all answers and lands where today's setup lands.
  - SE 375×667 with the keyboard inset on step 5: «التالي» can be scrolled into view and tapped.
- [ ] **Step 2: Run** `flutter test test/full_setup_test.dart` — FAIL.
- [ ] **Step 3: Implement**: steps from `setupSteps(dealbreakers: mutualSuggestions)`; a step renders `ProfileFieldControl` for each `setupShown` key (step 6 `PartnerPrefsFields`, step 7 `DealbreakerToggles`); `missingOnStep` drives errors; draft PATCH per finished step (fire-and-forget, as today); resume via `firstIncompleteStep` after the draft loads; keep today's load-error view, back behaviour, analytics `setupStep`, guardian step where it exists today, and the end route. Final payload: all shown answers + `dealbreakers` (`PartnerPrefs.activeDealbreakers` rules), `childrenCount: 0` for single, through `withoutMuslimOnly`; no religion keys without the list.
- [ ] **Step 4: Run** `flutter test` (all) — PASS; `flutter analyze` clean.
- [ ] **Step 5: Commit** `git commit -m "App setup: every profile field in the website's 7 steps"`

### Task 5: Docs

**Files:** `naseebak_app/CLAUDE.md`, root `CLAUDE.md` («What needs an app version» line).
- [ ] **Step 1:** One bullet in `naseebak_app/CLAUDE.md`: full setup in 7 steps (6 without «شروط أساسية»), driven by `setup_steps.dart` mirroring `src/lib/setup-steps.ts`, shared `ProfileFieldControl`, next app version, not released. Root CLAUDE.md: add «Full setup (7 steps)» to the app-version list.
- [ ] **Step 2: Commit** `git commit -m "Docs: app full setup"` (stage the two files by path).
