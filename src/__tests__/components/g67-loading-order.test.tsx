import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: () => {}, replace: () => {}, refresh: () => {} }));
const data = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const autoSave = vi.hoisted(() => ({
  enabled: [] as boolean[],
  // Stable like the real hook's useCallback functions
  api: {
    savedIndicatorVisible: false,
    saveToLocalStorage: () => {},
    restoreDraft: () => null,
    clearDraft: () => {},
    saveToServer: () => {},
  },
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));
vi.mock("@/hooks/use-auto-save", () => ({
  useAutoSave: (enabled: boolean) => {
    autoSave.enabled.push(enabled);
    return autoSave.api;
  },
}));

const legacyFlags = { introRequests: false, chat: false, mutualSuggestions: false, creditOnInterest: false };
const newFlags = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
  autoSave.enabled = [];
  data.current = {
    loading: true, profile: null, profileFailed: false, counts: { flags: legacyFlags },
    refreshUnread: vi.fn(), refreshProfile: vi.fn(),
  };
});

describe("G67: pages wait for the switch flags before switch-dependent copy", () => {
  it("matches page shows its loader while the dashboard context is loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => json({ matches: [], totalPages: 1 }));
    const { default: MatchesPage } = await import("@/app/(ar)/dashboard/matches/page");
    render(<MatchesPage />);
    await act(async () => {});
    expect(screen.getByText("جاري تحميل التوافقات...")).toBeTruthy();
  });

  it("payments page shows its loader while the dashboard context is loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => json({ plans: [], payments: [], matchCredits: 2, totalPages: 1 }));
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await act(async () => {});
    expect(screen.getByText("جاري التحميل...")).toBeTruthy();
  });
});

describe("G67: setup wizard when /api/profile fails", () => {
  it("shows the retry screen and never turns auto-save on; a retry loads the form", async () => {
    data.current = { ...data.current, loading: false, counts: { flags: newFlags } };
    let fail = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/me/counts") return json({ flags: newFlags });
      if (url === "/api/profile") return fail ? json({ error: "x" }, false) : json({ user: { id: "u1", gender: "FEMALE", profile: null } });
      return json({});
    });
    const { default: SetupPage } = await import("@/app/(ar)/dashboard/profile/setup/page");
    render(<SetupPage />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل ملفك"));
    expect(autoSave.enabled.every((e) => e === false)).toBe(true);
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/profile" && (c[1] as RequestInit | undefined)?.method)).toBe(false);

    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(autoSave.enabled.at(-1)).toBe(true);
  });
});
