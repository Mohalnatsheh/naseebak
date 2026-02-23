import { describe, it, expect } from "vitest";
import { visitFeedbackSchema } from "@/lib/validations/visit-feedback";

describe("visitFeedbackSchema", () => {
  it("should accept valid feedback with PROCEEDED outcome", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
      rating: 5,
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid feedback with DECLINED outcome", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "DECLINED",
      rating: 3,
      reason: "لم يكن هناك توافق",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid outcome value", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "MAYBE",
      rating: 3,
    });
    expect(result.success).toBe(false);
  });

  it("should reject rating below 1", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
      rating: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject rating above 5", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it("should reject non-integer rating", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
      rating: 3.5,
    });
    expect(result.success).toBe(false);
  });

  it("should accept rating of exactly 1", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "DECLINED",
      rating: 1,
    });
    expect(result.success).toBe(true);
  });

  it("should accept rating of exactly 5", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
      rating: 5,
    });
    expect(result.success).toBe(true);
  });

  it("should allow optional reason", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
      rating: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBeUndefined();
    }
  });

  it("should reject reason longer than 500 characters", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "DECLINED",
      rating: 2,
      reason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing outcome", () => {
    const result = visitFeedbackSchema.safeParse({
      rating: 3,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing rating", () => {
    const result = visitFeedbackSchema.safeParse({
      outcome: "PROCEEDED",
    });
    expect(result.success).toBe(false);
  });
});
