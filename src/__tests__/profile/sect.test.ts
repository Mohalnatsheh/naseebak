import { describe, it, expect } from "vitest";
import {
  PREF_SECT_VALUES,
  SECT_UNDISCLOSED,
  SECT_VALUES,
  sectApplies,
  stripSectUnlessLebanon,
  visibleSect,
} from "@/lib/profile-sect";
import { profileDraftSchema, profileSchema, profileUpdateChangesSchema } from "@/lib/validations/profile";
import { describeOption, OPTION_VALUES, partnerOptions, selfLabel } from "@/lib/profile-options";
import { defaultCountrySettings, publicCountryDetail } from "@/lib/countries/settings";
import { calculateCompleteness } from "@/lib/profile-completeness";
import { buildProfileUpdate } from "@/lib/admin/profile-changes";
import { dealbreakerSummary } from "@/lib/matching/dealbreaker-summary";
import { DEALBREAKER_LABELS } from "@/lib/matching/score";
import { arabicIssueMessage } from "@/lib/validations/issue-message";

const base = {
  dateOfBirth: "1995-01-15",
  city: "بيروت",
  nationality: "لبناني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  religiosity: "ملتزم",
  prefAgeMin: 22,
  prefAgeMax: 30,
};

describe("sect values", () => {
  it("stores exactly three values; a preference can't ask for «أفضّل عدم الذكر»", () => {
    expect(SECT_VALUES).toEqual(["سني", "شيعي", "أفضّل عدم الذكر"]);
    expect(SECT_UNDISCLOSED).toBe("أفضّل عدم الذكر");
    expect(PREF_SECT_VALUES).toEqual(["سني", "شيعي"]);
    expect(OPTION_VALUES.sect).toEqual(SECT_VALUES);
  });

  it("applies to Lebanon only", () => {
    expect(sectApplies("LB")).toBe(true);
    expect(sectApplies("JO")).toBe(false);
    expect(sectApplies("SA")).toBe(false);
    expect(sectApplies(null)).toBe(false);
    expect(sectApplies("lb")).toBe(false);
  });

  it("«أفضّل عدم الذكر» is never shown to another member", () => {
    expect(visibleSect("أفضّل عدم الذكر")).toBeNull();
    expect(visibleSect("سني")).toBe("سني");
    expect(visibleSect("شيعي")).toBe("شيعي");
    expect(visibleSect(null)).toBeNull();
    expect(visibleSect("")).toBeNull();
  });
});

describe("stripSectUnlessLebanon", () => {
  const data = { sect: "سني", prefSect: ["سني"], dealbreakers: ["age", "sect"], city: "عمان" };

  it("drops sect, prefSect and the sect dealbreaker outside Lebanon", () => {
    expect(stripSectUnlessLebanon("JO", { sect: "سني", prefSect: ["سني"], dealbreakers: ["age", "sect"] })).toEqual({ dealbreakers: ["age"] });
    expect(stripSectUnlessLebanon("SA", data)).toEqual({ dealbreakers: ["age"], city: "عمان" });
  });

  it("leaves the input untouched (a copy is returned)", () => {
    stripSectUnlessLebanon("JO", data);
    expect(data.sect).toBe("سني");
    expect(data.dealbreakers).toEqual(["age", "sect"]);
  });

  it("keeps everything for a Lebanese member", () => {
    expect(stripSectUnlessLebanon("LB", data)).toEqual(data);
  });

  it("passes non-objects through", () => {
    expect(stripSectUnlessLebanon("JO", null)).toBeNull();
    expect(stripSectUnlessLebanon("JO", ["sect"])).toEqual(["sect"]);
  });
});

describe("validation", () => {
  it("profile save accepts the three values and refuses others", () => {
    for (const sect of SECT_VALUES) expect(profileSchema.safeParse({ ...base, sect }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, sect: "درزي" }).success).toBe(false);
  });

  it("a partner preference accepts سني / شيعي only", () => {
    expect(profileSchema.safeParse({ ...base, prefSect: ["سني", "شيعي"] }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, prefSect: ["أفضّل عدم الذكر"] }).success).toBe(false);
    expect(profileDraftSchema.safeParse({ prefSect: ["أفضّل عدم الذكر"] }).success).toBe(false);
    expect(profileDraftSchema.safeParse({ sect: "درزي" }).success).toBe(false);
    expect(profileDraftSchema.safeParse({ sect: "شيعي", prefSect: ["سني"] }).success).toBe(true);
  });

  it("an update request takes sect (or a cleared one) and prefSect", () => {
    expect(profileUpdateChangesSchema.safeParse({ sect: "سني" }).success).toBe(true);
    expect(profileUpdateChangesSchema.safeParse({ sect: "" }).success).toBe(true);
    expect(profileUpdateChangesSchema.safeParse({ sect: "درزي" }).success).toBe(false);
    expect(profileUpdateChangesSchema.safeParse({ prefSect: ["شيعي"] }).success).toBe(true);
    expect(profileUpdateChangesSchema.safeParse({ prefSect: ["أفضّل عدم الذكر"] }).success).toBe(false);
  });

  it("names the field in Arabic", () => {
    expect(arabicIssueMessage({ message: "Invalid", path: ["sect"] })).toContain("المذهب");
    expect(arabicIssueMessage({ message: "Invalid", path: ["prefSect", 0] })).toContain("مذهب الشريك");
  });
});

describe("labels", () => {
  it("women see the female forms; «أفضّل عدم الذكر» stays as is", () => {
    expect(selfLabel("sect", "سني", "FEMALE")).toBe("سنية");
    expect(selfLabel("sect", "شيعي", "FEMALE")).toBe("شيعية");
    expect(selfLabel("sect", "أفضّل عدم الذكر", "FEMALE")).toBe("أفضّل عدم الذكر");
    expect(selfLabel("sect", "سني", "MALE")).toBe("سني");
    expect(describeOption("sect", "شيعي", "FEMALE")).toBe("شيعية");
    expect(describeOption("sect", "شيعي", "MALE")).toBe("شيعي");
  });

  it("partner options never offer «أفضّل عدم الذكر»", () => {
    expect(partnerOptions("sect", "MALE")).toEqual([{ value: "سني", label: "سنية" }, { value: "شيعي", label: "شيعية" }]);
    expect(partnerOptions("sect", "FEMALE")).toEqual([{ value: "سني", label: "سني" }, { value: "شيعي", label: "شيعي" }]);
  });

  it("the «شرط أساسي» reads «المذهب» and says the partner's sect", () => {
    expect(DEALBREAKER_LABELS.sect).toBe("المذهب");
    expect(dealbreakerSummary("sect", { prefSect: ["سني"] }, "MALE")).toBe("سنية");
    expect(dealbreakerSummary("sect", { prefSect: [] }, "MALE")).toBeNull();
  });
});

describe("admin approval of an update request", () => {
  it("stores sect as text and prefSect as a list", () => {
    expect(buildProfileUpdate({ sect: "شيعي", prefSect: ["سني"] })).toEqual({ sect: "شيعي", prefSect: ["سني"] });
    expect(buildProfileUpdate({ sect: "" })).toEqual({ sect: null });
  });
});

describe("country detail for the app", () => {
  const content = { heroTitle: "", heroSubtitle: "", seoTitle: "", seoDescription: "" };

  it("only Lebanon lists sect options", () => {
    const jo = publicCountryDetail(defaultCountrySettings("JO"), content, "https://naseebak.com");
    const sa = publicCountryDetail(defaultCountrySettings("SA"), content, "https://naseebak.com");
    const lb = publicCountryDetail(defaultCountrySettings("LB"), content, "https://naseebak.com");
    expect(jo.options.sect).toBeUndefined();
    expect(jo.options.prefSect).toBeUndefined();
    expect(sa.options.sect).toBeUndefined();
    expect(lb.options.sect).toEqual(["سني", "شيعي", "أفضّل عدم الذكر"]);
    expect(lb.options.prefSect).toEqual(["سني", "شيعي"]);
  });
});

describe("completeness", () => {
  const profile = {
    dateOfBirth: "1995-01-01", city: "بيروت", area: "الحمرا", nationality: "لبناني", education: "بكالوريوس",
    job: "مهندس", height: 175, weight: 70, maritalStatus: "أعزب", aboutMe: "مرحباً",
    prefAgeMin: 20, prefAgeMax: 30, prefCity: ["بيروت"], prefEducation: ["بكالوريوس"],
    prefMaritalStatus: ["عزباء"], prefReligiosity: ["ملتزمة"], prefSmokingStatus: ["غير مدخنة"],
  };
  const section = (country: string, p: Record<string, unknown>, key: string) =>
    calculateCompleteness({ country, profile: p }).sections.find((s) => s.key === key)!;

  it("counts sect and the partner's sect for Lebanon only", () => {
    expect(section("LB", profile, "basic").missingFields).toContain("المذهب");
    expect(section("LB", profile, "preferences").missingFields).toContain("المذهب لدى الشريك");
    expect(section("LB", { ...profile, sect: "سني", prefSect: ["سني"] }, "basic").percentage).toBe(100);
    expect(section("LB", { ...profile, sect: "سني", prefSect: ["سني"] }, "preferences").percentage).toBe(100);
    // «أفضّل عدم الذكر» is an answer
    expect(section("LB", { ...profile, sect: "أفضّل عدم الذكر" }, "basic").percentage).toBe(100);
  });

  it("Jordan and Saudi Arabia are unchanged", () => {
    for (const c of ["JO", "SA"]) {
      expect(section(c, profile, "basic").percentage).toBe(100);
      expect(section(c, profile, "preferences").percentage).toBe(100);
      expect(section(c, profile, "basic").missingFields).not.toContain("المذهب");
    }
  });
});
