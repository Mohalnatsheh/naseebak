import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, countrySetting: { findMany: vi.fn(), findUnique: vi.fn() } }));
const jod = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ currentSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/countries/server", () => ({ getVisitorCountry: async () => "JO" }));
vi.mock("@/lib/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/settings")>();
  return { ...real, jodChargingFor: async (c: string | null | undefined) => jod.on && c === "JO" };
});

import { GET as plans } from "@/app/api/payments/plans/route";
import { clearCountrySettingsCache } from "@/lib/countries/settings";
import { dollarChargeLine } from "@/lib/payments/packages";

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  jod.on = false;
  db.user.findUnique.mockResolvedValue({ country: "JO" });
  db.countrySetting.findMany.mockResolvedValue([]);
  db.countrySetting.findUnique.mockResolvedValue(null);
});

describe("GET /api/payments/plans with jod_charging", () => {
  it("off: Jordan's packages carry the dollar charge, as today", async () => {
    const body = await (await plans()).json();
    expect(body.jodCharging).toBe(false);
    const p = body.packages.find((x: { id: string }) => x.id === "launch_10");
    expect(p.chargeUsd).toBe(4.23);
    expect(p.chargeLabel).toBe("4.23$");
  });

  it("on: no dollar charge, the label equals the price (the app hides it)", async () => {
    jod.on = true;
    const body = await (await plans()).json();
    expect(body.jodCharging).toBe(true);
    const p = body.packages.find((x: { id: string }) => x.id === "launch_10");
    expect(p.chargeUsd).toBeUndefined();
    expect(p.chargeLabel).toBe("3 د.أ");
    expect(p.chargeLabel).toContain(p.currencySymbol);
  });
});

describe("dollarChargeLine (/pay)", () => {
  it("a Jordanian row charged in USD (older or switch off) shows the dollar amount", () => {
    expect(dollarChargeLine({ amount: "3", currency: "JOD" })).toBe("4.23$");
    expect(dollarChargeLine({ amount: "3", currency: "JOD", chargeCurrency: "usd" })).toBe("4.23$");
  });
  it("a row charged in JOD, a Saudi or a Lebanese row: none", () => {
    expect(dollarChargeLine({ amount: "3", currency: "JOD", chargeCurrency: "jod" })).toBeNull();
    expect(dollarChargeLine({ amount: "15", currency: "SAR" })).toBeNull();
    expect(dollarChargeLine({ amount: "3", currency: "USD" })).toBeNull();
  });
});
