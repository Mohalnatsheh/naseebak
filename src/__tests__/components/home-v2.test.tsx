import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/* Home v2 (switch dashboard_redesign): what needs me now first, then «مهتمون بك», «اليوم» and «المزيد» */

type Dash = Record<string, unknown> & { counts: Record<string, unknown>; profile: Record<string, unknown> };

function baseDash(): Dash {
  return {
    profile: { firstName: "أحمد", gender: "MALE", matchCredits: 3, profile: { isComplete: true }, _count: { matchesAsFemale: 0, matchesAsMale: 1 } },
    completeness: { total: 80, tips: [{ message: "أكمل اختبار الشخصية", link: "/dashboard/personality", impact: 10 }] },
    counts: {
      flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true, freeInterestReply: true },
      pendingIntros: 1,
      pendingIntroMatchId: "m1",
      unreadChats: 0,
      hasChats: true,
      guardian: { exists: true, consented: false },
      actionableMatches: 0,
      openMatches: 1,
      credits: 3,
      newSuggestions: 8,
      likedYou: 6,
      dashboardRedesign: true,
      pro: { isPro: false, cancelAtPeriodEnd: false, showPage: true },
    },
    unreadCount: 0,
    loading: false,
    profileFailed: false,
    countsFailed: false,
    refreshProfile: vi.fn(),
    refreshUnread: vi.fn(),
    country: "JO",
  };
}

const dash = vi.hoisted(() => ({ value: {} as Dash }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash.value }));
vi.mock("@/components/shared/banner-slot", () => ({
  BannerSlot: () => <div data-testid="banner-slot" />,
  requestsWaiting: (n: number) => `${n} طلبات تعارف`,
}));
vi.mock("@/components/engagement/poll-card", () => ({ PollCard: () => <div data-testid="poll-card" /> }));
vi.mock("@/components/dashboard/next-step-card", () => ({ NextStepCard: () => <div data-testid="next-step" /> }));
vi.mock("@/components/intro/guardian-consent-card", () => ({ GuardianConsentCard: () => <div data-testid="guardian-card" /> }));

const person = (i: number) => ({
  id: `s${i}`,
  compatibilityScore: 80,
  likedYou: true,
  candidate: { id: `c${i}`, firstName: `اسم${i}`, age: 20 + i, city: "عمّان" },
});

let interested: unknown[] = [];
let poll: unknown = null;
const fetchMock = vi.fn();
beforeEach(() => {
  dash.value = baseDash();
  interested = [1, 2, 3, 4, 5, 6].map(person);
  poll = { id: "p1", status: "ACTIVE", question: "ما أهم ما تبحث عنه؟", myVote: null };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) return { ok: true, json: async () => ({ items: interested }) };
    if (url.startsWith("/api/chats"))
      return {
        ok: true,
        json: async () => ({
          conversations: [{ id: "c1", status: "ACTIVE", unread: 2, matchHidden: false, partner: { firstName: "سارة", isPro: false }, lastMessage: { body: "شكراً على سؤالك", mine: false, createdAt: new Date().toISOString() } }],
        }),
      };
    if (url.startsWith("/api/polls/current")) return { ok: true, json: async () => ({ poll }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderHome() {
  const { HomeV2 } = await import("@/components/dashboard/home-v2");
  const r = render(<HomeV2 />);
  await screen.findByText("اسم1، 21");
  return r;
}
const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

describe("HomeV2", () => {
  it("keeps the order: greeting, banner, waiting, guardian card, interested, today, more", async () => {
    const { container } = await renderHome();
    await screen.findByText("سارة");
    await screen.findByText("سؤال الأسبوع");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^(صباح الخير|مساء الخير)، أحمد$/);
    const order = [
      container.querySelector("h1"),
      screen.getByTestId("banner-slot"),
      container.querySelector("#home-waiting"),
      screen.getByTestId("guardian-card"),
      container.querySelector("#home-interested"),
      container.querySelector("#home-today"),
      container.querySelector("#home-more"),
    ];
    order.forEach((el) => expect(el).not.toBeNull());
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `step ${i}`).toBeTruthy();
    }
  });

  it("«بانتظار ردّك»: a request row to its match; nothing waiting → no section", async () => {
    const { container, unmount } = await renderHome();
    const waiting = container.querySelector("#home-waiting") as HTMLElement;
    const row = within(waiting).getByRole("link", { name: /طلب تعارف بانتظار ردّك/ });
    expect(row.getAttribute("href")).toBe("/dashboard/suggestions?tab=matches&match=m1");
    unmount();

    dash.value.counts = { ...dash.value.counts, pendingIntros: 0, pendingIntroMatchId: null, actionableMatches: 0 };
    const again = await renderHome();
    expect(again.container.querySelector("#home-waiting")).toBeNull();
  });

  it("«بانتظار ردّك»: a match waiting for a step gets one row to the matches tab", async () => {
    dash.value.counts = { ...dash.value.counts, pendingIntros: 0, pendingIntroMatchId: null, actionableMatches: 2 };
    const { container } = await renderHome();
    const waiting = container.querySelector("#home-waiting") as HTMLElement;
    const row = within(waiting).getByRole("link", { name: /توافقان ينتظرانك/ });
    expect(row.getAttribute("href")).toBe("/dashboard/suggestions?tab=matches");
  });

  it("«مهتمون بك»: 5 people of 6 (the 4th and 5th hidden on phones), each to the tab, with the free-reply note", async () => {
    const { container } = await renderHome();
    const sec = container.querySelector("#home-interested") as HTMLElement;
    expect(within(sec).getByRole("heading", { name: "مهتمون بك" })).toBeTruthy();
    const people = sec.querySelectorAll("[data-person]");
    expect(people).toHaveLength(5);
    expect(within(sec).queryByText("اسم6، 26")).toBeNull();
    people.forEach((p, i) => {
      expect(p.className.includes("max-md:hidden")).toBe(i >= 3);
      expect(p.querySelector("a")!.getAttribute("href")).toBe("/dashboard/suggestions?tab=interested");
    });
    expect(within(sec).getByRole("link", { name: /عرض الكل/ }).getAttribute("href")).toBe("/dashboard/suggestions?tab=interested");
    expect(within(sec).getByText("ردّك بـ«مهتم» على من اهتم بك مجاني.")).toBeTruthy();
  });

  it("«مهتمون بك»: no note without free_interest_reply; no section on an empty tab", async () => {
    dash.value.counts = { ...dash.value.counts, flags: { ...(dash.value.counts.flags as object), freeInterestReply: false } };
    const first = await renderHome();
    expect(within(first.container.querySelector("#home-interested") as HTMLElement).queryByText(/مجاني/)).toBeNull();
    first.unmount();

    interested = [];
    const { HomeV2 } = await import("@/components/dashboard/home-v2");
    const { container } = render(<HomeV2 />);
    await waitFor(() => expect(urls().filter((u) => u.startsWith("/api/suggestions/feed")).length).toBe(2));
    await screen.findByText("اقتراحات جديدة");
    expect(container.querySelector("#home-interested")).toBeNull();
  });

  it("«اليوم»: new suggestions with the count, then conversations", async () => {
    const { container } = await renderHome();
    await screen.findByText("سارة");
    const today = container.querySelector("#home-today") as HTMLElement;
    const fresh = within(today).getByRole("link", { name: /اقتراحات جديدة/ });
    expect(fresh.getAttribute("href")).toBe("/dashboard/suggestions");
    expect(fresh.textContent).toContain("8");
    expect(within(today).getByRole("link", { name: /سارة/ }).getAttribute("href")).toBe("/dashboard/chats/c1");
  });

  it("fetches the top-up once, then the interested tab, and the chats", async () => {
    await renderHome();
    await screen.findByText("سارة");
    const u = urls();
    expect(u.filter((x) => x === "/api/suggestions?page=1")).toHaveLength(1);
    expect(u.indexOf("/api/suggestions?page=1")).toBeLessThan(u.indexOf("/api/suggestions/feed?tab=interested&page=1"));
    expect(u).toContain("/api/chats");
  });

  it("no chats call while chat is off and there are no chats", async () => {
    dash.value.counts = { ...dash.value.counts, flags: { ...(dash.value.counts.flags as object), chat: false }, hasChats: false };
    await renderHome();
    expect(urls()).not.toContain("/api/chats");
  });

  it("«المزيد»: poll, profile and Pro rows; the poll row opens PollCard in a dialog", async () => {
    const { container } = await renderHome();
    const more = container.querySelector("#home-more") as HTMLElement;
    const pollRow = await within(more).findByRole("button", { name: /سؤال الأسبوع/ });
    expect(within(pollRow).getByText("جديد")).toBeTruthy();
    expect(within(more).getByRole("link", { name: /ملفك مكتمل/ }).getAttribute("href")).toBe("/dashboard/personality");
    expect(within(more).getByRole("link", { name: /عضوية Pro/ }).getAttribute("href")).toBe("/dashboard/pro");
    expect(screen.queryByTestId("poll-card")).toBeNull();
    fireEvent.click(pollRow);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("poll-card")).toBeTruthy();
  });

  it("«المزيد»: no «جديد» once answered; nothing when there is no poll, the profile is complete and Pro isn't offered", async () => {
    poll = { id: "p1", status: "ACTIVE", question: "س", myVote: "a" };
    const first = await renderHome();
    const pollRow = await within(first.container.querySelector("#home-more") as HTMLElement).findByRole("button", { name: /سؤال الأسبوع/ });
    expect(within(pollRow).queryByText("جديد")).toBeNull();
    first.unmount();

    poll = null;
    dash.value.completeness = { total: 100, tips: [] };
    dash.value.counts = { ...dash.value.counts, pro: { isPro: true, cancelAtPeriodEnd: false, showPage: true } };
    const { container } = await renderHome();
    await waitFor(() => expect(urls().filter((u) => u === "/api/polls/current").length).toBe(2));
    expect(container.querySelector("#home-more")).toBeNull();
  });

  it("setup unfinished: the next-step card and none of the sections", async () => {
    dash.value.profile = { ...dash.value.profile, profile: { isComplete: false } };
    const { HomeV2 } = await import("@/components/dashboard/home-v2");
    const { container } = render(<HomeV2 />);
    expect(screen.getByTestId("next-step")).toBeTruthy();
    for (const id of ["home-waiting", "home-interested", "home-today", "home-more"]) {
      expect(container.querySelector(`#${id}`), id).toBeNull();
    }
    expect(urls()).not.toContain("/api/suggestions?page=1");
  });

  it("a failed interested load shows LoadError, never an empty state", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/suggestions/feed")) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({}) };
    });
    const { HomeV2 } = await import("@/components/dashboard/home-v2");
    render(<HomeV2 />);
    expect(await screen.findByText("تعذّر تحميل من اهتم بك.")).toBeTruthy();
  });
});

describe("dashboard page switch", () => {
  it("renders HomeV2 when dashboardRedesign is on, and the top-up runs once", async () => {
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    const { container } = render(<DashboardPage />);
    await screen.findByText("اسم1، 21");
    expect(container.querySelector("#home-today")).not.toBeNull();
    expect(container.querySelector("[data-home-column=main]")).toBeNull();
    expect(urls().filter((x) => x === "/api/suggestions?page=1")).toHaveLength(1);
  });

  it("renders today's home when the switch is off", async () => {
    dash.value.counts = { ...dash.value.counts, dashboardRedesign: false };
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    const { container } = render(<DashboardPage />);
    await waitFor(() => expect(container.querySelector("[data-home-column=main]")).not.toBeNull());
    expect(container.querySelector("#home-today")).toBeNull();
  });
});
