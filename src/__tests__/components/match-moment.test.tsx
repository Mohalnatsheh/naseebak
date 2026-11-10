import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* S1 at the match moment, S2 on matched photos, S3 on the family steps */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE", firstName: "سامي" },
    counts: { flags: {}, guardian: { exists: true, consented: true } },
    refreshProfile: vi.fn(),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";
import { PersonCard } from "@/components/shared/person-card";

const candidate = { id: "c1", firstName: "ريم", isVerified: false, childrenCount: 0 } as const;
const item = { kind: "mutual", id: "s1", compatibilityScore: 70, reason: "سبب", createdAt: "2026-10-01", candidate, likedYou: true };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) {
      const isNew = url.includes("tab=new");
      return { ok: true, json: async () => ({ items: isNew ? [item] : [], total: isNew ? 1 : 0, totalPages: 1 }) };
    }
    if (url.includes("/decide")) return { ok: true, json: async () => ({ match: true, matchId: "m1" }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("the match moment", () => {
  it("draws the seal around both initials with «توافق متبادل!» and «عرض التوافق»", async () => {
    render(<MutualSuggestionsView />);
    fireEvent.click(await screen.findByRole("button", { name: /^مهتم/ }));
    const moment = await screen.findByTestId("match-moment");
    // Decorative: the visible «توافق متبادل!» is what is announced, once (review X4b minor 6)
    expect(within(moment).queryByRole("img", { name: "توافق متبادل" })).toBeNull();
    const seal = moment.querySelector<HTMLElement>("[data-slot=match-seal]")!;
    expect(seal.getAttribute("aria-hidden")).toBe("true");
    expect(seal.textContent).toContain("س · ر");
    seal.querySelectorAll("path").forEach((p) => expect(p.getAttribute("class")).toContain("animate-seal-draw"));
    expect(within(moment).getByText("توافق متبادل!")).toBeInTheDocument();
    expect(within(moment).getByRole("button", { name: /عرض التوافق/ })).toBeInTheDocument();
    // It sits in the majlis
    expect(moment.closest("[role=status]")!.className).toContain("majlis");
  });
});

describe("S2 on a matched card", () => {
  it("the photo fades in from a blur once matched; a hidden one is the veil", () => {
    const { container, rerender } = render(<PersonCard name="ريم" photoLocked />);
    expect(container.querySelector(".member-veil")).not.toBeNull();
    rerender(<PersonCard name="ريم" matched photoUrl="https://cdn.naseebak.com/a.jpg" />);
    expect(container.querySelector("img")!.className).toContain("photo-reveal");
  });
});
