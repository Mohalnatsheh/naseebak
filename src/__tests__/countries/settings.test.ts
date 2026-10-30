import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ countrySetting: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import {
  clearCountrySettingsCache,
  countrySignupBlock,
  countryWarnings,
  defaultCountrySettings,
  getCountrySettings,
  listCountrySettings,
  mockSmsAllowed,
  publicCountry,
  publicCountryDetail,
  purchasesAvailable,
  resolveSmsProvider,
} from "@/lib/countries/settings";

const env = (over: Record<string, string | undefined>) => ({ NODE_ENV: "production", ...over }) as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  db.countrySetting.findMany.mockResolvedValue([]);
});

describe("defaults (no row)", () => {
  it("Jordan is active and selling; Saudi Arabia is closed and not selling, so a deploy never opens it", async () => {
    expect(await getCountrySettings("JO")).toMatchObject({ active: true, registrationOpen: true, purchasesEnabled: true, smsProvider: "DEFAULT" });
    expect(await getCountrySettings("SA")).toMatchObject({ active: false, purchasesEnabled: false });
  });

  it("a row from the database wins over the defaults", async () => {
    db.countrySetting.findMany.mockResolvedValue([{ ...defaultCountrySettings("SA"), active: true, createdAt: new Date(), updatedAt: new Date(), updatedById: null }]);
    expect((await getCountrySettings("SA")).active).toBe(true);
    expect((await listCountrySettings()).map((s) => s.code)).toEqual(["JO", "SA"]);
  });

  it("falls back to the safe defaults when the database can't be read", async () => {
    db.countrySetting.findMany.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await getCountrySettings("JO")).active).toBe(true);
    expect((await getCountrySettings("SA")).active).toBe(false);
    spy.mockRestore();
  });
});

describe("SMS provider", () => {
  it("DEFAULT is Broadnet for Jordan and Unifonic for Saudi Arabia", () => {
    expect(resolveSmsProvider("JO", "DEFAULT", env({}))).toBe("BROADNET");
    expect(resolveSmsProvider("SA", "DEFAULT", env({}))).toBe("UNIFONIC");
    expect(resolveSmsProvider("SA", "NONE", env({}))).toBe("NONE");
  });

  it("the mock is never reachable on a real server", () => {
    const live = env({ NEXT_PUBLIC_APP_URL: "https://naseebak.com", SMS_MOCK: "true" });
    expect(mockSmsAllowed(live)).toBe(false);
    expect(resolveSmsProvider("JO", "MOCK", live)).toBe("NONE");
    expect(resolveSmsProvider("JO", "DEFAULT", live)).toBe("BROADNET");
  });

  it("locally, SMS_MOCK sends everything to the mock (development or a localhost production build)", () => {
    expect(resolveSmsProvider("JO", "DEFAULT", env({ NODE_ENV: "development", SMS_MOCK: "true" }))).toBe("MOCK");
    expect(resolveSmsProvider("SA", "UNIFONIC", env({ SMS_MOCK: "true", NEXT_PUBLIC_APP_URL: "http://localhost:3020" }))).toBe("MOCK");
    expect(mockSmsAllowed(env({ SMS_MOCK: "true", NEXT_PUBLIC_APP_URL: "http://localhost.evil.com" }))).toBe(false);
  });
});

describe("purchases", () => {
  it("Jordan sells; Saudi Arabia never sells while its prices are not approved, even if switched on", () => {
    expect(purchasesAvailable(defaultCountrySettings("JO"))).toBe(true);
    expect(purchasesAvailable({ ...defaultCountrySettings("SA"), active: true, purchasesEnabled: true })).toBe(false);
    expect(purchasesAvailable({ ...defaultCountrySettings("JO"), active: false })).toBe(false);
  });
});

describe("warnings", () => {
  it("flags an open country with no SMS, missing credentials, unapproved prices and no support contact", () => {
    const sa = { ...defaultCountrySettings("SA"), active: true, purchasesEnabled: true };
    const msgs = countryWarnings(sa, env({})).map((w) => w.message).join(" | ");
    expect(msgs).toMatch(/Unifonic credentials are missing/);
    expect(msgs).toMatch(/prices are not approved/);
    expect(msgs).toMatch(/STRIPE_SECRET_KEY/);
    expect(msgs).toMatch(/No support contact/);
    const none = countryWarnings({ ...defaultCountrySettings("JO"), smsProvider: "NONE" }, env({}));
    expect(none.some((w) => w.level === "error" && /no SMS provider/.test(w.message))).toBe(true);
  });

  it("a fully set Jordan has no errors", () => {
    const jo = { ...defaultCountrySettings("JO"), supportEmail: "info@naseebak.com" };
    expect(countryWarnings(jo, env({ BROADNET_USER: "u", BROADNET_PASS: "p", STRIPE_SECRET_KEY: "sk" }))).toEqual([]);
  });
});

describe("public view", () => {
  it("contains display data only — no provider, sender id or credentials", () => {
    const view = publicCountry({ ...defaultCountrySettings("SA"), active: true, smsProvider: "UNIFONIC", smsSenderId: "SECRET-SENDER" });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/SECRET-SENDER|UNIFONIC|BROADNET|smsProvider|smsSenderId/);
    expect(view).toMatchObject({ code: "SA", dialCode: "+966", currency: { code: "SAR" }, direction: "rtl", purchasesEnabled: false });
  });
});

describe("sign-up gate", () => {
  it("refuses an inactive or closed country, a wrong claimed country and unknown numbers", async () => {
    expect(await countrySignupBlock("966551234567")).toMatchObject({ status: 403, code: "COUNTRY_INACTIVE" });
    db.countrySetting.findMany.mockResolvedValue([{ ...defaultCountrySettings("SA"), active: true, registrationOpen: false }]);
    clearCountrySettingsCache();
    expect(await countrySignupBlock("966551234567")).toMatchObject({ status: 403, code: "COUNTRY_REGISTRATION_CLOSED" });
    expect(await countrySignupBlock("962791234567", "SA")).toMatchObject({ status: 400, code: "COUNTRY_MISMATCH" });
    expect(await countrySignupBlock("441234567890")).toMatchObject({ status: 400, code: "COUNTRY_UNSUPPORTED" });
    expect(await countrySignupBlock("962791234567", "jo")).toBeNull();
  });
});

describe("country detail lists (the app's profile forms)", () => {
  const content = { heroTitle: "h", heroSubtitle: "s", seoTitle: "t", seoDescription: "d" };

  it("gives each country its own money ranges and tribe word, and the shared option values", () => {
    const jo = publicCountryDetail(defaultCountrySettings("JO"), content, "https://naseebak.com");
    const sa = publicCountryDetail(defaultCountrySettings("SA"), content, "https://naseebak.com");
    expect(jo.lists.incomeRanges.some((r) => r.includes("د.أ"))).toBe(true);
    expect(sa.lists.expenseRanges.every((r) => r.includes("ر.س"))).toBe(true);
    expect(jo.lists.tribeLabel).not.toBe(sa.lists.tribeLabel);
    expect(jo.options.skinColor).toContain("حنطي");
    expect(jo.options.job).toContain("أخرى");
    expect(jo.options.education[0]).toBe("ثانوية عامة");
  });
});
