import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE" },
    counts: { flags: {}, guardian: { exists: true, consented: true } },
    refreshProfile: vi.fn(),
    refreshUnread: vi.fn(),
  }),
}));
// The real card saves through its sheet; here only its `onSaved` matters
vi.mock("@/components/suggestions/dealbreakers-card", () => ({
  DealbreakersCard: ({ onSaved }: { onSaved?: () => void }) => (
    <button type="button" onClick={onSaved}>
      حفظ الشروط
    </button>
  ),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";

const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [], total: 0, totalPages: 1 }) }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const feedCalls = () => (fetchMock.mock.calls as unknown as [string][]).map(([url]) => String(url)).filter((url) => url.includes("/api/suggestions/feed"));

describe("«شروطي الأساسية» saved on the suggestions page", () => {
  it("reloads «جديدة» with the top-up shortly after, so closed cards leave and the empty state is asked again", async () => {
    render(<MutualSuggestionsView />);
    const save = await screen.findByRole("button", { name: "حفظ الشروط" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    fetchMock.mockClear();
    fireEvent.click(save);
    // Not at once: the server's sweep runs in the background after the save answers
    expect(feedCalls()).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(feedCalls()).toContain("/api/suggestions/feed?tab=new&page=1&topup=1");
  });
});
