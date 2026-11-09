import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const refreshProfile = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: null, completeness: null, unreadCount: 0, loading: false, profileFailed: true, country: "JO", refreshProfile,
    counts: { flags: { introRequests: true, chat: true, mutualSuggestions: true }, pendingIntros: 0 },
  }),
}));
vi.mock("@/lib/push-client", () => ({ signOutAndUnlinkPush: vi.fn() }));

import AccountPage from "@/app/(ar)/dashboard/account/page";

describe("«حسابي» when the profile failed to load (QA WA-04)", () => {
  it("shows LoadError with a retry and keeps sign-out", async () => {
    render(<AccountPage />);
    expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل حسابك");
    expect(screen.getByRole("button", { name: /تسجيل الخروج/ })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });
});
