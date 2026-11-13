# Full sign-up setup (website): every profile field, in 7 steps

Date: 2026-11-14. Owner decisions, given through the top session and confirmed with the owner in this one. Builds on `2026-11-13-auth-and-profile-edit-redesign-design.md`.

## Why

The redesigned setup (`ShortSetup`, live in production with `auth_profile_redesign` on) asks only the essentials in 3 steps and leaves the rest for «تعديل الملف». The owner wants every profile field asked during sign-up, in steps with a progress bar, so new profiles start full.

## Decisions

**Owner's choices:**
- **What is asked:** every profile field. The progress bar reads «الخطوة X من 7».
- **What must be answered to go on:**
  - today's required fields;
  - every multiple-choice question;
  - children count, when shown.
- **What can stay empty:**
  - free texts and the short texts other than nationality;
  - height, weight and siblings;
  - every partner preference except the age range.
- **Step order:** the 7 steps below.
- **Platform and rollout:**
  - The website gets this first, with no new switch: it replaces the 3 steps inside `auth_profile_redesign`.
  - With that switch off, the legacy setup is untouched.
  - The app follows in its next version.

**Steps:**

| # | Name | Fields (shown only where they apply, same rules as the edit list) |
|---|---|---|
| 1 | عنك | birth date, nationality, city (+ area), marital status, children count (not single), height, weight, skin colour |
| 2 | الدين ونمط الحياة | «الديانة» (switch `religion_enabled`), religiosity, «المذهب» (LB, not a Christian), hijab (women) / beard (men), not for a Christian; smoking, cooking, lifestyle, driving licence, relocation |
| 3 | التعليم والعمل | education, field of study, job (+ «أخرى» text), income |
| 4 | العائلة | tribe, family origin, siblings, housing, monthly expenses, health |
| 5 | عنّي | about me, partner expectations, hobbies, interests, family values |
| 6 | من تبحث عنه | every partner preference in the edit list's «تفضيلات الشريك» section, `prefReligion` and the age range first |
| 7 | شروط أساسية | each filled-in preference that has a «شرط أساسي» key, with its toggle, and the legacy explanation «لن نقترح عليك من لا يحققه». It shows only where the legacy shows dealbreakers (`flags.mutualSuggestions`), otherwise there are 6 steps. |

**Required rule.** A field is required in setup when either holds:
- it is `required` in the field table;
- it is a member's own field (not `pref*`) with a `choice`, `yesNo` or `picker` control and it is shown.

So skin colour, smoking, cooking, lifestyle, licence, relocation, job, income, housing and expenses are required. Children count stays required when shown, and so does the age range. Errors show under the field.

## Unchanged

- **The server.** The same `PATCH /api/profile/draft` autosave and the same final `PUT /api/profile`. The server never requires the new fields, so old apps and the legacy setup keep working.
- **The rest of setup:**
  - the switch-off path (`legacy-setup-page.tsx`);
  - the «ملفك جاهز» end screen;
  - the guardian step in the legacy cycle only.

## How it's built

`ShortSetup` stops hand-listing fields. It reads them from `EDIT_SECTIONS` (`src/lib/profile-edit-fields.ts`) through a setup step map, and renders each field with the edit list's controls. Labels, options, `showIf`, hints and the Christian/Lebanon rules therefore stay in one place.

Validation:
- runs per step;
- the dealbreaker save uses `dealbreakerKeysToSave`;
- the payload goes through `sendableChanges`, as edit does.

**Where a member resumes:** at the first step with an empty required field. A member who already finished setup is unaffected (`isComplete`).

## Approaches

1. **(Chosen) Drive setup from the edit field table.** One source for fields and rules, and setup and edit can never drift apart.
2. **Hand-write the four new steps, as the legacy setup does.** Faster to type, but it duplicates about 30 fields and their rules, which is the drift the redesign removed.
3. **Re-enable the legacy 4-step setup.** It has the old look and the old order, and doesn't match the owner's step list.

## Left to the builder

- **How to share controls between the editor and setup:** extract a field-control component from `row-editor.tsx`, or similar.
- **Copy:** the exact sub-line under each step title.
- **The step-7 empty state** (no preference filled in): a short line and «التالي».
