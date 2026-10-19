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
