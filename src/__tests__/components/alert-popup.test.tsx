// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/dashboard", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));

import { AlertPopup, isAlertHome } from "@/components/shared/alert-popup";

const alert = { id: "a1", title: "عرض خاص", body: "تفاصيل", imageUrl: null, buttonUrl: null, buttonLabel: null };

describe("AlertPopup only on the dashboard home", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(JSON.stringify({ alert }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("isAlertHome: only /dashboard", () => {
    expect(isAlertHome("/dashboard")).toBe(true);
    expect(isAlertHome("/dashboard/")).toBe(true);
    expect(isAlertHome("/dashboard/profile/setup")).toBe(false);
    expect(isAlertHome("/dashboard/suggestions")).toBe(false);
    expect(isAlertHome("/login")).toBe(false);
    expect(isAlertHome(null)).toBe(false);
  });

  it("shows the waiting alert on home", async () => {
    nav.pathname = "/dashboard";
    render(<AlertPopup />);
    expect(await screen.findByText("عرض خاص")).toBeTruthy();
  });

  it("on setup (right after sign-up) or any other page: never asks, never shows", async () => {
    for (const p of ["/dashboard/profile/setup", "/dashboard/suggestions", "/dashboard/chats/x"]) {
      nav.pathname = p;
      render(<AlertPopup />);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText("عرض خاص")).toBeNull();
      cleanup();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("waits until the member reaches home", async () => {
    nav.pathname = "/dashboard/profile/setup";
    const { rerender } = render(<AlertPopup />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    nav.pathname = "/dashboard";
    rerender(<AlertPopup />);
    await waitFor(() => expect(screen.getByText("عرض خاص")).toBeTruthy());
  });
});
