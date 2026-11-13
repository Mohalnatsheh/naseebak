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

describe("empty hijab / beard answered «لا»", () => {
  it("is a direct fill, and the fill body keeps false", () => {
    const blank = { ...stored, hijab: null, beard: null };
    const r = splitProfileEdit({ hijab: false, beard: false }, blank);
    expect(r.fills).toEqual({ hijab: false, beard: false });
    expect(r.reviewed).toEqual({});
    expect(buildFillBody(blank, r.fills)).toMatchObject({ hijab: false, beard: false });
  });
});

describe("hijab and niqab move together", () => {
  it("an empty niqab next to a stored hijab true is a direct fill", () => {
    const r = splitProfileEdit({ niqab: true }, { ...stored, hijab: true, niqab: null });
    expect(r.fills).toEqual({ niqab: true });
    expect(r.reviewed).toEqual({});
  });

  it("«غير محجبة» → «منتقبة» goes to review as one change (hijab and niqab)", () => {
    const r = splitProfileEdit({ hijab: true, niqab: true }, { ...stored, hijab: false, niqab: null });
    expect(r.reviewed).toEqual({ hijab: true, niqab: true });
    expect(r.fills).toEqual({});
  });
});

describe("«الديانة»", () => {
  it("a religion change always goes to review, even from an empty column", () => {
    expect(splitProfileEdit({ religion: "مسيحي", prefReligion: "لا مانع" }, { religion: null })).toEqual({
      fills: {},
      prefs: { prefReligion: "لا مانع" },
      reviewed: { religion: "مسيحي" },
    });
  });
});
