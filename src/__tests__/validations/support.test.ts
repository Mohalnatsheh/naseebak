import { describe, it, expect } from "vitest";
import { createTicketSchema } from "@/lib/validations/support";

describe("createTicketSchema", () => {
  const validTicket = {
    type: "ISSUE" as const,
    subject: "مشكلة في تسجيل الدخول",
    description: "لا أستطيع الدخول إلى حسابي بعد تحديث رقم الهاتف الخاص بي",
  };

  it("should accept valid ticket data", () => {
    const result = createTicketSchema.safeParse(validTicket);
    expect(result.success).toBe(true);
  });

  it("should accept SUGGESTION type", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, type: "SUGGESTION" });
    expect(result.success).toBe(true);
  });

  it("should accept CHANGE_REQUEST type", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, type: "CHANGE_REQUEST" });
    expect(result.success).toBe(true);
  });

  it("should reject invalid type", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, type: "BUG" });
    expect(result.success).toBe(false);
  });

  it("should reject short subject (less than 5 chars)", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, subject: "مشك" });
    expect(result.success).toBe(false);
  });

  it("should reject subject over 200 chars", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, subject: "م".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("should reject short description (less than 20 chars)", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, description: "وصف قصير" });
    expect(result.success).toBe(false);
  });

  it("should reject missing required fields", () => {
    const result = createTicketSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
