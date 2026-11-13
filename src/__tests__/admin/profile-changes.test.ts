import { describe, it, expect } from "vitest";
import { buildProfileUpdate } from "@/lib/admin/profile-changes";
import { safePagination, enumParam } from "@/lib/admin/query";

describe("buildProfileUpdate religion", () => {
  it("approving a switch to مسيحي clears the Muslim-only answers and conditions", () => {
    expect(
      buildProfileUpdate({ religion: "مسيحي", city: "إربد" }, { religion: null, dealbreakers: ["age", "hijab"] }),
    ).toEqual({
      religion: "مسيحي", city: "إربد", hijab: null, niqab: null, beard: null, sect: null,
      prefSect: [], prefHijab: null, prefBeard: null, dealbreakers: ["age"],
    });
  });
  it("a Christian's request never sets a Muslim-only answer", () => {
    expect(buildProfileUpdate({ hijab: true, religiosity: "ملتزم" }, { religion: "مسيحي" })).toEqual({ religiosity: "ملتزم" });
  });
  it("a request carrying مسيحي and hijab together stores no hijab", () => {
    const d = buildProfileUpdate({ religion: "مسيحي", hijab: true }, { religion: null, dealbreakers: [] });
    expect(d.hijab).toBeNull();
  });
  it("switching back to مسلم clears nothing", () => {
    expect(buildProfileUpdate({ religion: "مسلم" }, { religion: "مسيحي", dealbreakers: ["age"] })).toEqual({ religion: "مسلم" });
  });
  it("a Muslim with null religion behaves as before, niqab rule included", () => {
    expect(buildProfileUpdate({ niqab: true }, { religion: null })).toEqual({ niqab: true, hijab: true });
  });
});

describe("buildProfileUpdate", () => {
  it("applies willingToRelocate and the other edit-form fields", () => {
    const data = buildProfileUpdate({
      willingToRelocate: "نعم",
      skinColor: "حنطي",
      fieldOfStudy: "هندسة",
      height: "172",
      prefCity: ["عمان"],
      prefHijab: "نعم",
      hijab: true,
      dateOfBirth: "1995-04-01",
    });
    expect(data).toMatchObject({
      willingToRelocate: "نعم",
      skinColor: "حنطي",
      fieldOfStudy: "هندسة",
      height: 172,
      prefCity: ["عمان"],
      prefHijab: "نعم",
      hijab: true,
    });
    expect(data.dateOfBirth).toBeInstanceOf(Date);
  });

  it("maps cleared values to null (childrenCount to 0) instead of NaN", () => {
    expect(
      buildProfileUpdate({ height: "", weight: "", childrenCount: "", job: "", aboutMe: "  ", prefAgeMin: "" })
    ).toEqual({ height: null, weight: null, childrenCount: 0, job: null, aboutMe: null, prefAgeMin: null });
  });

  it("ignores unknown fields and an empty birth date", () => {
    expect(buildProfileUpdate({ userId: "x", isComplete: true, dateOfBirth: "", parentName: "x" })).toEqual({});
  });
});

describe("buildProfileUpdate — niqab", () => {
  it("applies niqab and keeps the hijab invariant", () => {
    expect(buildProfileUpdate({ niqab: true })).toEqual({ niqab: true, hijab: true });
    expect(buildProfileUpdate({ hijab: false })).toEqual({ hijab: false, niqab: false });
    expect(buildProfileUpdate({ niqab: false })).toEqual({ niqab: false });
    expect(buildProfileUpdate({ hijab: true })).toEqual({ hijab: true });
  });
});

describe("query helpers", () => {
  it("falls back to page 1 on bad values", () => {
    expect(safePagination(new URLSearchParams("page=abc"), 20)).toEqual({ page: 1, pageSize: 20, skip: 0 });
    expect(safePagination(new URLSearchParams("page=-2"), 20).page).toBe(1);
    expect(safePagination(new URLSearchParams("page=3"), 20).skip).toBe(40);
  });

  it("only accepts known enum values", () => {
    expect(enumParam("OPEN", ["OPEN", "CLOSED"] as const)).toBe("OPEN");
    expect(enumParam("bogus", ["OPEN", "CLOSED"] as const)).toBeUndefined();
    expect(enumParam(null, ["OPEN"] as const)).toBeUndefined();
  });
});
