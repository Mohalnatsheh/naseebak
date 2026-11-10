import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const m = vi.hoisted(() => ({
  appPaymentsFor: vi.fn(),
  getProEnabled: vi.fn(),
  getCountrySettings: vi.fn(),
  purchasesAvailable: vi.fn(),
  currentProSubscription: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
const requireUser = vi.hoisted(() => vi.fn(async () => ({ session: { user: { id: "u1" } } })));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/mobile-config", () => ({ appPaymentsFor: m.appPaymentsFor }));
vi.mock("@/lib/settings", () => ({ getProEnabled: m.getProEnabled }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: m.getCountrySettings, purchasesAvailable: m.purchasesAvailable }));
vi.mock("@/lib/pro/status", () => ({ currentProSubscription: m.currentProSubscription }));

import { GET } from "@/app/api/pro/route";

const web = new Request("http://x/api/pro");
const app = new Request("http://x/api/pro", { headers: { authorization: "Bearer t" } });

beforeEach(() => {
  vi.clearAllMocks();
  m.appPaymentsFor.mockResolvedValue(true);
  m.getProEnabled.mockResolvedValue(true);
  m.purchasesAvailable.mockReturnValue(true);
  m.getCountrySettings.mockResolvedValue({ proPlans: { monthly: { enabled: true, price: 4, credits: 8 } } });
  m.currentProSubscription.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ country: "JO" });
});

describe("GET /api/pro while paused (QA WP2-02, A-M01)", () => {
  it("is read-only, so a paused member may read it", async () => {
    await GET(web);
    expect(requireUser).toHaveBeenCalledWith({ allowDeactivated: true });
  });

  it("a paused member sees their state but nothing to buy (checkout refuses while paused)", async () => {
    db.user.findUnique.mockResolvedValue({ country: "JO", isDeactivated: true });
    const body = await (await GET(web)).json();
    expect(body).toMatchObject({ canBuy: false, offers: [] });
    expect(body.enabled).toBe(true);
  });
});

describe("GET /api/pro", () => {
  it("can buy when on, selling and not Pro", async () => {
    const s = await (await GET(web)).json();
    expect(s).toMatchObject({ enabled: true, isPro: false, canBuy: true, plan: null });
    expect(s.offers).toHaveLength(1);
  });
  it("switch off: no offers, cannot buy", async () => {
    m.getProEnabled.mockResolvedValue(false);
    const s = await (await GET(web)).json();
    expect(s).toMatchObject({ enabled: false, canBuy: false, offers: [] });
  });
  it("a cancelled but not yet ended subscription is still Pro and cannot buy", async () => {
    m.currentProSubscription.mockResolvedValue({ plan: "MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), cancelAtPeriodEnd: true });
    const s = await (await GET(web)).json();
    expect(s).toMatchObject({ isPro: true, plan: "monthly", cancelAtPeriodEnd: true, canBuy: false, pastDue: false, renewsAt: "2026-12-01T00:00:00.000Z" });
  });
  it("credits per grant and the next grant: monthly on the renewal, none once cancelled; yearly on the drip date (QA WP2-18)", async () => {
    m.currentProSubscription.mockResolvedValue({
      plan: "MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), cancelAtPeriodEnd: false, creditsPerGrant: 5, nextCreditGrantAt: null,
    });
    expect(await (await GET(web)).json()).toMatchObject({ creditsPerGrant: 5, nextGrantAt: "2026-12-01T00:00:00.000Z" });
    m.currentProSubscription.mockResolvedValue({
      plan: "MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), cancelAtPeriodEnd: true, creditsPerGrant: 5, nextCreditGrantAt: null,
    });
    expect((await (await GET(web)).json()).nextGrantAt).toBeNull();
    m.currentProSubscription.mockResolvedValue({
      plan: "YEARLY", status: "ACTIVE", currentPeriodEnd: new Date("2027-10-01T00:00:00Z"), cancelAtPeriodEnd: true, creditsPerGrant: 8, nextCreditGrantAt: new Date("2026-12-10T00:00:00Z"),
    });
    expect(await (await GET(web)).json()).toMatchObject({ creditsPerGrant: 8, nextGrantAt: "2026-12-10T00:00:00.000Z" });
  });
  it("past due is flagged", async () => {
    m.currentProSubscription.mockResolvedValue({ plan: "WEEKLY", status: "PAST_DUE", currentPeriodEnd: new Date(), cancelAtPeriodEnd: false });
    expect((await (await GET(web)).json()).pastDue).toBe(true);
  });
  it("Saudi prices not approved: cannot buy", async () => {
    m.purchasesAvailable.mockReturnValue(false);
    expect((await (await GET(web)).json()).canBuy).toBe(false);
  });
  it("app request with in-app payments refused (or test account): no offers, cannot buy", async () => {
    m.appPaymentsFor.mockResolvedValue(false);
    const s = await (await GET(app)).json();
    expect(s).toMatchObject({ canBuy: false, offers: [] });
  });
  it("app request keeps a real subscriber's status even when buying is refused", async () => {
    m.appPaymentsFor.mockResolvedValue(false);
    m.currentProSubscription.mockResolvedValue({ plan: "MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), cancelAtPeriodEnd: false });
    const s = await (await GET(app)).json();
    expect(s).toMatchObject({ isPro: true, plan: "monthly", renewsAt: "2026-12-01T00:00:00.000Z", canBuy: false, offers: [] });
  });
  it("app request with payments allowed can buy", async () => {
    expect((await (await GET(app)).json()).canBuy).toBe(true);
  });
});
