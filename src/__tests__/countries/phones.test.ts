import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone, phoneInputCountry, localPhone } from "@/lib/validations/auth";
import { citiesFor } from "@/lib/countries/places";
import { incomeRangesFor, defaultNationality } from "@/lib/profile-options";
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

describe("Lebanon numbers", () => {
  it.each(["03123456", "3123456", "+9613123456", "009613123456", "9613123456"])("%s → 9613123456", (v) => {
    expect(isValidPhone(v, "LB")).toBe(true);
    expect(normalizePhone(v)).toBe("9613123456");
  });
  it.each(["71123456", "+96171123456", "0096171123456", "81123456", "76123456"])("%s is Lebanese", (v) => {
    expect(phoneInputCountry(v)).toBe("LB");
  });
  it("local forms", () => {
    expect(localPhone("9613123456")).toBe("03123456");
    expect(localPhone("96171123456")).toBe("71123456");
  });
  it("never confuses countries", () => {
    expect(phoneInputCountry("0791234567")).toBe("JO");
    expect(phoneInputCountry("0512345678")).toBe("SA");
    expect(phoneInputCountry("78123456")).toBe("LB");
    expect(isValidPhone("72123456", "LB")).toBe(false);
    expect(isValidPhone("0712345678", "LB")).toBe(false);
  });
  it("country of a stored number", () => expect(countryOfPhone("96171123456")).toBe("LB"));
  it("per-country lists", () => {
    expect(citiesFor("LB")).toEqual(expect.arrayContaining(["بيروت", "طرابلس"]));
    expect(incomeRangesFor("LB")[0]).toBe("أقل من 500 $");
    expect(defaultNationality("FEMALE", "LB")).toBe("لبنانية");
  });
});
