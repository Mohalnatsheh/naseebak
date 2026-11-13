import { describe, it, expect } from "vitest";
import { EDIT_SECTIONS, editField, fieldForOldStep } from "@/lib/profile-edit-fields";

/** Every key today's edit page saves (`ProfileForm` in the legacy edit page, minus the form-only `jobCustom`
 * and the guardian fields, which save through /api/profile/parent-info and are not in the list). */
const LEGACY_EDIT_KEYS = [
  "dateOfBirth", "city", "area", "nationality", "education", "job", "height", "weight", "skinColor",
  "incomeRange", "childrenCount", "willingToRelocate", "maritalStatus", "religiosity", "sect", "hijab", "niqab",
  "beard", "smokingStatus", "cookingAbility", "drivingLicense", "aboutMe", "partnerExpectations", "hobbies",
  "familyValues", "tribe", "familyOriginArea", "numberOfSiblings", "housingType", "monthlyExpenses",
  "healthConditions", "prefAgeMin", "prefAgeMax", "prefCity", "prefEducation", "prefMaritalStatus", "prefHijab",
  "prefBeard", "prefReligiosity", "prefSect", "prefSmokingStatus", "prefChildrenAcceptance",
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

describe("fieldForOldStep", () => {
  it("maps ?step=N to the first field of that old wizard step", () => {
    expect(fieldForOldStep(1)).toBe("dateOfBirth");
    expect(fieldForOldStep(2)).toBe("maritalStatus");
    expect(fieldForOldStep(3)).toBe("aboutMe");
    expect(fieldForOldStep(4)).toBe("tribe");
    expect(fieldForOldStep(5)).toBeNull();
    expect(fieldForOldStep(9)).toBeNull();
    expect(fieldForOldStep(0)).toBeNull();
    expect(fieldForOldStep(Number.NaN)).toBeNull();
  });
});
