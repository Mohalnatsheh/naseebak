import { describe, it, expect } from "vitest";
import { checkMessage, completesSplitNumber, numberShape } from "@/lib/chat/filter";

const blocked = (body: string) => {
  const r = checkMessage(body);
  return r.ok ? null : r.reason;
};

describe("checkMessage", () => {
  it.each([
    "0791234567",
    "رقمي 07 9123 4567",
    "٠٧٩١٢٣٤٥٦٧",
    "+962-79-123-4567",
    "(079) 123.4567",
    "صفر سبعة تسعة واحد اثنين ثلاثة اربعة",
    "my insta @yazan_99",
    "زورني على instagram",
    "كلمني واتس",
    "تيليجرام",
  ])("blocks contact details: %s", (body) => {
    expect(blocked(body)).toBe("CONTACT");
  });

  it.each(["wa.me/96279", "www.site.com", "https://example.com/x", "t.me/user", "mysite.jo"])(
    "blocks links: %s",
    (body) => {
      expect(blocked(body)).toBe("LINK");
    }
  );

  it.each([
    "عمري 29 وأسكن في عمّان منذ 2015",
    "عندي 3 إخوة",
    "السلام عليكم، كيف حالك؟",
    "تخرجت سنة 2018 وأعمل منذ 5 سنوات",
    "أحب القراءة والسفر",
  ])("allows normal messages: %s", (body) => {
    expect(checkMessage(body)).toEqual({ ok: true, text: body });
  });

  it("trims and rejects empty messages", () => {
    expect(blocked("   ")).toBe("EMPTY");
    expect(checkMessage("  مرحبا  ")).toEqual({ ok: true, text: "مرحبا" });
  });

  it("rejects messages over 1000 characters", () => {
    expect(blocked("أ".repeat(1001))).toBe("TOO_LONG");
    expect(checkMessage("أ".repeat(1000)).ok).toBe(true);
  });

  it("gives an Arabic explanation", () => {
    const r = checkMessage("0791234567");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("التعارف العائلي");
  });
});

describe("phone numbers split across messages", () => {
  it("reads number-only messages together", () => {
    expect(completesSplitNumber("واحد اثنان", ["صفر سبعة تسعة صفر صفر"])).toBe(true);
    expect(completesSplitNumber("4567", ["079 123"])).toBe(true);
    expect(completesSplitNumber("٤٥", ["٠٧٩", "١٢٣"])).toBe(true);
  });

  it("ignores ordinary sentences with a few numbers", () => {
    expect(completesSplitNumber("ولدت سنة 1997", ["عمري 29 وعندي 3 إخوة"])).toBe(false);
    expect(completesSplitNumber("2 أو 3 أطفال", [])).toBe(false);
    expect(completesSplitNumber("صفر سبعة", ["كيف حالك؟"])).toBe(false);
  });

  it("stops at the first message that is not a number", () => {
    expect(completesSplitNumber("واحد اثنان", ["أهلاً", "صفر سبعة تسعة صفر صفر"])).toBe(false);
  });

  it("numberShape counts digits and spelled digits", () => {
    expect(numberShape("صفر سبعة تسعة")).toEqual({ digits: 3, numberish: true });
    expect(numberShape("رقمي 079")).toEqual({ digits: 3, numberish: true });
    expect(numberShape("أنا من عمان")).toEqual({ digits: 0, numberish: false });
  });
});
