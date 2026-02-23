import { describe, it, expect } from "vitest";
import { updateNotificationPreferencesSchema } from "@/lib/validations/notification-preferences";

describe("updateNotificationPreferencesSchema", () => {
  it("should accept empty object (all fields optional)", () => {
    const result = updateNotificationPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept all boolean fields", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      suggestions: true,
      interests: false,
      matches: true,
      visitUpdates: false,
      payments: true,
      identity: true,
      support: false,
    });
    expect(result.success).toBe(true);
  });

  it("should accept partial updates", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      suggestions: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestions).toBe(false);
      expect(result.data.interests).toBeUndefined();
    }
  });

  it("should reject non-boolean values", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      suggestions: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("should reject number values", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      matches: 1,
    });
    expect(result.success).toBe(false);
  });

  it("should accept multiple partial fields", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      interests: true,
      payments: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interests).toBe(true);
      expect(result.data.payments).toBe(false);
    }
  });
});
