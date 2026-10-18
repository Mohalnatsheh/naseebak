import { describe, it, expect } from "vitest";
import { safeCallbackPath } from "@/lib/safe-redirect";

const origin = "https://naseebak.com";

describe("safeCallbackPath (G23)", () => {
  it("keeps a same-site path or same-origin URL (NextAuth sends the full URL)", () => {
    expect(safeCallbackPath("/dashboard/matches?match=m1", origin)).toBe("/dashboard/matches?match=m1");
    expect(safeCallbackPath("https://naseebak.com/dashboard/chats/c1", origin)).toBe("/dashboard/chats/c1");
  });

  it("falls back to /dashboard for other hosts and tricks", () => {
    for (const bad of [
      null, "", "https://evil.com/dashboard", "//evil.com/x", "/\\evil.com", "javascript:alert(1)",
      "http://naseebak.com/dashboard", "/login", "/register?x=1", "/api/profile", "/admin",
    ]) {
      expect(safeCallbackPath(bad, origin), String(bad)).toBe("/dashboard");
    }
  });
});
