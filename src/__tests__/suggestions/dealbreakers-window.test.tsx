import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const ctx = vi.hoisted(() => ({ redesign: true as boolean }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE", profile: {} },
    country: "JO",
    counts: { dashboardRedesign: ctx.redesign },
  }),
}));

import { DealbreakersCard } from "@/components/suggestions/dealbreakers-card";

const prefs = { dealbreakers: [], prefAgeMin: 25, prefAgeMax: 35 };
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
  ok: true,
  status: 200,
  json: async () => (init?.method === "PUT" ? {} : { profile: prefs }),
}));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/dashboard/suggestions");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«شروطي الأساسية» window (switch dashboard_redesign)", () => {
  it("the trigger opens a Dialog (not a bottom sheet) with the same content", async () => {
    render(<DealbreakersCard asDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    expect(dialog.getAttribute("dir")).toBe("rtl");
    expect(dialog.textContent).toContain("شروطي الأساسية");
  });

  it("#dealbreakers in the URL opens it on load", async () => {
    window.history.replaceState(null, "", "/dashboard/suggestions#dealbreakers");
    render(<DealbreakersCard asDialog />);
    expect((await screen.findByRole("dialog")).getAttribute("data-slot")).toBe("dialog-content");
  });

  it("saving calls onSaved", async () => {
    const onSaved = vi.fn();
    render(<DealbreakersCard asDialog onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const save = await screen.findByRole("button", { name: "حفظ الشروط" });
    fireEvent.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("switch off: the editor stays the bottom sheet", async () => {
    render(<DealbreakersCard />);
    fireEvent.click(screen.getByRole("button", { name: /شروطي الأساسية/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-slot")).not.toBe("dialog-content");
  });
});
