import { describe, it, expect } from "vitest";
import { cardFacts } from "@/lib/suggestions/card-facts";
import { describeOption, tribeLabel } from "@/lib/profile-options";
import type { FeedCandidate } from "@/lib/suggestions/feed-types";

const base: FeedCandidate = {
  id: "c1", firstName: "س", isVerified: false, age: 27, city: "عمان", area: null, nationality: null,
  education: "بكالوريوس", fieldOfStudy: null, job: "موظف", incomeRange: null, height: 165, weight: null,
  skinColor: null, maritalStatus: "أعزب", childrenCount: 0, religiosity: "ملتزم", smokingStatus: "غير مدخن",
  sect: null, aboutMe: null, hobbies: null, interests: null, lifestyle: null, beard: null, hijab: true,
  niqab: false, tribe: "العبادي", familyOriginArea: null, numberOfSiblings: null, housingType: null,
  cookingAbility: null, drivingLicense: null, willingToRelocate: null, familyValues: null,
};

describe("cardFacts", () => {
  it("gives the eight facts of a Jordanian woman in order", () => {
    const facts = cardFacts(base, "FEMALE", "JO");
    expect(facts.map((f) => f.key)).toEqual(["job", "education", "religiosity", "veil", "height", "maritalStatus", "smoking", "tribe"]);
    expect(facts.map((f) => f.label)).toEqual(["العمل", "التعليم", "الالتزام", "الحجاب", "الطول", "الحالة الاجتماعية", "التدخين", tribeLabel("JO")]);
    expect(facts.find((f) => f.key === "height")?.value).toBe("165 سم");
  });

  it("shows the beard for a man, no veil", () => {
    const yes = cardFacts({ ...base, hijab: null, niqab: null, beard: true }, "MALE", "JO");
    expect(yes.some((f) => f.key === "veil")).toBe(false);
    expect(yes.find((f) => f.key === "beard")).toEqual({ key: "beard", label: "اللحية", value: "ملتحٍ" });
    const no = cardFacts({ ...base, hijab: null, beard: false }, "MALE", "JO");
    expect(no.find((f) => f.key === "beard")?.value).toBe("غير ملتحٍ");
  });

  it("ends with the sect in Lebanon, or the tribe when there is none", () => {
    const withSect = cardFacts({ ...base, sect: "سني" }, "FEMALE", "LB");
    expect(withSect.at(-1)).toMatchObject({ key: "sect", label: "المذهب" });
    expect(withSect.some((f) => f.key === "tribe")).toBe(false);
    expect(cardFacts({ ...base, sect: null }, "FEMALE", "LB").at(-1)?.key).toBe("tribe");
  });

  it("leaves out empty fields", () => {
    const facts = cardFacts({ ...base, job: null, height: null, tribe: "" }, "FEMALE", "JO");
    const keys = facts.map((f) => f.key);
    expect(keys).not.toContain("job");
    expect(keys).not.toContain("height");
    expect(keys).not.toContain("tribe");
    expect(facts.every((f) => f.value !== "")).toBe(true);
  });

  it("words the values for the partner's gender", () => {
    const f = cardFacts({ ...base, religiosity: "ملتزم" }, "FEMALE", "JO").find((x) => x.key === "religiosity");
    expect(f?.value).toBe(describeOption("religiosity", "ملتزم", "FEMALE"));
  });
});
