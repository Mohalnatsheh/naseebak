import { describe, it, expect } from "vitest";
import { ageRangesFit, type UserForScoring } from "@/lib/matching/score";

const YEAR = 365.25 * 24 * 60 * 60 * 1000;
/** Born `age` years and a half ago, so the computed age is exactly `age` */
const born = (age: number) => new Date(Date.now() - (age + 0.5) * YEAR);

const member = (id: string, gender: "MALE" | "FEMALE", age: number | null, min: number | null, max: number | null): UserForScoring => ({
  id,
  gender,
  profile: { dateOfBirth: age === null ? null : born(age), prefAgeMin: min, prefAgeMax: max },
});

describe("ageRangesFit", () => {
  it("fits when each is inside the other's range", () => {
    expect(ageRangesFit(member("w", "FEMALE", 25, 26, 35), member("m", "MALE", 30, 20, 30))).toBe(true);
  });

  it("fails when he is outside her range (she 25 wants 28–35, he 24)", () => {
    expect(ageRangesFit(member("w", "FEMALE", 25, 28, 35), member("m", "MALE", 24, 18, 30))).toBe(false);
  });

  it("fails when she is outside his range (he wants 20–30, she 32)", () => {
    expect(ageRangesFit(member("m", "MALE", 34, 20, 30), member("w", "FEMALE", 32, 25, 40))).toBe(false);
  });

  it("is symmetric", () => {
    const a = member("w", "FEMALE", 25, 28, 35);
    const b = member("m", "MALE", 24, 18, 30);
    expect(ageRangesFit(b, a)).toBe(ageRangesFit(a, b));
  });

  it("treats empty bounds as open", () => {
    expect(ageRangesFit(member("w", "FEMALE", 25, null, null), member("m", "MALE", 60, null, null))).toBe(true);
  });

  it("respects a single bound", () => {
    expect(ageRangesFit(member("w", "FEMALE", 25, 30, null), member("m", "MALE", 29, null, null))).toBe(false);
    expect(ageRangesFit(member("w", "FEMALE", 25, null, 30), member("m", "MALE", 31, null, null))).toBe(false);
    expect(ageRangesFit(member("w", "FEMALE", 25, null, 30), member("m", "MALE", 30, null, null))).toBe(true);
  });

  it("fails a set bound when the other's age is unknown", () => {
    expect(ageRangesFit(member("w", "FEMALE", 25, 26, 35), member("m", "MALE", null, null, null))).toBe(false);
  });

  it("an unknown age passes when the other set no bound", () => {
    expect(ageRangesFit(member("w", "FEMALE", 25, null, null), member("m", "MALE", null, null, null))).toBe(true);
  });

  it("is false without a profile", () => {
    expect(ageRangesFit({ id: "x", gender: "MALE", profile: null }, member("w", "FEMALE", 25, null, null))).toBe(false);
  });
});
