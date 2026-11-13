import { describe, it, expect } from "vitest";
import { EDIT_SECTIONS, editField, fieldForOldStep, prefReligionHints } from "@/lib/profile-edit-fields";
import { PREF_AGE_MAX } from "@/lib/validations/profile";

/** Every key today's edit page saves (`ProfileForm` in the legacy edit page, minus the form-only `jobCustom`
 * and the guardian fields, which save through /api/profile/parent-info and are not in the list). */
const LEGACY_EDIT_KEYS = [
  "dateOfBirth", "city", "area", "nationality", "education", "job", "height", "weight", "skinColor",
  "incomeRange", "childrenCount", "willingToRelocate", "maritalStatus", "religiosity", "sect", "hijab", "niqab",
  "beard", "smokingStatus", "cookingAbility", "drivingLicense", "aboutMe", "partnerExpectations", "hobbies",
  "familyValues", "tribe", "familyOriginArea", "numberOfSiblings", "housingType", "monthlyExpenses",
  "healthConditions", "prefAgeMin", "prefAgeMax", "prefCity", "prefEducation", "prefMaritalStatus", "prefHijab",
  "prefBeard", "prefReligiosity", "prefSect", "prefSmokingStatus", "prefChildrenAcceptance", "religion", "prefReligion",
];

const allKeys = () => EDIT_SECTIONS.flatMap((s) => s.fields.flatMap((f) => [f.key, ...(f.companions ?? [])]));

describe("EDIT_SECTIONS", () => {
  it("includes fieldOfStudy, interests, lifestyle and every key of the legacy edit page", () => {
    const keys = new Set(allKeys());
    for (const k of [...LEGACY_EDIT_KEYS, "fieldOfStudy", "interests", "lifestyle"]) expect(keys, k).toContain(k);
  });

  it("lists each key once", () => {
    const keys = allKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has the six sections in order", () => {
    expect(EDIT_SECTIONS.map((s) => s.id)).toEqual(["basics", "work", "life", "about", "family", "prefs"]);
  });

  it("asks the driving licence as yes/no", () => {
    expect(editField("drivingLicense")?.control).toBe("yesNo");
  });

  it("keeps hijab and niqab together, and area with the city", () => {
    expect(editField("hijab")?.companions).toContain("niqab");
    expect(editField("city")?.companions).toContain("area");
  });

  it("gives each preference with a «شرط أساسي» its key", () => {
    expect(editField("prefAgeMin")?.dealbreaker).toBe("age");
    expect(editField("prefCity")?.dealbreaker).toBe("city");
    expect(editField("prefSect")?.dealbreaker).toBe("sect");
    expect(editField("prefChildrenAcceptance")?.dealbreaker).toBe("children");
  });

  it("only puts pref* keys in the prefs section", () => {
    const prefs = EDIT_SECTIONS.find((s) => s.id === "prefs")!;
    expect(prefs.fields.every((f) => f.key.startsWith("pref"))).toBe(true);
    const others = EDIT_SECTIONS.filter((s) => s.id !== "prefs").flatMap((s) => s.fields);
    expect(others.some((f) => f.key.startsWith("pref"))).toBe(false);
  });

  it("titles the preferences section «تفضيلات الشريك»", () => {
    expect(EDIT_SECTIONS.find((s) => s.id === "prefs")?.title).toBe("تفضيلات الشريك");
  });

  it("caps the partner age range at the server's PREF_AGE_MAX", () => {
    expect(editField("prefAgeMin")?.max).toBe(PREF_AGE_MAX);
    expect(editField("prefAgeMax")?.max).toBe(PREF_AGE_MAX);
  });

  it("sect only shows for LB", () => {
    const sect = editField("sect")!;
    expect(sect.showIf?.({ gender: "MALE", country: "LB", profile: {} })).toBe(true);
    expect(sect.showIf?.({ gender: "MALE", country: "JO", profile: {} })).toBe(false);
    expect(sect.showIf?.({ gender: "FEMALE", country: "SA", profile: {} })).toBe(false);
    const prefSect = editField("prefSect")!;
    expect(prefSect.showIf?.({ gender: "FEMALE", country: "LB", profile: {} })).toBe(true);
    expect(prefSect.showIf?.({ gender: "FEMALE", country: "JO", profile: {} })).toBe(false);
  });

  it("asks hijab of women and beard of men", () => {
    expect(editField("hijab")!.showIf?.({ gender: "FEMALE", country: "JO", profile: {} })).toBe(true);
    expect(editField("hijab")!.showIf?.({ gender: "MALE", country: "JO", profile: {} })).toBe(false);
    expect(editField("beard")!.showIf?.({ gender: "MALE", country: "JO", profile: {} })).toBe(true);
    expect(editField("prefHijab")!.showIf?.({ gender: "MALE", country: "JO", profile: {} })).toBe(true);
    expect(editField("prefBeard")!.showIf?.({ gender: "MALE", country: "JO", profile: {} })).toBe(false);
  });

  it("hides the children count for a single member", () => {
    const f = editField("childrenCount")!;
    expect(f.showIf?.({ gender: "MALE", country: "JO", profile: { maritalStatus: "أعزب/عزباء" } })).toBe(false);
    expect(f.showIf?.({ gender: "MALE", country: "JO", profile: { maritalStatus: "مطلق/مطلقة" } })).toBe(true);
  });

  it("labels options for the member's own gender and country", () => {
    const rel = editField("religiosity")!.options!({ gender: "FEMALE", country: "JO" });
    expect(rel.find((o) => o.value === "ملتزم")?.label).toBe("ملتزمة");
    const jobs = editField("job")!.options!({ gender: "MALE", country: "JO" }).map((o) => o.value);
    expect(jobs).not.toContain("ربة منزل");
    const income = editField("incomeRange")!.options!({ gender: "MALE", country: "SA" }).map((o) => o.value);
    expect(income[0]).toContain("ر.س");
    expect(editField("tribe")!.label("MALE", "SA")).toBe("القبيلة أو الأسرة");
    expect(editField("tribe")!.label("MALE")).toBe("العشيرة");
  });
});

describe("«الديانة» (religion_enabled)", () => {
  type Ctx = { gender: "MALE" | "FEMALE"; country: string; religionEnabled?: boolean; profile: Record<string, unknown> };
  const shownKeys = (ctx: Ctx) => EDIT_SECTIONS.flatMap((s) => s.fields).filter((f) => !f.showIf || f.showIf(ctx)).map((f) => f.key);
  const MUSLIM_ONLY_ROWS = ["hijab", "beard", "sect", "prefSect", "prefHijab", "prefBeard"];

  it("shows religion and prefReligion only while the switch is on", () => {
    const off = shownKeys({ gender: "MALE", country: "JO", profile: {} });
    expect(off).not.toContain("religion");
    expect(off).not.toContain("prefReligion");
    expect(shownKeys({ gender: "MALE", country: "JO", religionEnabled: false, profile: {} })).not.toContain("religion");
    const on = shownKeys({ gender: "MALE", country: "JO", religionEnabled: true, profile: {} });
    expect(on).toContain("religion");
    expect(on).toContain("prefReligion");
  });

  it("puts religion in «البيانات الأساسية» before marital status and prefReligion in the partner's preferences", () => {
    const basics = EDIT_SECTIONS.find((s) => s.id === "basics")!.fields.map((f) => f.key);
    expect(basics.indexOf("religion")).toBe(basics.indexOf("maritalStatus") - 1);
    expect(EDIT_SECTIONS.find((s) => s.id === "prefs")!.fields.map((f) => f.key)).toContain("prefReligion");
    expect(editField("religion")!.required).toBe(true);
    expect(editField("prefReligion")!.dealbreaker).toBeUndefined();
  });

  it("labels religion for the member's own gender and offers the partner's two choices", () => {
    expect(editField("religion")!.options!({ gender: "FEMALE", country: "JO" })).toEqual([
      { value: "مسلم", label: "مسلمة" },
      { value: "مسيحي", label: "مسيحية" },
    ]);
    expect(editField("religion")!.options!({ gender: "MALE", country: "JO" }).map((o) => o.label)).toEqual(["مسلم", "مسيحي"]);
    expect(editField("prefReligion")!.options!({ gender: "MALE", country: "JO" }).map((o) => o.value)).toEqual(["نفس ديانتي", "لا مانع"]);
    // A stored null reads «مسلم» / «نفس ديانتي»
    expect(editField("religion")!.storedDefault).toBe("مسلم");
    expect(editField("prefReligion")!.storedDefault).toBe("نفس ديانتي");
  });

  it("hides the Muslim-only rows for a Christian, whatever the switch", () => {
    for (const religionEnabled of [true, false]) {
      for (const gender of ["MALE", "FEMALE"] as const) {
        const christian = shownKeys({ gender, country: "LB", religionEnabled, profile: { religion: "مسيحي" } });
        for (const k of MUSLIM_ONLY_ROWS) expect(christian, `${gender} ${k}`).not.toContain(k);
      }
    }
    // A Muslim (or a null religion) in Lebanon keeps them
    const woman = shownKeys({ gender: "FEMALE", country: "LB", religionEnabled: true, profile: { religion: null } });
    expect(woman).toEqual(expect.arrayContaining(["hijab", "sect", "prefSect", "prefBeard"]));
    const man = shownKeys({ gender: "MALE", country: "LB", religionEnabled: true, profile: { religion: "مسلم" } });
    expect(man).toEqual(expect.arrayContaining(["beard", "sect", "prefSect", "prefHijab"]));
  });

  it("gives prefReligion the legacy hint lines", () => {
    const hints = editField("prefReligion")!.hints!;
    const base = { gender: "MALE" as const, country: "JO", religionEnabled: true };
    expect(hints({ ...base, profile: { religion: "مسلم", prefReligion: "نفس ديانتي" }, dealbreakers: ["hijab"] })).toEqual([]);
    expect(hints({ ...base, profile: { religion: "مسلم", prefReligion: null }, dealbreakers: ["hijab"] })).toEqual([]);
    expect(hints({ ...base, profile: { religion: "مسلم", prefReligion: "لا مانع" }, dealbreakers: [] })).toEqual([
      "ستظهر لك اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً",
    ]);
    expect(hints({ ...base, profile: { religion: null, prefReligion: "لا مانع" }, dealbreakers: ["hijab"] })).toEqual([
      "ستظهر لك اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً",
      "شروطك الأساسية مثل الحجاب تبقى سارية",
    ]);
    // A Christian has no hijab or beard condition
    expect(prefReligionHints("مسيحي", "لا مانع", ["beard"])).toEqual(["ستظهر لك اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً"]);
  });
});

describe("fieldForOldStep", () => {
  it("maps ?step=N to the first field of that old wizard step", () => {
    expect(fieldForOldStep(1)).toBe("dateOfBirth");
    expect(fieldForOldStep(2)).toBe("maritalStatus");
    // Step 3 was the partner preferences: every ?step=3 link means them
    expect(fieldForOldStep(3)).toBe("prefAgeMin");
    expect(fieldForOldStep(4)).toBe("tribe");
    // Step 5: the guardian row
    expect(fieldForOldStep(5)).toBe("parentName");
    expect(fieldForOldStep(9)).toBeNull();
    expect(fieldForOldStep(0)).toBeNull();
    expect(fieldForOldStep(Number.NaN)).toBeNull();
  });
});
