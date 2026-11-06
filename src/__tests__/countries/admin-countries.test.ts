import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ countrySetting: { findMany: vi.fn(), upsert: vi.fn() }, user: { groupBy: vi.fn() } }));
const admin = vi.hoisted(() => ({ ok: true }));
const sms = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: async () =>
    admin.ok ? { session: { user: { id: "admin1", role: "ADMIN" } } } : { error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) },
}));
vi.mock("@/lib/sms", () => sms);
vi.mock("@/lib/rate-limit-db", () => ({ rateLimitDb: async () => ({ success: true }) }));

import { clearCountrySettingsCache } from "@/lib/countries/settings";
import { GET as list } from "@/app/api/admin/countries/route";
import { PATCH as update } from "@/app/api/admin/countries/[code]/route";
import { POST as testSms } from "@/app/api/admin/countries/[code]/test-sms/route";

const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const p = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.clearAllMocks();
  admin.ok = true;
  clearCountrySettingsCache();
  db.countrySetting.findMany.mockResolvedValue([]);
  db.countrySetting.upsert.mockResolvedValue({});
  db.user.groupBy.mockResolvedValue([{ country: "JO", _count: { _all: 900 } }]);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("admin countries", () => {
  it("saves a country's prices and their approval", async () => {
    const res = await update(req({ packagePrices: { sa_10: 20, sa_25: 35.5 }, pricesApproved: true }), p("SA"));
    expect(res.status).toBe(200);
    expect(db.countrySetting.upsert.mock.calls[0][0].update).toMatchObject({ packagePrices: { sa_10: 20, sa_25: 35.5 }, pricesApproved: true });
  });

  it("a first save of a country without a row works with no prices set", async () => {
    await update(req({ active: true }), p("SA"));
    const { create } = db.countrySetting.upsert.mock.calls[0][0];
    expect(create).not.toHaveProperty("packagePrices");
    expect(create).toMatchObject({ code: "SA", active: true });
  });

  it("refuses another country's package, and a price Stripe can't take", async () => {
    expect((await update(req({ packagePrices: { launch_10: 5 } }), p("SA"))).status).toBe(400);
    for (const price of [0, -1, 0.5, 2.555, 100000, "20"]) {
      expect((await update(req({ packagePrices: { sa_10: price } }), p("SA"))).status).toBe(400);
    }
    expect(db.countrySetting.upsert).not.toHaveBeenCalled();
  });

  it("admins only", async () => {
    admin.ok = false;
    expect((await list()).status).toBe(403);
    expect((await update(req({ active: true }), p("SA"))).status).toBe(403);
  });

  it("lists both countries with warnings, members and yes/no credential flags only", async () => {
    // Warnings may name a missing variable; the values themselves must never appear
    vi.stubEnv("BROADNET_USER", "broadnet-user-value");
    vi.stubEnv("BROADNET_PASS", "sk_live_PLANTED_SECRET");
    vi.stubEnv("UNIFONIC_APP_SID", "sk_test_PLANTED_SID");
    const res = await list();
    vi.unstubAllEnvs();
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.countries.map((c: { settings: { code: string } }) => c.settings.code)).toEqual(["JO", "SA"]);
    expect(body.countries[0].members.total).toBe(900);
    expect(body.countries[1].pricesApproved).toBe(false);
    expect(typeof body.server.broadnet).toBe("boolean");
    expect(text).not.toMatch(/broadnet-user-value|PLANTED_SECRET|PLANTED_SID/);
    expect(body.server.broadnet).toBe(true);
  });

  it("validates input and refuses unknown fields", async () => {
    expect((await update(req({ supportEmail: "not-an-email" }), p("SA"))).status).toBe(400);
    expect((await update(req({ smsSenderId: "way-too-long-sender" }), p("SA"))).status).toBe(400);
    expect((await update(req({ unifonicSecret: "x" }), p("SA"))).status).toBe(400);
    expect((await update(req({ active: true }), p("XX"))).status).toBe(404);
    expect(db.countrySetting.upsert).not.toHaveBeenCalled();
  });

  it("the default country can't be switched off", async () => {
    const res = await update(req({ active: false }), p("JO"));
    expect(res.status).toBe(409);
  });

  it("a first save creates the row from the defaults plus the change", async () => {
    const res = await update(req({ active: true, supportEmail: " sa@naseebak.com ", heroTitle: "" }), p("sa"));
    expect(res.status).toBe(200);
    const args = db.countrySetting.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ code: "SA" });
    expect(args.create).toMatchObject({ code: "SA", active: true, purchasesEnabled: false, supportEmail: "sa@naseebak.com", heroTitle: null, updatedById: "admin1" });
    expect(args.update).toMatchObject({ active: true, supportEmail: "sa@naseebak.com", heroTitle: null });
  });

  it("test SMS: the number must be of that country; the answer never carries provider replies or secrets", async () => {
    expect((await testSms(req({ phone: "0791234567" }), p("SA"))).status).toBe(400);
    sms.sendSms.mockResolvedValue(true);
    const res = await testSms(req({ phone: "0791234567" }), p("JO"));
    const body = await res.json();
    expect(body).toEqual({ sent: true, provider: expect.any(String), to: "96279****567" });
    expect(sms.sendSms).toHaveBeenCalledWith("962791234567", expect.stringContaining("رسالة تجربة"));
  });
});
