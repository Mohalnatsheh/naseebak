# Sign-in, Sign-up and Profile Edit Redesign: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One plain flow on the website and the app.
- Phone, then code, then a short «بياناتك الأساسية» card.
- 3 short setup steps.
- An edit list with one sticky save bar.

**Architecture:**
- **Website, behind the new switch `auth_profile_redesign`.**
  - The four pages (`/login`, `/register`, `/dashboard/profile/setup`, `/dashboard/profile/edit`) become thin server components. Each reads the switch and renders either the old client page, moved unchanged to `legacy-*.tsx`, or a new client component.
  - Pure, db-free modules hold the field table, the edit-row state and the save plan. Both the edit list and the tests use them.
- **App, as the next app version.** Rewrites the same three areas with the same rules.
- **Server API and schema:** unchanged.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 tokens, shadcn/ui `Dialog`/`Sheet`, Vitest + Testing Library (jsdom), Flutter (Riverpod, go_router), `flutter_test`.

**Spec:** `docs/superpowers/specs/2026-11-13-auth-and-profile-edit-redesign-design.md`. Mockup: `docs/design-mockup/auth-edit-redesign-2026-11-13.html`. App screens: `docs/design-mockup/app-mockup/project/{Phone,Otp,OtpWhatsapp,OtpError,Register,Setup,SetupBasics,SetupSocial,SetupSectLB,SetupLooking,MyProfile,ProfileEdit,QuickEditSheet}.dc.html`.

## Global Constraints

- **Switch:** `auth_profile_redesign`, default `"false"`. Off = today's four pages exactly. Settings are cached for 30 s.
- **No schema change and no API change.** Old app versions must keep working.
- **Tokens only:**
  - no raw hex;
  - none of the forbidden palettes (`blue-`, `violet-`, `purple-`, `rose-`, `pink-`, `sky-`, `cyan-`, `indigo-`, `slate-`, `gray-`, `orange-`);
  - text ≥ 12 px (`text-caption` and up);
  - inputs ≥ 16 px on phones;
  - tap targets ≥ 44 px.
  - `src/__tests__/components/design-guards.test.ts` must stay green.
- **Controls:** `BirthDateSelect` for dates, `NumberInput` for numbers, `Dialog` / `DropdownMenu`, never `window.confirm`. `LoadError` on a failed load, and no save after a failed load.
- **Digits and phones:** `toLatinDigits()` on phone and code inputs. Western digits everywhere. Phones `dir="ltr"` inside `<bdi>`.
- **Copy:**
  - Gendered copy via `forViewer()`.
  - Shared lines use «يمكنك …».
  - Option labels via `selfLabel()` (own profile).
  - Arabic-only names: today's rule.
- **«المذهب»:** Lebanon only (`sectApplies(country)`), required in setup.
- **Code channel:**
  - Website: `CountryConfig.otpByWhatsapp` / the `channel` returned by `send-otp`.
  - App: `Country.otpChannel`.
  - Never `country === "SA"`.
- **`send-otp` context:** always `"login"` from the shared phone screen.
- **Client code imports:**
  - Client components never import a runtime value from a module that imports `@/lib/db`.
  - No regex lookbehind in browser code.
  - Never name a top-level const `short`, `long`, `int` and the like.
- **Parallel sessions:** don't touch `src/app/(ar)/dashboard/page.tsx`, `src/components/suggestions/`, `src/components/dashboard/`, `src/components/chat/`, `naseebak_app/lib/features/{home,discovery,chat}/`.
- **Git:** stage by path, never `git add -A`.
- **Exact copy, from the spec:**
  - Phone screen: «ما رقم هاتفك؟», «سنرسل لك رمز دخول من 6 أرقام {عبر واتساب|برسالة نصية}.», «لا يظهر رقمك لأي عضو.», «إرسال الرمز».
  - Code screen: «أدخل الرمز», «أرسلنا رمزاً من 6 أرقام {عبر واتساب|برسالة نصية} إلى», «إعادة الإرسال بعد», «إعادة إرسال الرمز», «تغيير الرقم», «الرمز غير صحيح. تأكد من آخر رسالة وصلتك.».
  - Register card: «بياناتك الأساسية», «خطوة أخيرة لإنشاء حسابك. يظهر اسمك الأول فقط للطرف الآخر.», «لديك رمز دعوة؟», «إنشاء الحساب».
  - Setup: steps «عنك» / «حالتك» / «من تبحث عنه»; «ملفك جاهز», «عرض الاقتراحات», «أكمل ملفك متى شئت · يزيد فرصك».
  - Edit: «تعديل ملفي», «الحقول الفارغة تُحفظ فوراً. تغيير معلومة محفوظة يراجعه فريق نصيبك قبل ظهوره.», «فوراً», «للمراجعة», «قيد المراجعة», «حفظ», «تراجع», «تجاهل التعديلات؟», «سحب الطلب».

## Review Focus

1. **Pending request plus fills.** A member with a pending request fills an empty field and saves. Expected: the fill saves, no 409, and the locked rows stay locked. Task 2 tests it.
2. **Leaving edit with unsaved changes.** Back link, sidebar link, browser back or closing the tab. Expected: «تجاهل التعديلات؟» or the browser's leave prompt; nothing is lost silently. Task 6 tests it.
3. **Partial save failure.** The fill PUT succeeds and the review POST fails (409, 500 or offline). Expected: a banner naming what saved and what didn't, with failed rows still marked. Task 2 (`runSave`) and Task 6 test it.
4. **Arabic-Indic digits and pasted numbers.** «٠٧٩١٢٣٤٥٦٧», «+962 79-123-4567», or a 6-digit code pasted into the first box. Expected: accepted and normalised; the code auto-submits. Tests in Task 3 (website) and Task 8 (app).
5. **Switch flipped mid-setup.** A member with old `setupStep = 3` and an empty `prefAgeMin`. Expected: the new setup opens on «من تبحث عنه» with the earlier answers kept. Task 5 tests it.

---

## File map

Website, new:

| File | What it holds |
|---|---|
| `src/lib/profile-edit-fields.ts` | db-free. Field table: sections, keys, label, control kind, option source; `fieldForOldStep()` |
| `src/lib/profile-edit-state.ts` | db-free. `rowState()`, `planSave()`, `runSave()`, `saveSummary()` |
| `src/components/auth/auth-frame.tsx` | The plain top bar and the centred column |
| `src/components/auth/phone-step.tsx`, `code-step.tsx`, `register-card.tsx` | The three auth screens |
| `src/components/auth/auth-flow.tsx` | The state machine phone → code → (sign-in \| register) |
| `src/components/profile/setup/short-setup.tsx` | The 3 steps |
| `src/components/profile/setup/setup-done.tsx` | «ملفك جاهز» |
| `src/components/profile/edit/edit-list.tsx` | The edit list |
| `src/components/profile/edit/row-editor.tsx` | One question's editor |
| `src/components/profile/edit/save-bar.tsx` | The sticky save bar |
| `src/components/profile/edit/use-edit-session.ts` | The edit session hook |

Website, moved unchanged:

| From | To |
|---|---|
| `src/app/(ar)/login/page.tsx` | `src/app/(ar)/login/legacy-login-page.tsx` |
| `src/app/(ar)/register/page.tsx` | `legacy-register-page.tsx` |
| `.../profile/setup/page.tsx` | `legacy-setup-page.tsx` |
| `.../profile/edit/page.tsx` | `legacy-edit-page.tsx` |

Each original `page.tsx` becomes a server wrapper.

Website, modified:

| File | Change |
|---|---|
| `src/lib/settings.ts` | default and getter |
| `src/app/api/admin/settings/new-cycle/route.ts`, `src/components/admin/new-cycle-settings-card.tsx` | admin toggle |
| `src/app/api/me/counts/route.ts`, `src/contexts/dashboard-context.tsx` | the flag reaches the dashboard |
| `src/app/(ar)/dashboard/profile/page.tsx` | edit links |
| `CLAUDE.md` | one bullet for the switch |

App, modified:

| File | Change |
|---|---|
| `naseebak_app/lib/features/auth/phone_screen.dart` | The new phone screen |
| `otp_screen.dart` | Code-screen copy and wrong-code state |
| `register_screen.dart` | Register card |
| `onboarding/setup_screen.dart` | Step names and the done screen |
| `profile/profile_edit_screen.dart` | Rewritten as the edit list |
| `profile/profile_screen.dart` | Quick sheet follows the lock rule |

App, new:

| File | What it holds |
|---|---|
| `naseebak_app/lib/features/profile/profile_edit_fields.dart` | Field table, same keys and order as the website |
| `naseebak_app/lib/features/profile/edit_row_state.dart` | Row state |
| `naseebak_app/lib/features/onboarding/setup_done_screen.dart` | «ملفك جاهز» |

---

### Task 1: Switch `auth_profile_redesign`

**Files:**
- Modify: `src/lib/settings.ts` (DEFAULTS, plus a getter next to `getChatDeleteEnabled`)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts` (GET, the zod schema, POST, following `chatDeleteEnabled` at lines 9–35, 66, 111–113)
- Modify: `src/components/admin/new-cycle-settings-card.tsx` (`Key` union and one row, labelled "Sign-in, sign-up and profile edit redesign (website)")
- Modify: `src/app/api/me/counts/route.ts` and `src/contexts/dashboard-context.tsx` (`flags.authRedesign?: boolean`)
- Test: `src/__tests__/admin/new-cycle-settings.test.ts`

**Interfaces:**
- Produces: `getAuthRedesignEnabled(): Promise<boolean>` in `src/lib/settings.ts`. Also `counts.flags.authRedesign` on the client.

- [ ] **Step 1: Write the failing tests** in `new-cycle-settings.test.ts`:
  - `it("reads and saves auth_profile_redesign")`: GET returns `authRedesign: false` by default.
  - POST `{ authRedesign: true }` calls `setSetting("auth_profile_redesign", "true")`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/admin/new-cycle-settings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - Add `auth_profile_redesign: "false"` to DEFAULTS.
  - Add `getAuthRedesignEnabled()`, which returns `getSetting(...) === "true"`.
  - Add the route field and the card row.
  - Add `authRedesign` to the `/api/me/counts` flags and the context type.
- [ ] **Step 4: Run** the same test, then `npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit**: `git add` the 6 files, then `git commit -m "Switch auth_profile_redesign (off by default)"`.

### Task 2: Field table, row state and save plan (pure, db-free)

**Files:**
- Create: `src/lib/profile-edit-fields.ts`, `src/lib/profile-edit-state.ts`
- Test: `src/__tests__/profile/edit-state.test.ts`, `src/__tests__/profile/edit-fields.test.ts`

**Interfaces:**

Consumes:
- `splitProfileEdit`, `buildFillBody`, `isEmptyStored` from `src/lib/profile-edit-split.ts`
- option tables from `src/lib/profile-options.ts`
- `sectApplies` from `src/lib/profile-sect.ts`

Produces in `profile-edit-fields.ts`:

```ts
export type EditControl = "date" | "choice" | "multi" | "number" | "text" | "longText" | "picker" | "yesNo";
export interface EditField { key: string; label: (gender: "MALE" | "FEMALE") => string; control: EditControl;
  options?: (ctx: { gender: "MALE" | "FEMALE"; country: string }) => { value: string; label: string }[];
  required?: boolean; showIf?: (ctx: { gender: "MALE" | "FEMALE"; country: string; profile: Record<string, unknown> }) => boolean;
  max?: number; companions?: string[] /* e.g. city → area, job → jobOther, hijab → niqab */ }
export interface EditSection { id: "basics" | "work" | "life" | "about" | "family" | "prefs"; title: string; fields: EditField[] }
// "prefs" (website only): today's web edit step-3 preference fields, each with `dealbreaker?: string` (its «شرط أساسي» key) on EditField
export const EDIT_SECTIONS: EditSection[];
export function fieldForOldStep(step: number): string | null; // ?step=N → first field key of that old wizard step
```

Produces in `profile-edit-state.ts`:

```ts
export type RowState = "idle" | "fill" | "review" | "pending" | "locked";
export function rowState(key: string, stored: Record<string, unknown>, changes: Record<string, unknown>, pendingKeys: string[] | null): RowState;
export interface SavePlan { prefChanges: Record<string, unknown> | null; dealbreakerKeys: string[] | null; fillBody: Record<string, unknown> | null; reviewChanges: Record<string, unknown> | null; fillKeys: string[]; reviewKeys: string[] }
export function planSave(changes: Record<string, unknown>, stored: Record<string, unknown>, dealbreakers?: { stored: string[]; next: string[] }): SavePlan;
export interface SaveResult { saved: string[]; sentForReview: string[]; failed: string[]; error?: string }
export function runSave(plan: SavePlan, api: { postPrefs(prefs: Record<string, unknown>): Promise<Response>; putDealbreakers(keys: string[]): Promise<Response>; putProfile(body: Record<string, unknown>): Promise<Response>; postReview(changes: Record<string, unknown>, message?: string): Promise<Response> }, message?: string): Promise<SaveResult>;
export function saveSummary(r: SaveResult, labelOf: (key: string) => string): string; // the one banner line
```

**Rules the tests pin:**
- `rowState` values:
  - A `pref*` key is never `"pending"` or `"locked"`; when changed it is `"fill"` («فوراً»), because preferences save directly.
  - `"pending"` for a key in `pendingKeys`.
  - `"locked"` for a stored non-empty key when `pendingKeys` is non-null and the key isn't in it.
  - `"fill"` / `"review"` for a changed key, from `splitProfileEdit`. Setting a key back to its stored value makes it `"idle"`.
- `hijab` and `niqab` share one state.
- `EDIT_SECTIONS` holds every key that today's edit page saves, plus `fieldOfStudy`, `interests` and `lifestyle`. `drivingLicense` uses `"yesNo"`.
- `runSave` order:
  1. Preferences alone first: `POST /api/profile/update-request` with only `pref*` keys. The server applies these even while a request is pending, and refuses a mixed body with 409.
  2. Then dealbreakers (`PUT /api/profile/dealbreakers {keys}`), then fills (`PUT /api/profile`), then review (`POST /api/profile/update-request` with `{ changes, message }`).
  3. A failed review leaves `failed` set to its keys and keeps `saved`.
  4. A 409 `REQUEST_PENDING` maps `error` to «لديك طلب تعديل قيد المراجعة بالفعل.».

- [ ] **Step 1: Write the failing tests:**
  - `rowState returns locked for stored keys while a request is pending, fill for empty keys`.
  - `rowState: changing a value back to stored is idle`.
  - `hijab and niqab go to review together` (stored `hijab: true, niqab: null`; change `hijab: false` makes both `review`).
  - `planSave puts empty-field changes in fillBody built by buildFillBody and stored-value changes in reviewChanges`.
  - `runSave keeps saved fills when the review POST fails`: mock `putProfile` with 200 and `postReview` with 500. Expect `saved: ["fieldOfStudy"], failed: ["city"]`.
  - `runSave maps 409 REQUEST_PENDING`.
  - `runSave sends preferences in their own POST before the review POST, so they save while a request is pending`.
  - `rowState: pref keys are never locked`.
  - `saveSummary` with `{saved:["hobbies"], sentForReview:["aboutMe"]}` equals «حُفظت الهوايات. نبذتك الجديدة أُرسلت للمراجعة، وستظهر بعد الموافقة.»: one saved field plus one review field, with the label table.
  - `EDIT_SECTIONS includes fieldOfStudy, interests, lifestyle and every key of the legacy edit page`. Read the legacy key list from the `ProfileFormData` keys in the moved `legacy-edit-page.tsx` (Task 6 moves it): hard-code the expected list in the test now.
  - `fieldForOldStep(1) === "dateOfBirth"`, `fieldForOldStep(3) === "aboutMe"`, `fieldForOldStep(9) === null`.
  - `sect only shows for LB` through `showIf`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/profile/edit-state.test.ts src/__tests__/profile/edit-fields.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement both modules.**
  - `saveSummary` builds «حُفظ/حُفظت {labels}.» plus «{label} أُرسلت للمراجعة، وستظهر بعد الموافقة.». It takes the field's grammatical gender from the field table (add `fem?: boolean` to `EditField`).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Edit list: field table, row state and save plan"`.

### Task 3: Website auth screens (phone, code, register card)

**Files:**
- Create: `src/components/auth/auth-frame.tsx`, `phone-step.tsx`, `code-step.tsx`, `register-card.tsx`, `auth-flow.tsx`
- Test: `src/__tests__/components/auth-flow.test.tsx`

**Interfaces:**
- Consumes:
  - `DialCodeToggle` (`src/components/shared/dial-code-toggle.tsx`), `dialCountryFor` / `normalizePhoneField` (`src/lib/phone-field.ts`), `toLatinDigits`
  - `TermsConsentText`
  - today's API calls, unchanged:
    - `POST /api/auth/send-otp {phone, context:"login", country}`
    - `POST /api/auth/verify-otp`
    - `POST /api/auth/register`
    - `signIn("credentials", …)`
    - referral apply
  - Copy their call shapes from `legacy-login-page.tsx` lines 120–210 and `legacy-register-page.tsx` lines 417–544.
- Produces: `<AuthFlow mode="login" | "register" callbackUrl?: string inviteCode?: string />`.

**Behaviour:**
- The phone step is the same in both modes, except for the header link («جديد على نصيبك؟ إنشاء حساب» or «لديك حساب؟ تسجيل الدخول») and the document title.
- The code step:
  - six inputs in one LTR `role="group"`;
  - paste fills all six; Arabic-Indic digits are converted; the code auto-submits at 6;
  - the 60 s resend count shows as `m:ss`;
  - a wrong code clears the boxes and shows the wrong-code line under them.
- A verified new number keeps phone and code in component state, not sessionStorage, and shows the register card. `?from=login` handoff stays readable for old links.
- The register card:
  - the invite field is hidden behind «لديك رمز دعوة؟» unless `inviteCode` is set;
  - errors appear under each field (`aria-describedby`);
  - success goes to `/dashboard/profile/setup`; no confetti step.
- Closed registration or a closed country shows the `send-otp` 403 error text under the phone field.

- [ ] **Step 1: Write the failing tests** (mock `fetch`, `next-auth/react`, `next/navigation`):
  - `phone step sends login context and converts Arabic-Indic digits`: type «٠٧٩١٢٣٤٥٦٧», click «إرسال الرمز», expect a body with `context: "login"` and `phone` holding Latin digits.
  - `send-otp 403 shows the server error under the phone field`.
  - `pasting 6 digits into the first code box submits verify-otp`.
  - `wrong code clears boxes and shows «الرمز غير صحيح. تأكد من آخر رسالة وصلتك.»`.
  - `WhatsApp channel says «عبر واتساب»`: `send-otp` returns `channel: "whatsapp"`.
  - `existing member signs in and goes to callbackUrl`.
  - `new number shows «بياناتك الأساسية» and register posts phone+otp+names+gender`.
  - `invite field hidden until «لديك رمز دعوة؟», pre-opened with inviteCode`.
  - `terms unchecked shows the error under the checkbox and does not post`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/auth-flow.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the five components.
  - Desktop: a 420 px centred column under a white top bar with the text logo «نصيبك» in `text-primary font-display`.
  - Phones: full width with `px-4`.
  - The phone field is one grouped card: a country row (shown only when `DialCodeToggle` has 2+ countries), then the LTR number row.
- [ ] **Step 4: Run** the test, then `npx vitest run src/__tests__/components/design-guards.test.ts src/__tests__/lib/no-regex-lookbehind.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Auth redesign: phone, code and register card (website)"`.

### Task 4: Switch wrappers for `/login` and `/register`

**Files:**
- Move: `src/app/(ar)/login/page.tsx` → `legacy-login-page.tsx`, and `register/page.tsx` → `legacy-register-page.tsx`, with `git mv` and no content change.
- Create: new `page.tsx` in both folders.
- Test: `src/__tests__/components/auth-pages-switch.test.tsx`

**Interfaces:**
- Consumes: `getAuthRedesignEnabled()` (Task 1), `AuthFlow` (Task 3).
- Produces: `/login` and `/register` render `AuthFlow` when the switch is on, and the legacy page otherwise.

**Wrapper:**
- A server component: `export const dynamic = "force-dynamic"`.
- Reads `searchParams` (`callbackUrl`, `ref`/invite param, the same names the legacy pages read).
- Renders `<Suspense>` around the client component.
- `metadata` stays in the existing `layout.tsx`.

- [ ] **Step 1: Write the failing test:** `renders legacy login when off, AuthFlow mode=login when on`, and the same for register. Mock `@/lib/settings` and both child components as stubs with `data-testid`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the moves and the wrappers.
- [ ] **Step 4: Run** the test and `pnpm build`. Expected: PASS; the build succeeds (catches the client/db import trap).
- [ ] **Step 5: Commit**: `git add` the 4 page files and the test, then `git commit -m "Login and register follow auth_profile_redesign"`.

### Task 5: Short setup (website)

**Files:**
- Create: `src/components/profile/setup/short-setup.tsx`, `setup-done.tsx`
- Move: `src/app/(ar)/dashboard/profile/setup/page.tsx` → `legacy-setup-page.tsx`; new `page.tsx` wrapper, same pattern as Task 4.
- Test: `src/__tests__/components/short-setup.test.tsx`

**Interfaces:**
- Consumes:
  - `missingSetupSteps()` (`src/lib/profile-completeness.ts`)
  - `BirthDateSelect`, `NumberInput`, `ChoiceGroup` / `Field` (`src/components/profile/form-fields.tsx`)
  - `sectApplies`, `forViewer`
  - today's `PATCH /api/profile/draft` (autosave) and final `PUT /api/profile` (copy the body shape from `legacy-setup-page.tsx` ~l.480–530)
  - `EDIT_SECTIONS` keys for the done-screen links
- Produces: `<ShortSetup />`, `<SetupDone />`.

**Behaviour:**
- **Steps and fields:**
  - Step 1: `dateOfBirth`, `nationality`, `city`, `education`.
  - Step 2: `maritalStatus`, `childrenCount` (when not «أعزب/عزباء»), `religiosity`, `sect` (LB).
  - Step 3: `prefAgeMin` / `prefAgeMax` (18–70, min ≤ max, error «العمر الأدنى يجب أن يكون أقل من العمر الأقصى»).
- **Start step:** the first entry of `missingSetupSteps(user)`, else step 3. The stored `setupStep` is ignored.
- **Legacy guardian step:** step 4 only when `flags.introRequests` is false; reuse the legacy step 5 block.
- **Validation:** «التالي» validates the step and shows errors under their fields.
- **Saving:** the autosave writes the draft on each change, debounced, the same as legacy `useAutoSave`. «حفظ والبدء» saves and shows `<SetupDone />`.
- **Done screen:** rows link to `/dashboard/profile/edit?field=aboutMe`, `?field=job`, `/dashboard/photos` and `/dashboard/profile/edit?field=prefAgeMin`. The website has no separate preferences page.

- [ ] **Step 1: Write the failing tests:**
  - `starts at step 3 when only prefAge is missing (old setupStep=3)`.
  - `step 2 hides childrenCount for single and shows sect only for LB`.
  - `next shows errors under empty required fields and stays`.
  - `finish PUTs the profile and shows «ملفك جاهز» with «عرض الاقتراحات» to /dashboard/suggestions`.
  - `prefAgeMin > prefAgeMax shows the age error`.
  - `wrapper renders legacy setup when the switch is off`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/short-setup.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the components.
  - Progress: three bars plus named steps «1. عنك · 2. حالتك · 3. من تبحث عنه». The heading for step 3 uses `forViewer` for «تبحث/تبحثين».
  - The navigation row is sticky at the bottom on phones.
- [ ] **Step 4: Run** the tests, then `npx vitest run src/__tests__/missing-setup-steps.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Short 3-step setup behind auth_profile_redesign"`.

### Task 6: Edit list (website)

**Files:**
- Create: `src/components/profile/edit/edit-list.tsx`, `row-editor.tsx`, `save-bar.tsx`, `use-edit-session.ts`
- Move: `src/app/(ar)/dashboard/profile/edit/page.tsx` → `legacy-edit-page.tsx`; new `page.tsx` wrapper.
- Modify: `src/app/(ar)/dashboard/profile/page.tsx`
  - The header button label is «تعديل» when the switch is on.
  - Edit links use `?field=` when on, keeping `?step=` when off. That covers the «شروط أساسية» nudge, which uses `emptyFilterFields().step`; map it with `EmptyFilterField.key` as the field.
- Test: `src/__tests__/components/edit-list.test.tsx`

**Website partner preferences:**
- Today they live in the web edit wizard (step 3); there is no separate page.
- The list ends with the «تفضيلات الشريك» section (`prefs`).
- Each preference editor holds its «شرط أساسي» `DealbreakerToggle` (`src/components/profile/form-fields.tsx`), disabled until a value is picked, with the legacy line «لن نقترح عليك من لا يحققه».
- Add a test: `a preference change saves while a request is pending`.

**Interfaces:**
- Consumes:
  - `EDIT_SECTIONS`, `fieldForOldStep`, `rowState`, `planSave`, `runSave`, `saveSummary` (Task 2)
  - `useDashboardData().refreshProfile`
  - `GET /api/profile` (stored values)
  - `GET /api/profile/update-request` (pending request: `requests[].status === "PENDING"` with its changes' keys)
  - `POST /api/profile/update-request/withdraw`
- Produces: `useEditSession()` returning `{ stored, changes, setChange(key, value), revert(), pendingKeys, save(note?), result, dirty }`.

**Behaviour:**
- **Load:** a failed load shows `LoadError` and nothing is editable.
- **Rows:** each row shows the current value (`selfLabel`) or «إضافة» in `text-primary`. A changed row gets a start-edge `bg-primary` bar and a tag: «فوراً» (`emerald`) or «للمراجعة» (`primary`).
- **Locked rows:** a `pending` row shows «الحالية: {old}» and «قيد المراجعة» (`amber`). Pending and locked rows open nothing.
- **Row editor:** `Dialog` on `md:` and up; a bottom sheet below that (the shadcn `Sheet` side="bottom" if present in `src/components/ui/`, else `Dialog` styled as a sheet). «تم» calls `setChange`.
  - When the stored value is non-empty, it shows the amber review line.
- **Save bar:** shown when `dirty`.
  - Text: «{n} تعديلات» with the fill/review split. Use `arabicCount` for n.
  - Buttons: «حفظ», plus «تراجع» from `md:` up.
  - When there are review keys, a «ملاحظة لفريق المراجعة (اختياري)» field appears in the bar, collapsed behind a link.
- **After save:** the summary banner shows at the top and `refreshProfile()` runs.
- **Leaving:** `beforeunload` while dirty. In-app links inside the page (back «ملفي») open the `Dialog` «تجاهل التعديلات؟».
- **Deep links:** `?field=KEY` opens that row's editor on load; `?step=N` uses `fieldForOldStep`.

- [ ] **Step 1: Write the failing tests:**
  - `renders sections and «إضافة» for empty fields`.
  - `editing an empty field marks it «فوراً», a stored one «للمراجعة», and the bar counts 2`.
  - `save sends PUT for fills then POST update-request, then shows the summary banner`.
  - `review POST failure keeps the failed row marked and names it in the banner`.
  - `pending request locks stored rows, keeps empty rows editable, «سحب الطلب» calls withdraw`.
  - `?field=city opens the city editor; ?step=3 opens aboutMe`.
  - `navigating back while dirty asks «تجاهل التعديلات؟»`.
  - `load failure shows LoadError and no save bar`.
  - `wrapper renders legacy edit when off`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/components/edit-list.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: all green, lint at 0.
- [ ] **Step 5: Commit**: `git commit -m "Profile edit as one list with a save bar (website, behind auth_profile_redesign)"`.

### Task 7: Website real-flow QA and docs

**Files:**
- Modify: `CLAUDE.md`. Add one bullet under the switches:

  > `auth_profile_redesign` (Admin → Settings, off by default, 2026-11-13): new website sign-in/sign-up, 3-step setup and edit list; off = the legacy pages in `legacy-*.tsx`.

- Modify: `docs/platform-flow.html`, the sign-up and edit flow notes only.

- [ ] **Step 1: Production build locally,** with the commands from CLAUDE.md "Real-flow QA": `NODE_ENV=production pnpm build`, then `next start -p 3030`. Turn the switch on in local Admin → Settings.
- [ ] **Step 2: Walk the flows with Playwright at 390 px and 1280 px:**
  - sign-in with `0777000001`, code `111111`;
  - sign-up with the `EXTRA_TEST_PHONES` number;
  - setup to «ملفك جاهز»;
  - edit: one fill plus one review, then the pending state, then a fill while pending, then withdraw.
  - Expected: matches the mockup; no console errors; the switch off shows the legacy pages.
- [ ] **Step 3: Commit** the docs: `git commit -m "Docs: auth_profile_redesign switch"`.

### Task 8: App auth screens (next app version)

Tell the owner before building the app (CLAUDE.md). This task changes code and tests only.

**Files:**
- Modify: `naseebak_app/lib/features/auth/phone_screen.dart`, `otp_screen.dart`, `register_screen.dart`, `auth_repository.dart` (callers pass `OtpContext.login` only)
- Test: `naseebak_app/test/auth_redesign_test.dart`

**Interfaces:**
- Consumes: `Country.otpChannel`, `phone_validation.dart`, `SafeInputFormatter`, `toLatinDigits`, `pendingAuthProvider`, `authModeProvider` (now only pre-fills the invite code).
- Produces: no new public API.

**Behaviour:**
- **Phone screen:**
  - remove `_ModeSwitch`, the closed-registration banner and the promise tiles;
  - the title is «ما رقم هاتفك؟», with the channel line;
  - one grouped field (country row → `/country`, number row LTR);
  - the hint «لا يظهر رقمك لأي عضو.»;
  - the button «إرسال الرمز», using `LoadingButton` with the theme height, not `_GoldButton`;
  - a `send-otp` error shows under the field.
- **OTP screen:** the copy from Global Constraints; a wrong code clears the field and shows the wrong-code line under the boxes.
- **Register screen:**
  - the invite field is behind «لديك رمز دعوة؟», pre-opened when `authModeProvider` carries a code;
  - `textInputAction.next` from the first name to the last name.

- [ ] **Step 1: Write the failing widget tests:**
  - `phone screen has no mode tabs and one «إرسال الرمز» button`.
  - `sendOtp is called with OtpContext.login`.
  - `Arabic-Indic digits in phone are accepted`.
  - `send-otp 403 message shows under the field`.
  - `otp wrong code clears and shows the wrong-code line`.
  - `whatsapp country says «عبر واتساب»`.
  - `register hides invite until tapped, pre-opens with invite`.
- [ ] **Step 2: Run** `cd naseebak_app && flutter test test/auth_redesign_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `flutter test test/auth_redesign_test.dart test/country_and_phone_test.dart test/auth_state_test.dart && flutter analyze`. Expected: PASS, no issues.
- [ ] **Step 5: Commit**: `git commit -m "App: one phone screen, code and register card per the redesign"`.

### Task 9: App setup step names and done screen

**Files:**
- Modify: `naseebak_app/lib/features/onboarding/setup_screen.dart`
- Create: `naseebak_app/lib/features/onboarding/setup_done_screen.dart`, plus a route `/onboarding/done` in `core/routing/router.dart`. It must be allowed by `guardRedirect` once `profileComplete` is true, then go to `/home` from its button.
- Test: `naseebak_app/test/setup_progress_test.dart` (extend)

**Behaviour:**
- **Progress:** named steps «عنك» / «حالتك» / «من تبحث عنه».
- **Option lists:** education comes from `CountryLists` (`lists.option('education')`), not `ProfileOptions.education`.
- **Errors:** inline under each field, as today.
- **Finish:** «حفظ والبدء» opens the done screen.
  - Button «عرض الاقتراحات» goes to discovery.
  - Rows: «نبذة عنك» → profile edit with field `aboutMe`, «الوظيفة والطول» → field `job`, «صوري», «تفضيلات الشريك».

- [ ] **Step 1: Write the failing tests:**
  - `progress shows the three step names`.
  - `education chips come from country lists`.
  - `after save the done screen shows and its rows route correctly`.
- [ ] **Step 2: Run** `flutter test test/setup_progress_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same test plus `test/setup_lists_test.dart`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 10: App edit list and quick sheet

**Files:**
- Create: `naseebak_app/lib/features/profile/profile_edit_fields.dart` (same section ids, keys and order as `EDIT_SECTIONS`), `edit_row_state.dart`
- Modify: `profile_edit_screen.dart` (rewrite as the list), `profile_screen.dart` (quick sheet), `profile_edit_plan.dart` (reuse it for the split; no rule change)
- Test: `naseebak_app/test/profile_edit_list_test.dart`. Also update `test/profile_required_and_locks_test.dart` where it asserts the old layout.

**Interfaces:**
- Consumes: `pendingEditProvider` (`profile_repository.dart:322`), `CountryLists`, `OptionLabels`, today's repository save calls.
- Produces:
  - `enum EditRowState { idle, fill, review, pending, locked }`
  - `EditRowState editRowState(String key, Map stored, Map changes, List<String>? pendingKeys)`

  The same rules as the website's `rowState`.

**Behaviour:**
- **Rows:** grouped list rows as in `ProfileEdit.dc.html`. A changed row gets a navy start bar and a «فوراً» / «للمراجعة» tag.
- **Editing:** a bottom sheet per field, with «إلغاء» / «تم» and the review line when the field is stored.
- **Save bar:** sticky above the safe area, `{n} تعديلات · {a} فوراً · {b} للمراجعة` and «حفظ». It replaces the bottom «حفظ التعديلات» button.
- **Pending request:** banner plus locked rows; empty rows stay editable.
- **Leaving:** `PopScope` with `confirmDialog` «تجاهل التعديلات؟».
- **Quick sheet in «ملفي»:**
  - opens only when the field is empty or nothing is pending, otherwise it shows the row as locked;
  - uses the label from `profile_edit_fields.dart`.
- **New rows:** the list includes `fieldOfStudy`, `interests` and `lifestyle`; `drivingLicense` uses yes/no chips.

- [ ] **Step 1: Write the failing tests:**
  - `editRowState matches the website rules (same cases as Task 2)`.
  - `changed empty field shows «فوراً», stored «للمراجعة», bar counts 2`.
  - `pending request locks stored rows and quick sheet`.
  - `back with changes asks «تجاهل التعديلات؟»`.
  - `field table keys equal the website list`: hard-code the same key list as Task 2's test.
- [ ] **Step 2: Run** `flutter test test/profile_edit_list_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `flutter test && flutter analyze`. Expected: all green.
- [ ] **Step 5: Commit**: `git commit -m "App: profile edit list with one save bar"`.

### Task 11: Final verification

- [ ] **Step 1:** Run `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: 0 lint problems; all tests pass; the build succeeds.
- [ ] **Step 2:** Run `cd naseebak_app && flutter analyze && flutter test`. Expected: no issues; all pass.
- [ ] **Step 3:** Request a whole-branch review with superpowers:requesting-code-review. Fix what it confirms.
- [ ] **Step 4:** Report to the owner:
  - what is behind `auth_profile_redesign`;
  - that the app part needs a new version (after 1.3.0+8);
  - that nothing is deployed. Deploy only with the owner's approval.
