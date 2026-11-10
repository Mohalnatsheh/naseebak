import { describe, it, expect } from "vitest";
import { bubbleMisplaced, isLiveChatOffPath, tawkStyle } from "@/lib/live-chat";

describe("isLiveChatOffPath", () => {
  it.each(["/admin", "/admin/users/1", "/pay/p1", "/payments/return", "/dashboard/chats", "/dashboard/chats/c1", "/dashboard/payments", "/dashboard/pro"])("hides on %s", (p) => {
    expect(isLiveChatOffPath(p)).toBe(true);
  });

  it.each(["/", "/contact", "/login", "/dashboard", "/dashboard/suggestions", "/payment-terms"])("shows on %s", (p) => {
    expect(isLiveChatOffPath(p)).toBe(false);
  });
});

describe("tawkStyle", () => {
  it("clears the 64px bottom bar and the iPhone home-indicator area on phones", () => {
    expect(tawkStyle(390).visibility.mobile.yOffset).toBeGreaterThan(98);
  });

  it("does the same in a narrow desktop window, where Tawk uses its desktop style", () => {
    expect(tawkStyle(500).visibility.desktop.yOffset).toBeGreaterThan(98);
  });

  it("stays in the corner on a wide screen", () => {
    expect(tawkStyle(1280).visibility.desktop.yOffset).toBe(20);
  });
});

describe("bubbleMisplaced (QA WC-08)", () => {
  it("hides a bubble loaded in a wide window once the window narrows to the phone layout", () => {
    expect(bubbleMisplaced(1280, 600)).toBe(true);
    expect(bubbleMisplaced(1280, 1000)).toBe(false);
    // Loaded narrow: already above the bars
    expect(bubbleMisplaced(390, 390)).toBe(false);
    expect(bubbleMisplaced(500, 1280)).toBe(false);
  });
});
