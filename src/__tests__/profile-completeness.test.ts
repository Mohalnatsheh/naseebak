import { describe, it, expect } from "vitest";
import { calculateCompleteness, type UserForCompleteness } from "@/lib/profile-completeness";

describe("calculateCompleteness", () => {
  it("returns 0 for a completely empty user", () => {
    const user: UserForCompleteness = {};
    const result = calculateCompleteness(user);
    expect(result.total).toBe(0);
    expect(result.sections).toHaveLength(5);
    result.sections.forEach((s) => {
      expect(s.percentage).toBe(0);
    });
  });

  it("returns 100 for a fully complete user", () => {
    const user: UserForCompleteness = {
      identityDoc: { status: "APPROVED" },
      profile: {
        dateOfBirth: "1995-01-01",
        city: "عمان",
        area: "الصويفية",
        nationality: "أردني",
        education: "بكالوريوس",
        job: "مهندس",
        height: 175,
        weight: 70,
        maritalStatus: "أعزب",
        aboutMe: "مرحباً",
        prefAgeMin: 20,
        prefAgeMax: 30,
        prefCity: ["عمان"],
        prefEducation: ["بكالوريوس"],
        prefMaritalStatus: ["عزباء"],
        prefReligiosity: ["متدينة"],
        prefSmokingStatus: ["غير مدخنة"],
        tribe: "عشيرة",
        familyOriginArea: "عمان",
        numberOfSiblings: 3,
      },
      personalityResult: { personalityType: "INTJ" },
      photos: [{ id: "p1" }],
      parentInfo: { id: "pi1", parentName: "أحمد" },
    };
    const result = calculateCompleteness(user);
    expect(result.total).toBe(100);
  });

  it("identity verification is optional and has no completeness section", () => {
    const result = calculateCompleteness({ identityDoc: { status: "APPROVED" } });
    expect(result.sections.find((s) => s.key === "identity")).toBeUndefined();
    expect(result.total).toBe(0);
  });

  it("an unverified user can still reach 100%", () => {
    const result = calculateCompleteness({
      identityDoc: null,
      profile: {
        dateOfBirth: "1995-01-01", city: "عمان", area: "الصويفية", nationality: "أردني",
        education: "بكالوريوس", job: "مهندس", height: 175, weight: 70, maritalStatus: "أعزب",
        aboutMe: "مرحباً", prefAgeMin: 20, prefAgeMax: 30, prefCity: ["عمان"],
        prefEducation: ["بكالوريوس"], prefMaritalStatus: ["عزباء"], prefReligiosity: ["متدينة"],
        prefSmokingStatus: ["غير مدخنة"], tribe: "عشيرة", familyOriginArea: "عمان", numberOfSiblings: 3,
      },
      personalityResult: { personalityType: "INTJ" },
      photos: [{ id: "p1" }],
      parentInfo: { id: "pi1", parentName: "أحمد" },
    });
    expect(result.total).toBe(100);
  });

  it("basic info section shows partial completeness", () => {
    const user: UserForCompleteness = {
      profile: {
        dateOfBirth: "1995-01-01",
        city: "عمان",
        // Missing: area, nationality, education, job, height, weight, maritalStatus, aboutMe
      },
    };
    const result = calculateCompleteness(user);
    const basicSection = result.sections.find((s) => s.key === "basic");
    expect(basicSection?.percentage).toBe(20); // 2 of 10 fields
    expect(basicSection?.missingFields.length).toBe(8);
  });

  it("photos section is 100 with at least one photo", () => {
    const user: UserForCompleteness = {
      photos: [{ id: "p1" }],
    };
    const result = calculateCompleteness(user);
    const photosSection = result.sections.find((s) => s.key === "photos");
    expect(photosSection?.percentage).toBe(100);
  });

  it("photos section is 0 with no photos", () => {
    const user: UserForCompleteness = {
      photos: [],
    };
    const result = calculateCompleteness(user);
    const photosSection = result.sections.find((s) => s.key === "photos");
    expect(photosSection?.percentage).toBe(0);
  });

  it("quiz section is 100 when quiz exists", () => {
    const user: UserForCompleteness = {
      personalityResult: { personalityType: "INTJ" },
    };
    const result = calculateCompleteness(user);
    const quizSection = result.sections.find((s) => s.key === "quiz");
    expect(quizSection?.percentage).toBe(100);
  });

  it("family section shows partial completeness", () => {
    const user: UserForCompleteness = {
      profile: {
        tribe: "عشيرة",
        // Missing: familyOriginArea, numberOfSiblings
      },
      parentInfo: { id: "pi1", parentName: "أحمد" },
    };
    const result = calculateCompleteness(user);
    const familySection = result.sections.find((s) => s.key === "family");
    expect(familySection?.percentage).toBe(50); // 2 of 4 fields
  });

  it("total is weighted average of sections", () => {
    // Only quiz done → 15% weight, 100% section = 15 total
    const user: UserForCompleteness = {
      personalityResult: { personalityType: "INTJ" },
    };
    const result = calculateCompleteness(user);
    expect(result.total).toBe(15);
  });

  it("all sections have correct links for incomplete profile", () => {
    const user: UserForCompleteness = {};
    const result = calculateCompleteness(user);

    const expectedLinks: Record<string, string> = {
      basic: "/dashboard/profile/setup",
      preferences: "/dashboard/profile/setup",
      quiz: "/dashboard/personality-quiz",
      photos: "/dashboard/photos",
      family: "/dashboard/profile/setup",
    };

    result.sections.forEach((s) => {
      expect(s.link).toBe(expectedLinks[s.key]);
    });
  });

  it("profile sections link to edit page when profile is complete", () => {
    const user: UserForCompleteness = {
      profile: { isComplete: true },
    };
    const result = calculateCompleteness(user);

    const basicSection = result.sections.find((s) => s.key === "basic");
    const prefSection = result.sections.find((s) => s.key === "preferences");
    const familySection = result.sections.find((s) => s.key === "family");

    expect(basicSection?.link).toBe("/dashboard/profile/edit");
    expect(prefSection?.link).toBe("/dashboard/profile/edit");
    expect(familySection?.link).toBe("/dashboard/profile/edit");
  });

  it("preferences section counts array fields correctly", () => {
    const user: UserForCompleteness = {
      profile: {
        prefAgeMin: 20,
        prefAgeMax: 30,
        prefCity: ["عمان", "إربد"],
        prefEducation: [],
        prefMaritalStatus: [],
        prefReligiosity: [],
        prefSmokingStatus: [],
      },
    };
    const result = calculateCompleteness(user);
    const prefSection = result.sections.find((s) => s.key === "preferences");
    // prefAgeMin + prefAgeMax + prefCity = 3 of 7
    expect(prefSection?.percentage).toBe(43); // Math.round(3/7 * 100) = 43
  });

  // ─── Strength level tests ─────────────────────

  it("level is 'weak' when total is 0", () => {
    const user: UserForCompleteness = {};
    const result = calculateCompleteness(user);
    expect(result.level).toBe("weak");
  });

  it("level is 'weak' at 40%", () => {
    // quiz (15) + photos (15) + family (10) = 40%
    const user: UserForCompleteness = {
      personalityResult: { personalityType: "INTJ" },
      photos: [{ id: "p1" }],
      profile: { tribe: "عشيرة", familyOriginArea: "عمان", numberOfSiblings: 3 },
      parentInfo: { id: "pi1", parentName: "أحمد" },
    };
    const result = calculateCompleteness(user);
    expect(result.total).toBe(40);
    expect(result.level).toBe("weak");
  });

  it("level is 'good' at 41%+", () => {
    // quiz (15) + photos (15) + family (10) + partial basic
    const user: UserForCompleteness = {
      personalityResult: { personalityType: "INTJ" },
      photos: [{ id: "p1" }],
      profile: { dateOfBirth: "1995-01-01", tribe: "عشيرة", familyOriginArea: "عمان", numberOfSiblings: 3 },
      parentInfo: { id: "pi1", parentName: "أحمد" },
    };
    const result = calculateCompleteness(user);
    expect(result.total).toBeGreaterThanOrEqual(41);
    expect(result.level).toBe("good");
  });

  it("level is 'excellent' at 100%", () => {
    const user: UserForCompleteness = {
      identityDoc: { status: "APPROVED" },
      profile: {
        dateOfBirth: "1995-01-01",
        city: "عمان",
        area: "الصويفية",
        nationality: "أردني",
        education: "بكالوريوس",
        job: "مهندس",
        height: 175,
        weight: 70,
        maritalStatus: "أعزب",
        aboutMe: "مرحباً",
        prefAgeMin: 20,
        prefAgeMax: 30,
        prefCity: ["عمان"],
        prefEducation: ["بكالوريوس"],
        prefMaritalStatus: ["عزباء"],
        prefReligiosity: ["متدينة"],
        prefSmokingStatus: ["غير مدخنة"],
        tribe: "عشيرة",
        familyOriginArea: "عمان",
        numberOfSiblings: 3,
      },
      personalityResult: { personalityType: "INTJ" },
      photos: [{ id: "p1" }],
      parentInfo: { id: "pi1", parentName: "أحمد" },
    };
    const result = calculateCompleteness(user);
    expect(result.level).toBe("excellent");
  });

  // ─── Tips tests ────────────────────────────────

  it("tips are empty at 100%", () => {
    const user: UserForCompleteness = {
      identityDoc: { status: "APPROVED" },
      profile: {
        dateOfBirth: "1995-01-01",
        city: "عمان",
        area: "الصويفية",
        nationality: "أردني",
        education: "بكالوريوس",
        job: "مهندس",
        height: 175,
        weight: 70,
        maritalStatus: "أعزب",
        aboutMe: "مرحباً",
        prefAgeMin: 20,
        prefAgeMax: 30,
        prefCity: ["عمان"],
        prefEducation: ["بكالوريوس"],
        prefMaritalStatus: ["عزباء"],
        prefReligiosity: ["متدينة"],
        prefSmokingStatus: ["غير مدخنة"],
        tribe: "عشيرة",
        familyOriginArea: "عمان",
        numberOfSiblings: 3,
      },
      personalityResult: { personalityType: "INTJ" },
      photos: [{ id: "p1" }],
      parentInfo: { id: "pi1", parentName: "أحمد" },
    };
    const result = calculateCompleteness(user);
    expect(result.tips).toHaveLength(0);
  });

  it("tips max 3 items", () => {
    const user: UserForCompleteness = {};
    const result = calculateCompleteness(user);
    expect(result.tips.length).toBeLessThanOrEqual(3);
  });

  it("tips are sorted by impact descending", () => {
    const user: UserForCompleteness = {};
    const result = calculateCompleteness(user);
    for (let i = 1; i < result.tips.length; i++) {
      expect(result.tips[i - 1].impact).toBeGreaterThanOrEqual(result.tips[i].impact);
    }
  });

  it("backward compatibility: total and sections still present", () => {
    const user: UserForCompleteness = {};
    const result = calculateCompleteness(user);
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBe(5);
  });
});
