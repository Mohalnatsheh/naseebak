import { describe, it, expect } from "vitest";
import { applyReferralSchema } from "@/lib/validations/referral";

describe("applyReferralSchema", () => {
  it("accepts a valid 8-character code", () => {
    const result = applyReferralSchema.safeParse({ code: "ABCD1234" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty code", () => {
    const result = applyReferralSchema.safeParse({ code: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a code that is too short", () => {
    const result = applyReferralSchema.safeParse({ code: "ABC" });
    expect(result.success).toBe(false);
  });

  it("rejects a code that is too long", () => {
    const result = applyReferralSchema.safeParse({ code: "ABCDEFGHI" });
    expect(result.success).toBe(false);
  });

  it("rejects missing code field", () => {
    const result = applyReferralSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string code", () => {
    const result = applyReferralSchema.safeParse({ code: 12345678 });
    expect(result.success).toBe(false);
  });
});
