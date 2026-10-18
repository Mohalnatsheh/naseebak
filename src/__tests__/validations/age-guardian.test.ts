import { describe, it, expect } from "vitest";
import { ageFromDob, dateOfBirthError, maxDateOfBirth, parentInfoSchema, profileDraftSchema } from "@/lib/validations/profile";

const now = new Date("2026-10-17T12:00:00Z");

describe("member age", () => {
  it("counts full years, the day before and on the birthday", () => {
    expect(ageFromDob("2008-10-18", now)).toBe(17);
    expect(ageFromDob("2008-10-17", now)).toBe(18);
  });

  it("refuses under 18, unreadable dates and absurd ages", () => {
    expect(dateOfBirthError("2015-01-01", now)).toMatch(/18 سنة على الأقل/);
    expect(dateOfBirthError("2008-10-18", now)).not.toBeNull();
    expect(dateOfBirthError("2008-10-17", now)).toBeNull();
    expect(dateOfBirthError("not a date", now)).toBe("تاريخ الميلاد غير صالح");
    expect(dateOfBirthError("1900-01-01", now)).toBe("تاريخ الميلاد غير صالح");
  });

  it("gives the date input its latest allowed birth date", () => {
    expect(maxDateOfBirth(now)).toBe("2008-10-17");
  });

  it("the draft schema checks a given birth date but allows none", () => {
    expect(profileDraftSchema.safeParse({ dateOfBirth: "2015-01-01" }).success).toBe(false);
    expect(profileDraftSchema.safeParse({}).success).toBe(true);
  });
});

describe("guardian contact", () => {
  const ok = { parentName: "محمد أحمد", parentPhone: "0791234567", relationship: "father", address: "عمّان" };

  it("accepts any Jordanian mobile format", () => {
    for (const parentPhone of ["0791234567", "+962 79 123 4567", "962791234567", "079-123-4567"]) {
      expect(parentInfoSchema.safeParse({ ...ok, parentPhone }).success, parentPhone).toBe(true);
    }
  });

  it("accepts a phone typed with Arabic-Indic or Persian digits", () => {
    for (const parentPhone of ["٠٧٩١٢٣٤٥٦٧", "۰۷۹۱۲۳۴۵۶۷", "٠٧٩ ١٢٣ ٤٥٦٧"]) {
      const r = parentInfoSchema.safeParse({ ...ok, parentPhone });
      expect(r.success, parentPhone).toBe(true);
      if (r.success) expect(r.data.parentPhone).toBe("0791234567");
    }
  });

  it("refuses a non-Arabic name, a short phone and an unknown relationship", () => {
    expect(parentInfoSchema.safeParse({ ...ok, parentName: "Ahmad" }).success).toBe(false);
    expect(parentInfoSchema.safeParse({ ...ok, parentPhone: "123" }).success).toBe(false);
    expect(parentInfoSchema.safeParse({ ...ok, relationship: "الأب" }).success).toBe(false);
    expect(parentInfoSchema.safeParse({ ...ok, address: "" }).success).toBe(false);
  });
});
