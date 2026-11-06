import { describe, it, expect } from "vitest";
import { isLiveChatOffPath } from "@/lib/live-chat";

describe("isLiveChatOffPath", () => {
  it.each(["/admin", "/admin/users/1", "/pay/p1", "/payments/return", "/dashboard/chats", "/dashboard/chats/c1"])("hides on %s", (p) => {
    expect(isLiveChatOffPath(p)).toBe(true);
  });

  it.each(["/", "/contact", "/login", "/dashboard", "/dashboard/payments", "/dashboard/suggestions", "/payment-terms"])("shows on %s", (p) => {
    expect(isLiveChatOffPath(p)).toBe(false);
  });
});
