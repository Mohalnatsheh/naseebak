import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  countrySetting: { findMany: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ session: { user: { id: "u1" } } }),
  currentSession: async () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/payments/fulfil", () => ({ fulfilCheckoutSession: vi.fn(), CHECKOUT_APP: "naseebak" }));
vi.mock("@/lib/countries/server", () => ({ getVisitorCountry: async () => "JO" }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: stripe.create } } }) }));

import { POST as checkout } from "@/app/api/payments/checkout/route";
import { GET as plans } from "@/app/api/payments/plans/route";
import { clearCountrySettingsCache, defaultCountrySettings, goLiveChecklist, purchasesAvailable } from "@/lib/countries/settings";
import {
  findPackage,
  formatPaidCharge,
  packagesFor,
  packagesSentence,
  readPackagePrices,
} from "@/lib/payments/packages";
import { countryChanges } from "@/lib/admin/settings-changes";
import { faqsFor } from "@/app/(ar)/faq/faq-data";

const row = (over: Record<string, unknown>) => ({ ...defaultCountrySettings("JO"), createdAt: new Date(), updatedAt: new Date(), updatedById: null, ...over });
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  process.env.STRIPE_SECRET_KEY = "sk_test";
  db.user.findUnique.mockResolvedValue({ country: "SA" });
  db.countrySetting.findMany.mockResolvedValue([]);
  stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
});

describe("prices set in admin", () => {
  it("Jordan: a new dinar price sets the dollars charged at the same rate", () => {
    const [ten, twentyFive] = packagesFor("JO", { launch_10: 4 });
    expect(ten).toMatchObject({ credits: 10, price: 4, chargeCurrency: "usd", chargeAmount: 564 });
    expect(twentyFive).toMatchObject({ price: 6, chargeAmount: 846 });
  });

  it("Saudi Arabia: a new price is charged in riyals", () => {
    expect(packagesFor("SA", { sa_10: 19.5 })[0]).toMatchObject({ price: 19.5, chargeCurrency: "sar", chargeAmount: 1950 });
  });

  it("no longer shows a «was» price that isn't higher", () => {
    expect(packagesFor("JO", { launch_10: 8 })[0].wasPrice).toBeUndefined();
    expect(packagesFor("JO", { launch_10: 4 })[0].wasPrice).toBe(7);
  });

  it("with nothing set, the prices in the code stay", () => {
    expect(packagesFor("JO", null)).toEqual(packagesFor("JO"));
    expect(findPackage("sa_10", "SA", { sa_10: 20 })?.price).toBe(20);
    expect(findPackage("sa_10", "SA")?.price).toBe(15);
  });

  it("reads only usable prices from the stored value", () => {
    expect(readPackagePrices({ sa_10: 20, sa_25: "x", sa_50: -1 })).toEqual({ sa_10: 20 });
    expect(readPackagePrices(null)).toBeNull();
    expect(readPackagePrices([1])).toBeNull();
  });

  it("the FAQ sentence uses the set price", () => {
    expect(packagesSentence("SA", { sa_10: 20 })).toContain("10 أرصدة بـ 20 ر.س");
    const answers = faqsFor(true, false, false, "SA", { sa_10: 20 }).map((f) => f.a).join(" ");
    expect(answers).toContain("10 أرصدة بـ 20 ر.س");
  });

  it("a past payment is reported at what it paid, whatever the price is today", () => {
    expect(formatPaidCharge({ amount: 3, currency: "JOD" })).toBe("4.23$");
    expect(formatPaidCharge({ amount: 15, currency: "SAR" })).toBe("15 ر.س");
  });
});

describe("approving prices", () => {
  const saudi = { ...defaultCountrySettings("SA"), active: true, purchasesEnabled: true };

  it("Saudi Arabia sells only once approved in admin", () => {
    expect(purchasesAvailable(saudi)).toBe(false);
    expect(purchasesAvailable({ ...saudi, pricesApproved: true })).toBe(true);
  });

  it("Jordan keeps selling with nothing saved, and stops if approval is taken back", () => {
    expect(purchasesAvailable(defaultCountrySettings("JO"))).toBe(true);
    expect(purchasesAvailable({ ...defaultCountrySettings("JO"), pricesApproved: false })).toBe(false);
  });
});

describe("checkout and plans with admin prices", () => {
  const saudiRow = () => [row({ code: "SA", active: true, purchasesEnabled: true, pricesApproved: true, packagePrices: { sa_10: 20 } })];

  it("charges and records the set price", async () => {
    db.countrySetting.findMany.mockResolvedValue(saudiRow());
    expect((await checkout(post({ packageId: "sa_10" }))).status).toBe(200);
    expect(stripe.create.mock.calls[0][0].line_items[0].price_data).toMatchObject({ currency: "sar", unit_amount: 2000 });
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 20, currency: "SAR", planName: "sa_10" });
    expect(stripe.create.mock.calls[0][0].metadata.credits).toBe("10");
  });

  it("refuses a Saudi purchase while the prices aren't approved", async () => {
    db.countrySetting.findMany.mockResolvedValue([row({ code: "SA", active: true, purchasesEnabled: true })]);
    expect((await checkout(post({ packageId: "sa_10" }))).status).toBe(403);
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it("the plans the site and the app read carry the set price", async () => {
    db.countrySetting.findMany.mockResolvedValue(saudiRow());
    const body = await (await plans()).json();
    expect(body.purchasesEnabled).toBe(true);
    expect(body.packages[0]).toMatchObject({ id: "sa_10", credits: 10, price: 20, chargeLabel: "20 ر.س" });
  });
});

describe("go-live checklist", () => {
  const env = { STRIPE_SECRET_KEY: "sk", VERIFYWAY_API_KEY: "v" } as unknown as NodeJS.ProcessEnv;
  const pending = (s: Parameters<typeof goLiveChecklist>[0], e = env) => goLiveChecklist(s, e).filter((i) => !i.done).map((i) => i.key);

  it("lists what a closed country still needs", () => {
    expect(pending(defaultCountrySettings("SA"))).toEqual(["pricesApproved", "support", "purchases", "active"]);
  });

  it("is complete when everything is set", () => {
    const s = { ...defaultCountrySettings("SA"), active: true, purchasesEnabled: true, pricesApproved: true, supportEmail: "a@b.co" };
    expect(pending(s)).toEqual([]);
  });

  it("needs a way to send sign-in codes and a Stripe key", () => {
    expect(pending(defaultCountrySettings("SA"), {} as NodeJS.ProcessEnv)).toEqual(expect.arrayContaining(["codes", "stripe"]));
  });
});

describe("the confirm dialog", () => {
  const before = { ...defaultCountrySettings("JO"), packagePrices: null, pricesApproved: null };
  const packages = [{ id: "launch_10", credits: 10, price: 3, currency: "JOD" }];

  it("names a price change", () => {
    const { lines, warnings } = countryChanges(before, { ...before, packagePrices: { launch_10: 4 } }, "Jordan", packages);
    expect(lines).toContain("10 credits: 3 → 4 JOD");
    expect(warnings).toEqual([]);
  });

  it("warns about a price that moved a lot, which is usually a typo", () => {
    const { warnings } = countryChanges(before, { ...before, packagePrices: { launch_10: 30 } }, "Jordan", packages);
    expect(warnings.join(" ")).toContain("10 credits");
  });

  it("warns when approval is taken back", () => {
    const { lines, warnings } = countryChanges(before, { ...before, pricesApproved: false }, "Jordan", packages, true);
    expect(lines).toContain("Prices approved: On → Off");
    expect(warnings.join(" ")).toContain("Selling stops");
  });
});
