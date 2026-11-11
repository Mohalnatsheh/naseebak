import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  setting: "true",
  selling: true,
  appPayments: true,
  testPhone: false,
}));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(async () => m.setting) }));
vi.mock("@/lib/countries/settings", () => ({
  getCountrySettings: vi.fn(async (code: string) => ({ code })),
  purchasesAvailable: vi.fn(() => m.selling),
}));
vi.mock("@/lib/mobile-config", () => ({ appPaymentsEnabled: vi.fn(async () => m.appPayments) }));
vi.mock("@/lib/test-accounts", () => ({ isTestPhone: vi.fn(() => m.testPhone) }));

import { interestPaywallFor } from "@/lib/payments/interest-paywall";
import { getCountrySettings } from "@/lib/countries/settings";

const base = { creditOnInterest: true, country: "JO", phone: "962790000000", app: false };

beforeEach(() => {
  Object.assign(m, { setting: "true", selling: true, appPayments: true, testPhone: false });
  vi.clearAllMocks();
});

describe("interestPaywallFor: «مهتم» at 0 credits opens the paywall only for members who can buy", () => {
  it("true when the switch is on, credit on interest is on and the country sells", async () => {
    expect(await interestPaywallFor(base)).toBe(true);
    expect(await interestPaywallFor({ ...base, app: true })).toBe(true);
  });
  it("false with the switch off (and reads no country)", async () => {
    m.setting = "false";
    expect(await interestPaywallFor(base)).toBe(false);
    expect(getCountrySettings).not.toHaveBeenCalled();
  });
  it("false with credit on interest off", async () => {
    expect(await interestPaywallFor({ ...base, creditOnInterest: false })).toBe(false);
  });
  it("false where the country isn't selling (Lebanon, Saudi Arabia before prices are approved)", async () => {
    m.selling = false;
    expect(await interestPaywallFor({ ...base, country: "LB" })).toBe(false);
  });
  it("false for a test or review account", async () => {
    m.testPhone = true;
    expect(await interestPaywallFor(base)).toBe(false);
    expect(await interestPaywallFor({ ...base, app: true })).toBe(false);
  });
  it("in the app, false while payments in the app are off; the website ignores that switch", async () => {
    m.appPayments = false;
    expect(await interestPaywallFor({ ...base, app: true })).toBe(false);
    expect(await interestPaywallFor(base)).toBe(true);
  });
});
