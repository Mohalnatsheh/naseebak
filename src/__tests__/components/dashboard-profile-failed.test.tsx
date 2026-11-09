import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const data = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/components/dashboard/next-step-card", () => ({ NextStepCard: () => <div>next-step</div> }));
vi.mock("@/components/intro/guardian-consent-card", () => ({ GuardianConsentCard: () => null }));
vi.mock("@/components/shared/install-app-card", () => ({ InstallAppCard: () => null }));

import { DashboardDataProvider, useDashboardData } from "@/contexts/dashboard-context";

const flags = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response);
}

function Probe() {
  const d = useDashboardData();
  useEffect(() => {
    data.current = d as unknown as Record<string, unknown>;
  });
  return <div>{d.loading ? "loading" : d.profileFailed ? "failed" : d.profile ? "ok" : "none"}</div>;
}

describe("DashboardDataProvider profileFailed (G56)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a failed /api/profile load instead of leaving an empty profile", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ error: "x" }, false);
      if (url === "/api/me/counts") return json({ flags });
      return json({ count: 0 });
    });
    render(<DashboardDataProvider><Probe /></DashboardDataProvider>);
    await waitFor(() => expect(screen.getByText("failed")).toBeTruthy());
    expect(data.current.profile).toBeNull();
  });

  it("a later failed refresh keeps the profile that loaded", async () => {
    let fail = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return fail ? Promise.reject(new Error("offline")) : json({ user: { id: "u1" } });
      if (url === "/api/me/counts") return json({ flags });
      return json({ count: 0 });
    });
    render(<DashboardDataProvider><Probe /></DashboardDataProvider>);
    await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
    fail = true;
    await act(async () => {
      await (data.current.refreshProfile as () => Promise<void>)();
    });
    expect(data.current.profileFailed).toBe(true);
    expect(data.current.profile).toMatchObject({ id: "u1" });
  });
});

describe("dashboard home when the profile failed (G56)", () => {
  it("shows LoadError with a retry, not the setup hero", async () => {
    const refreshProfile = vi.fn(async () => {});
    vi.doMock("@/contexts/dashboard-context", () => ({
      useDashboardData: () => ({
        profile: null, completeness: null, unreadCount: 0, loading: false, profileFailed: true, refreshProfile,
        counts: { flags, pendingIntros: 0, unreadChats: 0, hasChats: false, guardian: null, actionableMatches: 0 },
      }),
    }));
    vi.resetModules();
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    render(<DashboardPage />);
    expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل بياناتك");
    expect(screen.queryByText("next-step")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    vi.doUnmock("@/contexts/dashboard-context");
  });
});

describe("DashboardDataProvider polling (G65)", () => {
  it("skips the 30 s poll in a background tab and refreshes once when the tab is shown again", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    const spy = vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ user: { id: "u1" } });
      if (url === "/api/me/counts") return json({ flags });
      return json({ count: 0 });
    });
    const countsCalls = () => fetchSpy.mock.calls.filter((c) => String(c[0]) === "/api/me/counts").length;
    fetchSpy.mockClear();
    render(<DashboardDataProvider><Probe /></DashboardDataProvider>);
    await act(async () => {});
    expect(countsCalls()).toBe(1);

    visibility = "hidden";
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    expect(countsCalls()).toBe(1);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(countsCalls()).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(countsCalls()).toBe(3);
    spy.mockRestore();
    vi.useRealTimers();
  });
});

describe("DashboardDataProvider countsFailed (QA WA-02)", () => {
  it("marks counts that never loaded (first try and retry failed)", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ user: { id: "u1" } });
      if (url === "/api/me/counts") return json({ error: "x" }, false);
      return json({ count: 0 });
    });
    render(<DashboardDataProvider><Probe /></DashboardDataProvider>);
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    await act(async () => {});
    expect(data.current.countsFailed).toBe(true);
    vi.useRealTimers();
  });

  it("a counts answer without `pro` (server lookup failed) keeps the badge already shown", async () => {
    let withPro = true;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ user: { id: "u1" } });
      if (url === "/api/me/counts") return json(withPro ? { flags, pro: { isPro: true, cancelAtPeriodEnd: false, showPage: true } } : { flags });
      return json({ count: 0 });
    });
    render(<DashboardDataProvider><Probe /></DashboardDataProvider>);
    await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
    withPro = false;
    await act(async () => {
      await (data.current.refreshUnread as () => Promise<unknown>)();
    });
    expect((data.current.counts as { pro?: { isPro: boolean } }).pro?.isPro).toBe(true);
    expect(data.current.countsFailed).toBe(false);
  });
});

describe("dashboard home when the counts failed (QA WA-02)", () => {
  it("shows LoadError with a retry, not the switched-off flow", async () => {
    const refreshUnread = vi.fn(async () => true);
    vi.doMock("@/contexts/dashboard-context", () => ({
      useDashboardData: () => ({
        profile: { id: "u1", firstName: "س", gender: "FEMALE", profile: { isComplete: true }, _count: {} },
        completeness: { total: 100 }, unreadCount: 0, loading: false, profileFailed: false, countsFailed: true,
        refreshProfile: vi.fn(), refreshUnread, country: "JO",
        counts: { flags: { introRequests: false, chat: false, mutualSuggestions: false }, pendingIntros: 0, unreadChats: 0, hasChats: false, guardian: null, actionableMatches: 0 },
      }),
    }));
    vi.resetModules();
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    render(<DashboardPage />);
    expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل صفحتك");
    expect(screen.queryByText(/مكتمل/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });
    expect(refreshUnread).toHaveBeenCalledTimes(1);
    vi.doUnmock("@/contexts/dashboard-context");
  });

  it("a failed chats or feed load shows LoadError there, not an empty state (QA WA-03)", async () => {
    vi.doMock("@/contexts/dashboard-context", () => ({
      useDashboardData: () => ({
        profile: { id: "u1", firstName: "س", gender: "FEMALE", profile: { isComplete: true }, _count: {} },
        completeness: { total: 100 }, unreadCount: 0, loading: false, profileFailed: false, countsFailed: false,
        refreshProfile: vi.fn(), refreshUnread: vi.fn(), country: "JO",
        counts: { flags, pendingIntros: 0, unreadChats: 0, hasChats: true, guardian: null, actionableMatches: 0, newSuggestions: 0, likedYou: 0 },
      }),
    }));
    vi.doMock("@/components/engagement/poll-card", () => ({ PollCard: () => null }));
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith("/api/suggestions?")) return json({ emptyReason: "pending" });
      return json({ error: "x" }, false);
    });
    vi.resetModules();
    const { default: DashboardPage } = await import("@/app/(ar)/dashboard/page");
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText("تعذّر تحميل المحادثات.")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("تعذّر تحميل التوافقات المقترحة.")).toBeTruthy());
    expect(screen.queryByText(/تبدأ المحادثة عندما/)).toBeNull();
    expect(screen.queryByText(/لديك اقتراحات بانتظار الطرف الآخر/)).toBeNull();
    vi.doUnmock("@/contexts/dashboard-context");
    vi.doUnmock("@/components/engagement/poll-card");
  });
});
