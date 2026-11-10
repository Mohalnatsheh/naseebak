import { describe, it, expect } from "vitest";
import {
  defaultNationality, expenseRangesFor, incomeRangesFor, nationalityOptions, tribeLabel,
} from "@/lib/profile-options";
import { parentInfoSchema, parentInfoSchemaFor } from "@/lib/validations/profile";
import { formatGuardianPhone, formatJordanPhone } from "@/components/intro/intro-utils";
import { listTimeLabel, timeLabel } from "@/components/chat/chat-utils";

describe("profile options per country", () => {
  it("Jordan keeps today's stored income / expense values exactly", () => {
    expect(incomeRangesFor("JO")).toEqual(["أقل من 300 د.أ", "300-500 د.أ", "500-1000 د.أ", "1000-2000 د.أ", "أكثر من 2000 د.أ"]);
    expect(expenseRangesFor("JO")).toEqual(["أقل من 300 د.أ", "300-500 د.أ", "500-800 د.أ", "أكثر من 800 د.أ"]);
    // Unknown / missing country = Jordan (every existing member)
    expect(incomeRangesFor(undefined)).toEqual(incomeRangesFor("JO"));
  });

  it("Saudi Arabia uses riyal ranges", () => {
    for (const v of [...incomeRangesFor("SA"), ...expenseRangesFor("SA")]) expect(v).toMatch(/ر\.س$/);
    expect(incomeRangesFor("SA")[0]).toBe("أقل من 5,000 ر.س");
  });

  it("nationality defaults to the member's country, in their gender, listed first", () => {
    expect(defaultNationality("MALE", "JO")).toBe("أردني");
    expect(defaultNationality("FEMALE", "JO")).toBe("أردنية");
    expect(defaultNationality("MALE", "SA")).toBe("سعودي");
    expect(defaultNationality("FEMALE", "SA")).toBe("سعودية");
    expect(nationalityOptions("FEMALE", "SA")[0]).toBe("سعودية");
    expect(nationalityOptions("MALE", "JO")[0]).toBe("أردني");
  });

  it("tribe label follows the viewer's country", () => {
    expect(tribeLabel("JO")).toBe("العشيرة");
    expect(tribeLabel("SA")).toBe("القبيلة أو الأسرة");
    expect(tribeLabel(null)).toBe("العشيرة");
  });
});

describe("parentInfoSchemaFor", () => {
  const base = { parentName: "أحمد محمد", relationship: "father", address: "المدينة والحي" };

  it("Jordan: Jordanian mobiles only, same message as before", () => {
    expect(parentInfoSchema.safeParse({ ...base, parentPhone: "0791234567" }).success).toBe(true);
    expect(parentInfoSchemaFor("JO").safeParse({ ...base, parentPhone: "٠٧٩١٢٣٤٥٦٧" }).success).toBe(true);
    const r = parentInfoSchemaFor("JO").safeParse({ ...base, parentPhone: "0512345678" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("رقم هاتف ولي الأمر غير صالح. مثال: 0791234567");
  });

  it("Saudi Arabia: Saudi mobiles only, «جوال» wording", () => {
    for (const p of ["0512345678", "512345678", "+966512345678", "00966512345678", "٠٥١٢٣٤٥٦٧٨"]) {
      expect(parentInfoSchemaFor("SA").safeParse({ ...base, parentPhone: p }).success).toBe(true);
    }
    const r = parentInfoSchemaFor("SA").safeParse({ ...base, parentPhone: "0791234567" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("رقم جوال ولي الأمر غير صالح. مثال: 0512345678");
  });
});

describe("guardian phone display", () => {
  it("formats Jordanian numbers as before", () => {
    expect(formatJordanPhone("962791234567")).toEqual({ display: "+962 79 123 4567", tel: "+962791234567", wa: "962791234567" });
    expect(formatGuardianPhone("0791234567").display).toBe("+962 79 123 4567");
  });

  it("formats Saudi numbers", () => {
    expect(formatGuardianPhone("966512345678")).toEqual({ display: "+966 51 234 5678", tel: "+966512345678", wa: "966512345678" });
    expect(formatGuardianPhone("0512345678", "SA").display).toBe("+966 51 234 5678");
  });

  it("formats Lebanese numbers as the app does (10 or 11 digits with 961)", () => {
    expect(formatGuardianPhone("96171123456")).toEqual({ display: "+961 71 123 456", tel: "+96171123456", wa: "96171123456" });
    expect(formatGuardianPhone("9613123456")).toEqual({ display: "+961 3 123 456", tel: "+9613123456", wa: "9613123456" });
    expect(formatGuardianPhone("+961 81 123 456").display).toBe("+961 81 123 456");
    expect(formatGuardianPhone("03123456", "LB").display).toBe("+961 3 123 456");
    expect(formatGuardianPhone("071123456", "LB").display).toBe("+961 71 123 456");
    // Jordan and Saudi Arabia unchanged, also seen by a Lebanese viewer
    expect(formatGuardianPhone("962791234567", "LB").display).toBe("+962 79 123 4567");
    expect(formatGuardianPhone("966512345678", "LB").display).toBe("+966 51 234 5678");
  });
});

describe("chat time labels", () => {
  it("use Western digits and the Gregorian calendar in both countries", () => {
    const iso = "2026-03-01T09:05:00.000Z";
    for (const c of ["JO", "SA"]) {
      expect(timeLabel(iso, c)).toMatch(/\d/);
      expect(timeLabel(iso, c)).not.toMatch(/[٠-٩]/);
      expect(listTimeLabel("2020-03-01T09:05:00.000Z", c)).not.toMatch(/[٠-٩]|رجب|شعبان/);
    }
  });
});
