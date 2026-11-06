import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMail = vi.hoisted(() => vi.fn(async () => ({})));
const db = vi.hoisted(() => ({ countrySetting: { findMany: vi.fn() }, user: { findUnique: vi.fn() } }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock("@/lib/db", () => ({ db }));

import { adminEmailsFor, clearCountrySettingsCache, defaultCountrySettings, publicCountry } from "@/lib/countries/settings";
import { sendAdminEmail, sendContactNotification, sendNewUserNotification } from "@/lib/email";
import { sendAdminAlert } from "@/lib/admin-alert";
import { countrySettingsSchema, parseEmailList } from "@/lib/validations/country-settings";
import { countryChanges } from "@/lib/admin/settings-changes";

const row = (code: string, adminEmails: string | null) => ({ ...defaultCountrySettings("JO"), code, adminEmails, createdAt: new Date(), updatedAt: new Date(), updatedById: null });
const sentTo = () => (sendMail.mock.calls[0] as unknown as [{ to: string[] }])[0].to;
const member = { firstName: "نورة", lastName: "أ", phone: "966512345678", gender: "FEMALE", createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  vi.stubEnv("SMTP_HOST", "smtp.test");
  vi.stubEnv("SMTP_USER", "u");
  vi.stubEnv("SMTP_PASS", "p");
  vi.stubEnv("ADMIN_NOTIFY_EMAIL", "main@naseebak.com");
  db.countrySetting.findMany.mockResolvedValue([row("JO", "jo1@x.co, jo2@x.co"), row("SA", "ksa@x.co")]);
  db.user.findUnique.mockResolvedValue({ country: "SA" });
});
afterEach(() => vi.unstubAllEnvs());

describe("parseEmailList", () => {
  it("splits on commas, also the Arabic comma, and drops blanks and repeats", () => {
    expect(parseEmailList(" a@x.co, b@x.co ،A@x.co,, ")).toEqual(["a@x.co", "b@x.co"]);
    expect(parseEmailList(null)).toEqual([]);
  });
});

describe("adminEmailsFor", () => {
  it("uses the country's own list", async () => {
    expect(await adminEmailsFor("JO")).toEqual(["jo1@x.co", "jo2@x.co"]);
    expect(await adminEmailsFor("SA")).toEqual(["ksa@x.co"]);
  });

  it("falls back to the server's inbox when a country has none", async () => {
    db.countrySetting.findMany.mockResolvedValue([]);
    expect(await adminEmailsFor("SA")).toEqual(["main@naseebak.com"]);
  });

  it("uses Jordan's list when no country is given", async () => {
    expect(await adminEmailsFor()).toEqual(["jo1@x.co", "jo2@x.co"]);
  });
});

describe("who gets each email", () => {
  it("a new member: their country's list", async () => {
    await sendNewUserNotification(member);
    expect(sentTo()).toEqual(["ksa@x.co"]);
  });

  it("a contact message: the visitor's country list", async () => {
    await sendContactNotification({ name: "a", email: null, subject: "s", message: "m", country: "SA" });
    expect(sentTo()).toEqual(["ksa@x.co"]);
  });

  it("an alert about a member: that member's country list", async () => {
    await sendAdminAlert("بلاغ", "نص", { userId: "u1" });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { country: true } });
    expect(sentTo()).toEqual(["ksa@x.co"]);
  });

  it("an alert naming a country: that list", async () => {
    await sendAdminAlert("نزاع", "نص", { country: "SA" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(sentTo()).toEqual(["ksa@x.co"]);
  });

  it("a system alert (daily job, polls): Jordan's list", async () => {
    await sendAdminAlert("Daily job", "نص");
    expect(sentTo()).toEqual(["jo1@x.co", "jo2@x.co"]);
  });

  it("still alerts when the member can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.findUnique.mockRejectedValue(new Error("db down"));
    await sendAdminAlert("بلاغ", "نص", { userId: "u1" });
    expect(sentTo()).toEqual(["jo1@x.co", "jo2@x.co"]);
  });

  it("sends nothing when nobody is set", async () => {
    vi.stubEnv("ADMIN_NOTIFY_EMAIL", "");
    db.countrySetting.findMany.mockResolvedValue([]);
    expect(await sendAdminEmail("s", "t")).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("the admin field", () => {
  const parse = (adminEmails: unknown) => countrySettingsSchema.safeParse({ adminEmails });

  it("stores a clean list, and empty as none", () => {
    expect(parse(" a@x.co ,b@x.co, ").data?.adminEmails).toBe("a@x.co, b@x.co");
    expect(parse("  ").data?.adminEmails).toBeNull();
  });

  it("refuses a bad address and names it", () => {
    const result = parse("a@x.co, nope");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("nope");
  });

  it("names the change in the confirm dialog", () => {
    const before = { ...defaultCountrySettings("SA"), packagePrices: null, pricesApproved: null };
    expect(countryChanges(before, { ...before, adminEmails: "a@x.co" }, "Saudi Arabia").lines[0]).toContain("Admin emails");
  });

  it("is never in the public country data", () => {
    const pub = publicCountry({ ...defaultCountrySettings("SA"), adminEmails: "secret@x.co" });
    expect(JSON.stringify(pub)).not.toContain("secret@x.co");
  });
});
