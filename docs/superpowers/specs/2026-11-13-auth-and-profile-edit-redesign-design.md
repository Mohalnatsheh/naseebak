# Sign-in, sign-up and profile edit redesign (website + app)

Date: 2026-11-13. Status: approved by the owner. Mockups:

- Website, plus the app's edit save bar: `docs/design-mockup/auth-edit-redesign-2026-11-13.html`.
- App, made 2026-11-12, in `docs/design-mockup/app-mockup/project/`: `Phone`, `Otp`, `OtpWhatsapp`, `OtpError`, `Register`, `Setup`, `SetupBasics`, `SetupSocial`, `SetupSectLB`, `SetupLooking`, `MyProfile`, `ProfileEdit`, `QuickEditSheet`.

## Why

The owner asked to "enhance the login and register ui ux and the design, also edit info".

**Website today**
- Sign-up is one long card: names, gender, phone, inline code, invite code, photo switch, terms.
- It ends on a fake «تم بنجاح» step, then a setup of about 45 fields over 4 steps.
- Edit is the same 5-step wizard, even to change one field.
  - Errors show in a banner at the top, not under the field.
  - Three setup fields cannot be edited at all: `fieldOfStudy`, `interests` and `lifestyle`.
- Login and register look different from each other: different card, label and button styles.

**App today**
- The phone screen has «تسجيل الدخول | حساب جديد» tabs and a button labelled «إنشاء الحساب», which doesn't create anything.
- Edit shows errors one at a time at the bottom of a long scroll.
- The «عنّي» quick-edit sheet sends a review request even when one is already pending, and the server refuses it with `REQUEST_PENDING`.
- Labels drift between the sheet and the edit screen.

**Goal:** one simple, plain-realistic flow, the same on the website and the app.

## Goals

- **Sign-in and sign-up start the same way:** «ما رقم هاتفك؟», then a code screen.
  - A member signs in straight away.
  - A new number goes to a short «بياناتك الأساسية» card: name, «أنا», terms, and an optional invite code behind a link.
- **Setup is 3 short steps with visible names:** «عنك», «حالتك», «من تبحث عنه». It ends on «ملفك جاهز» with an optional «أكمل ملفك متى شئت» list.
- **Edit is one grouped list:**
  - A row opens a small editor for that question: a dialog on desktop, a bottom sheet on phones.
  - Changed rows are marked, and each says before saving whether it saves at once or goes to review.
  - One sticky save bar saves everything.
- **Errors appear under the field that caused them,** in plain words.
- **The website and the app share the same steps, names and copy.**

## Non-goals

- Photos, guardian and the personality quiz keep their own screens, and so do partner preferences in the app.
- On the website, partner preferences live inside edit today and have no page of their own. They become the last section of the edit list, «تفضيلات الشريك»:
  - rows save at once;
  - each editor holds its «شرط أساسي» toggle;
  - a pending request never locks them.
- No change to review rules, the matching score or the suggestion gate. Still one pending review request at a time.
- No change to OTP delivery, rate limits, or the WhatsApp/SMS choice (`otpByWhatsapp` / `otpChannel`).
- No change to admin screens.

## Anti-goals (fail even if it works)

- **Revealing more about whether a number is registered than today.** The shared phone screen sends the `login` context, exactly as today's website login and the app's login tab already do: no new leak. The `userExists` field that context still returns for pre-2026-11-07 apps is removed by its own follow-up, not here.
- **A member losing edits silently.** Leaving with unsaved changes asks «تجاهل التعديلات؟».
- **Half-saved edits with no explanation.** After saving, one message says what saved and what went to review.
- **Breaking older app versions.** No API change may break them.

## Constraints

- Live site with real members: the website part goes behind a new switch.
  - `auth_profile_redesign` in Admin → Settings, off by default.
  - Off = today's login, register, setup and edit, untouched.
- Every schema change must be additive. **None is expected.**
- **Brand and design rules:**
  - Brand tokens only (`docs/reference/design-system.md`); the guard test fails on raw hex and forbidden palettes.
  - Cairo; nothing under 12 px; inputs ≥ 16 px on phones; tap targets ≥ 44 px.
  - `BirthDateSelect`, never `<input type="date">`.
  - `NumberInput` for numbers.
  - `Dialog` / `DropdownMenu`, never hand-made overlays.
  - `LoadError` on failed loads.
- **Copy rules:**
  - Gendered copy via `forViewer()` / `forPartner()`.
  - Western digits; phone and code inputs accept Arabic-Indic digits through `toLatinDigits()`.
  - The «المذهب» question appears for Lebanon only, and stays required in setup.
- **App:**
  - This is a new app version (new screens and behaviour).
  - Tell the owner before building it.
  - Old app versions keep working, because the server is unchanged.
- **Parallel sessions:**
  - Another session owns `src/app/(ar)/dashboard/page.tsx`, `src/components/suggestions/`, `src/components/dashboard/`, `naseebak_app/lib/features/home` and `discovery`.
  - Another owns chat.
  - This work stays out of those files.

## Approaches considered

### 1. Website: what to follow

| Option | What it means |
|---|---|
| A. Follow the app mockups **(chosen by the owner)** | One flow everywhere |
| B. Restyle only | Keep today's one-card sign-up, 4-step setup and 5-step edit wizard; only the look changes |
| C. Follow the app but keep the long web setup | Profiles stay as full as today, but the two platforms differ |

**Why A:**
- App members already finish setup with these 3 steps, so the server accepts it.
  - `PUT /api/profile` sets `isComplete: true` with the same required basics.
  - `meetsSuggestionGate` only reads `isComplete`.
- B leaves the length problems.
- C keeps two different products.

### 2. Edit: how saving works

The server allows one `PENDING` review request at a time (`/api/profile/update-request` returns 409 `REQUEST_PENDING`).

| Option | What it means |
|---|---|
| A. Edit rows, then one Save **(chosen by the owner)** | Same split as today (`splitProfileEdit`: fills / prefs / reviewed); no server change |
| B. Each row saves alone; a new change joins the pending request | Needs a server and admin-review change, and care for an admin mid-review |
| C. Each row saves alone; while one change waits, the other stored values can't be changed | No server change, but it frustrates members |

## The design

### Sign-in and sign-up (website and app)

**Phone screen**
- Title «ما رقم هاتفك؟», sub-line «سنرسل لك رمز دخول من 6 أرقام {عبر واتساب|برسالة نصية}.».
- A grouped field:
  - Country row: flag, name, chevron. It opens the country picker; only active countries; a plain row when only one is active.
  - Number row: LTR, dial code, then the number.
- Hint «لا يظهر رقمك لأي عضو.».
- One button «إرسال الرمز».
- Under it on the website: «بالمتابعة توافق على الشروط وسياسة الخصوصية.».

**Website specifics**
- `/login` and `/register` both show this screen.
  - Header link: «جديد على نصيبك؟ إنشاء حساب» on `/login`, «لديك حساب؟ تسجيل الدخول» on `/register`.
  - The two screens differ only in that link and the page title: «تسجيل الدخول» / «إنشاء حساب».
- Desktop: a centred 420 px column under a plain white top bar with the text logo «نصيبك».
  - Today's brand side panel, photo and gradient are removed (plain-realistic, per the 2026-11-12 app style).
- The mobile web screen is the app screen.

**App specifics**
- Remove `_ModeSwitch` and the «إنشاء الحساب» label from `phone_screen.dart`. The button becomes «إرسال الرمز».
- Keep:
  - the invite-link register mode (`authModeProvider`), used only to pre-fill the invite code on the register card;
  - the closed-registration handling: drop the banner that reads the country before anything is typed, and show the server's own `send-otp` refusal under the phone field instead («التسجيل مغلق حالياً…», `countrySignupBlock`). Members still get their code, because the `login` context gates only new numbers. This is what today's website login already does;
  - `AuthHero`, only if it matches the mockup's plain style. Otherwise use the mockup's plain title.

**Code screen**
- Six boxes, LTR; Arabic-Indic digits accepted; auto-submit at 6.
- Line «أرسلنا رمزاً من 6 أرقام {عبر واتساب|برسالة نصية} إلى {masked phone}».
- Website, WhatsApp countries: a small «وصل الرمز عبر واتساب» note.
- Row: «إعادة الإرسال بعد 0:42», which becomes the link «إعادة إرسال الرمز», plus «تغيير الرقم».
- Wrong code:
  - boxes turn red and clear;
  - «الرمز غير صحيح. تأكد من آخر رسالة وصلتك.» under them.
- Other server errors also show under the boxes, keeping today's texts.

**After the code**
- Unchanged server logic: `verify-otp` says whether the number is a member.
- **Member:** sign in, go to `callbackUrl` (website) or home (app).
- **New number:**
  - Website: today's handoff (`naseeb:register-handoff` in sessionStorage, phone and code) to the register card.
  - App: today's `pushReplacement('/auth/register')`.

**Register card «بياناتك الأساسية»**
- Sub-line «خطوة أخيرة لإنشاء حسابك. يظهر اسمك الأول فقط للطرف الآخر.».
- Fields:
  - Grouped «الاسم بالعربية»: الاسم الأول, اسم العائلة. Same Arabic-only rule as today.
  - «أنا»: two cards, رجل «أبحث عن زوجة» / امرأة «أبحث عن زوج».
  - «لديك رمز دعوة؟», a link that reveals the 8-character field. It is pre-opened and filled when an invite code came in the link.
  - The terms + 18+ checkbox, today's text and country-aware links (`terms-consent-text.tsx`).
  - «إنشاء الحساب».
- Field errors sit under the field, today's texts.
- **Removed on the website:**
  - the optional photo switch (photos go to «صوري»);
  - the «تم بنجاح» step with confetti.
- After success, go straight to setup step 1.
- `send-otp` context: always `login` from the shared screen. This is today's website login behaviour: members of a closed country still sign in, and new numbers get the closed-registration refusal under the phone field.
- If the number turns out to be registered (a race), keep today's silent sign-in and «هذا الرقم مسجّل بحساب سابق…».

### Setup (website and app)

Three steps. A progress bar with step names: «1. عنك · 2. حالتك · 3. من تبحث عنه». It saves as the member goes and resumes where they stopped, with today's draft mechanisms.

| Step | Title | Fields |
|---|---|---|
| 1 «عنك» | «معلوماتك الأساسية» | `BirthDateSelect` (18+); الجنسية and المدينة as grouped rows that open a picker; المستوى التعليمي chips. All required. |
| 2 «حالتك» | «حالتك الاجتماعية» | الحالة الاجتماعية chips; عدد الأبناء (`NumberInput`, only when not single); الالتزام الديني; المذهب (Lebanon only). All required. |
| 3 «من تبحث عنه» | «من {تبحث\|تبحثين} عنه» | العمر المناسب من/إلى, 18–70, min ≤ max. Required. |

**How steps behave**
- «التالي» validates the step and shows each error under its field.
- The last step's button is «حفظ والبدء».
- The legacy guardian step stays as today, as step 4. It shows only when `intro_requests_enabled` is off, which never happens in production.
- Today's optional web step «معلومات عائلية» (tribe, origin, siblings, housing, expenses, health) is not a setup step any more. Those fields live in edit under «العائلة والسكن».
- **Where a member resumes (website, new setup):** the first of the 3 steps that has an empty required field, read from the stored profile and draft (`PATCH /api/profile/draft` stays the store). Today's stored `setupStep` number is ignored. A member halfway through the old setup lands on the right short step with what they already answered. With the switch turned back off, the old setup resumes from the stored profile the same way today's draft does.

**«ملفك جاهز»**
- Check mark, title, «نبحث الآن عمّن يناسبك…», button «عرض الاقتراحات».
- Below it, «أكمل ملفك متى شئت · يزيد فرصك»: rows for نبذة عنك, الوظيفة والطول, صوري, تفضيلات الشريك. Each says «إضافة» and opens the matching edit row, the photos page or the preferences page.

**Website only**
- The fields dropped from setup are all optional today, and the app never asks them at setup:
  - area, field of study, job, height, weight, skin colour, income;
  - smoking, hijab/beard, cooking, lifestyle, licence;
  - about-me texts, partner preference fields beyond age, family step.
- They move to edit.
- With the switch off, today's 4-step setup stays.

### Profile edit (website and app)

**Entry points**
- From «ملفي», the profile view page.
- Website: the «طلب تعديل» header button keeps its place, labelled «تعديل».
- App: «تعديل ملفي (كل البيانات)».
- Deep links:
  - `?field=<key>` (website) opens that row's editor directly.
  - It replaces `?step=N`; `?step=N` maps to the first field of that old step.
  - The «شروط أساسية» nudge links to preferences, as it does in the app.

**Layout**
- Title «تعديل ملفي».
- Sub-line «الحقول الفارغة تُحفظ فوراً. تغيير معلومة محفوظة يراجعه فريق نصيبك قبل ظهوره.».
- Grouped sections, one row per field: label, current value or «إضافة» in navy, chevron. The sections:
  - البيانات الأساسية: date of birth, nationality, city + area, marital status, children, religiosity, sect (LB)
  - التعليم والعمل: education, field of study, job (+ «أخرى»), income
  - المظهر ونمط الحياة: height, weight, skin colour, hijab or beard, smoking, cooking, lifestyle, driving licence, relocation
  - عنّي: about me, partner expectations, hobbies, interests, family values (each row shows the first line)
  - العائلة والسكن: tribe, family origin, siblings, housing, expenses, health
- The list includes `fieldOfStudy`, `interests` and `lifestyle` (missing today).
- The driving licence becomes «نعم» / «لا» chips instead of a bare switch. A stored `false` shows as «لا» and counts as an answer, as the server already treats it (`isEmptyStored`), so changing it goes to review like any stored value. No null default is written any more: today's edit page wrote `false` for members who never answered, and the new list writes nothing until the member picks.

**Row editor**
- Website desktop: `Dialog`. Phones (website and app): bottom sheet.
- Contents:
  - the field's control (chips, picker list, `BirthDateSelect`, `NumberInput`, textarea with a counter);
  - «تم» and «إلغاء»;
  - when the field already has a stored value, an amber line «تغيير {field} يُرسل لفريق نصيبك للمراجعة قبل ظهوره.».
- «تم» changes nothing on the server: it updates the row and marks it changed.
- Validation errors show in the editor, under the control.

**A changed row**
- A navy start-edge bar and a light background.
- A small tag: «فوراً» (green) for a fill, «للمراجعة» (navy) for a change to a stored value. The split is `splitProfileEdit`: hijab and niqab travel together.
- Setting a row back to its stored value un-marks it.

**Save bar**
- Shows only once something changed. Sticky at the bottom: website content column, app above the safe area.
- Text: «{n} تعديلات» with «{a} فوراً · {b} للمراجعة».
- Buttons: «حفظ», plus «تراجع» on desktop.
- On save, today's calls, in order:
  - fills → `PUT /api/profile` (`buildFillBody`);
  - reviewed → `POST /api/profile/update-request`, with an optional «ملاحظة لفريق المراجعة»;
  - for a reviewed change, the review note field shows in the save confirmation on the website, as a collapsible line in the bar.
- After save, one banner at the top of the list says what happened, e.g. «حُفظت الهوايات. نبذتك الجديدة أُرسلت للمراجعة، وستظهر بعد الموافقة.». Rows reflect the new state.
- Partial failure: the banner names what saved and what didn't, and the failed rows stay marked.

**Pending request**
- Amber banner: «طلبك قيد المراجعة: {fields}. يمكنك تعبئة الحقول الفارغة الآن، وتغيير المعلومات الأخرى بعد المراجعة.» with «سحب الطلب».
- The pending row shows «الحالية: {old}», the new value, and a «قيد المراجعة» tag. It is locked.
- Every other row with a stored value is locked too: lock icon, no editor. Empty rows stay editable as fills.
- This matches the server's one-request rule without a 409 surprise.

**Leaving**
- With unsaved changes, «تجاهل التعديلات؟» via `Dialog` (website) or `confirmDialog` (app). Website also covers `beforeunload`.

**App quick-edit sheet in «ملفي»**
- Same rule: it opens only for an empty field or when no request is pending. Otherwise the row shows locked.
- Its labels come from the same table as edit, so they stop drifting.

### Shared copy and labels

- One label table per platform, built from the existing option tables.
  - Website: `src/lib/profile-options.ts` and friends.
  - App: the lists the server already sends in the country config (`CountryLists` in `naseebak_app/lib/features/country_selection/country.dart`) plus `OptionLabels`. Setup and preferences stop using the hard-coded `ProfileOptions.education`.
- **App pending state:** the edit screen and the quick sheet read the existing `pendingEditProvider` (`profile_repository.dart`, from `GET /api/profile/update-request`), which gives the pending fields. No new endpoint.
- Setup, edit and the quick sheet all use it.
- Pick the setup wording where the two differ: «الهوايات» and «الاهتمامات» stay separate; «القيم العائلية»; «مواصفات الشريك المطلوبة».

### Switch and rollout

- **Website:** `auth_profile_redesign` (Admin → Settings, default off) chooses between the new and old login/register/setup/edit.
  - The old pages stay in the code until the owner says the new ones are settled.
  - No app version needed for the website.
- **App:**
  - Ships as the next version after the current one.
  - Not behind the website switch, since the server API is unchanged.
  - Old apps keep their current screens.

## Left to the builder

- Component structure and file names. Prefer new components under `src/components/auth/` and `src/components/profile/edit/`, keeping the old pages intact behind the switch.
- Exact desktop widths and the dialog size, within the two page widths of the design system.
- How to keep the field list in one place for the edit list and the label table.
- Test coverage. Each of these needs tests:
  - the edit split and lock rules;
  - the `?step` → `?field` mapping;
  - the switch fallback;
  - Arabic-digit entry on the new phone and code screens.

## Calls made in this design (not asked of the owner)

- `/login` and `/register` share the phone screen and differ only in the title and the header link.
- Today's brand side panel and photo on the auth pages are dropped for the plain style.
- The app's country-level «التسجيل مغلق مؤقتاً» banner goes. The server's refusal for a new number shows under the phone field instead, so members who only want to sign in never see it.
- The review note («ملاحظة لفريق المراجعة») moves into the save step.
- `?step=N` deep links map to the first field of that old step.
- The driving licence becomes «نعم»/«لا» in edit; a stored `false` is «لا».
- The new website setup resumes at the first short step with an empty required field, not the stored `setupStep` number.
- The shared phone screen always uses the `login` context of `send-otp`, like today's website login.
