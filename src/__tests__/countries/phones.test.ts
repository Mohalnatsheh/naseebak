import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone, phoneInputCountry } from "@/lib/validations/auth";
import { countryOfPhone, toCountry, formatDate } from "@/lib/countries";

describe("phones per country", () => {
  it("normalises Jordanian and Saudi numbers to their own country", () => {
    expect(normalizePhone("0791234567")).toBe("962791234567");
    expect(normalizePhone("+962 79 123 4567")).toBe("962791234567");
    expect(normalizePhone("0512345678")).toBe("966512345678");
    expect(normalizePhone("00966512345678")).toBe("966512345678");
    expect(normalizePhone("٠٥١٢٣٤٥٦٧٨")).toBe("966512345678");
    expect(normalizePhone("512345678")).toBe("966512345678");
  });

  it("validates per country and overall", () => {
    expect(isValidPhone("0791234567")).toBe(true);
    expect(isValidPhone("0512345678")).toBe(true);
    expect(isValidPhone("0512345678", "JO")).toBe(false);
    expect(isValidPhone("0791234567", "SA")).toBe(false);
    expect(isValidPhone("0612345678")).toBe(false);
    expect(phoneInputCountry("+966512345678")).toBe("SA");
  });

  it("knows a stored number's country", () => {
    expect(countryOfPhone("962791234567")).toBe("JO");
    expect(countryOfPhone("966512345678")).toBe("SA");
    expect(countryOfPhone("201001234567")).toBeNull();
    expect(toCountry("sa")).toBe("SA");
    expect(toCountry("xx")).toBe("JO");
  });

  it("formats Saudi dates in the Gregorian calendar with Western digits", () => {
    const s = formatDate("2026-10-26T12:00:00Z", "SA", { year: "numeric", month: "long", day: "numeric" });
    expect(s).toContain("2026");
    expect(s).not.toMatch(/[٠-٩]/);
  });
});
