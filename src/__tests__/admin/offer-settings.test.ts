import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("@/lib/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/settings")>();
  return {
    ...real,
    getSetting: vi.fn(async (key: string) => store.value[key] ?? ""),
    setSetting: vi.fn(async (key: string, value: string) => {
      store.value[key] = value;
    }),
  };
});
vi.mock("@/lib/db", () => ({ db: {} }));
const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () =>
    auth.admin ? { session: { user: { id: "admin1", role: "ADMIN" } } } : { error: new Response("no", { status: 403 }) },
  ),
}));

import { GET, PATCH } from "@/app/api/admin/settings/offer/route";

const patch = (body: object) => PATCH(new Request("http://localhost/api/admin/settings/offer", { method: "PATCH", body: JSON.stringify(body) }));
const start = "2026-11-26T22:00:00.000Z";
const end = "2026-11-30T21:59:00.000Z";

beforeEach(() => {
  store.value = {};
  auth.admin = true;
});

describe("admin sale offer settings", () => {
  it("saves the four keys and returns the state", async () => {
    const res = await patch({ percent: 50, startsAt: start, endsAt: end, title: "عروض الجمعة البيضاء" });
    expect(res.status).toBe(200);
    expect(store.value).toMatchObject({ offer_bonus_percent: "50", offer_starts_at: start, offer_ends_at: end, offer_title: "عروض الجمعة البيضاء" });
    const body = await res.json();
    expect(body).toMatchObject({ percent: 50, startsAt: start, endsAt: end, title: "عروض الجمعة البيضاء" });
    expect(["scheduled", "active", "ended"]).toContain(body.status);
  });

  it("refuses an end before the start", async () => {
    const res = await patch({ percent: 50, startsAt: end, endsAt: start, title: "" });
    expect(res.status).toBe(400);
    expect(store.value.offer_bonus_percent).toBeUndefined();
  });

  it("refuses a percent over 100", async () => {
    expect((await patch({ percent: 150, startsAt: start, endsAt: end, title: "" })).status).toBe(400);
  });

  it("percent 0 turns it off, dates may be empty", async () => {
    const res = await patch({ percent: 0, startsAt: null, endsAt: null, title: "" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("off");
  });

  it("is admin only", async () => {
    auth.admin = false;
    expect((await GET()).status).toBe(403);
    expect((await patch({ percent: 50, startsAt: start, endsAt: end, title: "" })).status).toBe(403);
  });
});
