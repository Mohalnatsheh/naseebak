import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const ctx = vi.hoisted(() => ({ redesign: true as boolean }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE", profile: {} },
    country: "JO",
    counts: { dashboardRedesign: ctx.redesign, religionEnabled: false, flags: { mutualSuggestions: true } },
    refreshProfile: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import { DealbreakersCard } from "@/components/suggestions/dealbreakers-card";

const stored = {
  isComplete: true,
  dealbreakers: [] as string[],
  prefAgeMin: 25,
  prefAgeMax: 35,
  prefCity: [] as string[],
  prefEducation: [],
  prefMaritalStatus: [],
  prefReligiosity: [],
  prefSmokingStatus: [],
  prefHijab: null,
  prefBeard: null,
  prefChildrenAcceptance: null,
};
type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data, clone() { return this; } });
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url === "/api/profile/dealbreakers" && method === "GET") return ok({ profile: stored });
  if (url === "/api/profile" && method === "GET") return ok({ user: { gender: "MALE", country: "JO", profile: stored } });
  if (url === "/api/profile/update-request" && method === "GET") return ok({ requests: [] });
  if (url === "/api/profile/parent-info") return ok({ parentInfo: null });
  return ok({});
});

beforeEach(() => {
  calls = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/dashboard/suggestions");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«تفضيلات الشريك» window on the suggestions page (as the app)", () => {
  it("the trigger opens a Dialog (not a bottom sheet) with every preference and its «شرط أساسي»", async () => {
    render(<DealbreakersCard asDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    expect(dialog.getAttribute("dir")).toBe("rtl");
    await within(dialog).findByText("المدن المفضلة");
    expect(dialog.textContent).toContain("العمر المفضل");
    expect(dialog.textContent).toContain("تفضيل الحجاب");
    expect(dialog.textContent).not.toContain("تفضيل اللحية");
    expect(within(dialog).getAllByText("شرط أساسي").length).toBeGreaterThan(3);
    expect(within(dialog).getByRole("button", { name: "حفظ التفضيلات" })).toBeTruthy();
  });

  it("#dealbreakers in the URL opens it on load", async () => {
    window.history.replaceState(null, "", "/dashboard/suggestions#dealbreakers");
    render(<DealbreakersCard asDialog />);
    expect((await screen.findByRole("dialog")).getAttribute("data-slot")).toBe("dialog-content");
  });

  it("#dealbreakers added later (a link on the same page) opens it", async () => {
    render(<DealbreakersCard asDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      window.history.replaceState(null, "", "/dashboard/suggestions#dealbreakers");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect((await screen.findByRole("dialog")).getAttribute("data-slot")).toBe("dialog-content");
  });

  it("an empty preference can't be a «شرط أساسي»; choosing a value enables it, and saving sends both, then onSaved", async () => {
    const onSaved = vi.fn();
    render(<DealbreakersCard asDialog onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("المدن المفضلة");
    const cityLock = dialog.querySelector<HTMLInputElement>("#pref-prefCity-dealbreaker")!;
    expect(cityLock.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: /^عمّان/ }));
    expect(cityLock.disabled).toBe(false);
    fireEvent.click(cityLock);
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التفضيلات" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const prefsPost = calls.find((c) => c.url === "/api/profile/update-request" && c.method === "POST");
    expect(prefsPost?.body).toEqual({ changes: { prefCity: ["عمّان"] } });
    const locks = calls.find((c) => c.url === "/api/profile/dealbreakers" && c.method === "PUT");
    expect(locks?.body).toEqual({ keys: ["city"] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a wrong age range shows its error and saves nothing", async () => {
    const onSaved = vi.fn();
    render(<DealbreakersCard asDialog onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("المدن المفضلة");
    const [min] = within(dialog).getAllByRole("textbox");
    fireEvent.change(min, { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التفضيلات" }));
    await within(dialog).findByText("العمر الأدنى يجب أن يكون أقل من العمر الأقصى");
    expect(calls.some((c) => c.method === "POST" || c.method === "PUT")).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("switch off: the editor stays the bottom sheet", async () => {
    render(<DealbreakersCard />);
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-slot")).not.toBe("dialog-content");
  });
});
