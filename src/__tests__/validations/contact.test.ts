import { describe, it, expect } from "vitest";
import { contactSchema } from "@/lib/validations/contact";

const base = { name: "سارة", subject: "سؤال", message: "أريد معرفة طريقة عمل المنصة." };

describe("contactSchema (phone or email, G34)", () => {
  it("accepts a phone without an email", () => {
    const r = contactSchema.safeParse({ ...base, phone: "٠٧٩١٢٣٤٥٦٧" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe("0791234567");
      expect(r.data.email).toBe("");
    }
  });

  it("accepts an email without a phone, and both", () => {
    expect(contactSchema.safeParse({ ...base, email: "a@b.co" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...base, email: "a@b.co", phone: "0791234567" }).success).toBe(true);
  });

  it("needs at least one way to reply", () => {
    const r = contactSchema.safeParse({ ...base, email: "", phone: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe("phone");
  });

  it("refuses a broken phone or email", () => {
    expect(contactSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
});
