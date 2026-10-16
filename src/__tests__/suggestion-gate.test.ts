import { describe, it, expect } from "vitest";
import { meetsSuggestionGate, qualifiesForSuggestions } from "@/lib/profile-completeness";

const shortSetupUser = {
  profile: { isComplete: true, dateOfBirth: "1998-03-12", city: "عمّان", education: "بكالوريوس", maritalStatus: "أعزب/عزباء", prefAgeMin: 27, prefAgeMax: 36 },
  photos: [],
  personalityResult: null,
  parentInfo: { id: "p1" },
};

describe("suggestion gate", () => {
  it("new cycle: a finished short setup is enough", () => {
    expect(meetsSuggestionGate(shortSetupUser, true)).toBe(true);
    expect(meetsSuggestionGate({ ...shortSetupUser, profile: { ...shortSetupUser.profile, isComplete: false } }, true)).toBe(false);
  });

  it("legacy: still needs 50% completeness", () => {
    expect(meetsSuggestionGate(shortSetupUser, false)).toBe(false);
  });

  it("client helper follows the same rule", () => {
    expect(qualifiesForSuggestions({ completenessTotal: 27, isComplete: true, newCycle: true })).toBe(true);
    expect(qualifiesForSuggestions({ completenessTotal: 27, isComplete: true, newCycle: false })).toBe(false);
    expect(qualifiesForSuggestions({ completenessTotal: 60, isComplete: false, newCycle: false })).toBe(true);
  });
});
