import { describe, it, expect } from "vitest";
import { suggestionReason } from "@/lib/matching/reasons";

const yearsAgo = (n: number) => new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000 - 86400000);

const man = (profile: object, vector?: number[]) => ({
  id: "m", gender: "MALE", profile, personalityResult: vector ? { vector } : null,
});
const woman = (profile: object, vector?: number[]) => ({
  id: "w", gender: "FEMALE", profile, personalityResult: vector ? { vector } : null,
});

describe("suggestionReason", () => {
  it("lists the viewer's preferences the other person meets (male viewer)", () => {
    const r = suggestionReason(
      man({ prefAgeMin: 22, prefAgeMax: 30, prefCity: ["عمان"] }),
      woman({ dateOfBirth: yearsAgo(26), city: "عمان" }),
    );
    expect(r).toContain("توافق ما تبحث عنه");
    expect(r).toContain("العمر");
    expect(r).toContain("المدينة");
  });

  it("uses feminine wording for a female viewer and masculine for a male candidate", () => {
    const r = suggestionReason(
      woman({ prefEducation: ["بكالوريوس"] }),
      man({ education: "بكالوريوس" }),
    );
    expect(r).toContain("يوافق ما تبحثين عنه");
    expect(r).toContain("التعليم");
  });

  it("names at most three preferences", () => {
    const r = suggestionReason(
      man({
        prefAgeMin: 20, prefAgeMax: 40, prefCity: ["عمان"], prefMaritalStatus: ["عزباء"],
        prefEducation: ["بكالوريوس"], prefReligiosity: ["متدينة"],
      }),
      woman({ dateOfBirth: yearsAgo(26), city: "عمان", maritalStatus: "عزباء", education: "بكالوريوس", religiosity: "متدينة" }),
    );
    const labels = ["العمر", "المدينة", "الحالة الاجتماعية", "التعليم", "التدين"].filter((l) => r.includes(l));
    expect(labels).toHaveLength(3);
  });

  it("mentions close personalities when both took the quiz", () => {
    const v = [0.8, 0.6, 0.7, 0.5, 0.9];
    const r = suggestionReason(man({ prefCity: ["عمان"] }, v), woman({ city: "عمان" }, v));
    expect(r).toContain("متقاربة");
  });

  it("falls back to the same city", () => {
    const r = suggestionReason(man({ city: "إربد" }), woman({ city: "إربد" }));
    expect(r).toContain("المدينة نفسها");
  });

  it("has a generic fallback", () => {
    expect(suggestionReason(man({}), woman({}))).toBe("اقترحناه لتوافق ملفيكما بشكل عام");
  });

  it("never mentions unmatched preferences", () => {
    const r = suggestionReason(man({ prefCity: ["عمان"], prefEducation: ["ماجستير"] }), woman({ city: "عمان", education: "بكالوريوس" }));
    expect(r).not.toContain("التعليم");
  });
});
