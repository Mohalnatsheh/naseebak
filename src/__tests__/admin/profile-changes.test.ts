import { describe, it, expect } from "vitest";
import { buildProfileUpdate } from "@/lib/admin/profile-changes";
import { safePagination, enumParam } from "@/lib/admin/query";

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
