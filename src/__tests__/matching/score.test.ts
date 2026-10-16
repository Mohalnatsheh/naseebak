import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  checkPreferenceMatch,
  profileQualityScore,
  calculateCompatibility,
  type ProfileForScoring,
  type UserForScoring,
} from "@/lib/matching/score";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const vec = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 2);
  });

  it("returns 0.5 for orthogonal vectors", () => {
    // Orthogonal vectors have dot product 0, so (0 + 1) / 2 = 0.5
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.5, 2);
  });

  it("returns 0 for opposite vectors", () => {
    const vecA = [1, 1, 1];
    const vecB = [-1, -1, -1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0, 2);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("checkPreferenceMatch", () => {
  const baseProfile = {
    dateOfBirth: "1995-01-01",
    city: "عمان",
    education: "بكالوريوس",
    maritalStatus: "أعزب",
    religiosity: "متدين",
    smokingStatus: "غير مدخن",
    hijab: true,
    beard: false,
    childrenCount: 0,
  };

  it("returns 1 when no preferences are set", () => {
    const profileWithNoPrefs = {};
    const score = checkPreferenceMatch(profileWithNoPrefs, baseProfile, "FEMALE");
    expect(score).toBe(1);
  });

  it("returns 1 when all preferences match", () => {
    const profileWithPrefs = {
      prefAgeMin: 25,
      prefAgeMax: 35,
      prefCity: ["عمان"],
      prefEducation: ["بكالوريوس"],
      prefMaritalStatus: ["أعزب"],
      prefReligiosity: ["متدين"],
      prefSmokingStatus: ["غير مدخن"],
    };
    const score = checkPreferenceMatch(profileWithPrefs, baseProfile, "FEMALE");
    expect(score).toBe(1);
  });

  it("returns 0 when no preferences match", () => {
    const profileWithPrefs = {
      prefCity: ["إربد"],
      prefEducation: ["دكتوراه"],
      prefMaritalStatus: ["مطلق"],
    };
    const score = checkPreferenceMatch(profileWithPrefs, baseProfile, "FEMALE");
    expect(score).toBe(0);
  });

  it("returns partial score when some preferences match", () => {
    const profileWithPrefs = {
      prefCity: ["عمان"],
      prefEducation: ["دكتوراه"],
    };
    const score = checkPreferenceMatch(profileWithPrefs, baseProfile, "FEMALE");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("handles age range check correctly", () => {
    const profileWithAgePrefs = {
      prefAgeMin: 20,
      prefAgeMax: 25,
    };
    // Person born 1995-01-01 would be about 31 in 2026
    const score = checkPreferenceMatch(profileWithAgePrefs, baseProfile, "FEMALE");
    expect(score).toBe(0); // 31 is outside 20-25 range
  });

  it("handles hijab preference for men", () => {
    const maleProfile = {
      prefHijab: "yes",
    };
    const femaleWithHijab = { hijab: true };
    const femaleWithoutHijab = { hijab: false };

    expect(checkPreferenceMatch(maleProfile, femaleWithHijab, "FEMALE")).toBe(1);
    expect(checkPreferenceMatch(maleProfile, femaleWithoutHijab, "FEMALE")).toBe(0);
  });

  it("handles children acceptance preference", () => {
    const noChildrenPref = { prefChildrenAcceptance: "no_children" };
    const withChildren = { childrenCount: 2 };
    const noChildren = { childrenCount: 0 };

    expect(checkPreferenceMatch(noChildrenPref, withChildren, "MALE")).toBe(0);
    expect(checkPreferenceMatch(noChildrenPref, noChildren, "MALE")).toBe(1);
  });
});

describe("profileQualityScore", () => {
  it("returns 1 for a fully complete user", () => {
    const user = {
      id: "1",
      gender: "MALE",
      profile: { isComplete: true },
      personalityResult: { vector: [1, 2, 3] },
      photos: [{ id: "p1" }],
      identityDoc: { status: "APPROVED" },
    };
    expect(profileQualityScore(user)).toBe(1);
  });

  it("returns 0 for an empty user", () => {
    const user = {
      id: "1",
      gender: "MALE",
      profile: null,
      personalityResult: null,
      photos: [],
      identityDoc: null,
    };
    expect(profileQualityScore(user)).toBe(0);
  });

  it("returns partial score for partially complete user", () => {
    const user = {
      id: "1",
      gender: "MALE",
      profile: { isComplete: true },
      personalityResult: null,
      photos: [{ id: "p1" }],
      identityDoc: { status: "PENDING" },
    };
    const score = profileQualityScore(user);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("calculateCompatibility", () => {
  interface UserOverrides {
    id?: string;
    gender?: string;
    profile?: Partial<ProfileForScoring> | null;
    personalityResult?: UserForScoring["personalityResult"];
    photos?: UserForScoring["photos"];
    identityDoc?: UserForScoring["identityDoc"];
  }

  const makeUser = (overrides: UserOverrides = {}): UserForScoring => ({
    id: overrides.id || "1",
    gender: overrides.gender || "MALE",
    profile: {
      isComplete: true,
      dateOfBirth: "1995-01-01",
      city: "عمان",
      education: "بكالوريوس",
      maritalStatus: "أعزب",
      religiosity: "متدين",
      smokingStatus: "غير مدخن",
      prefAgeMin: 20,
      prefAgeMax: 35,
      prefCity: ["عمان"],
      prefEducation: ["بكالوريوس"],
      prefMaritalStatus: ["عزباء"],
      prefReligiosity: ["متدينة"],
      prefSmokingStatus: ["غير مدخنة"],
      ...overrides.profile,
    },
    personalityResult: overrides.personalityResult ?? { vector: [0.8, 0.6, 0.7, 0.5, 0.9] },
    photos: overrides.photos ?? [{ id: "p1" }],
    identityDoc: overrides.identityDoc ?? { status: "APPROVED" },
  });

  it("returns 0 when either user has no profile", () => {
    const userA = makeUser({ profile: null });
    const userB = makeUser({ id: "2", gender: "FEMALE" });
    // Need to set profile to null properly
    userA.profile = null;
    expect(calculateCompatibility(userA, userB)).toBe(0);
  });

  it("returns a score between 0 and 100", () => {
    const userA = makeUser();
    const userB = makeUser({
      id: "2",
      gender: "FEMALE",
      profile: {
        dateOfBirth: "1998-01-01",
        city: "عمان",
        education: "بكالوريوس",
        maritalStatus: "عزباء",
        religiosity: "متدينة",
        smokingStatus: "غير مدخنة",
        prefAgeMin: 25,
        prefAgeMax: 35,
        prefCity: ["عمان"],
      },
    });
    const score = calculateCompatibility(userA, userB);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns higher scores for similar personality vectors", () => {
    const userA = makeUser({ personalityResult: { vector: [0.8, 0.6, 0.7, 0.5, 0.9] } });
    const userB = makeUser({
      id: "2",
      gender: "FEMALE",
      personalityResult: { vector: [0.8, 0.6, 0.7, 0.5, 0.9] },
      profile: {
        dateOfBirth: "1998-01-01",
        city: "عمان",
        education: "بكالوريوس",
        maritalStatus: "عزباء",
        religiosity: "متدينة",
        smokingStatus: "غير مدخنة",
        prefAgeMin: 25,
        prefAgeMax: 35,
        prefCity: ["عمان"],
      },
    });
    const userC = makeUser({
      id: "3",
      gender: "FEMALE",
      personalityResult: { vector: [0.1, 0.9, 0.2, 0.8, 0.1] },
      profile: {
        dateOfBirth: "1998-01-01",
        city: "عمان",
        education: "بكالوريوس",
        maritalStatus: "عزباء",
        religiosity: "متدينة",
        smokingStatus: "غير مدخنة",
        prefAgeMin: 25,
        prefAgeMax: 35,
        prefCity: ["عمان"],
      },
    });

    const scoreWithSimilar = calculateCompatibility(userA, userB);
    const scoreWithDifferent = calculateCompatibility(userA, userC);
    expect(scoreWithSimilar).toBeGreaterThanOrEqual(scoreWithDifferent);
  });

  it("redistributes personality weight when quiz is missing", () => {
    const userA = makeUser({ personalityResult: null });
    const userB = makeUser({
      id: "2",
      gender: "FEMALE",
      personalityResult: null,
      profile: {
        dateOfBirth: "1998-01-01",
        city: "عمان",
        education: "بكالوريوس",
        maritalStatus: "عزباء",
      },
    });
    const score = calculateCompatibility(userA, userB);
    expect(score).toBeGreaterThan(0);
  });
});
