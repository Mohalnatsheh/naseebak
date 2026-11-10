import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProIntroCard, proIntroShown } from "@/components/payments/pro-intro-card";

// The test runner has no localStorage: a small in-memory one per test
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("proIntroShown (the home card announcing Pro)", () => {
  it("only for a member who can buy Pro and isn't Pro", () => {
    expect(proIntroShown({ isPro: false, cancelAtPeriodEnd: false, showPage: true })).toBe(true);
    expect(proIntroShown({ isPro: true, cancelAtPeriodEnd: false, showPage: true })).toBe(false);
    // Sales off, no plan for the country, or a test account: the page isn't linked, so no card
    expect(proIntroShown({ isPro: false, cancelAtPeriodEnd: false, showPage: false })).toBe(false);
    expect(proIntroShown(undefined)).toBe(false);
  });
});

describe("ProIntroCard", () => {
  it("names what Pro gives and links to the Pro page, in the viewer's gender", () => {
    render(<ProIntroCard gender="FEMALE" chatOn />);
    expect(screen.getByText("جديد")).toBeTruthy();
    expect(screen.getByText(/صور ورسائل صوتية في المحادثة/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /اكتشفي Pro/ });
    expect(link.getAttribute("href")).toBe("/dashboard/pro");
  });

  it("never describes chat media while chat is off", () => {
    render(<ProIntroCard gender="MALE" chatOn={false} />);
    expect(screen.queryByText(/المحادثة/)).toBeNull();
    expect(screen.getByRole("link", { name: /اكتشف Pro/ })).toBeTruthy();
  });

  it("✕ hides it on this device, and it stays hidden", () => {
    const { unmount } = render(<ProIntroCard gender="FEMALE" chatOn />);
    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    expect(screen.queryByText("جديد")).toBeNull();
    unmount();
    render(<ProIntroCard gender="FEMALE" chatOn />);
    expect(screen.queryByText("جديد")).toBeNull();
  });
});
