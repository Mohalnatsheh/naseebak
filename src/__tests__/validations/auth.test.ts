import { describe, it, expect } from "vitest";
import { sendOtpSchema, verifyOtpSchema, loginSchema, registerSchema, normalizePhone } from "@/lib/validations/auth";

describe("sendOtpSchema", () => {
  it("should accept valid Jordanian phone (07x)", () => {
    const result = sendOtpSchema.safeParse({ phone: "0791234567" });
    expect(result.success).toBe(true);
  });

  it("should accept +962 format", () => {
    const result = sendOtpSchema.safeParse({ phone: "+962791234567" });
    expect(result.success).toBe(true);
  });

  it("should accept 962 format without plus", () => {
    const result = sendOtpSchema.safeParse({ phone: "962791234567" });
    expect(result.success).toBe(true);
  });

  it("should accept 00962 format", () => {
    const result = sendOtpSchema.safeParse({ phone: "00962791234567" });
    expect(result.success).toBe(true);
  });

  it("should accept 7x format (without leading 0)", () => {
    const result = sendOtpSchema.safeParse({ phone: "791234567" });
    expect(result.success).toBe(true);
  });

  it("should accept 077 format", () => {
    const result = sendOtpSchema.safeParse({ phone: "0771234567" });
    expect(result.success).toBe(true);
  });

  it("should reject non-Jordanian phone", () => {
    const result = sendOtpSchema.safeParse({ phone: "1234567890" });
    expect(result.success).toBe(false);
  });

  it("should reject empty phone", () => {
    const result = sendOtpSchema.safeParse({ phone: "" });
    expect(result.success).toBe(false);
  });

  it("should reject short phone", () => {
    const result = sendOtpSchema.safeParse({ phone: "079123" });
    expect(result.success).toBe(false);
  });

  it("should reject non-mobile Jordanian number (76)", () => {
    const result = sendOtpSchema.safeParse({ phone: "0761234567" });
    expect(result.success).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("should normalize 07x format", () => {
    expect(normalizePhone("0791234567")).toBe("0791234567");
  });

  it("should normalize 7x format", () => {
    expect(normalizePhone("791234567")).toBe("0791234567");
  });

  it("should normalize +962 format", () => {
    expect(normalizePhone("+962791234567")).toBe("0791234567");
  });

  it("should normalize 962 format", () => {
    expect(normalizePhone("962791234567")).toBe("0791234567");
  });

  it("should normalize 00962 format", () => {
    expect(normalizePhone("00962791234567")).toBe("0791234567");
  });

  it("should strip spaces and dashes", () => {
    expect(normalizePhone("079 123 4567")).toBe("0791234567");
    expect(normalizePhone("079-123-4567")).toBe("0791234567");
  });
});

describe("verifyOtpSchema", () => {
  it("should accept valid phone and 6-digit code", () => {
    const result = verifyOtpSchema.safeParse({ phone: "0791234567", code: "123456" });
    expect(result.success).toBe(true);
  });

  it("should reject code shorter than 6 digits", () => {
    const result = verifyOtpSchema.safeParse({ phone: "0791234567", code: "12345" });
    expect(result.success).toBe(false);
  });

  it("should reject code longer than 6 digits", () => {
    const result = verifyOtpSchema.safeParse({ phone: "0791234567", code: "1234567" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid phone", () => {
    const result = verifyOtpSchema.safeParse({ phone: "123", code: "123456" });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("should accept valid phone and OTP", () => {
    const result = loginSchema.safeParse({ phone: "0791234567", otp: "123456" });
    expect(result.success).toBe(true);
  });

  it("should accept +962 phone format", () => {
    const result = loginSchema.safeParse({ phone: "+962781234567", otp: "654321" });
    expect(result.success).toBe(true);
  });

  it("should accept 7x format", () => {
    const result = loginSchema.safeParse({ phone: "791234567", otp: "123456" });
    expect(result.success).toBe(true);
  });

  it("should accept 00962 format", () => {
    const result = loginSchema.safeParse({ phone: "00962791234567", otp: "123456" });
    expect(result.success).toBe(true);
  });

  it("should reject invalid phone", () => {
    const result = loginSchema.safeParse({ phone: "invalid", otp: "123456" });
    expect(result.success).toBe(false);
  });

  it("should reject short OTP", () => {
    const result = loginSchema.safeParse({ phone: "0791234567", otp: "123" });
    expect(result.success).toBe(false);
  });

  it("should reject empty fields", () => {
    const result = loginSchema.safeParse({ phone: "", otp: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const validData = {
    firstName: "أحمد",
    lastName: "محمد",
    phone: "0791234567",
    gender: "MALE" as const,
    otp: "123456",
  };

  it("should accept valid registration data", () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should accept Jordanian phone number", () => {
    const result = registerSchema.safeParse({
      ...validData,
      phone: "0781234567",
    });
    expect(result.success).toBe(true);
  });

  it("should accept +962 phone format", () => {
    const result = registerSchema.safeParse({
      ...validData,
      phone: "+962791234567",
    });
    expect(result.success).toBe(true);
  });

  it("should accept 7x format (no prefix)", () => {
    const result = registerSchema.safeParse({
      ...validData,
      phone: "791234567",
    });
    expect(result.success).toBe(true);
  });

  it("should accept 00962 format", () => {
    const result = registerSchema.safeParse({
      ...validData,
      phone: "00962791234567",
    });
    expect(result.success).toBe(true);
  });

  it("should reject non-Jordanian phone number", () => {
    const result = registerSchema.safeParse({
      ...validData,
      phone: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing phone", () => {
    const { phone, ...noPhone } = validData;
    const result = registerSchema.safeParse(noPhone);
    expect(result.success).toBe(false);
  });

  it("should reject short first name", () => {
    const result = registerSchema.safeParse({
      ...validData,
      firstName: "أ",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid gender", () => {
    const result = registerSchema.safeParse({
      ...validData,
      gender: "OTHER",
    });
    expect(result.success).toBe(false);
  });

  it("should accept FEMALE gender", () => {
    const result = registerSchema.safeParse({
      ...validData,
      gender: "FEMALE",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid OTP length", () => {
    const result = registerSchema.safeParse({
      ...validData,
      otp: "12345",
    });
    expect(result.success).toBe(false);
  });
});
