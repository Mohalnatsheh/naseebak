import { describe, it, expect } from "vitest";
import { mutuallyAcceptable, passesDealbreakers } from "@/lib/matching/score";

const yearsAgo = (n: number) => new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000 - 86400000);

describe("passesDealbreakers", () => {
  it("passes when the owner has no dealbreakers", () => {
    expect(passesDealbreakers({ prefAgeMin: 25, prefAgeMax: 30 }, { dateOfBirth: yearsAgo(40) }, "FEMALE")).toBe(true);
  });

  it("fails an age dealbreaker outside the range", () => {
    const owner = { prefAgeMin: 25, prefAgeMax: 30, dealbreakers: ["age"] };
    expect(passesDealbreakers(owner, { dateOfBirth: yearsAgo(35) }, "FEMALE")).toBe(false);
    expect(passesDealbreakers(owner, { dateOfBirth: yearsAgo(28) }, "FEMALE")).toBe(true);
  });

  it("fails when the other value is missing", () => {
    expect(passesDealbreakers({ prefAgeMin: 25, dealbreakers: ["age"] }, {}, "FEMALE")).toBe(false);
    expect(passesDealbreakers({ prefSmokingStatus: ["غير مدخن"], dealbreakers: ["smokingStatus"] }, {}, "MALE")).toBe(false);
  });

  it("ignores a dealbreaker whose preference is empty", () => {
    expect(passesDealbreakers({ prefSmokingStatus: [], dealbreakers: ["smokingStatus"] }, { smokingStatus: "مدخن" }, "MALE")).toBe(true);
  });

  it("checks list preferences", () => {
    const owner = { prefCity: ["عمان", "إربد"], dealbreakers: ["city"] };
    expect(passesDealbreakers(owner, { city: "الزرقاء" }, "MALE")).toBe(false);
    expect(passesDealbreakers(owner, { city: "إربد" }, "MALE")).toBe(true);
  });

  it("applies hijab only to women and beard only to men", () => {
    const owner = { prefHijab: "yes", prefBeard: "yes", dealbreakers: ["hijab", "beard"] };
    expect(passesDealbreakers(owner, { hijab: false, beard: true }, "MALE")).toBe(true);
    expect(passesDealbreakers(owner, { hijab: false }, "FEMALE")).toBe(false);
    expect(passesDealbreakers(owner, { beard: false }, "MALE")).toBe(false);
  });

  it("fails no_children against someone with children", () => {
    const owner = { prefChildrenAcceptance: "no_children", dealbreakers: ["children"] };
    expect(passesDealbreakers(owner, { childrenCount: 2 }, "FEMALE")).toBe(false);
    expect(passesDealbreakers(owner, { childrenCount: 0 }, "FEMALE")).toBe(true);
    expect(passesDealbreakers({ prefChildrenAcceptance: "accept_children", dealbreakers: ["children"] }, { childrenCount: 2 }, "FEMALE")).toBe(true);
  });

  it("ignores unknown keys", () => {
    expect(passesDealbreakers({ dealbreakers: ["height"] }, {}, "MALE")).toBe(true);
  });
});

describe("mutuallyAcceptable", () => {
  const a = { id: "a", gender: "MALE", profile: { city: "عمان", prefCity: ["عمان"], dealbreakers: ["city"] } };
  it("needs both sides to pass", () => {
    const b = { id: "b", gender: "FEMALE", profile: { city: "عمان", smokingStatus: null, prefSmokingStatus: ["غير مدخن"], dealbreakers: ["smokingStatus"] } };
    expect(mutuallyAcceptable(a, b)).toBe(false);
    const b2 = { ...b, profile: { ...b.profile, dealbreakers: [] } };
    expect(mutuallyAcceptable(a, b2)).toBe(true);
  });
  it("is false without profiles", () => {
    expect(mutuallyAcceptable(a, { id: "b", gender: "FEMALE", profile: null })).toBe(false);
  });
});
