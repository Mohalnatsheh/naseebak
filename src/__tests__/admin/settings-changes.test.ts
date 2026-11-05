import { describe, it, expect } from "vitest";
import { countryChanges, mobileAppChanges, type CountryValues, type MobileAppValues } from "@/lib/admin/settings-changes";

const platform = { minVersion: "", latestVersion: "", storeUrl: "https://x" };
const mobile: MobileAppValues = { android: platform, ios: platform, paymentsEnabled: true, androidCertSha256: "AA:BB", arabicCheckout: "off" };

const country: CountryValues = {
  active: true, registrationOpen: true, purchasesEnabled: true, pollsEnabled: true, smsProvider: "DEFAULT",
  smsSenderId: null, supportEmail: null, supportPhone: null, supportWhatsapp: null, seoTitle: null, seoDescription: null, heroTitle: null, heroSubtitle: null,
};

describe("mobileAppChanges", () => {
  it("nothing changed: no lines (spaces and fingerprint case don't count)", () => {
    const after = { ...mobile, android: { ...platform, storeUrl: " https://x " }, androidCertSha256: "aa:bb\n" };
    expect(mobileAppChanges(mobile, after)).toEqual({ lines: [], warnings: [] });
  });

  it("names payment changes in plain words", () => {
    const { lines, warnings } = mobileAppChanges(mobile, { ...mobile, paymentsEnabled: false, arabicCheckout: "all" });
    expect(lines).toEqual(["App payments (Android and iOS): On → Off", "Arabic payment page: Off → Everyone"]);
    expect(warnings).toHaveLength(2);
  });

  it("a raised minimum version warns who gets blocked", () => {
    const { lines, warnings } = mobileAppChanges(mobile, { ...mobile, ios: { ...platform, minVersion: "1.2.0" } });
    expect(lines).toEqual(["iOS required update: (empty) → 1.2.0"]);
    expect(warnings[0]).toContain("older than 1.2.0");
  });
});

describe("countryChanges", () => {
  it("a blank field that was null is no change", () => {
    expect(countryChanges(country, { ...country, heroTitle: "" }, "Jordan").lines).toEqual([]);
  });

  it("plain changes carry no warning", () => {
    expect(countryChanges(country, { ...country, supportEmail: "a@b.c", pollsEnabled: false }, "Jordan")).toEqual({
      lines: ["«سؤال نصيبك»: On → Off", "Support email: (empty) → a@b.c"],
      warnings: [],
    });
  });

  it.each(["NONE", "MOCK"])("SMS provider %s: nobody can sign in", (smsProvider) => {
    const { warnings } = countryChanges(country, { ...country, smsProvider }, "Saudi Arabia");
    expect(warnings[0]).toContain("Nobody in Saudi Arabia will be able to sign in");
  });

  it("warns on inactive, closed registration and stopped selling, not on turning them back on", () => {
    const off = { ...country, active: false, registrationOpen: false, purchasesEnabled: false };
    expect(countryChanges(country, off, "Jordan").warnings).toHaveLength(3);
    expect(countryChanges(off, country, "Jordan").warnings).toEqual([]);
  });
});
