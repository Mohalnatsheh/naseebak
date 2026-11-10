import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ notification: { findMany: vi.fn(), updateMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })),
}));

import { POST } from "@/app/api/notifications/read-for-page/route";

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/notifications/read-for-page", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.notification.updateMany.mockResolvedValue({ count: 0 });
  db.notification.findMany.mockResolvedValue([
    { id: "n1", type: "SUGGESTION", metadata: { url: "/dashboard/suggestions?tab=interested" } },
    { id: "n2", type: "SUGGESTION", metadata: null }, // type link: /dashboard/suggestions
    { id: "n3", type: "MATCH", metadata: { url: "/dashboard/matches?match=m1" } },
    { id: "n4", type: "CHAT", metadata: { url: "/dashboard/chats/c1" } },
    { id: "n5", type: "CHAT", metadata: null }, // /dashboard/chats
  ]);
});

describe("POST /api/notifications/read-for-page", () => {
  it("marks the notices that lead to the opened page (query string ignored), only mine", async () => {
    const res = await call({ path: "/dashboard/suggestions" });
    expect(await res.json()).toEqual({ marked: 2, unreadCount: 3 });
    expect(db.notification.findMany.mock.calls[0][0].where).toEqual({ userId: "u1", isRead: false });
    expect(db.notification.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["n1", "n2"] }, userId: "u1" }, data: { isRead: true } });
  });

  it("a page prefix covers its sub-pages; exact covers only the page itself", async () => {
    expect(await (await call({ path: "/dashboard/chats" })).json()).toEqual({ marked: 2, unreadCount: 3 });
    expect(await (await call({ path: "/dashboard/chats", exact: true })).json()).toEqual({ marked: 1, unreadCount: 4 });
    expect(await (await call({ path: "/dashboard/chats/c1" })).json()).toEqual({ marked: 1, unreadCount: 4 });
  });

  it("nothing to mark → no write; bad paths are refused", async () => {
    expect(await (await call({ path: "/dashboard/payments" })).json()).toEqual({ marked: 0, unreadCount: 5 });
    expect(db.notification.updateMany).not.toHaveBeenCalled();
    for (const path of ["/admin", "https://evil.com/dashboard", "/dashboard/../admin", "dashboard"]) {
      expect((await call({ path })).status).toBe(400);
    }
  });
});
