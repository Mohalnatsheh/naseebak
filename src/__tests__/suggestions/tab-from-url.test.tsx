import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// The URL the Next router reports; a sidebar <Link> to ?tab=matches changes it without a reload or popstate
const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/suggestions",
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "FEMALE" },
    counts: { flags: {}, guardian: { exists: true, consented: true } },
    refreshProfile: vi.fn(async () => {}),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/components/matches/matches-view", () => ({ MatchesView: () => <div data-testid="matches-list" /> }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";

const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [], total: 0, totalPages: 1 }) }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.search = "";
  window.history.replaceState(null, "", "/dashboard/suggestions");
});
afterEach(() => vi.unstubAllGlobals());

function goTo(search: string) {
  nav.search = search;
  window.history.pushState(null, "", `/dashboard/suggestions${search ? `?${search}` : ""}`);
}

describe("the tab follows the URL on client navigation (sidebar «التوافقات» while on the page)", () => {
  it("?tab=matches from a link opens the matches list without a reload", async () => {
    const { rerender } = render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    expect(screen.queryByTestId("matches-list")).not.toBeInTheDocument();

    goTo("tab=matches");
    rerender(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    expect(await screen.findByTestId("matches-list")).toBeInTheDocument();
  });

  it("a link back to the plain page leaves the matches list for «جديدة»", async () => {
    goTo("tab=matches");
    const { rerender } = render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    expect(await screen.findByTestId("matches-list")).toBeInTheDocument();

    goTo("");
    rerender(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    await waitFor(() => expect(screen.queryByTestId("matches-list")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes("tab=new"))).toBe(true)
    );
  });
});
