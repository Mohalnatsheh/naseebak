import { describe, it, expect } from "vitest";
import { isPrivatePath } from "@/lib/analytics";

describe("isPrivatePath (no tracking there)", () => {
  it("covers the dashboard, chats and admin", () => {
    for (const p of ["/dashboard", "/dashboard/chats/c1", "/chat", "/admin/users"]) expect(isPrivatePath(p)).toBe(true);
  });
  it("leaves public pages tracked", () => {
    for (const p of ["/", "/blog/x", "/faq", "/login", "/register", "/dashboards-guide"]) expect(isPrivatePath(p)).toBe(false);
  });
});
