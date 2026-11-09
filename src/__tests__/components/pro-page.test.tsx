import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/dashboard/payments", search: "", replace: vi.fn() }));
const data = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: nav.replace, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}));
vi.mock("@/lib/push-client", () => ({ signOutAndUnlinkPush: vi.fn() }));

const flags = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };
const offer = { id: "monthly", price: 4, currency: "JOD", chargeCurrency: "usd", chargeAmount: 564, credits: 8, interval: "month" };
const sellingState = { enabled: true, isPro: false, plan: null, renewsAt: null, cancelAtPeriodEnd: false, pastDue: false, canBuy: true, offers: [offer] };
const proState = { ...sellingState, isPro: true, plan: "monthly", renewsAt: "2026-12-01T00:00:00Z", canBuy: false };

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
const pkg = { id: "jo_10", name: "10 أرصدة", credits: 10, price: 3, currency: "jod", currencySymbol: "د.أ" };
function serve(pro: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.startsWith("/api/payments/plans")) return json({ country: "JO", purchasesEnabled: true, packages: [pkg] });
    if (url.startsWith("/api/payments/history")) return json({ payments: [], matchCredits: 2, totalPages: 1 });
    if (url.startsWith("/api/pro")) return json(pro);
    return json({});
  });
}
function context(pro?: { isPro: boolean; cancelAtPeriodEnd: boolean; showPage?: boolean }) {
  data.current = {
    loading: false,
    profile: { firstName: "سارة", lastName: "", gender: "FEMALE", photos: [], matchCredits: 2, phone: "962700000000" },
    completeness: { total: 80 },
    country: "JO",
    unreadCount: 0,
    counts: { flags, pendingIntros: 0, unreadChats: 0, hasChats: false, guardian: null, actionableMatches: 0, credits: 2, ...(pro && { pro }) },
    refreshUnread: () => {},
    refreshProfile: () => {},
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  nav.pathname = "/dashboard/payments";
  nav.search = "";
  nav.replace.mockReset();
});
afterEach(cleanup);

describe("/dashboard/payments after Pro moved to its own page", () => {
  it("never renders the Pro plans or «اشتراكي», and never loads /api/pro", async () => {
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    const fetchSpy = serve(sellingState);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await screen.findByRole("button", { name: /شراء الآن/ });
    expect(screen.queryByRole("radiogroup", { name: "مدة الاشتراك" })).toBeNull();
    expect(screen.queryByText(/اشتركي الآن|اشترك الآن/)).toBeNull();
    expect(screen.queryByText("اشتراكي")).toBeNull();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith("/api/pro"))).toBe(false);
  });

  it("one link card to /dashboard/pro when plans can be bought", async () => {
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    serve(sellingState);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await screen.findByRole("button", { name: /شراء الآن/ });
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/dashboard/pro");
    expect(links).toHaveLength(1);
    expect(within(links[0]).getByText(/إرسال الصور والرسائل الصوتية/)).toBeTruthy();
  });

  it("the card says «إدارة اشتراكك» for a subscriber", async () => {
    context({ isPro: true, cancelAtPeriodEnd: false, showPage: true });
    serve(proState);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await screen.findByRole("button", { name: /شراء الآن/ });
    expect(screen.getByText(/إدارة اشتراكك/)).toBeTruthy();
  });

  it("no card when nothing can be bought and the member isn't Pro (or the counts didn't say)", async () => {
    for (const pro of [{ isPro: false, cancelAtPeriodEnd: false, showPage: false }, undefined]) {
      context(pro);
      serve(sellingState);
      const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
      render(<PaymentsPage />);
      await screen.findByRole("button", { name: /شراء الآن/ });
      expect(screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === "/dashboard/pro")).toHaveLength(0);
      expect(screen.queryByText(/عضوية/)).toBeNull();
      cleanup();
    }
  });

  it("an old Stripe return (?pro=success) is sent to the Pro page", async () => {
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    nav.search = "pro=success";
    serve(sellingState);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard/pro?pro=success"));
  });
});

describe("/dashboard/pro", () => {
  it("title, the compact plan card and the pitch", async () => {
    nav.pathname = "/dashboard/pro";
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    serve(sellingState);
    const { default: ProPage } = await import("@/app/(ar)/dashboard/pro/page");
    render(<ProPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "عضوية Pro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "اشتركي الآن" })).toBeTruthy();
    expect(screen.getByText(/مع Pro يمكنك إرسال الصور/)).toBeTruthy();
  });

  it("«اشتراكي» with the past-due note for a subscriber", async () => {
    nav.pathname = "/dashboard/pro";
    context({ isPro: true, cancelAtPeriodEnd: false, showPage: true });
    serve({ ...proState, pastDue: true });
    const { default: ProPage } = await import("@/app/(ar)/dashboard/pro/page");
    render(<ProPage />);
    expect(await screen.findByText("اشتراكي")).toBeTruthy();
    expect(screen.getByText(/لم ينجح تجديد الدفع/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /اشتركي الآن/ })).toBeNull();
  });

  it("sales off and not Pro: no plans, no pitch", async () => {
    nav.pathname = "/dashboard/pro";
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: false });
    serve({ ...sellingState, enabled: false, canBuy: false, offers: [] });
    const { default: ProPage } = await import("@/app/(ar)/dashboard/pro/page");
    render(<ProPage />);
    expect(await screen.findByText("الاشتراك غير متاح حالياً.")).toBeTruthy();
    expect(screen.queryByText(/مع Pro يمكنك/)).toBeNull();
    expect(screen.queryByRole("button", { name: /اشتركي الآن/ })).toBeNull();
  });

  it("the cancelled return says so and clears the query", async () => {
    nav.pathname = "/dashboard/pro";
    nav.search = "pro=cancel";
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    serve(sellingState);
    const { default: ProPage } = await import("@/app/(ar)/dashboard/pro/page");
    render(<ProPage />);
    expect(await screen.findByText("لم تكتمل عملية الدفع")).toBeTruthy();
    expect(nav.replace).toHaveBeenCalledWith("/dashboard/pro");
  });

  it("the success return polls /api/pro until Pro is on", async () => {
    nav.pathname = "/dashboard/pro";
    nav.search = "pro=success";
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/pro")) return json(++calls >= 2 ? proState : sellingState);
      return json({});
    });
    const { default: ProPage } = await import("@/app/(ar)/dashboard/pro/page");
    render(<ProPage />);
    expect(await screen.findByText("تم تفعيل اشتراك Pro")).toBeTruthy();
    expect(await screen.findByText("اشتراكي")).toBeTruthy();
  });
});

describe("«عضوية Pro» in the navigation", () => {
  it("sidebar: shown only under the rule, and not active on /dashboard/profile", async () => {
    const { DashboardSidebar } = await import("@/components/shared/dashboard-sidebar");
    nav.pathname = "/dashboard/profile";
    context({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    render(<DashboardSidebar />);
    const entry = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/dashboard/pro");
    expect(entry?.textContent).toContain("عضوية Pro");
    expect(entry?.className).not.toContain("bg-primary/10 text-primary");
    cleanup();

    for (const pro of [{ isPro: false, cancelAtPeriodEnd: false, showPage: false }, undefined]) {
      context(pro);
      render(<DashboardSidebar />);
      expect(screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === "/dashboard/pro")).toHaveLength(0);
      cleanup();
    }
  });

  it("«حسابي»: shown only under the rule", async () => {
    const { default: AccountPage } = await import("@/app/(ar)/dashboard/account/page");
    nav.pathname = "/dashboard/account";
    context({ isPro: true, cancelAtPeriodEnd: false, showPage: true });
    render(<AccountPage />);
    const entry = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/dashboard/pro");
    expect(entry?.textContent).toContain("عضوية Pro");
    expect(entry?.textContent).toContain("فعّالة");
    cleanup();

    context({ isPro: false, cancelAtPeriodEnd: false, showPage: false });
    render(<AccountPage />);
    expect(screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === "/dashboard/pro")).toHaveLength(0);
  });
});
