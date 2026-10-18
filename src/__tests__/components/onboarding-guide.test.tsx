import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const data = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard" }));

import { OnboardingGuide } from "@/components/shared/onboarding-guide";

const legacyFlags = { introRequests: false, chat: false, mutualSuggestions: false, creditOnInterest: false };
const newFlags = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };
const recent = new Date(Date.now() - 60_000).toISOString();

function ctx(over: Record<string, unknown>) {
  return { loading: false, counts: { flags: legacyFlags }, profile: { gender: "FEMALE", createdAt: recent, profile: { isComplete: false } }, ...over };
}

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  });
});

describe("OnboardingGuide", () => {
  it("does not open while the profile and switches are loading", () => {
    data.current = ctx({ loading: true });
    render(<OnboardingGuide />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not crash when the step list shrinks under the current step", () => {
    data.current = ctx({});
    const { rerender } = render(<OnboardingGuide />);
    // Legacy flow: 5 steps. Walk to the last one.
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: /التالي/ }));
    expect(screen.getByRole("heading", { name: "أنت جاهز!" })).toBeTruthy();

    // The switches arrive and the setup is done: only 3 steps are left
    data.current = ctx({ counts: { flags: newFlags }, profile: { gender: "FEMALE", createdAt: recent, profile: { isComplete: true } } });
    expect(() => rerender(<OnboardingGuide />)).not.toThrow();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: /عرض الاقتراحات/ })).toBeTruthy();
  });

  it("survives blocked localStorage", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("SecurityError"); },
        setItem: () => { throw new Error("SecurityError"); },
      },
    });
    data.current = ctx({});
    expect(() => render(<OnboardingGuide />)).not.toThrow();
  });
});
