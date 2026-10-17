import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE" },
    counts: { flags: {}, guardian: { exists: true, consented: true } },
    refreshProfile: vi.fn(),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";

const candidate = { id: "c1", firstName: "سارة", isVerified: false, childrenCount: 0 } as const;
const item = { kind: "mutual", id: "s1", compatibilityScore: 70, reason: "سبب", createdAt: "2026-10-01", candidate };
let feedItems: unknown[];
const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  feedItems = [item];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) {
      const isNew = url.includes("tab=new");
      return { ok: true, json: async () => ({ items: isNew ? feedItems : [], total: isNew ? feedItems.length : 0, totalPages: 1 }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  toastMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const decideCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/decide"));

describe("«لا» with undo", () => {
  it("hides the card at once and sends the decision only after the undo window", async () => {
    render(<MutualSuggestionsView />);
    fireEvent.click(await screen.findByRole("button", { name: /^لا$/ }));
    expect(screen.queryByText("سارة")).not.toBeInTheDocument();
    expect(decideCalls()).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(decideCalls()).toHaveLength(1);
    expect(decideCalls()[0][1]).toMatchObject({ method: "POST", keepalive: true, body: JSON.stringify({ interested: false }) });
  });

  it("«تراجع» cancels the decision and brings the card back", async () => {
    render(<MutualSuggestionsView />);
    fireEvent.click(await screen.findByRole("button", { name: /^لا$/ }));
    const undo = toastMock.mock.calls[0][1].action.onClick as () => void;
    await act(async () => {
      undo();
    });
    expect(await screen.findByText("سارة")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(decideCalls()).toHaveLength(0);
  });

  it("leaving the page inside the window still sends it", async () => {
    const { unmount } = render(<MutualSuggestionsView />);
    fireEvent.click(await screen.findByRole("button", { name: /^لا$/ }));
    unmount();
    expect(decideCalls()).toHaveLength(1);
  });
});
