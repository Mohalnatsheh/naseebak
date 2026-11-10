import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const dash = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash.value }));

import { NextStepCard } from "@/components/dashboard/next-step-card";

/** Steps 1 and 3 done; step 2 has everything but «المذهب» */
const PROFILE = {
  dateOfBirth: "1995-01-01", nationality: "لبناني", city: "بيروت", education: "بكالوريوس",
  maritalStatus: "أعزب", religiosity: "ملتزم", prefAgeMin: 22, prefAgeMax: 30,
};

function setDash(country: "JO" | "LB") {
  dash.value = {
    counts: { flags: { introRequests: true, chat: true, mutualSuggestions: true }, pendingIntros: 0, unreadChats: 0, hasChats: false, guardian: null },
    profile: { gender: "MALE", country, profile: PROFILE },
    country,
  };
}

describe("next step card: setup hint follows the member's country", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a Lebanese member without «المذهب» is told step 2 is left", () => {
    setDash("LB");
    render(<NextStepCard qualifies={false} pendingSuggestions={null} credits={3} />);
    expect(screen.getByText(/بقي: الحالة الاجتماعية والتدين/)).toBeTruthy();
  });

  it("a Jordanian member with the same answers has no step left", () => {
    setDash("JO");
    render(<NextStepCard qualifies={false} pendingSuggestions={null} credits={3} />);
    expect(screen.queryByText(/بقي:/)).toBeNull();
  });
});
