import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

/* P2-6: the two-column desktop home (greeting, banner slot, today's suggestions | tiles, chats, profile strength) */

const dash = vi.hoisted(() => ({
  value: {
    profile: { firstName: "ريم", gender: "FEMALE", matchCredits: 3, profile: { isComplete: true }, _count: { matchesAsFemale: 1, matchesAsMale: 0 } },
    completeness: { total: 70, tips: [] },
    counts: {
      flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true, freeInterestReply: true },
      pendingIntros: 1,
      unreadChats: 0,
      hasChats: true,
      guardian: { exists: true, consented: true },
      actionableMatches: 2,
      openMatches: 2,
      credits: 3,
      newSuggestions: 4,
      likedYou: 2,
    },
    unreadCount: 0,
    loading: false,
    profileFailed: false,
    countsFailed: false,
    refreshProfile: vi.fn(),
    refreshUnread: vi.fn(),
    country: "JO",
  },
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash.value }));
vi.mock("@/components/shared/banner-slot", () => ({ BannerSlot: () => <div data-testid="banner-slot" />, requestsWaiting: (n: number) => `${n} طلبات تعارف` }));
vi.mock("@/components/engagement/poll-card", () => ({ PollCard: () => <div data-testid="poll" /> }));
vi.mock("@/components/dashboard/next-step-card", () => ({ NextStepCard: () => <div data-testid="next-step" /> }));
vi.mock("@/components/intro/guardian-consent-card", () => ({ GuardianConsentCard: () => null }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed"))
      return { ok: true, json: async () => ({ items: [{ id: "s1", compatibilityScore: 80, candidate: { firstName: "سامي", age: 30, city: "عمّان" } }] }) };
    if (url.startsWith("/api/chats"))
      return { ok: true, json: async () => ({ conversations: [{ id: "c1", status: "ACTIVE", unread: 1, partner: { firstName: "خالد" }, lastMessage: { body: "مرحبا", mine: false, createdAt: new Date().toISOString() } }] }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("home on two columns", () => {
  it("main: greeting, the banner slot, what waits and today's suggestions; side: tiles, chats, profile strength", async () => {
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    const { container } = render(<DashboardPage />);
    await screen.findByText("سامي");
    await screen.findByText("خالد");
    const main = container.querySelector("[data-home-column=main]") as HTMLElement;
    const side = container.querySelector("[data-home-column=side]") as HTMLElement;
    expect(within(main).getByRole("heading", { level: 1 }).textContent).toContain("ريم");
    // The slot sits under the greeting, in the main column
    const slot = within(main).getByTestId("banner-slot");
    expect(main.querySelector("h1")!.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(main).getByText("سامي")).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "بانتظار ردّك" })).toBeInTheDocument();
    expect(within(side).getByText("خالد")).toBeInTheDocument();
    expect(within(side).getByRole("heading", { name: /ملفكِ مكتمل/ })).toBeInTheDocument();
    // The grid only from lg: phones keep one column
    expect((container.firstChild as HTMLElement).className).toContain("lg:grid-cols-");
  });

  it("the tiles (desktop in the side, phones in the main column): new, «مهتمون بكِ» in gold, matches in red with a request", async () => {
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    const { container } = render(<DashboardPage />);
    await screen.findByText("سامي");
    const side = container.querySelector("[data-home-column=side]") as HTMLElement;
    const tiles = within(side).getByTestId("home-tiles");
    expect(tiles.parentElement!.className).toContain("hidden lg:block");
    const liked = within(tiles).getByRole("link", { name: /مهتمون بكِ/ });
    expect(liked.getAttribute("data-tone")).toBe("news");
    expect(liked.getAttribute("href")).toBe("/dashboard/suggestions?tab=interested");
    const matches = within(tiles).getByRole("link", { name: /توافقات تنتظرك/ });
    expect(matches.getAttribute("data-tone")).toBe("urgent");
    expect(matches.textContent).toContain("3");
    expect(matches.getAttribute("href")).toBe("/dashboard/suggestions?tab=matches");
    const main = container.querySelector("[data-home-column=main]") as HTMLElement;
    expect(within(main).getByTestId("home-tiles").parentElement!.className).toContain("lg:hidden");
  });
});
