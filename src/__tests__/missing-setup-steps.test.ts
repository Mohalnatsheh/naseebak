import { describe, it, expect } from "vitest";
import { missingSetupSteps } from "@/lib/profile-completeness";

const basics = { dateOfBirth: "1995-01-01", nationality: "أردني", city: "عمّان", education: "بكالوريوس" };
const status = { maritalStatus: "أعزب/عزباء", religiosity: "ملتزم" };
const prefs = { prefAgeMin: 20, prefAgeMax: 30 };

describe("missingSetupSteps", () => {
  it("lists every required step for an empty profile", () => {
    expect(missingSetupSteps({ profile: null }).map((s) => s.step)).toEqual([1, 2, 3]);
  });

  it("only the partner age when the user stopped at step 3", () => {
    const missing = missingSetupSteps({ profile: { ...basics, ...status, prefAgeMin: null } });
    expect(missing).toEqual([{ step: 3, label: "العمر المناسب للشريك" }]);
  });

  it("nothing when every required field is filled, guardian or not", () => {
    expect(missingSetupSteps({ profile: { ...basics, ...status, ...prefs } })).toEqual([]);
  });
});
