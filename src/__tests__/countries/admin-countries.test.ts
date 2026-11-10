import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ countrySetting: { findMany: vi.fn(), upsert: vi.fn() }, user: { groupBy: vi.fn() } }));
const admin = vi.hoisted(() => ({ ok: true }));
const sms = vi.hoisted(() => ({ sendSms: vi.fn(), sendOtpCode: vi.fn(), otpChannel: vi.fn(async () => "sms") }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: async () =>
    admin.ok ? { session: { user: { id: "admin1", role: "ADMIN" } } } : { error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) },
}));
vi.mock("@/lib/sms", () => sms);
vi.mock("@/lib/rate-limit-db", () => ({ rateLimitDb: async () => ({ success: true }) }));

import { clearCountrySettingsCache, getCountrySettings } from "@/lib/countries/settings";
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

  it("refuses a Saudi price under Stripe's minimum", async () => {
    expect((await update(req({ packagePrices: { sa_10: 1.5 } }), p("SA"))).status).toBe(400);
    expect((await update(req({ packagePrices: { launch_10: 1.5 } }), p("JO"))).status).toBe(200);
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

  it("Pro plans round-trip: a first save creates the row with them, and the stored value reads back as the same plans", async () => {
    const proPlans = { monthly: { enabled: true, price: 4, credits: 8 }, yearly: { enabled: false, price: 40, credits: 5 } };
    await update(req({ proPlans }), p("JO"));
    const { create } = db.countrySetting.upsert.mock.calls[0][0];
    expect(create.proPlans).toEqual(proPlans);
    // A first save with no Pro change sends no plain null into the Json column
    await update(req({ active: true }), p("SA"));
    expect(db.countrySetting.upsert.mock.calls[1][0].create).not.toHaveProperty("proPlans");

    clearCountrySettingsCache();
    db.countrySetting.findMany.mockResolvedValue([{ ...create, createdAt: new Date(), updatedAt: new Date(), updatedById: "admin1" }]);
    expect((await getCountrySettings("JO")).proPlans).toEqual(proPlans);
  });

  it("saves Pro plans per country", async () => {
    const proPlans = { weekly: { enabled: false, price: 2, credits: 1 }, monthly: { enabled: true, price: 5.5, credits: 10 }, yearly: { enabled: true, price: 50, credits: 12 } };
    const res = await update(req({ proPlans }), p("JO"));
    expect(res.status).toBe(200);
    expect(db.countrySetting.upsert.mock.calls[0][0].update).toMatchObject({ proPlans });
  });

  it("clearing every Pro plan stores NULL, not {} (QA WEB-PAY-16)", async () => {
    const { Prisma } = await import("@prisma/client");
    expect((await update(req({ proPlans: {} }), p("JO"))).status).toBe(200);
    expect(db.countrySetting.upsert.mock.calls[0][0].update.proPlans).toBe(Prisma.DbNull);
  });

  it("refuses Pro plans with a zero or negative price, bad credits, unknown plans or a Saudi price under 2", async () => {
    const ok = { enabled: true, price: 5, credits: 10 };
    for (const proPlans of [
      { monthly: { ...ok, price: -1 } },
      { monthly: { ...ok, price: 0 } },
      { monthly: { ...ok, credits: -1 } },
      { monthly: { ...ok, credits: 101 } },
      { monthly: { ...ok, credits: 1.5 } },
      { monthly: { ...ok, price: 5.555 } },
      { daily: ok },
      { monthly: { price: 5, credits: 1 } },
    ]) {
      expect((await update(req({ proPlans }), p("JO"))).status).toBe(400);
    }
    expect((await update(req({ proPlans: { monthly: { ...ok, price: 1.5 } } }), p("SA"))).status).toBe(400);
    // Jordan is charged in dollars: under 0.36 JOD is under Stripe's 0.50 USD minimum
    const jo = await update(req({ proPlans: { monthly: { ...ok, price: 0.35 } } }), p("JO"));
    expect(jo.status).toBe(400);
    expect((await jo.json()).error).toBe("A Jordan Pro plan price must be at least 0.36 JOD");
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
    expect(body.countries.map((c: { settings: { code: string } }) => c.settings.code)).toEqual(["JO", "SA", "LB"]);
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

  it("test code: a WhatsApp country gets a real 6-digit code, never echoed back", async () => {
    sms.otpChannel.mockResolvedValueOnce("whatsapp");
    sms.sendOtpCode.mockResolvedValue(true);
    const res = await testSms(req({ phone: "03123456" }), p("LB"));
    const text = JSON.stringify(await res.json());
    const sentCode = sms.sendOtpCode.mock.calls[0][1];
    expect(sms.sendOtpCode).toHaveBeenCalledWith("9613123456", expect.stringMatching(/^\d{6}$/));
    expect(text).not.toContain(sentCode);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  describe("test SMS where codes go by WhatsApp", () => {
    beforeEach(() => {
      vi.stubEnv("SMS_MOCK", "");
      vi.stubEnv("VERIFYWAY_API_KEY", "vw-key");
      sms.otpChannel.mockResolvedValue("whatsapp");
      sms.sendSms.mockResolvedValue(true);
      sms.sendOtpCode.mockResolvedValue(true);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      sms.otpChannel.mockResolvedValue("sms");
    });

    it("Saudi Arabia with Unifonic configured keeps testing Unifonic by SMS", async () => {
      vi.stubEnv("UNIFONIC_APP_SID", "sid");
      vi.stubEnv("UNIFONIC_SENDER_ID", "Naseebak");
      const res = await testSms(req({ phone: "0501234567" }), p("SA"));
      expect(await res.json()).toEqual({ sent: true, provider: "UNIFONIC", to: expect.any(String) });
      expect(sms.sendSms).toHaveBeenCalledWith("966501234567", expect.stringContaining("رسالة تجربة"));
      expect(sms.sendOtpCode).not.toHaveBeenCalled();
    });

    it("Lebanon with no SMS provider gets a real WhatsApp code, never echoed back", async () => {
      const res = await testSms(req({ phone: "71123456" }), p("LB"));
      const body = await res.json();
      expect(body).toMatchObject({ sent: true, provider: "WHATSAPP" });
      const sentCode = sms.sendOtpCode.mock.calls[0][1];
      expect(sms.sendOtpCode).toHaveBeenCalledWith("96171123456", expect.stringMatching(/^\d{6}$/));
      expect(JSON.stringify(body)).not.toContain(sentCode);
      expect(sms.sendSms).not.toHaveBeenCalled();
    });
  });
});
