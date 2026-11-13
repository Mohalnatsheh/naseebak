import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const dash = vi.hoisted(() => ({ redesign: true }));
const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { firstName: "س", lastName: "ع", gender: "MALE", photos: [], profile: {} },
    completeness: { total: 50 }, unreadCount: 0, loading: false, country: "JO", refreshProfile: vi.fn(),
    counts: { dashboardRedesign: dash.redesign, flags: { introRequests: true, chat: true, mutualSuggestions: true }, pendingIntros: 0 },
  }),
}));
vi.mock("@/lib/push-client", () => ({ signOutAndUnlinkPush: signOut }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/account", useSearchParams: () => new URLSearchParams() }));

import AccountPage from "@/app/(ar)/dashboard/account/page";
import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";

const surfaces: [string, () => void][] = [
  ["account page", () => { render(<AccountPage />); }],
  ["sidebar", () => { render(<DashboardSidebar />); }],
];

function signOutButtons() {
  return screen.getAllByRole("button", { name: /تسجيل الخروج/ });
}

describe.each(surfaces)("sign-out confirm on the %s", (_name, mount) => {
  beforeEach(() => {
    signOut.mockClear();
    dash.redesign = true;
  });

  it("switch on: opens the dialog first, with the spec text", () => {
    mount();
    fireEvent.click(signOutButtons()[0]);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("تسجيل الخروج؟")).toBeTruthy();
    expect(screen.getByText(/سيتم تسجيل خروجك من هذا المتصفح ومن كل المتصفحات الأخرى. التطبيق على هاتفك لا يتأثر./)).toBeTruthy();
  });

  it("«إلغاء» closes with no call", () => {
    mount();
    fireEvent.click(signOutButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("confirm signs out once", () => {
    mount();
    fireEvent.click(signOutButtons()[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent?.trim() === "تسجيل الخروج")!);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith("/login");
  });

  it("switch off: signs out at once, no dialog", () => {
    dash.redesign = false;
    mount();
    fireEvent.click(signOutButtons()[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith("/login");
  });
});
