import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), count: vi.fn() },
  mobileSession: { groupBy: vi.fn() },
  pushDevice: { findMany: vi.fn() },
  activityDay: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ session: { user: { id: "a", role: "ADMIN" } } })) }));
vi.mock("@/lib/countries/server", () => ({ getAdminCountry: vi.fn(async () => "ALL"), userCountryWhere: () => ({}) }));

import { GET } from "@/app/api/admin/users/route";

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "u4" }]);
  db.user.count.mockResolvedValue(4);
  db.mobileSession.groupBy.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }, { userId: "u4" }]);
  db.pushDevice.findMany.mockResolvedValue([{ userId: "u2", platform: "ios" }]);
  db.activityDay.findMany.mockResolvedValue([
    { userId: "u1", source: "APP_ANDROID" },
    { userId: "u1", source: "WEB_IPHONE" },
    { userId: "u3", source: "WEB_DESKTOP" },
  ]);
});

describe("admin users «Uses»", () => {
  it("app platform from activity, else push device, else unknown; website devices since 4 Nov", async () => {
    const body = await (await GET(new Request("http://x/api/admin/users")))!.json();
    const uses = Object.fromEntries(body.users.map((u: { id: string; uses: unknown }) => [u.id, u.uses]));
    expect(uses).toEqual({
      u1: { app: "android", web: ["iphone"] },
      u2: { app: "ios", web: [] },
      u3: { app: null, web: ["desktop"] },
      u4: { app: "unknown", web: [] },
    });
  });

  it("filters app users / website only by app sign-ins", async () => {
    await GET(new Request("http://x/api/admin/users?uses=app"));
    expect(db.user.findMany.mock.calls[0][0].where.mobileSessions).toEqual({ some: {} });
    await GET(new Request("http://x/api/admin/users?uses=web"));
    expect(db.user.findMany.mock.calls[1][0].where.mobileSessions).toEqual({ none: {} });
  });
});
