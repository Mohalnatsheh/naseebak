import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// next-auth itself can't load under Vitest: a stand-in for the one class the route uses
const nextAuth = vi.hoisted(() => ({ CredentialsSignin: class CredentialsSignin extends Error { code?: string } }));
vi.mock("next-auth", () => nextAuth);
const { CredentialsSignin } = nextAuth;

const db = vi.hoisted(() => ({
  countrySetting: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  payment: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  mobileSession: { create: vi.fn() },
}));
const authz = vi.hoisted(() => ({ authorizePhoneLogin: vi.fn() }));
const fulfil = vi.hoisted(() => ({ fulfilCheckoutSession: vi.fn(), CHECKOUT_APP: "naseebak" }));
const stripe = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth-authorize", () => authz);
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/settings", () => ({
  // Nothing stored: app payments on (src/lib/mobile-config.ts)
  getSetting: async () => "",
  getMaintenanceState: async () => ({ enabled: false, message: "" }),
  getCycleFlags: async () => ({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true }),
  jodChargingFor: async () => false,
  activeOfferFor: async () => null,
}));
vi.mock("@/lib/payments/fulfil", () => fulfil);
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: stripe.create, retrieve: stripe.retrieve } } }) }));

import { clearCountrySettingsCache, defaultCountrySettings } from "@/lib/countries/settings";
import { POST as token } from "@/app/api/mobile/auth/token/route";
import { GET as countries } from "@/app/api/countries/route";
import { GET as countryDetail } from "@/app/api/countries/[code]/route";
import { POST as checkout } from "@/app/api/payments/checkout/route";
import { POST as mockCheckout } from "@/app/api/dev/mock-checkout/[id]/route";

const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const saved = { ...process.env };
const saOpen = { ...defaultCountrySettings("SA"), active: true, smsProvider: "UNIFONIC", smsSenderId: "PRIVATE-SENDER", createdAt: new Date(), updatedAt: new Date(), updatedById: null };

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  db.countrySetting.findMany.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ country: "JO" });
  db.mobileSession.create.mockResolvedValue({});
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.PAYMENTS_MOCK = "";
});
afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...saved };
});

describe("POST /api/mobile/auth/token", () => {
  it("gives a token after the same check as the web sign-in", async () => {
    authz.authorizePhoneLogin.mockResolvedValue({ id: "u1", role: "USER" });
    db.user.findUnique.mockResolvedValue({ id: "u1", firstName: "سارة", lastName: "أ", gender: "FEMALE", phone: "962796922292", country: "JO", matchCredits: 3, status: "PENDING", isDeactivated: false, createdAt: new Date(), profile: { isComplete: true } });
    const res = await token(post({ phone: "0796922292", code: "111111", device: "test" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^nsb_/);
    expect(body.user).toMatchObject({ id: "u1", credits: 3, country: { code: "JO" }, profile: { complete: true } });
    expect(authz.authorizePhoneLogin).toHaveBeenCalledWith({ phone: "0796922292", otp: "111111" });
  });

  it("a wrong code is 401, the failure limit is 429, and admins get no token", async () => {
    authz.authorizePhoneLogin.mockResolvedValue(null);
    expect((await token(post({ phone: "0796922292", code: "000000" }))).status).toBe(401);
    const limited = new CredentialsSignin();
    limited.code = "rate_limited:12";
    authz.authorizePhoneLogin.mockRejectedValue(limited);
    const res = await token(post({ phone: "0796922292", code: "000000" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED", retryAfterMinutes: 12 });
    authz.authorizePhoneLogin.mockResolvedValue({ id: "a1", role: "ADMIN" });
    expect((await token(post({ phone: "0796922292", code: "111111" }))).status).toBe(401);
    expect(db.mobileSession.create).not.toHaveBeenCalled();
  });
});

describe("public country API", () => {
  it("lists active countries only, with no provider data or secrets", async () => {
    let res = await countries();
    expect((await res.json()).countries.map((c: { code: string }) => c.code)).toEqual(["JO"]);
    db.countrySetting.findMany.mockResolvedValue([saOpen]);
    clearCountrySettingsCache();
    res = await countries();
    const text = await res.text();
    expect(JSON.parse(text).countries.map((c: { code: string }) => c.code)).toEqual(["JO", "SA"]);
    expect(text).not.toMatch(/PRIVATE-SENDER|UNIFONIC|smsProvider|STRIPE|sk_test/);
  });

  it("detail: 404 for unknown or inactive countries; links and content for active ones", async () => {
    const params = (code: string) => ({ params: Promise.resolve({ code }) });
    expect((await countryDetail(new Request("http://x"), params("XX"))).status).toBe(404);
    expect((await countryDetail(new Request("http://x"), params("sa"))).status).toBe(404);
    const res = await countryDetail(new Request("http://x"), params("jo"));
    const { country } = await res.json();
    expect(country.links.terms).toMatch(/\/terms$/);
    expect(country.content.heroTitle.length).toBeGreaterThan(5);
  });
});

describe("checkout", () => {
  it("refuses members of a country that isn't selling (Saudi Arabia: prices not approved)", async () => {
    db.countrySetting.findMany.mockResolvedValue([{ ...saOpen, purchasesEnabled: true }]);
    db.user.findUnique.mockResolvedValue({ country: "SA" });
    const res = await checkout(post({ packageId: "sa_10" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PURCHASES_DISABLED" });
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it("hosted mode (app) returns the Stripe page URL; the row is PENDING", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/x" });
    const res = await checkout(post({ packageId: "launch_10", mode: "hosted" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checkoutUrl: "https://checkout.stripe.com/c/x" });
    const args = stripe.create.mock.calls[0][0];
    expect(args.ui_mode).toBeUndefined();
    expect(args.success_url).toContain("/payments/return?status=success");
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ status: "PENDING", stripeSessionId: "cs_1" });
  });

  it("the app checkout is refused for a test account (store review login), the website's is not", async () => {
    process.env.EXTRA_TEST_PHONES = "0796922292";
    db.user.findUnique.mockResolvedValue({ country: "JO", phone: "962796922292" });
    const res = await checkout(post({ packageId: "launch_10", mode: "hosted" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("APP_PURCHASES_DISABLED");
    expect(stripe.create).not.toHaveBeenCalled();
    delete process.env.EXTRA_TEST_PHONES;
  });

  it("mock mode (local) never calls Stripe", async () => {
    process.env.PAYMENTS_MOCK = "true";
    const res = await checkout(post({ packageId: "launch_10", mode: "hosted" }));
    expect(await res.json()).toMatchObject({ mock: true });
    expect(stripe.create).not.toHaveBeenCalled();
    expect(db.payment.create.mock.calls[0][0].data.stripeSessionId).toMatch(/^mock_/);
  });
});

describe("POST /api/dev/mock-checkout/[id]", () => {
  const params = { params: Promise.resolve({ id: "p1" }) };

  it("404 unless mock payments are on (never on a real server)", async () => {
    expect((await mockCheckout(post({ outcome: "paid" }), params)).status).toBe(404);
    process.env.PAYMENTS_MOCK = "true";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://naseebak.com");
    expect((await mockCheckout(post({ outcome: "paid" }), params)).status).toBe(404);
  });

  it("«paid» credits through the real fulfilment path, with the package's credits", async () => {
    process.env.PAYMENTS_MOCK = "true";
    db.payment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", stripeSessionId: "mock_p1", planName: "launch_25" });
    fulfil.fulfilCheckoutSession.mockResolvedValueOnce("fulfilled").mockResolvedValueOnce("already");
    expect(await (await mockCheckout(post({ outcome: "paid" }), params)).json()).toEqual({ result: "fulfilled" });
    const session = fulfil.fulfilCheckoutSession.mock.calls[0][0];
    expect(session).toMatchObject({ payment_status: "paid", metadata: { paymentId: "p1", userId: "u1", credits: "25", app: "naseebak" } });
    expect(await (await mockCheckout(post({ outcome: "paid" }), params)).json()).toEqual({ result: "already" });
  });

  it("refuses a real (non-mock) payment", async () => {
    process.env.PAYMENTS_MOCK = "true";
    db.payment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", stripeSessionId: "cs_real", planName: "launch_10" });
    expect((await mockCheckout(post({ outcome: "paid" }), params)).status).toBe(404);
    expect(fulfil.fulfilCheckoutSession).not.toHaveBeenCalled();
  });
});
