import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const m = vi.hoisted(() => ({
  getProEnabled: vi.fn(),
  getCountrySettings: vi.fn(),
  purchasesAvailable: vi.fn(),
  currentProSubscription: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/settings", () => ({ getProEnabled: m.getProEnabled }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: m.getCountrySettings, purchasesAvailable: m.purchasesAvailable }));
vi.mock("@/lib/pro/status", () => ({ currentProSubscription: m.currentProSubscription }));

import { GET } from "@/app/api/pro/route";

beforeEach(() => {
  vi.clearAllMocks();
  m.getProEnabled.mockResolvedValue(true);
  m.purchasesAvailable.mockReturnValue(true);
  m.getCountrySettings.mockResolvedValue({ proPlans: { monthly: { enabled: true, price: 4, credits: 8 } } });
  m.currentProSubscription.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ country: "JO" });
});

describe("GET /api/pro", () => {
  it("can buy when on, selling and not Pro", async () => {
    const s = await (await GET()).json();
    expect(s).toMatchObject({ enabled: true, isPro: false, canBuy: true, plan: null });
    expect(s.offers).toHaveLength(1);
  });
  it("switch off: no offers, cannot buy", async () => {
    m.getProEnabled.mockResolvedValue(false);
    const s = await (await GET()).json();
    expect(s).toMatchObject({ enabled: false, canBuy: false, offers: [] });
  });
  it("a cancelled but not yet ended subscription is still Pro and cannot buy", async () => {
    m.currentProSubscription.mockResolvedValue({ plan: "MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), cancelAtPeriodEnd: true });
    const s = await (await GET()).json();
    expect(s).toMatchObject({ isPro: true, plan: "monthly", cancelAtPeriodEnd: true, canBuy: false, pastDue: false, renewsAt: "2026-12-01T00:00:00.000Z" });
  });
  it("past due is flagged", async () => {
    m.currentProSubscription.mockResolvedValue({ plan: "WEEKLY", status: "PAST_DUE", currentPeriodEnd: new Date(), cancelAtPeriodEnd: false });
    expect((await (await GET()).json()).pastDue).toBe(true);
  });
  it("Saudi prices not approved: cannot buy", async () => {
    m.purchasesAvailable.mockReturnValue(false);
    expect((await (await GET()).json()).canBuy).toBe(false);
  });
});
