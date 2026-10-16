import { describe, it, expect } from "vitest";
import { describeOption, ownOptions, partnerOptions, selfLabel } from "@/lib/profile-options";
import { activeDealbreakers, dealbreakerSummary } from "@/lib/matching/dealbreaker-summary";

describe("profile option labels", () => {
  it("uses feminine labels for women and keeps the stored value", () => {
    const pharmacist = ownOptions("job", "FEMALE").find((o) => o.value === "صيدلي");
    expect(pharmacist?.label).toBe("صيدلانية");
    expect(ownOptions("religiosity", "FEMALE").map((o) => o.label)).toContain("ملتزمة");
    expect(ownOptions("lifestyle", "FEMALE").find((o) => o.value === "هادئ")?.label).toBe("هادئة");
    expect(ownOptions("religiosity", "MALE").find((o) => o.value === "ملتزم")?.label).toBe("ملتزم");
  });

  it("writes partner preferences about the partner, not in first person", () => {
    const forMan = partnerOptions("smokingStatus", "MALE");
    expect(forMan.find((o) => o.value === "لا أدخن")?.label).toBe("غير مدخنة");
    const forWoman = partnerOptions("smokingStatus", "FEMALE");
    expect(forWoman.find((o) => o.value === "أدخن أحياناً")?.label).toBe("يدخن أحياناً");
    expect(partnerOptions("religiosity", "MALE").find((o) => o.value === "ملتزم جداً")?.label).toBe("ملتزمة جداً");
    for (const o of [...forMan, ...forWoman]) expect(o.label).not.toMatch(/^(لا )?أ/);
  });

  it("returns unknown values (free-text jobs) unchanged", () => {
    expect(selfLabel("job", "خبير تغذية", "FEMALE")).toBe("خبير تغذية");
    expect(describeOption("smokingStatus", "غير مدخن", "MALE")).toBe("غير مدخن");
  });
});

describe("dealbreaker summaries", () => {
  it("drops ticked keys whose preference is empty", () => {
    const prefs = { prefCity: ["عمان"], prefEducation: [], prefChildrenAcceptance: "نعم" };
    expect(activeDealbreakers(["city", "education", "children", "age"], prefs, "MALE")).toEqual(["city"]);
  });

  it("only offers children when no children are accepted", () => {
    expect(dealbreakerSummary("children", { prefChildrenAcceptance: "لا" })).toBe("بدون أبناء");
    expect(dealbreakerSummary("children", { prefChildrenAcceptance: "لا يهم" })).toBeNull();
  });

  it("offers hijab to men only and describes smoking about the partner", () => {
    expect(dealbreakerSummary("hijab", { prefHijab: "نعم" }, "MALE")).toBe("محجبة");
    expect(dealbreakerSummary("hijab", { prefHijab: "نعم" }, "FEMALE")).toBeNull();
    expect(dealbreakerSummary("smokingStatus", { prefSmokingStatus: ["لا أدخن"] }, "FEMALE")).toBe("غير مدخن");
  });
});
