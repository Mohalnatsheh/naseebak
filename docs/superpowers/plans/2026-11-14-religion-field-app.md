# «الديانة» in the app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Flutter app asks, hides, shows and compares «الديانة» (مسلم / مسيحي) and its partner preference
(نفس ديانتي / لا مانع) exactly as the website on `main` does, driven by the server's option lists.

**Architecture:** One db-free Dart helper (`lib/shared/religion.dart`) mirrors `src/lib/profile-religion.ts`. Every
form shows the question only when the member's country detail carries `options.religion` / `options.prefReligion`
(sent only while `religion_enabled` is on), exactly like `options.sect`. Hiding the Muslim-only questions follows the
religion shown (stored, or the one picked on screen), whatever the switch says. Cards compare the candidate's
`religion` (null while the switch is off) with mine, read from `GET /api/profile`.

**Tech Stack:** Flutter / Dart, Riverpod, Dio with the tests' `FakeAdapter`, `flutter_test`.

**Spec:** `docs/superpowers/specs/2026-11-13-religion-field-design.md` (section "App (next version, separate plan)" and
every rule it points to). Behaviour reference: the website on `main` (`src/lib/profile-religion.ts`,
`src/lib/profile-options.ts` `religionFact`, `src/lib/profile-edit-split.ts`, `src/lib/profile-edit-fields.ts`,
`src/lib/suggestions/card-facts.ts`, `src/app/(ar)/dashboard/profile/page.tsx`).

## Global Constraints

- Work in `naseebak_app/` of this worktree (branch `feature/app-religion`). Never push. Stage files by path, never `git add -A`.
- A `flutter run` session is attached to the simulator from this folder: don't stop it; run tests with `flutter test`.
- This needs a **new app version** (setup, edit, preferences and cards are decided in the app). No server change.
- Stored values never change: `religion` ∈ {`"مسلم"`, `"مسيحي"`}, `prefReligion` ∈ {`"نفس ديانتي"`, `"لا مانع"`}.
  Null `religion` reads `"مسلم"`; null `prefReligion` reads `"نفس ديانتي"`.
- Labels: a woman's own / described religion «مسلمة» / «مسيحية»; a man «مسلم» / «مسيحي». Preference labels as stored.
- Question title «الديانة»; preference title «الديانة لدى الشريك». Hints, verbatim:
  - under «لا مانع»: «ستظهر لك اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً»;
  - only for a Muslim with an active hijab or beard «شرط أساسي» and «لا مانع»: «شروطك الأساسية مثل الحجاب تبقى سارية».
- Muslim-only fields (never asked of, sent for or shown for a Christian): `hijab`, `niqab`, `beard`, `sect`,
  `prefSect`, `prefHijab`, `prefBeard`; Muslim-only «شرط أساسي» keys: `hijab`, `beard`, `sect`.
  «مستوى التدين» stays for everyone with its values unchanged.
- Old servers: no `options.religion` / `options.prefReligion`, no `counts.religionEnabled`, no card `religion` →
  nothing about religion shows and nothing new is sent.
- «الديانة» never counts toward completeness (the app shows the server's numbers: add no local nudge).
- App rules (`naseebak_app/CLAUDE.md`): tokens from `core/theme/app_theme.dart` (no raw `fontSize:`, `goldText` on
  light), no opacity layers, `mounted` after every `await`, `flutter analyze` 0 issues, `flutter test` green.
- Before calling it done: `cd naseebak_app && flutter analyze && flutter test`.

## Review Focus

- **A Lebanese Christian saving «تعديل ملفي»:** the stored or shown religion is «مسيحي» and `options.sect` exists; the
  form must not demand «المذهب» («يرجى اختيار المذهب»). Pinned in Task 4.
- **Viewer religion not loaded yet (or `/api/profile` failed):** a card must show no religion fact rather than guess
  «مسلم» and flash a wrong one for a Christian viewer. Pinned in Task 2.
- **A finished member whose stored religion is null opens «تعديل ملفي» and changes something else:** «مسلم» is shown
  picked, and it is never sent as a fill (no `religion` in `PUT /api/profile`, nothing to review). Pinned in Task 4.
- **A religion change waiting for review:** preferences keep showing the hijab/beard/sect questions and their
  «شرط أساسي» (the stored religion is still مسلم; approval clears them). Pinned in Task 5.
- **Switching مسيحي → مسلم on screen before saving:** the hidden rows come back with their stored answers, nothing is
  sent for them. Pinned in Task 4.

---

### Task 1: Religion helpers, labels and the new fields

**Files:**
- Create: `naseebak_app/lib/shared/religion.dart`
- Modify: `naseebak_app/lib/shared/person.dart` (`PersonDetails` + `OptionLabels._femaleSelf`)
- Modify: `naseebak_app/lib/features/home/counts.dart` (`Counts`)
- Test: `naseebak_app/test/religion_test.dart` (new)

**Interfaces:**
- Produces (in `lib/shared/religion.dart`, no imports beyond `person.dart`):
  - `const religionMuslim = 'مسلم'`, `religionChristian = 'مسيحي'`, `prefReligionSame = 'نفس ديانتي'`, `prefReligionAny = 'لا مانع'`
  - `const muslimOnlyFields = {'hijab','niqab','beard','sect','prefSect','prefHijab','prefBeard'}`, `const muslimOnlyDealbreakers = {'hijab','beard','sect'}`
  - `const prefReligionAnyHint`, `const dealbreakersStillApplyHint` (the two hint texts above)
  - `String religionOf(Object? stored)` — `"مسيحي"` only for exactly that value, else `"مسلم"`
  - `bool isChristian(Object? stored)`
  - `Map<String, Object?> withoutMuslimOnly(Object? religion, Map<String, Object?> data)` — for a Christian a copy
    without `muslimOnlyFields` and with a `dealbreakers` list (if present) filtered of `muslimOnlyDealbreakers`; else `data`
  - `List<String> prefReligionHints(Object? religion, String? prefReligion, Iterable<String> activeDealbreakers)`
  - `String? religionFact(String? candidate, String? viewer, {required bool female})` — null when `candidate` is null
    (switch off), when `viewer` is null (not known yet) or when `religionOf` of both is equal; else
    `OptionLabels.describe('religion', religionOf(candidate), female: female)`
  - `PersonDetails.religion` (`String?`, `asString(j['religion'])`)
  - `Counts.religionEnabled` (`bool`, `asBool(j['religionEnabled']) ?? false`)
  - `OptionLabels._femaleSelf['religion'] = {'مسلم': 'مسلمة', 'مسيحي': 'مسيحية'}`

- [ ] **Step 1: Write the failing tests** in `test/religion_test.dart`, group `'religion helpers'`:

```dart
test('religionOf: null and unknown read مسلم', () {
  expect(religionOf(null), 'مسلم');
  expect(religionOf('مسيحي'), 'مسيحي');
  expect(religionOf('x'), 'مسلم');
  expect(isChristian('مسيحي'), isTrue);
  expect(isChristian(null), isFalse);
});
test('withoutMuslimOnly drops the Muslim-only answers for a Christian only', () {
  final data = {'religiosity': 'ملتزم', 'hijab': true, 'niqab': false, 'beard': null, 'sect': 'سني',
      'prefSect': ['سني'], 'prefHijab': 'نعم', 'prefBeard': 'لا', 'dealbreakers': ['age', 'hijab', 'sect']};
  expect(withoutMuslimOnly('مسيحي', data), {'religiosity': 'ملتزم', 'dealbreakers': ['age']});
  expect(withoutMuslimOnly('مسلم', data), data);
  expect(withoutMuslimOnly(null, data), data);
});
test('prefReligionHints', () {
  expect(prefReligionHints('مسلم', 'نفس ديانتي', ['hijab']), isEmpty);
  expect(prefReligionHints('مسلم', 'لا مانع', ['age']), [prefReligionAnyHint]);
  expect(prefReligionHints(null, 'لا مانع', ['beard']), [prefReligionAnyHint, dealbreakersStillApplyHint]);
  expect(prefReligionHints('مسيحي', 'لا مانع', ['hijab']), [prefReligionAnyHint]);
});
test('religionFact shows only a different, known religion', () {
  expect(religionFact('مسيحي', 'مسلم', female: true), 'مسيحية');
  expect(religionFact('مسلم', 'مسيحي', female: true), 'مسلمة');
  expect(religionFact('مسلم', 'مسيحي', female: false), 'مسلم');
  expect(religionFact('مسلم', 'مسلم', female: true), isNull);
  expect(religionFact(null, 'مسيحي', female: true), isNull);
  expect(religionFact('مسيحي', null, female: true), isNull);
});
test('labels, card field and the counts switch', () {
  expect(OptionLabels.describe('religion', 'مسيحي', female: true), 'مسيحية');
  expect(OptionLabels.self('religion', 'مسلم', female: false), 'مسلم');
  expect(PersonDetails.fromJson({'id': 'p', 'firstName': 'هدى', 'religion': 'مسيحي'}).religion, 'مسيحي');
  expect(Counts.fromJson({'flags': {}, 'religionEnabled': true}).religionEnabled, isTrue);
  expect(Counts.fromJson({'flags': {}}).religionEnabled, isFalse);
});
```

- [ ] **Step 2: Run** `cd naseebak_app && flutter test test/religion_test.dart` — Expected: FAIL (missing `religion.dart`).
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `flutter test test/religion_test.dart` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add naseebak_app/lib/shared/religion.dart naseebak_app/lib/shared/person.dart naseebak_app/lib/features/home/counts.dart naseebak_app/test/religion_test.dart
git commit -m "App religion: helpers, labels, card field and counts switch"
```

---

### Task 2: Cards and the full profile

**Files:**
- Modify: `naseebak_app/lib/features/discovery/card_facts.dart` (`cardFacts`)
- Modify: `naseebak_app/lib/shared/widgets/person_details_view.dart`
- Modify: `naseebak_app/lib/features/profile/profile_repository.dart` (new `viewerReligionProvider`)
- Modify: `naseebak_app/lib/features/discovery/suggestion_card.dart`, `naseebak_app/lib/features/discovery/suggestions_screen.dart` (~line 740)
- Modify: `naseebak_app/lib/features/home/widgets/home_suggestion_card.dart` (`HomeSuggestionsCarousel`, `HomeSuggestionCard`)
- Test: `naseebak_app/test/card_facts_test.dart`, `naseebak_app/test/religion_test.dart`

**Interfaces:**
- Consumes: `religionFact`, `religionOf`, `PersonDetails.religion` (Task 1).
- Produces:
  - `cardFacts(PersonDetails p, {required bool female, required String tribeLabel, required bool lebanon, String? viewerReligion})`:
    when `religionFact(p.religion, viewerReligion, female: female)` is non-null it is the FIRST fact,
    `CardFact(key: 'religion', label: 'الديانة', value: …)`, ahead of the eight (as the website's ninth that leads;
    so it survives the short phone's `take(4)` and home's `take(3)`).
  - `final viewerReligionProvider = Provider.autoDispose<String?>(…)`: `religionOf(profile.field('religion'))` once
    `myProfileProvider` has data, null while loading or on error.
  - `SuggestionCard` and `HomeSuggestionCard` take `String? viewerReligion` and pass it to `cardFacts`.
    `SuggestionsScreen` and `HomeSuggestionsCarousel` watch `viewerReligionProvider` only when a shown item's
    `candidate.religion != null` (switch on), so older servers and the existing tests make no extra `/api/profile` call.
  - `PersonDetailsView`: a key fact `'الديانة'` (value `OptionLabels.describe('religion', p.religion!, female: f)`,
    icon `Icons.auto_stories_outlined`) placed just before `'التدين'` whenever `p.religion != null` (full profile:
    always). The `'التدين'` row keeps `Icons.mosque_outlined` except for a Christian, who gets
    `Icons.auto_stories_outlined` (no Islam-specific icon on a Christian's profile).

- [ ] **Step 1: Write the failing tests.** In `card_facts_test.dart`, group `'cardFacts'`:

```dart
test('a different religion leads as a ninth fact; same or unknown shows none', () {
  final c = person({...full, 'religion': 'مسيحي', 'hijab': null, 'niqab': null});
  final f = cardFacts(c, female: true, tribeLabel: 'العشيرة', lebanon: false, viewerReligion: 'مسلم');
  expect(f.first.key, 'religion');
  expect(f.first.label, 'الديانة');
  expect(f.first.value, 'مسيحية');
  expect(keys(f).contains('veil'), isFalse);
  expect(keys(cardFacts(c, female: true, tribeLabel: 'x', lebanon: false, viewerReligion: 'مسيحي')).contains('religion'), isFalse);
  expect(keys(cardFacts(c, female: true, tribeLabel: 'x', lebanon: false)).contains('religion'), isFalse);
  expect(keys(cardFacts(person(full), female: true, tribeLabel: 'x', lebanon: false, viewerReligion: 'مسيحي')).contains('religion'), isFalse);
});
```

  In `card_facts_test.dart` (widget):

```dart
testWidgets('the full profile always shows «الديانة»; a Christian gets no mosque icon', (tester) async {
  await tester.pumpWidget(rtlApp(PersonDetailsView(
      person: person({'religion': 'مسلم', 'religiosity': 'ملتزم'}), female: true, alwaysExpanded: true)));
  expect(find.text('الديانة'), findsOneWidget);
  expect(find.text('مسلمة'), findsOneWidget);
  expect(find.byIcon(Icons.mosque_outlined), findsOneWidget);
  await tester.pumpWidget(rtlApp(PersonDetailsView(
      person: person({'religion': 'مسيحي', 'religiosity': 'ملتزم'}), female: false, alwaysExpanded: true)));
  expect(find.text('مسيحي'), findsOneWidget);
  expect(find.byIcon(Icons.mosque_outlined), findsNothing);
  await tester.pumpWidget(rtlApp(PersonDetailsView(person: person({'religiosity': 'ملتزم'}), female: true, alwaysExpanded: true)));
  expect(find.text('الديانة'), findsNothing);
});
```

  In `religion_test.dart`, group `'cards'`, using `Harness` from `suggestions_flow_test.dart` with
  `items: [{...card('s1'), 'candidate': {'id': 'c-s1', 'firstName': 'أحمد', 'age': 30, 'religion': 'مسيحي'}}]`, `gender: 'FEMALE'`:
  - `'a Muslim viewer sees «الديانة» on a Christian card'`: `/api/profile` answers
    `{'user': {'gender': 'FEMALE', 'profile': {'religion': null}}}` → `find.text('مسيحي')` findsOneWidget.
  - `'no religion fact while my profile cannot be read'`: `/api/profile` answers 500 → `find.text('الديانة')` findsNothing.
  - `'a card without religion never reads my profile'`: default `card('s1')` → `h.adapter.to('GET', '/api/profile')` isEmpty.

- [ ] **Step 2: Run** `flutter test test/card_facts_test.dart test/religion_test.dart` — Expected: FAIL (no `viewerReligion` parameter).
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `flutter test test/card_facts_test.dart test/religion_test.dart test/suggestions_flow_test.dart test/home_rich_test.dart test/candidate_profile_test.dart` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add naseebak_app/lib/features/discovery/card_facts.dart naseebak_app/lib/shared/widgets/person_details_view.dart naseebak_app/lib/features/profile/profile_repository.dart naseebak_app/lib/features/discovery/suggestion_card.dart naseebak_app/lib/features/discovery/suggestions_screen.dart naseebak_app/lib/features/home/widgets/home_suggestion_card.dart naseebak_app/test/card_facts_test.dart naseebak_app/test/religion_test.dart
git commit -m "App religion: shown on cards when it differs, always in the full profile"
```

---

### Task 3: Setup asks «الديانة» and the preference

**Files:**
- Modify: `naseebak_app/lib/features/onboarding/setup_screen.dart`
- Test: `naseebak_app/test/religion_test.dart`

**Interfaces:**
- Consumes: `religionChristian`, `prefReligionSame`, `prefReligionAny`, `prefReligionHints` (Task 1).
- Produces (all private to `_SetupScreenState`): `_religion` (`String?`, prefilled from the draft, no default),
  `_prefReligion` (`String?`, prefilled, default `prefReligionSame` when the list is offered), `_religionOptions =
  lists.option('religion')`, `_prefReligionOptions = lists.option('prefReligion')`.
- Rules:
  - Step 2 («حالتك الاجتماعية», index 1): «الديانة» first, before «مستوى التدين», chips labelled
    `OptionLabels.self('religion', v, female: female)`, required only when `_religionOptions` is not empty (error «الديانة مطلوبة»).
  - «المذهب» is asked, validated and sent only when `_sectOptions.isNotEmpty && _religion != religionChristian`.
  - Step 3 (index 2): «الديانة لدى الشريك» under the age range when `_prefReligionOptions` is not empty, two chips,
    never required; under it the `prefReligionHints(_religion, _prefReligion, const [])` lines in `AppText.labelRegular`, `AppColors.muted`.
  - `_payload` and `_saveDraft`: `religion` in step index 1's fields, `prefReligion` in step index 2's, each only when its list is offered.

- [ ] **Step 1: Write the failing tests** in `religion_test.dart`, group `'setup'`, with a helper
  `religionSetupWith(Map<String, dynamic>? profile, {int? savedStep})` copied from `lebanon_test.dart`'s
  `lbSetupWith` whose LB details add `'religion': ['مسلم', 'مسيحي'], 'prefReligion': ['نفس ديانتي', 'لا مانع']` to `options`:
  - `'step 2: religion is required with no preselected answer'`: savedStep 2, profile with marital/children/religiosity/sect
    → `find.text('الديانة')` findsOneWidget; tap `setup-next` → `find.text('الديانة مطلوبة')` findsOneWidget, still «الخطوة 2 من 3».
  - `'a Christian is not asked «المذهب»; the draft carries religion and no sect'`: savedStep 2, profile
    `{...lbBasics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم'}`; tap «مسيحية» → `find.text('المذهب')`
    findsNothing; tap `setup-next` → «الخطوة 3 من 3» and the single `PATCH /api/profile/draft` body equals
    `{'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم', 'religion': 'مسيحي'}`.
  - `'step 3: «لا مانع» shows its hint and is saved'`: savedStep 3, full step-2 profile with `'religion': 'مسلم'`, ages filled
    → «نفس ديانتي» is selected (ChoiceChip `selected`); tap «لا مانع» → `find.text(prefReligionAnyHint)` findsOneWidget,
    `find.text(dealbreakersStillApplyHint)` findsNothing; tap `setup-next` → `PUT /api/profile` body has
    `'religion': 'مسلم'` and `'prefReligion': 'لا مانع'` (the helper also answers `PUT /api/profile` 200 `{'profile': {}}`).
  - `'no lists (switch off, older server): not asked, not sent'`: `lbSetupWith` from `lebanon_test.dart` → `find.text('الديانة')`
    findsNothing and the saved draft has no `religion` key.

- [ ] **Step 2: Run** `flutter test test/religion_test.dart --plain-name setup` — Expected: FAIL.
- [ ] **Step 3: Implement** the rules above.
- [ ] **Step 4: Run** `flutter test test/religion_test.dart test/lebanon_test.dart test/setup_progress_test.dart test/setup_lists_test.dart` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add naseebak_app/lib/features/onboarding/setup_screen.dart naseebak_app/test/religion_test.dart
git commit -m "App religion: asked in setup, Christians skip «المذهب», partner preference with its hint"
```

---

### Task 4: «تعديل ملفي»

**Files:**
- Modify: `naseebak_app/lib/features/profile/profile_edit_screen.dart`
- Modify: `naseebak_app/lib/features/profile/profile_edit_plan.dart` (`planProfileEdit`)
- Test: `naseebak_app/test/religion_test.dart`

**Interfaces:**
- Consumes: `religionOf`, `isChristian`, `withoutMuslimOnly` (Task 1).
- Produces / rules:
  - `profileFieldLabels['religion'] = 'الديانة'` (also names it in the pending-request banners); `'religion'` joins `requiredChoices`.
  - `editableValues(p)` reads `religion` as `religionOf(p.field('religion'))`, so a null column shows «مسلم» picked and is never a change.
  - `planProfileEdit`: a changed `religion` always goes to `reviewed`, never `fills` (the website's `splitProfileEdit`).
  - The «الديانة» chips (`_choice('religion', lists.option('religion'), labelOf: self('religion', v))`) show first in
    «البيانات الأساسية» only when `lists.option('religion')` is not empty.
  - With the religion on screen («مسيحي», picked or stored, whatever the switch): no «المذهب», no hijab / beard rows,
    no «يرجى اختيار المذهب» check, and `_collect` returns `withoutMuslimOnly(_v['religion'], out)`.
  - Sending is unchanged: `fills` → `PUT /api/profile`, `reviewed` → `POST /api/profile/update-request` (the server
    answers 409 to a direct religion change).

- [ ] **Step 1: Write the failing tests** in `religion_test.dart`, group `'profile edit'`, reusing `openEditor` / `save`
  from `lebanon_test.dart` (copy them) with `relLists` = `lbLists` + `'religion': ['مسلم', 'مسيحي']` in `options`, the
  adapter also answering `POST /api/profile/update-request` 200 `{'message': 'ok', 'requested': true}`:
  - `'a null religion shows «مسلمة» picked and saving another field sends no religion'`: stored `{...storedProfile, 'sect': 'سني'}`
    → `ChoiceChip` with key `religion-مسلم` is `selected`; fill `field-height` with `165`, save → `PUT /api/profile`
    body has no `religion` key, no `POST /api/profile/update-request`.
  - `'choosing «مسيحية» goes to review and drops the Muslim-only answers; «المذهب» is not required'`: stored
    `{...storedProfile, 'sect': null}` (Lebanon, sect missing) → tap `religion-مسيحي` → `find.text('المذهب')` findsNothing,
    `find.byKey(Key('hijab-hijab'))` findsNothing; save → no «يرجى اختيار المذهب», no `PUT /api/profile`, update-request
    `changes` equal `{'religion': 'مسيحي'}`.
  - `'back to «مسلمة» before saving brings the rows back with their stored answers'`: tap `religion-مسيحي` then
    `religion-مسلم` → `hijab-none` chip shown and `selected` (stored `hijab: false`).
  - `'a stored Christian with the switch off keeps the rows hidden'`: `lists` without religion options, stored
    `{...storedProfile, 'religion': 'مسيحي', 'hijab': null}` → `find.text('الديانة')` findsNothing, `hijab-hijab` findsNothing.
  - unit `'planProfileEdit sends a religion change to review'`: `planProfileEdit({'religion': 'مسلم'}, {'religion': 'مسيحي'}).reviewed`
    equals `{'religion': 'مسيحي'}` and `.fills` is empty.

- [ ] **Step 2: Run** `flutter test test/religion_test.dart --plain-name "profile edit"` — Expected: FAIL.
- [ ] **Step 3: Implement** the rules above.
- [ ] **Step 4: Run** `flutter test test/religion_test.dart test/lebanon_test.dart test/account_parity_test.dart test/niqab_test.dart test/profile_required_and_locks_test.dart` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add naseebak_app/lib/features/profile/profile_edit_screen.dart naseebak_app/lib/features/profile/profile_edit_plan.dart naseebak_app/test/religion_test.dart
git commit -m "App religion: profile edit asks it, a change goes to review, Christians skip Muslim-only rows"
```

---

### Task 5: Partner preferences

**Files:**
- Modify: `naseebak_app/lib/features/profile/profile_repository.dart` (`PartnerPrefs`, `savePartnerPrefs`)
- Modify: `naseebak_app/lib/features/profile/preferences_screen.dart` (`PreferencesScreen`, `PreferencesForm`)
- Test: `naseebak_app/test/religion_test.dart`

**Interfaces:**
- Consumes: `isChristian`, `muslimOnlyDealbreakers`, `prefReligionSame`, `prefReligionHints`, `myProfileProvider` (Task 1, existing).
- Produces:
  - `PartnerPrefs.prefReligion` (`String?`, read from `p['prefReligion']`; `GET /api/profile/dealbreakers` doesn't send
    it today, so the screen overlays it from `/api/profile`).
  - `PartnerPrefs.activeDealbreakers({required bool female, bool christian = false})`: a Christian's list never holds `muslimOnlyDealbreakers`.
  - `PartnerPrefs.toChanges({required bool female, bool withSect = false, bool withReligion = false, bool christian = false})`:
    `'prefReligion': prefReligion ?? prefReligionSame` only with `withReligion`; a Christian sends no `prefSect`, `prefHijab`, `prefBeard`.
  - `ProfileRepository.savePartnerPrefs(..., bool withReligion = false, bool christian = false)` passes both through.
  - `PreferencesForm` new params: `List<String> religionOptions = const []` (`options.prefReligion`),
    `String? religion` (STORED religion, from `myProfileProvider`), `String? initialPrefReligion` (stored `prefReligion`).
    `PreferencesScreen` waits for `myProfileProvider` too (skeleton / `ErrorView` like the others).
  - Screen: «الديانة لدى الشريك» first after the banner when `religionOptions` is not empty (two `ChoiceChip`s keyed
    `pref-religion-<value>`, «نفس ديانتي» picked when nothing is stored, no «شرط أساسي»), and under it the lines of
    `prefReligionHints(widget.religion, _prefReligion, _current().activeDealbreakers(...))`.
    For `isChristian(widget.religion)`: no hijab / beard question, no «المذهب».

- [ ] **Step 1: Write the failing tests** in `religion_test.dart`, group `'preferences'`, pumping `PreferencesForm`
  like `lebanon_test.dart`'s `'preferences: the sect question …'` (adapter answering update-request and dealbreakers):
  - `'«لا مانع» shows the hint; the hijab note only with a hijab «شرط أساسي»'`: man (`female: false`),
    `religion: null`, `religionOptions: ['نفس ديانتي', 'لا مانع']`, `initial: PartnerPrefs(ageMin: 24, ageMax: 34, hijab: 'نعم', dealbreakers: {'hijab'})`
    → `pref-religion-نفس ديانتي` selected; tap `pref-religion-لا مانع` → `find.text(prefReligionAnyHint)` and
    `find.text(dealbreakersStillApplyHint)` findOneWidget each; untick `db-hijab` → the second findsNothing; save →
    update-request `changes['prefReligion'] == 'لا مانع'`.
  - `'a Christian: no hijab or sect question, nothing Muslim-only sent'`: man, `religion: 'مسيحي'`, `sectOptions: prefSectOptions`,
    `initial: PartnerPrefs(ageMin: 24, ageMax: 34, dealbreakers: {'age'})` → `find.text('هل تفضل محجبة؟')` and `find.text('المذهب')`
    findNothing; save → `changes` has none of `prefHijab`, `prefBeard`, `prefSect`; dealbreakers `keys == ['age']`.
  - `'a pending change to مسيحي keeps the hijab question (stored religion is مسلم)'`: `religion: 'مسلم'` → `find.text('هل تفضل محجبة؟')` findsOneWidget.
  - `'no prefReligion list (switch off, older server): not shown, not sent'`: `religionOptions` empty → `find.text('الديانة لدى الشريك')`
    findsNothing; save → `changes` has no `prefReligion` key.
  - unit: `PartnerPrefs.fromJson({'prefReligion': 'لا مانع'}).prefReligion == 'لا مانع'`;
    `const PartnerPrefs(hijab: 'نعم', dealbreakers: {'hijab', 'age'}, ageMin: 20).activeDealbreakers(female: false, christian: true)` equals `['age']`.

- [ ] **Step 2: Run** `flutter test test/religion_test.dart --plain-name preferences` — Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `flutter test test/religion_test.dart test/lebanon_test.dart test/preferences_bar_test.dart test/leave_mid_request_test.dart` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add naseebak_app/lib/features/profile/profile_repository.dart naseebak_app/lib/features/profile/preferences_screen.dart naseebak_app/test/religion_test.dart
git commit -m "App religion: partner preference with hints; Christians get no Muslim-only preferences"
```

---

### Task 6: My profile page, app notes, full check

**Files:**
- Modify: `naseebak_app/lib/features/profile/profile_screen.dart`
- Modify: `naseebak_app/CLAUDE.md` (Rules: a «الديانة» bullet next to «المذهب»; "Next version" list)
- Test: `naseebak_app/test/religion_test.dart`

**Interfaces:**
- Consumes: `countsProvider` (`Counts.religionEnabled`), `religionOf`, `isChristian`, `prefReligionSame` (Task 1).
- Rules: with `religionEnabled`, the facts list shows `('الديانة', OptionLabels.self('religion', religionOf(v('religion')), female: female))`
  after «التدين» and `('الديانة لدى الشريك', v('prefReligion') ?? prefReligionSame)`. For `isChristian(p.field('religion'))`
  the «المذهب» and «الحجاب» rows are left out. Missing counts (older server, loading) = switch off.
- CLAUDE.md bullet (one paragraph): «الديانة» (next app version): asked when the country detail's `options` carries
  `religion` (setup step 2, required; edit; a change goes to review) and `prefReligion` (setup step 3, preferences, with
  the two hints); a Christian (shown or stored religion) never sees hijab/niqab, beard, «المذهب» or their preferences
  and «شروط أساسية»; cards show `religion` only when it differs from mine (`viewerReligionProvider`, read from
  `/api/profile` because `/api/mobile/me` and `/api/profile/dealbreakers` don't carry it); the full profile always.

- [ ] **Step 1: Write the failing tests** in `religion_test.dart`, group `'my profile'`, pumping `ProfileScreen` with
  `GET /api/profile`, `GET /api/me/counts` and `GET /api/profile/update-request` (`{'requests': []}`) answered:
  - `'shows «الديانة» and the preference while the switch is on'`: counts `religionEnabled: true`, female profile
    `{...storedProfile, 'religion': null}` → `find.text('مسلمة')` and `find.text('نفس ديانتي')` findOneWidget each.
  - `'a Christian has no sect or hijab row'`: profile `{'religion': 'مسيحي', 'sect': 'سني', 'hijab': true, …}` →
    `find.text('مسيحية')` findsOneWidget, `find.text('المذهب')` and `find.text('الحجاب')` findNothing.
  - `'switch off: no religion rows'`: counts without `religionEnabled` → `find.text('الديانة')` findsNothing.
- [ ] **Step 2: Run** `flutter test test/religion_test.dart --plain-name "my profile"` — Expected: FAIL.
- [ ] **Step 3: Implement** the rules above and add the CLAUDE.md bullet.
- [ ] **Step 4: Run the full check** `cd naseebak_app && flutter analyze && flutter test` — Expected: `No issues found!` and `All tests passed!`.
- [ ] **Step 5: Commit**

```bash
git add naseebak_app/lib/features/profile/profile_screen.dart naseebak_app/CLAUDE.md naseebak_app/test/religion_test.dart
git commit -m "App religion: my profile shows it; app notes"
```

---

## Deliberately not changed

- `PreferencesBar` (`preferences_bar.dart`): it lists stored «شروط أساسية»; the server clears a Christian's
  hijab/beard/sect keys on setup and on approval (`muslimOnlyClears`), so it never holds them.
- Completeness and the strength sections: the app shows the server's numbers, which already leave «الديانة» out.
- `requiredPayload` (`profile_screen.dart`): sends no religion; the server keeps the stored one.
