import { describe, it, expect } from "vitest";
import { checkMessage } from "@/lib/chat/filter";

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
