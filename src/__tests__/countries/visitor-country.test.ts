import { describe, it, expect } from "vitest";
import { countryCookieString, countryQueryRedirect } from "@/lib/visitor-country";
import { acceptedFormats, dialCountryFor, isPhoneFor, phoneExampleError, phoneFormatsError } from "@/lib/phone-field";
import { cleanStartPhone } from "@/lib/landing-start";
import { contactSchemaFor } from "@/lib/validations/contact";

describe("?country= on a public URL", () => {
  it("returns the country and the same URL without the parameter", () => {
    const r = countryQueryRedirect(new URL("https://naseebak.com/faq?country=sa&utm_source=ig#x"));
    expect(r?.country).toBe("SA");
    expect(r?.url.href).toBe("https://naseebak.com/faq?utm_source=ig#x");
    expect(countryQueryRedirect(new URL("https://naseebak.com/?country=JO"))?.url.href).toBe("https://naseebak.com/");
  });
  it("accepts ?country=lb", () => {
    const r = countryQueryRedirect(new URL("https://naseebak.com/faq?country=lb"));
    expect(r?.country).toBe("LB");
    expect(r?.url.href).toBe("https://naseebak.com/faq");
  });
  it("leaves other URLs and unknown countries alone", () => {
    expect(countryQueryRedirect(new URL("https://naseebak.com/faq"))).toBeNull();
    expect(countryQueryRedirect(new URL("https://naseebak.com/faq?country=eg"))).toBeNull();
  });
  it("cookie lasts a year on the whole site", () => {
    expect(countryCookieString("SA")).toBe("naseeb_country=SA; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(countryCookieString("JO", true)).toContain("; Secure");
  });
});

describe("dial-code toggle (login / register)", () => {
  it("validates against the chosen country", () => {
    expect(isPhoneFor("0791234567", "JO")).toBe(true);
    expect(isPhoneFor("0791234567", "SA")).toBe(false);
    expect(isPhoneFor("0512345678", "SA")).toBe(true);
    expect(isPhoneFor("٠٥١٢٣٤٥٦٧٨", "SA")).toBe(true);
    expect(isPhoneFor("512345678", "JO")).toBe(false);
  });
  it("keeps the Jordanian wording and gives the Saudi one", () => {
    expect(phoneFormatsError("JO")).toBe("رقم الهاتف غير صالح. الصيغ المقبولة: 07X, 7X, 9627X, +9627X, 009627X");
    expect(phoneExampleError("JO")).toBe("رقم الهاتف غير صالح. أدخل رقماً أردنياً مثل 0791234567");
    expect(acceptedFormats("SA")).toBe("05X, 5X, 9665X, +9665X, 009665X");
    expect(phoneExampleError("SA")).toBe("رقم الجوال غير صالح. أدخل رقم جوال سعودي مثل 0512345678");
  });
  it("switches to the other country only for a complete number of that country", () => {
    expect(dialCountryFor("0512345678", "JO")).toBe("SA");
    expect(dialCountryFor("962791234567", "SA")).toBe("JO");
    expect(dialCountryFor("0791234567", "JO")).toBe("JO");
    expect(dialCountryFor("05", "JO")).toBe("JO");
  });
  it("never switches midway through a number of the current country (a whole Lebanese number is the start of a Jordanian one)", () => {
    // Typing 0791234567 on Jordan: every step stays Jordan, also «079123456» (a valid Lebanese 79 123 456)
    const typed = "0791234567";
    for (let i = 1; i <= typed.length; i++) expect(dialCountryFor(typed.slice(0, i), "JO")).toBe("JO");
    // A Lebanese number that can't start a Jordanian one still switches
    expect(dialCountryFor("03123456", "JO")).toBe("LB");
    expect(dialCountryFor("71123456", "JO")).toBe("LB");
    // On Lebanon, the 10th digit of a Jordanian number switches to Jordan
    expect(dialCountryFor("079123456", "LB")).toBe("LB");
    expect(dialCountryFor("0791234567", "LB")).toBe("JO");
  });
});

describe("landing quick start phone", () => {
  it("checks the visitor's country", () => {
    expect(cleanStartPhone("0512345678", "SA")).toBe("0512345678");
    expect(cleanStartPhone("0512345678", "JO")).toBeNull();
    expect(cleanStartPhone("0791234567", "SA")).toBeNull();
    expect(cleanStartPhone("", "SA")).toBe("");
  });
});

describe("contact form per country", () => {
  const base = { name: "سارة", subject: "سؤال", message: "أريد معرفة طريقة عمل المنصة." };
  it("Saudi visitors give a Saudi mobile, with «الجوال» wording", () => {
    expect(contactSchemaFor("SA").safeParse({ ...base, phone: "0512345678" }).success).toBe(true);
    const r = contactSchemaFor("SA").safeParse({ ...base, phone: "0791234567" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("رقم الجوال غير صالح. مثال: 0512345678");
    expect(contactSchemaFor("SA").safeParse(base).error?.issues[0].message).toContain("رقم جوالك");
  });
  it("Jordan keeps its rules and wording", () => {
    expect(contactSchemaFor("JO").safeParse({ ...base, phone: "0512345678" }).error?.issues[0].message).toBe(
      "رقم الهاتف غير صالح. مثال: 0791234567"
    );
  });
});
