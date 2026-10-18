import { describe, it, expect } from "vitest";
import { splitProfileEdit, buildFillBody } from "@/lib/profile-edit-split";

const stored = {
  dateOfBirth: "1995-01-15T00:00:00.000Z",
  city: "عمّان",
  nationality: "أردني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  religiosity: "ملتزم",
  prefAgeMin: 22,
  prefAgeMax: 30,
  height: null,
  tribe: "",
  job: "مهندس",
  hijab: false,
};

describe("splitProfileEdit (G20)", () => {
  it("sends empty-field fills directly, prefs directly, stored-value changes to review", () => {
    const r = splitProfileEdit({ height: "170", tribe: "العبادي", job: "طبيب", prefAgeMax: 35, hijab: true }, stored);
    expect(r.fills).toEqual({ height: "170", tribe: "العبادي" });
    expect(r.prefs).toEqual({ prefAgeMax: 35 });
    // false is a stored answer, so changing it is a reviewed edit
    expect(r.reviewed).toEqual({ job: "طبيب", hijab: true });
  });
});

describe("buildFillBody", () => {
  it("resends the stored basics with the fills (numbers as numbers)", () => {
    expect(buildFillBody(stored, { height: "170", tribe: "العبادي" })).toEqual({
      dateOfBirth: "1995-01-15",
      city: "عمّان",
      nationality: "أردني",
      education: "بكالوريوس",
      maritalStatus: "أعزب/عزباء",
      religiosity: "ملتزم",
      prefAgeMin: 22,
      prefAgeMax: 30,
      height: 170,
      tribe: "العبادي",
    });
  });

  it("is null when a stored basic is missing (setup not finished)", () => {
    expect(buildFillBody({ ...stored, city: null }, { tribe: "x" })).toBeNull();
  });
});
