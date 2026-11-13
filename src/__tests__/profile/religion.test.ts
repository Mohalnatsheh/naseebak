import { describe, it, expect } from "vitest";
import {
  PREF_RELIGION_VALUES,
  RELIGION_VALUES,
  muslimOnlyClears,
  opensToOtherReligion,
  publicReligionFields,
  religionOf,
  religionsMatch,
  sectAsked,
  showsDealbreakerHint,
  stripMuslimOnlyForChristian,
  stripReligionUnlessEnabled,
} from "@/lib/profile-religion";
import { describeOption, OPTION_VALUES, religionFact, selfLabel } from "@/lib/profile-options";
import { profileDraftSchema, profileSchema, profileUpdateRequestSchema } from "@/lib/validations/profile";

const base = {
  dateOfBirth: "1995-01-15",
  city: "بيروت",
  nationality: "لبناني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  religiosity: "ملتزم",
  prefAgeMin: 22,
  prefAgeMax: 30,
};

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
    expect(religionsMatch({}, c)).toBe(false);
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
