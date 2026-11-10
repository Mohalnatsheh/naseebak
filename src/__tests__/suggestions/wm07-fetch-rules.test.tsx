import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/* QA WM-07: the suggestions page decides the view from counts.flags and fetches only what it shows */

const dash = vi.hoisted(() => ({
  value: {
    profile: { gender: "MALE", firstName: "سامي", matchCredits: 2 },
    loading: false,
    country: "JO",
    counts: {
      flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true, freeInterestReply: true },
      guardian: { exists: true, consented: true },
      credits: 2,
    },
    refreshProfile: vi.fn(),
    refreshUnread: vi.fn(),
  } as Record<string, unknown>,
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash.value }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/components/matches/matches-view", () => ({ MatchesView: () => <div>matches-list</div> }));
vi.mock("@/lib/notifications-client", () => ({ markPageNotificationsRead: vi.fn() }));

const fetchMock = vi.fn();
const urls = () => fetchMock.mock.calls.map(([u]) => String(u));
beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard/suggestions");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/profile") return { ok: true, clone() { return this; }, json: async () => ({ user: { profile: { isComplete: true } }, completeness: { total: 90 } }) };
    if (url.startsWith("/api/suggestions/feed")) {
      const top = url.includes("topup=1");
      return { ok: true, json: async () => ({ items: [], total: 0, totalPages: 1, ...(top && { emptyReason: "no_candidates", nextSuggestionsAt: null }) }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function openPage() {
  const { default: SuggestionsPage } = await import("@/app/(ar)/dashboard/suggestions/page");
  render(<SuggestionsPage />);
}

describe("suggestions page fetch rules (WM-07)", () => {
  it("shared suggestions: no legacy /api/suggestions call; «جديدة» tops up once and says why it is empty", async () => {
    await openPage();
    expect(await screen.findByText("لا يوجد حالياً من يطابق شروطك")).toBeInTheDocument();
    expect(urls().filter((u) => u.startsWith("/api/suggestions?"))).toEqual([]);
    expect(urls().filter((u) => u.includes("topup=1"))).toEqual(["/api/suggestions/feed?tab=new&page=1&topup=1"]);
    // The visible tab's cards, the other two only as counts
    const feed = urls().filter((u) => u.startsWith("/api/suggestions/feed"));
    expect(feed.filter((u) => !u.includes("count=1"))).toHaveLength(1);
  });

  it("«التوافقات» tab: the matches list, only counts for the feed (the «جديدة» count carries the top-up)", async () => {
    window.history.replaceState(null, "", "/dashboard/suggestions?tab=matches");
    await openPage();
    expect(await screen.findByText("matches-list")).toBeInTheDocument();
    await waitFor(() => expect(urls().filter((u) => u.startsWith("/api/suggestions/feed"))).toHaveLength(3));
    const feed = urls().filter((u) => u.startsWith("/api/suggestions/feed"));
    expect(feed.every((u) => u.includes("count=1"))).toBe(true);
    expect(feed.filter((u) => u.includes("topup=1"))).toEqual(["/api/suggestions/feed?tab=new&page=1&count=1&topup=1"]);
    expect(urls().filter((u) => u.startsWith("/api/suggestions?"))).toEqual([]);
  });

  it("a failed first «جديدة» request: the retry carries the top-up again (review X4b minor 1)", async () => {
    let failed = false;
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string) => {
      if (!failed && url.includes("topup=1")) {
        failed = true;
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return base(url);
    });
    await openPage();
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(await screen.findByRole("button", { name: /حاول|إعادة/ }));
    expect(await screen.findByText("لا يوجد حالياً من يطابق شروطك")).toBeInTheDocument();
    expect(urls().filter((u) => u.includes("topup=1"))).toEqual([
      "/api/suggestions/feed?tab=new&page=1&topup=1",
      "/api/suggestions/feed?tab=new&page=1&topup=1",
    ]);
  });

  it("switches off: the legacy list is still loaded from /api/suggestions", async () => {
    dash.value = { ...dash.value, counts: { ...(dash.value.counts as object), flags: { introRequests: false, chat: false, mutualSuggestions: false } } };
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/profile") return { ok: true, clone() { return this; }, json: async () => ({ user: { profile: { isComplete: true } }, completeness: { total: 90 } }) };
      return { ok: true, json: async () => ({ mutualView: false, suggestions: [], totalPages: 1, credits: 2 }) };
    });
    await openPage();
    await waitFor(() => expect(urls()).toContain("/api/suggestions?page=1"));
    expect(urls().some((u) => u.includes("topup=1"))).toBe(false);
  });
});
