# «الديانة» (religion) on the website: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add «الديانة» (مسلم / مسيحي) and the partner preference (نفس ديانتي / لا مانع) to the website and server behind `religion_enabled`, with a hard matching rule, hidden Muslim-only questions for Christians, and no change at all while the switch is off.

**Architecture:** One db-free helper (`src/lib/profile-religion.ts`, modelled on `profile-sect.ts`) holds the values, `religionOf`, `religionsMatch`, the write-path strip and the "became Christian" clears. Matching adds `religionsMatch` to `mutuallyAcceptable` (and to the legacy branches that skip it), so refresh, sweep, hand-picks and the admin status all follow. Every profile write path strips Muslim-only fields for a Christian and drops `religion`/`prefReligion` while the switch is off; display routes send `religion` only while the switch is on.

**Tech Stack:** Next.js 16, Prisma 7 (Postgres), Zod v4 (`zod/v4`), Vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-11-13-religion-field-design.md` (read it with this plan). The app is out of scope except the option lists the server sends it (Task 2).

## Global Constraints

- Switch: `religion_enabled` in `system_settings`, Admin → Settings, default off. Off = nothing asked, shown or stored; `religion` and `prefReligion` are dropped from every write.
- Stored values, never changed: `religion` `"مسلم"` / `"مسيحي"`; `prefReligion` `"نفس ديانتي"` / `"لا مانع"`. Null religion reads `"مسلم"`, null preference reads `"نفس ديانتي"` everywhere. No backfill.
- Schema: two nullable `String?` columns on `Profile`, additive only. Before deploy: `npx prisma migrate diff --from-config-datasource --to-schema <file> --script` must show only `ADD COLUMN`.
- The matching rule (`religionsMatch`) applies whatever the switch says. Any mixed pair is allowed when both chose «لا مانع» (owner decision: don't "correct" it).
- Muslim-only fields, stripped for and cleared on a Christian: `hijab`, `niqab`, `beard`, `sect`, `prefSect`, `prefHijab`, `prefBeard`; dealbreaker keys `hijab`, `beard`, `sect`. «الالتزام الديني» (`religiosity`, `prefReligiosity`) stays.
- Client components import only `src/lib/profile-religion.ts` / `profile-options.ts` (db-free). Never a runtime import from a module that imports `@/lib/db`.
- Gendered labels go through `selfLabel` / `describeOption` (woman: «مسلمة» / «مسيحية»).
- Copy, exactly: hint under «لا مانع»: «ستظهر لك اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً»; dealbreaker hint: «شروطك الأساسية مثل الحجاب تبقى سارية».
- «الديانة» never counts toward completeness or the missing-field tips.
- `memberSuggestStatus` must keep mirroring `generate`.
- Parallel sessions share this checkout family: stage by path, never `git add -A`. Don't push or deploy; ask the owner before each deploy and before turning the switch on.

## Review Focus

1. **An existing member (both columns null) next to a Christian who chose «لا مانع»:** must never be paired, in the new or the legacy flow. Tests: Task 1 (`religionsMatch`), Task 3 (`mutuallyAcceptable`), Task 4 (legacy branches).
2. **A Lebanese Christian:** the setup must not demand «المذهب», the completeness must not count it, and the filter tips must not nudge hijab, beard or sect. Test: Task 8.
3. **An old app (no `religion` key) saving `hijab: true` or a `hijab` dealbreaker for a stored Christian:** both stripped, nothing stored. Test: Task 5.
4. **A finished member whose religion is null choosing «مسيحي» on the edit page:** goes to review. It is never a direct "fill an empty field" (client split and server `reviewedChanges`). Tests: Task 5 and Task 10.
5. **Switch turned off after Christians exist:** `religion` is no longer accepted or shown, but stored Christians stay apart from «نفس ديانتي» members, and their cards still hide hijab, beard and sect. Tests: Task 3 (rule ignores the switch), Task 5 (keys dropped), Task 9 (masking ignores the switch).

---

### Task 1: Data, helper, option lists, validation

**Files:**
- Modify: `prisma/schema.prisma:333` (after `sect`) and `:361` (after `prefSect`)
- Create: `src/lib/profile-religion.ts`
- Modify: `src/lib/profile-options.ts:20-35` (OPTION_VALUES), `:62-80` (FEMALE SELF labels), add `religionFact`
- Modify: `src/lib/validations/profile.ts:50-51,103,128,197,221,253,265`
- Test: `src/__tests__/profile/religion.test.ts`

**Interfaces:**
- Produces (`src/lib/profile-religion.ts`, db-free, imports only `@/lib/profile-sect`):
  - `RELIGION_MUSLIM = "مسلم"`, `RELIGION_CHRISTIAN = "مسيحي"`, `RELIGION_VALUES = [RELIGION_MUSLIM, RELIGION_CHRISTIAN] as const`, `type Religion`
  - `PREF_RELIGION_SAME = "نفس ديانتي"`, `PREF_RELIGION_ANY = "لا مانع"`, `PREF_RELIGION_VALUES = [SAME, ANY] as const`
  - `MUSLIM_ONLY_FIELDS = ["hijab","niqab","beard","sect","prefSect","prefHijab","prefBeard"] as const`, `MUSLIM_ONLY_DEALBREAKERS = ["hijab","beard","sect"] as const`
  - `type ReligionProfile = { religion?: string | null; prefReligion?: string | null }`
  - `religionOf(p: ReligionProfile | null | undefined): Religion` (anything but `"مسيحي"` → `"مسلم"`)
  - `isChristian(p: ReligionProfile | null | undefined): boolean`
  - `opensToOtherReligion(p: ReligionProfile | null | undefined): boolean` (`prefReligion === "لا مانع"`)
  - `religionsMatch(a, b: ReligionProfile | null | undefined): boolean`
  - `stripMuslimOnlyForChristian<T>(religion: string | null | undefined, data: T): T`: a copy without the Muslim-only fields and dealbreaker keys when `religion === "مسيحي"`; anything else, and non-objects, come back unchanged.
  - `muslimOnlyClears(dealbreakers: readonly string[] | null | undefined): { hijab: null; niqab: null; beard: null; sect: null; prefSect: string[]; prefHijab: null; prefBeard: null; dealbreakers: string[] }`
  - `stripReligionUnlessEnabled<T>(enabled: boolean, data: T): T`: drops `religion` and `prefReligion` when off.
  - `sectAsked(country: unknown, religion: string | null | undefined): boolean` = `sectApplies(country) && religion !== "مسيحي"`
  - `showsDealbreakerHint(religion: string | null | undefined, prefReligion: string | null | undefined, dealbreakers: readonly string[] | null | undefined): boolean`
  - `publicReligionFields(p: (ReligionProfile & { hijab?: boolean | null; niqab?: boolean | null; beard?: boolean | null; sect?: string | null }) | null | undefined, enabled: boolean): { religion: Religion | null; hijab: boolean | null; niqab: boolean | null; beard: boolean | null; sect: string | null }`: `religion` is `religionOf(p)` when enabled, else null. For a Christian, hijab/niqab/beard/sect are null whatever the switch. Otherwise the stored values, with sect through `visibleSect`.
- Produces (`profile-options.ts`): `OPTION_VALUES.religion = RELIGION_VALUES`; FEMALE SELF `religion: { "مسلم": "مسلمة", "مسيحي": "مسيحية" }`; `religionFact(candidate: string | null | undefined, viewer: string | null | undefined, partnerGender: string | null | undefined): string | null`: `describeOption("religion", candidate, partnerGender)` when both are non-null and differ (viewer null reads مسلم, candidate null = switch off → null).
- Produces (zod): `religion: religionEnum.optional()` / `prefReligion: prefReligionEnum.optional()` in `profileSchema` and `profileDraftFields`; `religion: religionEnum.or(z.literal(""))`, `prefReligion: prefReligionEnum` in the update-changes shape. Messages: «قيمة الديانة غير صالحة», «قيمة تفضيل الديانة غير صالحة».

- [ ] **Step 1: Write the failing tests** in `src/__tests__/profile/religion.test.ts`

```ts
describe("religion values", () => {
  it("keeps the stored values", () => {
    expect(RELIGION_VALUES).toEqual(["مسلم", "مسيحي"]);
    expect(PREF_RELIGION_VALUES).toEqual(["نفس ديانتي", "لا مانع"]);
    expect(OPTION_VALUES.religion).toEqual(RELIGION_VALUES);
  });
  it("labels a woman مسلمة / مسيحية", () => {
    expect(selfLabel("religion", "مسيحي", "FEMALE")).toBe("مسيحية");
    expect(describeOption("religion", "مسلم", "FEMALE")).toBe("مسلمة");
    expect(describeOption("religion", "مسيحي", "MALE")).toBe("مسيحي");
  });
});
describe("religionOf / religionsMatch", () => {
  it("reads null as مسلم and نفس ديانتي", () => {
    expect(religionOf(null)).toBe("مسلم");
    expect(religionOf({ religion: null })).toBe("مسلم");
    expect(opensToOtherReligion({ prefReligion: null })).toBe(false);
  });
  it("matches the same religion whatever the preference", () => {
    expect(religionsMatch({}, { religion: "مسلم" })).toBe(true);
    expect(religionsMatch({ religion: "مسيحي" }, { religion: "مسيحي", prefReligion: "لا مانع" })).toBe(true);
  });
  it("matches different religions only when both chose لا مانع", () => {
    const c = { religion: "مسيحي", prefReligion: "لا مانع" };
    expect(religionsMatch({}, c)).toBe(false);                                   // existing member, untouched
    expect(religionsMatch({ prefReligion: "لا مانع" }, { religion: "مسيحي" })).toBe(false);
    expect(religionsMatch({ prefReligion: "لا مانع" }, c)).toBe(true);
    expect(religionsMatch(c, { prefReligion: "لا مانع" })).toBe(true);
  });
});
describe("stripMuslimOnlyForChristian", () => {
  const data = { hijab: true, niqab: false, beard: true, sect: "سني", prefSect: ["سني"], prefHijab: "نعم", prefBeard: "نعم",
    religiosity: "ملتزم", prefReligiosity: ["ملتزم"], dealbreakers: ["age", "hijab", "beard", "sect", "religiosity"] };
  it("drops the Muslim-only answers for a Christian, keeps religiosity", () => {
    expect(stripMuslimOnlyForChristian("مسيحي", data)).toEqual({ religiosity: "ملتزم", prefReligiosity: ["ملتزم"], dealbreakers: ["age", "religiosity"] });
  });
  it("leaves a Muslim (or null) untouched and never mutates", () => {
    expect(stripMuslimOnlyForChristian("مسلم", data)).toEqual(data);
    expect(stripMuslimOnlyForChristian(null, data)).toEqual(data);
    stripMuslimOnlyForChristian("مسيحي", data);
    expect(data.dealbreakers).toHaveLength(5);
  });
  it("passes non-objects through", () => {
    expect(stripMuslimOnlyForChristian("مسيحي", null)).toBeNull();
  });
});
it("muslimOnlyClears nulls the answers and keeps other dealbreakers", () => {
  expect(muslimOnlyClears(["age", "hijab", "sect"])).toEqual({ hijab: null, niqab: null, beard: null, sect: null, prefSect: [], prefHijab: null, prefBeard: null, dealbreakers: ["age"] });
  expect(muslimOnlyClears(null).dealbreakers).toEqual([]);
});
it("stripReligionUnlessEnabled drops both keys only when off", () => {
  const d = { religion: "مسيحي", prefReligion: "لا مانع", city: "عمان" };
  expect(stripReligionUnlessEnabled(false, d)).toEqual({ city: "عمان" });
  expect(stripReligionUnlessEnabled(true, d)).toEqual(d);
});
it("sectAsked: Lebanon and not Christian", () => {
  expect(sectAsked("LB", null)).toBe(true);
  expect(sectAsked("LB", "مسيحي")).toBe(false);
  expect(sectAsked("JO", "مسلم")).toBe(false);
});
it("showsDealbreakerHint: Muslim, لا مانع, a hijab or beard condition", () => {
  expect(showsDealbreakerHint(null, "لا مانع", ["hijab"])).toBe(true);
  expect(showsDealbreakerHint(null, "لا مانع", ["beard", "age"])).toBe(true);
  expect(showsDealbreakerHint(null, "نفس ديانتي", ["hijab"])).toBe(false);
  expect(showsDealbreakerHint(null, "لا مانع", ["age"])).toBe(false);
  expect(showsDealbreakerHint("مسيحي", "لا مانع", ["hijab"])).toBe(false);
});
describe("publicReligionFields", () => {
  it("hides religion while the switch is off, masks a Christian whatever the switch", () => {
    const christian = { religion: "مسيحي", hijab: false, niqab: false, beard: null, sect: "سني" };
    expect(publicReligionFields(christian, false)).toEqual({ religion: null, hijab: null, niqab: null, beard: null, sect: null });
    expect(publicReligionFields(christian, true).religion).toBe("مسيحي");
    expect(publicReligionFields({ hijab: true, niqab: false, sect: "أفضّل عدم الذكر" }, true)).toEqual({ religion: "مسلم", hijab: true, niqab: false, beard: null, sect: null });
  });
});
it("religionFact shows only a different religion", () => {
  expect(religionFact("مسيحي", null, "FEMALE")).toBe("مسيحية");
  expect(religionFact("مسلم", "مسيحي", "MALE")).toBe("مسلم");
  expect(religionFact("مسلم", null, "MALE")).toBeNull();
  expect(religionFact(null, "مسيحي", "MALE")).toBeNull();
});
it("validation accepts the values and refuses others", () => {
  expect(profileSchema.safeParse({ ...base, religion: "مسيحي", prefReligion: "لا مانع" }).success).toBe(true);
  expect(profileSchema.safeParse({ ...base, religion: "يهودي" }).success).toBe(false);
  expect(profileDraftSchema.safeParse({ prefReligion: "كل الأديان" }).success).toBe(false);
  expect(profileUpdateRequestSchema.safeParse({ changes: { religion: "مسيحي" } }).success).toBe(true);
});
```
(`base` = the valid profile body used in `src/__tests__/profile/sect.test.ts` "validation".)

- [ ] **Step 2: Run** `npx vitest run src/__tests__/profile/religion.test.ts`. Expected: FAIL, cannot resolve `@/lib/profile-religion`.
- [ ] **Step 3: Add the columns** to `prisma/schema.prisma`. Add `religion String?` after `sect`, with the doc comment `/// «الديانة»: "مسلم" / "مسيحي"; null reads مسلم (RELIGION_VALUES in src/lib/profile-religion.ts)`. Add `prefReligion String?` after `prefSect`, with the comment `/// "نفس ديانتي" / "لا مانع"; null reads نفس ديانتي`. Then run `DATABASE_URL=postgresql://<user>@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate`.
- [ ] **Step 4: Implement** `src/lib/profile-religion.ts`, the `profile-options.ts` additions and the zod fields with the signatures above.
- [ ] **Step 5: Run** `npx vitest run src/__tests__/profile src/__tests__/lib/profile-options.test.ts src/__tests__/validations/profile.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/profile-religion.ts src/lib/profile-options.ts src/lib/validations/profile.ts src/__tests__/profile/religion.test.ts
git commit -m "Religion: columns, db-free helper, options and validation"
```

### Task 2: The `religion_enabled` switch and what it reaches

**Files:**
- Modify: `src/lib/settings.ts` (next to `getChatDeleteEnabled`, :103)
- Modify: `src/app/api/admin/settings/new-cycle/route.ts:9-35,66,111-113`, `src/components/admin/new-cycle-settings-card.tsx:31-36` + its row list
- Modify: `src/app/api/me/counts/route.ts` (both `NextResponse.json` returns, :65 and :101), `src/contexts/dashboard-context.tsx:38-70` (`CycleCounts`, `EMPTY_COUNTS`)
- Modify: `src/lib/countries/settings.ts:237,279`, `src/app/api/countries/[code]/route.ts:21`
- Test: `src/__tests__/admin/new-cycle-settings.test.ts`, `src/__tests__/admin/new-cycle-settings-card.test.tsx`, `src/__tests__/api/me-counts-religion.test.ts` (mocks copied from `me-counts-pro.test.ts`), `src/__tests__/profile/religion.test.ts`

**Interfaces:**
- Produces: `getReligionEnabled(): Promise<boolean>` (`getSetting("religion_enabled") === "true"`).
- Produces: admin GET/PATCH field `religionEnabled: boolean`; card label `"Religion question («الديانة»)"`.
- Produces: `/api/me/counts` top-level `religionEnabled: boolean` on every 200 answer; `CycleCounts.religionEnabled?: boolean`; `EMPTY_COUNTS.religionEnabled = false`.
- Produces: `publicCountryDetail(s, content, siteUrl, opts: { religion?: boolean } = {})`; `options` gains `religion: RELIGION_VALUES, prefReligion: PREF_RELIGION_VALUES` only when `opts.religion`.

- [ ] **Step 1: Write the failing tests**
  - `new-cycle-settings.test.ts`: `it("reads and saves religion_enabled")`, a copy of the `chat_delete_enabled` test with `religion_enabled` / `religionEnabled`.
  - `new-cycle-settings-card.test.tsx`: add `religionEnabled: true` to the fixture and the row `["Religion question («الديانة»)", "religionEnabled"]` to the table.
  - `me-counts-religion.test.ts`: `it("sends religionEnabled from the switch, also with the intro switch off")`. Set the `religion_enabled` mock to `"true"` and expect `json.religionEnabled === true`. Set it to `"false"` and expect `false`. Check both branches (`flags.introRequests` false and true).
  - `religion.test.ts`: `it("sends the religion lists to the app only while the switch is on")`. `publicCountryDetail(defaultCountrySettings("JO"), content, url)` has no `options.religion`. With `{ religion: true }`, JO, SA and LB all have `options.religion` equal to `RELIGION_VALUES` and `options.prefReligion` equal to `PREF_RELIGION_VALUES`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/admin/new-cycle-settings.test.ts src/__tests__/admin/new-cycle-settings-card.test.tsx src/__tests__/api/me-counts-religion.test.ts src/__tests__/profile/religion.test.ts`. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** as in Interfaces. The countries route reads `getReligionEnabled()` and passes `{ religion }`. Its 60 s public cache stays.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/app/api/admin/settings/new-cycle/route.ts src/components/admin/new-cycle-settings-card.tsx src/app/api/me/counts/route.ts src/contexts/dashboard-context.tsx src/lib/countries/settings.ts "src/app/api/countries/[code]/route.ts" src/__tests__/admin/new-cycle-settings.test.ts src/__tests__/admin/new-cycle-settings-card.test.tsx src/__tests__/api/me-counts-religion.test.ts src/__tests__/profile/religion.test.ts
git commit -m "Religion: religion_enabled switch (admin, counts, app option lists)"
```

### Task 3: Score and the pair rule

**Files:**
- Modify: `src/lib/matching/score.ts:50-75` (`ProfileForScoring`), `:239-254` (sect/hijab/beard items), `:458-462` (`mutuallyAcceptable`)
- Test: `src/__tests__/matching/score.test.ts`, `src/__tests__/matching/dealbreakers.test.ts`

**Interfaces:**
- Consumes: `isChristian`, `religionsMatch` (Task 1).
- Produces: `ProfileForScoring.religion?: string | null`, `prefReligion?: string | null`; `mutuallyAcceptable(a, b)` = today's check `&& religionsMatch(a.profile, b.profile)`. It never reads the switch. `passesDealbreakers` is unchanged.

- [ ] **Step 1: Write the failing tests**
  - `score.test.ts` `it("two compatible Christian profiles reach the minimum")`. Two complete profiles, both `religion: "مسيحي"`, matching age/city/education prefs, no hijab/beard. Expect `calculateCompatibility(man, woman) >= 60`.
  - `score.test.ts` `it("a Christian is not scored down for the skipped Muslim questions")`. A Muslim man with `prefHijab: "نعم"`, `prefReligion: "لا مانع"`. A Christian woman with `prefReligion: "لا مانع"`, a leftover `hijab: false` and `sect: "سني"`, and the man has `prefSect: ["شيعي"]`. Expect `calculateCompatibility(man, woman)` to equal the score for the same woman with `hijab: null, sect: null`. Expect `checkPreferenceMatchDetailed(man.profile, woman.profile, "FEMALE").details.map(d => d.field)` to contain neither `"hijab"` nor `"sect"`.
  - `dealbreakers.test.ts` `it("religion is a hard rule in mutuallyAcceptable")`. `mutuallyAcceptable(muslimNullPrefs, christianOpen)` is false. With both `prefReligion: "لا مانع"` it is true. Two Christians with no preference: true.
  - `dealbreakers.test.ts` `it("a Muslim's hijab condition still excludes a Christian when both opened")`. The man has `prefHijab: "نعم"`, `dealbreakers: ["hijab"]` and «لا مانع». The Christian woman has «لا مانع» and `hijab: null`. Expect false.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/matching/score.test.ts src/__tests__/matching/dealbreakers.test.ts`. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement.** In `checkPreferenceMatchDetailed`, push the sect, hijab and beard items only when `!isChristian(otherProfile)` (the person described). Skipping removes their weight. Add `religionsMatch` to `mutuallyAcceptable`.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/matching src/__tests__/suggestions/refresh.test.ts src/__tests__/suggestions/dealbreaker-sweep.test.ts src/__tests__/admin/suggestion-pair.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/score.ts src/__tests__/matching/score.test.ts src/__tests__/matching/dealbreakers.test.ts
git commit -m "Religion: hard pair rule in mutuallyAcceptable, Muslim-only score items skipped for Christians"
```

### Task 4: Generators, the legacy branches and the admin status

The legacy branches skip `mutuallyAcceptable` (`!mutual || …`), and the admin generate legacy loop never calls it. They get `religionsMatch` directly, so the rule holds with `new_suggestions_flow` off too.

**Files:**
- Modify: `src/lib/matching/auto-suggest.ts:491-493` (`rank`)
- Modify: `src/lib/admin/members-suggest-reason.ts:55-112` (`suitableCandidates`), `:146-183` (`MemberSuggestStatus`)
- Modify: `src/app/api/admin/suggestions/generate/route.ts:120-134` (legacy candidate filter)
- Modify: `src/components/admin/members-suggest-status.tsx`
- Modify: `src/lib/admin/suggestion-pair.ts:82-84` (error text only)
- Test: `src/__tests__/matching/auto-suggest.test.ts`, `src/__tests__/admin/members-suggest-reason.test.ts`, `src/__tests__/admin/generate-suggestions.test.ts`, `src/__tests__/admin/suggestion-pair.test.ts`

**Interfaces:**
- Consumes: `religionsMatch`, `mutuallyAcceptable` (Tasks 1, 3); `passesDealbreakers`.
- Produces: in `rank` and `suitableCandidates`, the filter becomes `mutual ? mutuallyAcceptable(user, c) : religionsMatch(user.profile, c.profile)`.
- Produces: `MemberSuggestStatus.blockedByReligion: number | null`. It is set only with `reason: "no_candidates"`: the candidates that pass the gate, both `passesDealbreakers`, the minimum score, and fail only `religionsMatch`. `suitableCandidates` returns `{ count: number; blockedByReligion: number }`.
- Produces: the admin status line `"«الديانة» keeps N more apart (religion preference)"` when `blockedByReligion > 0`. The `checkSuggestionPair` refusal for a religion-only failure says `"Different religions and one of them wants their own religion (الديانة)"`, otherwise the existing dealbreaker text.

- [ ] **Step 1: Write the failing tests**
  - `auto-suggest.test.ts` `it("never suggests a Christian to a member who kept their own religion, also with shared suggestions off")`. Run once with `mutualSuggestions: true` and once with false. Expect no `suggestion.create` for the pair.
  - `members-suggest-reason.test.ts` `it("names religion when it is the only thing keeping people apart")`. Expect `reason === "no_candidates"` and `blockedByReligion === 1`.
  - `generate-suggestions.test.ts` `it("legacy generate skips pairs of different religions")`. With `mutualSuggestions` off, two eligible users (Muslim, Christian «لا مانع»): expect `count === 0`.
  - `suggestion-pair.test.ts` `it("refuses a mixed pair unless both opened, with the religion message")`. Expect 409 and the error text above.
- [ ] **Step 2: Run** the four files. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/matching src/__tests__/admin`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/auto-suggest.ts src/lib/admin/members-suggest-reason.ts "src/app/api/admin/suggestions/generate/route.ts" src/components/admin/members-suggest-status.tsx src/lib/admin/suggestion-pair.ts src/__tests__/matching/auto-suggest.test.ts src/__tests__/admin/members-suggest-reason.test.ts src/__tests__/admin/generate-suggestions.test.ts src/__tests__/admin/suggestion-pair.test.ts
git commit -m "Religion: legacy generators and admin status follow the religion rule"
```

### Task 5: Member write paths

The effective religion of a write is `body.religion ?? stored.religion`, after the switch strip. Order in each route: `stripSectUnlessLebanon`, then `stripReligionUnlessEnabled`, then `stripMuslimOnlyForChristian(effective, …)`.

**Files:**
- Modify: `src/app/api/profile/route.ts:93-200` (PUT)
- Modify: `src/app/api/profile/draft/route.ts`
- Modify: `src/app/api/profile/update-request/route.ts:15-19` (`PREF_KEYS`), `:54-60`
- Modify: `src/app/api/profile/dealbreakers/route.ts:41-43`
- Test: `src/__tests__/api/profile-put.test.ts`, `src/__tests__/api/profile-draft.test.ts`, `src/__tests__/api/profile-update-request.test.ts`, `src/__tests__/profile/religion-routes.test.ts` (dealbreakers PUT; mocks copied from `sect-routes.test.ts`, plus `@/lib/settings`)

**Interfaces:**
- Consumes: `getReligionEnabled` (Task 2); `religionOf`, `stripReligionUnlessEnabled`, `stripMuslimOnlyForChristian`, `muslimOnlyClears` (Task 1).
- Produces:
  - PUT writes `religion`/`prefReligion` (create: `?? null`; update: `undefined` = unchanged).
  - While the profile is not complete and the effective religion is «مسيحي», PUT and draft merge `muslimOnlyClears(incoming dealbreakers ?? stored.dealbreakers)` into the write.
  - After setup, `reviewedChanges` gets `{ ...existing, religion: religionOf(existing) }`, so a null religion is «مسلم», not empty.
  - `update-request`: `prefReligion` joins `PREF_KEYS` (direct save, not in `LIST_PREFS`). `religion` stays a reviewed change. The strip uses `changes.religion ?? stored.religion`.
  - Dealbreakers PUT reads `religion` with `country` and strips `hijab`/`beard`/`sect` keys for a Christian.

- [ ] **Step 1: Write the failing tests**
  - `profile-put.test.ts`:
    - `it("drops religion and prefReligion while the switch is off")`: no `religion` key in the `profile.upsert` `create`/`update`.
    - `it("a new Christian member's setup clears the Muslim-only answers")`: switch on, stored draft `hijab: true, dealbreakers: ["age","hijab"]`. The body has `religion: "مسيحي"`, `beard: true`, `prefHijab: "نعم"`. Expect `update` to include `religion: "مسيحي", hijab: null, niqab: null, beard: null, prefHijab: null, prefSect: [], dealbreakers: ["age"]`.
    - `it("an old app's hijab answer for a stored Christian is not stored")`: complete profile with `religion: "مسيحي"`, body without `religion` and with `hijab: true`. Expect no `hijab: true` in the write and status 200.
    - `it("a finished member with a null religion cannot switch to مسيحي directly")`: complete profile with `religion: null`, body `religion: "مسيحي"`. Expect 409 with `code: "PROFILE_EDIT_NEEDS_REVIEW"` and `fields` containing `"religion"`. Sending `religion: "مسلم"` gives 200.
  - `profile-draft.test.ts` `it("strips and clears for a Christian during setup")`: same expectations as the setup case, on `profile.upsert`.
  - `profile-update-request.test.ts`:
    - `it("saves prefReligion directly and sends religion to review")`. Expect `profile.upsert` with `{ prefReligion: "لا مانع" }` and `profileUpdateRequest.create` with `changes: { religion: "مسيحي" }`.
    - `it("drops Muslim-only fields from a request that switches to مسيحي")`. Changes `{ religion: "مسيحي", hijab: true }` give request changes `{ religion: "مسيحي" }`.
  - `religion-routes.test.ts` `it("drops the hijab, beard and sect conditions for a Christian")`. Keys `["age","hijab","beard"]` save `["age"]`. For a Muslim they save unchanged.
- [ ] **Step 2: Run** the four files. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** as in Interfaces. `applyNiqabRule` still runs after the strip.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/api src/__tests__/profile`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile/route.ts src/app/api/profile/draft/route.ts src/app/api/profile/update-request/route.ts src/app/api/profile/dealbreakers/route.ts src/__tests__/api/profile-put.test.ts src/__tests__/api/profile-draft.test.ts src/__tests__/api/profile-update-request.test.ts src/__tests__/profile/religion-routes.test.ts
git commit -m "Religion: member write paths strip Muslim-only answers and follow the switch"
```

### Task 6: Admin approval

**Files:**
- Modify: `src/lib/admin/profile-changes.ts` (`STRING_FIELDS`, `buildProfileUpdate`)
- Modify: `src/app/api/admin/profile-requests/route.ts:72-75`
- Test: `src/__tests__/admin/profile-changes.test.ts`

**Interfaces:**
- Produces: `buildProfileUpdate(changes: Record<string, unknown>, current?: { religion?: string | null; dealbreakers?: string[] | null } | null): Record<string, unknown>`.
  - `religion` and `prefReligion` join `STRING_FIELDS` (`""` → null = مسلم).
  - With effective religion «مسيحي» (`changes.religion ?? current.religion`), Muslim-only keys are dropped.
  - When `changes.religion === "مسيحي"`, `muslimOnlyClears(current?.dealbreakers)` is merged in.
- The route reads `profile.findUnique({ where: { userId }, select: { religion: true, dealbreakers: true } })` before building the update. It applies `stripReligionUnlessEnabled(await getReligionEnabled(), changes)` first. `refreshOpenSuggestionsInBackground` stays, which closes unanswered cards that no longer fit and clears the cooldown (`refresh.ts`).

- [ ] **Step 1: Write the failing tests** in `profile-changes.test.ts`
  - `it("approving a switch to مسيحي clears the Muslim-only answers and conditions")`: `buildProfileUpdate({ religion: "مسيحي", city: "إربد" }, { religion: null, dealbreakers: ["age", "hijab"] })` equals `{ religion: "مسيحي", city: "إربد", hijab: null, niqab: null, beard: null, sect: null, prefSect: [], prefHijab: null, prefBeard: null, dealbreakers: ["age"] }`.
  - `it("a Christian's request never sets a Muslim-only answer")`: `buildProfileUpdate({ hijab: true, religiosity: "ملتزم" }, { religion: "مسيحي" })` equals `{ religiosity: "ملتزم" }`.
  - `it("switching back to مسلم clears nothing")`: `buildProfileUpdate({ religion: "مسلم" }, { religion: "مسيحي", dealbreakers: ["age"] })` equals `{ religion: "مسلم" }`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/admin/profile-changes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/admin/profile-changes.test.ts src/__tests__/api/visit-status-and-update-request.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/profile-changes.ts src/app/api/admin/profile-requests/route.ts src/__tests__/admin/profile-changes.test.ts
git commit -m "Religion: admin approval clears Muslim-only answers on a switch to مسيحي"
```

### Task 7: Guard test for write paths

**Files:**
- Create: `src/__tests__/profile/religion-guard.test.ts`

**Interfaces:**
- Consumes: Tasks 5–6 (the routes now mention `stripMuslimOnlyForChristian` or `buildProfileUpdate`).

- [ ] **Step 1: Write the test** `it("every profile write path strips Muslim-only answers for Christians")`. Walk `src/` (as in `src/__tests__/lib/automatic-notifications.test.ts`) for `.ts`/`.tsx` files outside `__tests__` that match `/(db|tx)\.profile\.(update|upsert|updateMany|create)\b/`. Each must contain `stripMuslimOnlyForChristian` or `buildProfileUpdate`, except an allowlist with reasons: `src/app/api/profile/avatar/route.ts` (photo only) and `src/lib/admin/change-gender.ts` (clears hijab/beard itself). Also assert that `src/lib/admin/profile-changes.ts` contains `stripMuslimOnlyForChristian`, and that the allowlist entries still exist (no stale entries).
- [ ] **Step 2: Run** `npx vitest run src/__tests__/profile/religion-guard.test.ts`. Expected: PASS. Then temporarily delete the import line from `dealbreakers/route.ts`, see it FAIL naming that file, and restore it.
- [ ] **Step 3: Commit**

```bash
git add src/__tests__/profile/religion-guard.test.ts
git commit -m "Religion: guard test for profile write paths"
```

### Task 8: Completeness, setup steps and filter tips for Christians

`sectApplies(country)` here becomes `sectAsked(country, profile.religion)`. Hijab and beard tips skip Christians. «الديانة» itself is never counted.

**Files:**
- Modify: `src/lib/profile-completeness.ts:121,145,289,309-324`
- Modify: `src/app/(ar)/dashboard/profile/page.tsx:378` (pass `p.religion`)
- Test: `src/__tests__/profile-completeness.test.ts`, `src/__tests__/missing-setup-steps.test.ts`

**Interfaces:**
- Consumes: `sectAsked`, `isChristian` (Task 1).
- Produces: `emptyFilterFields(profile & { religion?: string | null }, gender, country)` (same return type).

- [ ] **Step 1: Write the failing tests**
  - `missing-setup-steps.test.ts` `it("a Lebanese Christian finishes step 2 without «المذهب»")`: `missingSetupSteps({ country: "LB", profile: { …step 1 filled, maritalStatus, religiosity, religion: "مسيحي" } })` has no step 2.
  - `profile-completeness.test.ts` `it("religion never changes the percentage; a Christian is not missing «المذهب»")`. The same LB profile with `religion` null versus `"مسلم"` gives an equal `total`. A Christian LB profile has no «المذهب» or «المذهب لدى الشريك» in any `missingFields`.
  - `profile-completeness.test.ts` `it("no hijab, beard or sect tip for a Christian")`: `emptyFilterFields({ religion: "مسيحي" }, "FEMALE", "LB").map(f => f.key)` equals `["smokingStatus", "religiosity"]`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/__tests__/profile-completeness.test.ts src/__tests__/missing-setup-steps.test.ts src/__tests__/suggestion-gate.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/profile-completeness.ts "src/app/(ar)/dashboard/profile/page.tsx" src/__tests__/profile-completeness.test.ts src/__tests__/missing-setup-steps.test.ts
git commit -m "Religion: completeness and tips skip Muslim-only questions for Christians"
```

### Task 9: Display APIs

**Files:**
- Modify: `src/lib/suggestions/feed-types.ts:26` (`FeedCandidate`), `src/lib/suggestions/feed.ts:151-173,229,400`
- Modify: `src/app/api/suggestions/route.ts:115,172`, `src/app/api/matches/route.ts:50,169-176`, `src/app/api/interests/received/route.ts:73,146`
- Test: `src/__tests__/profile/religion-routes.test.ts`, `src/__tests__/suggestions/feed.test.ts`

**Interfaces:**
- Consumes: `publicReligionFields` (Task 1), `getReligionEnabled` (Task 2).
- Produces: `FeedCandidate.religion: string | null` (null while the switch is off). `toFeedCandidate(p: Person, religionOn = false)` spreads `publicReligionFields(prof, religionOn)` over `beard`/`hijab`/`niqab`/`sect`/`religion`. `getSuggestionFeed` reads `getReligionEnabled()` once per call. Each of the three routes adds `religion: true` to its profile select, reads the switch once, and maps through `publicReligionFields`. In `matches/route.ts`, each value is still wrapped in `detail()`.

- [ ] **Step 1: Write the failing tests**
  - `religion-routes.test.ts` `it("cards send religion only while the switch is on and mask a Christian's Muslim-only answers")`. With `toFeedCandidate(person({ religion: "مسيحي", hijab: false, sect: "سني" }), true)`, expect `religion === "مسيحي"`, `hijab === null` and `sect === null`. With `false`, `religion === null` and `hijab === null`. A Muslim person with `true` gives `religion === "مسلم"` and keeps `hijab`. `prefReligion` never appears.
  - `feed.test.ts` `it("passes the switch to the cards")`. Mock `getReligionEnabled` to return true and expect `items[0].candidate.religion === "مسلم"`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/__tests__/suggestions src/__tests__/profile src/__tests__/api`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/suggestions/feed-types.ts src/lib/suggestions/feed.ts src/app/api/suggestions/route.ts src/app/api/matches/route.ts src/app/api/interests/received/route.ts src/__tests__/profile/religion-routes.test.ts src/__tests__/suggestions/feed.test.ts
git commit -m "Religion: card APIs send religion behind the switch and mask Christians' Muslim-only answers"
```

### Task 10: Member pages (cards, wizards, edit split, own profile)

**Files:**
- Modify: `src/components/suggestions/candidate-details.tsx:16-40,145-148` (`religion?: string | null`; a «الديانة» row first in «الدين ونمط الحياة»)
- Modify: `src/components/suggestions/mutual-suggestions-view.tsx:904-909`, `src/app/(ar)/dashboard/suggestions/page.tsx:75,118,770,1007`, `src/components/matches/matches-view.tsx:108,650,687` (chip and full-profile row)
- Modify: `src/lib/profile-edit-split.ts:21-25`
- Modify: `src/app/(ar)/dashboard/profile/setup/page.tsx` (form state :88, `sectOn` :140, validation :352-371, payload :441-468, step 2 :731-790, step 3 :860-910)
- Modify: `src/app/(ar)/dashboard/profile/edit/page.tsx` (form :108/:134, load :332/:356, `sectOn` :257, validation :424, step 2 :998-1070, prefs step :1360-1420)
- Modify: `src/components/suggestions/dealbreakers-card.tsx:43,85`
- Modify: `src/app/(ar)/dashboard/profile/page.tsx:376-395,748-790,1034`
- Test: `src/__tests__/lib/profile-edit-split.test.ts`, `src/__tests__/components/candidate-details-sections.test.tsx`

**Interfaces:**
- Consumes: `religionFact`, `selfLabel`, `describeOption` (Task 1); `RELIGION_VALUES`, `PREF_RELIGION_VALUES`, `sectAsked`, `showsDealbreakerHint`, `religionOf`, `MUSLIM_ONLY_DEALBREAKERS` (Task 1); `counts.religionEnabled` (Task 2); `candidate.religion` (Task 9).
- Rules:
  - The question and the preference show only when `counts.religionEnabled`.
  - Card chip: `religionFact(c.religion, religionOf(viewerProfile), partnerGender)` as the **first** of the three chips when non-null, with the `Moon` icon. The full profile (`CandidateDetails`, matches detail) shows `InfoRow label="الديانة"` whenever `c.religion` is non-null.
  - Setup: «الديانة» is required and first in step 2 (error «الديانة مطلوبة»), with no preselected answer. When `form.religion === "مسيحي"`, hide hijab/niqab, beard and «المذهب» (`sectOn = sectAsked(country, form.religion)`), drop them from the payload, and hide the prefHijab/prefBeard/prefSect fields and their dealbreaker toggles in step 3. The preference «الديانة» sits in step 3 with «نفس ديانتي» preselected. The «لا مانع» hint and the dealbreaker hint (`showsDealbreakerHint`) sit under it.
  - Edit: same fields and hiding. The initial `religion` is `religionOf(p)` («مسلم» selected for null), the initial `prefReligion` is `p.prefReligion || "نفس ديانتي"`. Hidden Muslim-only fields are left out of `changes`.
  - `splitProfileEdit`: `religion` always goes to `reviewed`, never `fills`.
  - Dealbreakers card: hide the `MUSLIM_ONLY_DEALBREAKERS` toggles for a Christian.
  - Own profile: «الديانة» (`selfLabel`) and the preference row while the switch is on. Hijab, beard and sect rows hide for a Christian.

- [ ] **Step 1: Write the failing tests**
  - `profile-edit-split.test.ts` `it("a religion change always goes to review, even from an empty column")`: `splitProfileEdit({ religion: "مسيحي", prefReligion: "لا مانع" }, { religion: null })` equals `{ fills: {}, prefs: { prefReligion: "لا مانع" }, reviewed: { religion: "مسيحي" } }`.
  - `candidate-details-sections.test.tsx` `it("shows «الديانة» in the full profile when sent, and no hijab row for a Christian")`. Render with `religion: "مسيحي", hijab: null` for a female candidate: the text «الديانة» and «مسيحية» show, «الحجاب» does not. With `religion: null`, «الديانة» is absent.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the split, `CandidateDetails` and the card chips, then the wizards, the dealbreakers card and the own-profile page by the rules above.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/lib src/__tests__/components src/__tests__/suggestions && npx tsc --noEmit`. Expected: PASS, 0 type errors.
- [ ] **Step 5: Manual check.** Run a production build per CLAUDE.md "Real-flow QA" with `religion_enabled` on locally. Walk these:
  - a fresh sign-up choosing «مسيحي» sees no hijab, beard or sect, and the setup finishes;
  - LB Christian: a fresh sign-up with an LB number finishes without «المذهب»;
  - an existing member's edit page shows «مسلم» selected, and switching sends a review request;
  - with the switch off, none of it shows.
- [ ] **Step 6: Commit**

```bash
git add src/components/suggestions/candidate-details.tsx src/components/suggestions/mutual-suggestions-view.tsx "src/app/(ar)/dashboard/suggestions/page.tsx" src/components/matches/matches-view.tsx src/lib/profile-edit-split.ts "src/app/(ar)/dashboard/profile/setup/page.tsx" "src/app/(ar)/dashboard/profile/edit/page.tsx" src/components/suggestions/dealbreakers-card.tsx "src/app/(ar)/dashboard/profile/page.tsx" src/__tests__/lib/profile-edit-split.test.ts src/__tests__/components/candidate-details-sections.test.tsx
git commit -m "Religion: setup, edit, preferences, cards and own profile on the website"
```

### Task 11: Admin pages, docs, final verification

**Files:**
- Modify: `src/app/(en)/admin/users/[id]/page.tsx:770` (rows `Religion`: `p.religion || "مسلم (not set)"`; `Partner religion`: `p.prefReligion || "نفس ديانتي (not set)"`; the `Sect` row uses `sectAsked(user.country, p.religion)`)
- Modify: `src/app/(en)/admin/profile-requests/page.tsx:33,54` (labels `religion: "Religion"`, `prefReligion: "Pref Religion"`; `"religion"` in `OWN_OPTIONS`)
- Modify: `CLAUDE.md` (one bullet under the switches list and one under "What needs an app version": `religion_enabled` off by default, the rule, the app follows later), `docs/reference/suggestions-and-credits.md` (the religion rule next to «شروط أساسية»)
- Test: `src/__tests__/admin/admin-copy.test.ts` (only if it lists label maps; else none)

- [ ] **Step 1: Implement** the admin rows and labels and the doc lines.
- [ ] **Step 2: Verify the whole branch.** Run `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`. Expected: lint 0 problems, 0 type errors, all tests pass, the build succeeds (it catches a client importing a db module).
- [ ] **Step 3: Check the schema diff** against a local copy of the prod schema state: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`. Expected: only `ALTER TABLE "profiles" ADD COLUMN "religion" TEXT` and `ADD COLUMN "prefReligion" TEXT` (table name as mapped).
- [ ] **Step 4: Commit**

```bash
git add "src/app/(en)/admin/users/[id]/page.tsx" "src/app/(en)/admin/profile-requests/page.tsx" CLAUDE.md docs/reference/suggestions-and-credits.md
git commit -m "Religion: admin views and docs"
```

Deploy (`--db-push`) and turning `religion_enabled` on are the owner's calls, after this branch is reviewed.
