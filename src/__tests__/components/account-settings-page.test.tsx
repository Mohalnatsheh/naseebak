import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const dash = vi.hoisted(() => ({
  redesign: true,
  pro: null as null | { isPro: boolean; cancelAtPeriodEnd?: boolean; showPage?: boolean },
  gender: "MALE",
}));
const api = vi.hoisted(() => ({ pendingDeletion: null as null | { scheduledAt: string } }));

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { firstName: "س", lastName: "ع", gender: dash.gender, phone: "962777000001", photos: [], profile: {} },
    completeness: { total: 50 }, unreadCount: 0, loading: false, country: "JO", refreshProfile: vi.fn(() => Promise.resolve()),
    counts: {
      dashboardRedesign: dash.redesign,
      pro: dash.pro,
      religionEnabled: false,
      flags: { introRequests: true, chat: true, mutualSuggestions: false },
      pendingIntros: 0,
    },
  }),
  useCountry: () => ({ code: "JO" }),
}));
vi.mock("@/lib/push-client", () => ({ signOutAndUnlinkPush: vi.fn(() => Promise.resolve()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/account", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/shared-get", () => ({
  sharedGet: () =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        user: {
          firstName: "س", lastName: "ع", gender: dash.gender,
          profile: { isComplete: true },
          _count: { matchesAsFemale: 0, matchesAsMale: 0 },
        },
      }),
    }),
}));

import AccountSettingsPage from "@/app/(ar)/dashboard/account/settings/page";
import AccountPage from "@/app/(ar)/dashboard/account/page";
import ProfilePage from "@/app/(ar)/dashboard/profile/page";
import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";

beforeEach(() => {
  dash.redesign = true;
  dash.pro = null;
  dash.gender = "MALE";
  api.pendingDeletion = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/profile/delete") {
        return Promise.resolve({
          ok: true,
          json: async () => (api.pendingDeletion ? { hasPendingDeletion: true, deletionRequest: api.pendingDeletion } : { hasPendingDeletion: false }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ requests: [] }) });
    })
  );
});

describe("«إعدادات الحساب» page", () => {
  it("shows the title, a way back to «حسابي», and pause and delete", () => {
    render(<AccountSettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "إعدادات الحساب" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /حسابي/ }).getAttribute("href")).toBe("/dashboard/account");
    expect(screen.getByText("تعطيل الحساب مؤقتاً")).toBeTruthy();
    expect(screen.getByText("حذف الحساب نهائياً")).toBeTruthy();
  });

  it("pause asks first, with the Pro renewal line for a renewing subscriber", () => {
    dash.pro = { isPro: true, cancelAtPeriodEnd: false };
    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /تعطيل الحساب/ }));
    expect(screen.getByText("هل أنت متأكد من رغبتك في تعطيل حسابك؟")).toBeTruthy();
    expect(screen.getByText(/يتوقف تجديد اشتراك Pro دون استرداد/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "نعم، تعطيل الحساب" })).toBeTruthy();
  });

  it("delete asks first, in the member's gender, with the Pro line", () => {
    dash.gender = "FEMALE";
    dash.pro = { isPro: true, cancelAtPeriodEnd: true };
    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^حذف الحساب$/ }));
    expect(screen.getByText("هل أنتِ متأكدة من رغبتكِ في حذف حسابكِ نهائياً؟")).toBeTruthy();
    expect(screen.getByText(/يتوقف تجديد اشتراك Pro فوراً دون استرداد/)).toBeTruthy();
    expect(screen.getByLabelText("سبب الحذف (اختياري)")).toBeTruthy();
  });

  it("shows a pending deletion with its cancel button", async () => {
    api.pendingDeletion = { scheduledAt: "2026-12-13T00:00:00.000Z" };
    render(<AccountSettingsPage />);
    expect(await screen.findByText("حذف الحساب قيد التنفيذ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إلغاء طلب الحذف وتفعيل الحساب" })).toBeTruthy();
  });
});

function settingsHrefs() {
  return screen.getAllByRole("link", { name: "إعدادات الحساب" }).map((a) => a.getAttribute("href"));
}

describe("where «إعدادات الحساب» lives, by the switch", () => {
  // The profile page's `<style jsx global>` needs the styled-jsx compiler, which tests don't run: React warns about it
  beforeEach(() => {
    const original = console.error;
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("for a non-boolean attribute")) return;
      original(...args);
    });
    return () => vi.mocked(console.error).mockRestore();
  });

  it("switch on: «حسابي» and the sidebar link to the page; the profile page has no section", async () => {
    render(<AccountPage />);
    expect(settingsHrefs()).toEqual(["/dashboard/account/settings"]);
    cleanup();
    render(<DashboardSidebar />);
    // The sidebar entry opens «حسابي» (owner, 2026-11-13); the settings page is a row there
    expect(settingsHrefs()).toEqual(["/dashboard/account"]);

    const { container } = render(<ProfilePage />);
    await screen.findByText("الملف الشخصي");
    expect(container.querySelector("#account-settings")).toBeNull();
    expect(screen.queryByText("تعطيل الحساب مؤقتاً")).toBeNull();
  });

  it("switch off: the links go to the profile section, which is there", async () => {
    dash.redesign = false;
    render(<AccountPage />);
    expect(settingsHrefs()).toEqual(["/dashboard/profile#account-settings"]);
    cleanup();
    render(<DashboardSidebar />);
    expect(settingsHrefs()).toEqual(["/dashboard/account"]);

    const { container } = render(<ProfilePage />);
    await waitFor(() => expect(container.querySelector("#account-settings")).not.toBeNull());
    expect(screen.getByText("تعطيل الحساب مؤقتاً")).toBeTruthy();
    expect(screen.getByText("حذف الحساب نهائياً")).toBeTruthy();
  });
});
