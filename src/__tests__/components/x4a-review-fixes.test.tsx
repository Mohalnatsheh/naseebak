import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { navBadges } from "@/lib/nav-badges";

/* Review X4a fixes: nav badges keyed by the link's own page, tips in the page content, counted request titles */

const dash = vi.hoisted(() => ({
  value: {
    profile: { firstName: "سلمى", lastName: "ع", gender: "FEMALE", matchCredits: 2, profile: { isComplete: true } },
    completeness: { total: 80 },
    unreadCount: 0,
    loading: false,
    counts: {
      flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true, freeInterestReply: true },
      pendingIntros: 1,
      likedYou: 2,
      newSuggestions: 5,
      unreadChats: 0,
      hasChats: true,
      credits: 2,
      pro: null,
    },
  },
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash.value }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/photos", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/push-client", () => ({ signOutAndUnlinkPush: vi.fn() }));
vi.mock("@/components/shared/push-setup", () => ({ usePushState: () => ({ stage: "done" }), PushSetupSheet: () => null }));

describe("navBadges", () => {
  it("shared suggestions: «الاقتراحات» = likedYou in gold, «التوافقات» = requests in red", () => {
    const b = navBadges({ unreadNotifications: 0, unreadChats: 3, pendingIntros: 1, mutualSuggestions: true, likedYou: 2, newSuggestions: 5 });
    expect(b["/dashboard/suggestions"]).toEqual({ n: 2, tone: "news" });
    expect(b["/dashboard/matches"]).toEqual({ n: 1, tone: "urgent" });
    expect(b["/dashboard/chats"]).toEqual({ n: 3, tone: "count" });
  });

  it("no «مهتم» waiting: the new cards in navy; switches off: nothing for suggestions", () => {
    expect(navBadges({ unreadNotifications: 0, unreadChats: 0, pendingIntros: 0, mutualSuggestions: true, likedYou: 0, newSuggestions: 4 })["/dashboard/suggestions"]).toEqual({ n: 4, tone: "count" });
    expect(navBadges({ unreadNotifications: 0, unreadChats: 0, pendingIntros: 0, mutualSuggestions: false, likedYou: 3, newSuggestions: 4 })["/dashboard/suggestions"].n).toBe(0);
  });
});

describe("DashboardSidebar badges (sidebar and bottom bar)", () => {
  it("«التوافقات» points at ?tab=matches and still carries the red requests badge", async () => {
    const { DashboardSidebar } = await import("@/components/shared/dashboard-sidebar");
    render(<DashboardSidebar />);
    const bar = screen.getByRole("navigation", { name: "التنقل الرئيسي" });
    const matches = within(bar).getByRole("link", { name: "التوافقات (1)" });
    expect(matches.getAttribute("href")).toBe("/dashboard/suggestions?tab=matches");
    expect(matches.querySelector(".bg-destructive")?.textContent).toBe("1");
    const suggestions = within(bar).getByRole("link", { name: "الاقتراحات (2)" });
    expect(suggestions.querySelector(".bg-accent")?.textContent).toBe("2");
    expect(suggestions.querySelector(".bg-destructive")).toBeNull();
  });
});

describe("page tips sit in the page content", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });

  it("PageTip renders its own line and is dismissed for good", async () => {
    const { PageTip } = await import("@/components/shared/banner-slot");
    render(<PageTip storageKey="tip-x" title="نصيحة" body="نص" />);
    expect(screen.getByText("نصيحة").closest("[data-banner]")?.getAttribute("data-banner")).toBe("tip");
    fireEvent.click(screen.getByRole("button", { name: "إخفاء النصيحة" }));
    expect(store.get("tip-x")).toBe("true");
    expect(screen.queryByText("نصيحة")).toBeNull();
  });

  it("the slot never shows a page's tip", async () => {
    const { BannerSlot } = await import("@/components/shared/banner-slot");
    dash.value = { ...dash.value, counts: { ...dash.value.counts, pendingIntros: 0 } };
    const { container } = render(<BannerSlot />);
    expect(container.querySelector("[data-banner]")).toBeNull();
  });
});

describe("request titles are counted", () => {
  it("one, two, a few, many", async () => {
    const { requestsWaiting } = await import("@/components/shared/banner-slot");
    expect(requestsWaiting(1)).toBe("طلب تعارف");
    expect(requestsWaiting(2)).toBe("طلبا تعارف");
    expect(requestsWaiting(3)).toBe("3 طلبات تعارف");
    expect(requestsWaiting(11)).toBe("11 طلباً للتعارف");
  });
});
