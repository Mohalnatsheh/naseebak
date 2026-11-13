import { describe, expect, it } from "vitest";
import { EDIT_SECTIONS, editField } from "@/lib/profile-edit-fields";
import { firstIncompleteStep, missingOnStep, setupRequired, setupSteps } from "@/lib/setup-steps";

import type { EditCtx } from "@/lib/profile-edit-fields";

const ctx: EditCtx = { gender: "MALE", country: "JO", religionEnabled: false };
const field = (key: string) => {
  const f = editField(key);
  if (!f) throw new Error(key);
  return f;
};
const withProfile = (c: EditCtx, profile: Record<string, unknown>) => ({ ...c, profile });

describe("setupSteps", () => {
  it("has 7 steps in order, 6 without dealbreakers", () => {
    expect(setupSteps({ dealbreakers: true }).map((s) => s.id)).toEqual(["you", "faith", "work", "family", "about", "looking", "musts"]);
    const six = setupSteps({ dealbreakers: false }).map((s) => s.id);
    expect(six).toHaveLength(6);
    expect(six).not.toContain("musts");
  });

  it("places every edit field in exactly one step", () => {
    const all = setupSteps({ dealbreakers: true }).flatMap((s) => s.fieldKeys);
    for (const key of EDIT_SECTIONS.flatMap((s) => s.fields.map((f) => f.key))) {
      expect(all.filter((k) => k === key), key).toHaveLength(1);
    }
    expect(all).toHaveLength(new Set(all).size);
  });
});

describe("setupRequired", () => {
  it("requires the choice, yesNo and picker fields and the flagged ones", () => {
    expect(setupRequired(field("skinColor"), ctx)).toBe(true);
    expect(setupRequired(field("drivingLicense"), ctx)).toBe(true);
    expect(setupRequired(field("job"), ctx)).toBe(true);
    expect(setupRequired(field("prefAgeMin"), ctx)).toBe(true);
  });
  it("leaves text, number, longText and preferences optional", () => {
    expect(setupRequired(field("aboutMe"), ctx)).toBe(false);
    expect(setupRequired(field("height"), ctx)).toBe(false);
    expect(setupRequired(field("prefCity"), ctx)).toBe(false);
  });
  it("never requires a hidden field", () => {
    const f: EditCtx = { ...ctx, gender: "FEMALE", religionEnabled: true };
    expect(setupRequired(field("hijab"), withProfile(f, { religion: "مسيحي" }))).toBe(false);
    expect(setupRequired(field("hijab"), withProfile(f, { religion: "مسلم" }))).toBe(true);
  });
  it("requires children count only when not single", () => {
    expect(setupRequired(field("childrenCount"), withProfile(ctx, { maritalStatus: "أعزب/عزباء" }))).toBe(false);
    expect(setupRequired(field("childrenCount"), withProfile(ctx, { maritalStatus: "مطلق/مطلقة" }))).toBe(true);
  });
});

describe("missingOnStep", () => {
  const faith = () => setupSteps({ dealbreakers: true }).find((s) => s.id === "faith")!;
  it("counts false and 0 as answers", () => {
    const values = { religiosity: "x", smokingStatus: "x", cookingAbility: "x", lifestyle: "x", drivingLicense: false, willingToRelocate: "no", beard: false };
    expect(missingOnStep(faith(), values, ctx)).toEqual([]);
    expect(missingOnStep(faith(), { ...values, drivingLicense: undefined }, ctx)).toEqual(["drivingLicense"]);
  });
  it("treats a job still on «أخرى» as missing", () => {
    const work = setupSteps({ dealbreakers: true }).find((s) => s.id === "work")!;
    const values = { education: "x", incomeRange: "x" };
    expect(missingOnStep(work, { ...values, job: "أخرى" }, ctx)).toEqual(["job"]);
    expect(missingOnStep(work, { ...values, job: "مهندس" }, ctx)).toEqual([]);
    expect(missingOnStep(work, values, ctx)).toEqual(["job"]);
  });
});

describe("firstIncompleteStep", () => {
  const steps = setupSteps({ dealbreakers: true });
  const basics = {
    dateOfBirth: "1995-01-01", nationality: "x", city: "x", maritalStatus: "أعزب/عزباء", skinColor: "x",
    religiosity: "x", cookingAbility: "x", lifestyle: "x", drivingLicense: false, willingToRelocate: "no", beard: true,
  };
  it("stops at the first step with a missing required field", () => {
    expect(firstIncompleteStep(steps, basics, ctx)).toBe(1);
    expect(firstIncompleteStep(steps, { ...basics, skinColor: undefined }, ctx)).toBe(0);
  });
  it("gives the last step when all is filled", () => {
    const full = { ...basics, smokingStatus: "x", education: "x", job: "x", incomeRange: "x", housingType: "x", monthlyExpenses: "x", prefAgeMin: 20, prefAgeMax: 30 };
    expect(firstIncompleteStep(steps, full, ctx)).toBe(steps.length - 1);
  });
});
