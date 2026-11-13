import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: { gender: "MALE" }, country: "SA" }),
}));

import { CandidateDetails, type CandidateDetailsData } from "@/components/suggestions/candidate-details";

const base: CandidateDetailsData = {
  age: 28, city: "الرياض", area: null, nationality: "سعودية", education: "بكالوريوس", fieldOfStudy: null,
  job: "معلمة", incomeRange: null, height: null, weight: null, skinColor: null, maritalStatus: "عزباء",
  childrenCount: 0, religiosity: "ملتزم", smokingStatus: null, hobbies: null, interests: null, lifestyle: null,
  beard: null, hijab: true, niqab: false, tribe: null, familyOriginArea: null, numberOfSiblings: null,
  housingType: null, cookingAbility: null, drivingLicense: null, willingToRelocate: null, familyValues: null,
};

describe("CandidateDetails sections", () => {
  it("leaves out a section with nothing answered in it", () => {
    render(<CandidateDetails c={base} />);
    expect(screen.getByText("المعلومات الشخصية")).toBeTruthy();
    expect(screen.queryByText("العائلة")).toBeNull();
  });

  it("shows the family section once one answer is there", () => {
    render(<CandidateDetails c={{ ...base, numberOfSiblings: 3 }} />);
    expect(screen.getByText("العائلة")).toBeTruthy();
    expect(screen.getByText("عدد الإخوة")).toBeTruthy();
  });

  it("keeps «نعم» / «لا» for the beard on the old page and «ملتحٍ» on the flat one", () => {
    const { unmount } = render(<CandidateDetails c={{ ...base, beard: true }} />);
    expect(screen.getByText("نعم")).toBeTruthy();
    unmount();
    const flat = render(<CandidateDetails c={{ ...base, beard: false }} flat />);
    expect(screen.getByText("غير ملتحٍ")).toBeTruthy();
    flat.unmount();
    render(<CandidateDetails c={{ ...base, beard: false }} />);
    expect(screen.getByText("لا")).toBeTruthy();
  });

  it("shows «الديانة» in the full profile when sent, and no hijab row for a Christian", () => {
    const { unmount } = render(<CandidateDetails c={{ ...base, religion: "مسيحي", hijab: null, niqab: null }} />);
    expect(screen.getByText("الديانة")).toBeTruthy();
    expect(screen.getByText("مسيحية")).toBeTruthy();
    expect(screen.queryByText("الحجاب")).toBeNull();
    unmount();
    render(<CandidateDetails c={{ ...base, religion: null }} />);
    expect(screen.queryByText("الديانة")).toBeNull();
  });
});
