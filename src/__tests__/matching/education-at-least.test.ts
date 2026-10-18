import { describe, it, expect } from "vitest";
import { educationMatches, minEducation, passesDealbreakers } from "@/lib/matching/score";
import { dealbreakerSummary } from "@/lib/matching/dealbreaker-summary";

describe("education: a preferred level means this level or higher", () => {
  it("diploma accepts diploma and every higher level, not high school", () => {
    expect(educationMatches(["دبلوم"], "دبلوم")).toBe(true);
    expect(educationMatches(["دبلوم"], "بكالوريوس")).toBe(true);
    expect(educationMatches(["دبلوم"], "دكتوراه")).toBe(true);
    expect(educationMatches(["دبلوم"], "ثانوية عامة")).toBe(false);
  });

  it("several picks: the lowest one is the minimum", () => {
    expect(educationMatches(["ماجستير", "بكالوريوس"], "دكتوراه")).toBe(true);
    expect(educationMatches(["ماجستير", "بكالوريوس"], "دبلوم")).toBe(false);
  });

  it("no preference = null, missing value fails, unknown values match exactly", () => {
    expect(educationMatches([], "دبلوم")).toBeNull();
    expect(educationMatches(["دبلوم"], null)).toBe(false);
    expect(educationMatches(["شيء آخر"], "شيء آخر")).toBe(true);
    expect(educationMatches(["شيء آخر"], "دكتوراه")).toBe(false);
  });

  it("as a dealbreaker, a bachelor passes a diploma-only condition", () => {
    const owner = { prefEducation: ["دبلوم"], dealbreakers: ["education"] };
    expect(passesDealbreakers(owner as never, { education: "بكالوريوس" } as never, "MALE")).toBe(true);
    expect(passesDealbreakers(owner as never, { education: "ثانوية عامة" } as never, "MALE")).toBe(false);
  });

  it("says it in words: «دبلوم فأعلى», and just «دكتوراه» at the top", () => {
    expect(minEducation(["بكالوريوس", "دبلوم"])).toBe("دبلوم");
    expect(dealbreakerSummary("education", { prefEducation: ["بكالوريوس", "دبلوم"] })).toBe("دبلوم فأعلى");
    expect(dealbreakerSummary("education", { prefEducation: ["دكتوراه"] })).toBe("دكتوراه");
  });
});
