import { afterEach, describe, expect, it } from "vitest";
import { fixedOtpOverride } from "@/lib/otp-overrides";

// Made-up numbers only: real member numbers never go in the repo.
const ORIGINAL = process.env.FIXED_OTP_OVERRIDES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FIXED_OTP_OVERRIDES;
  else process.env.FIXED_OTP_OVERRIDES = ORIGINAL;
});

describe("fixedOtpOverride", () => {
  it("returns the fixed code for a listed number, matching any input format", () => {
    process.env.FIXED_OTP_OVERRIDES = "9613000777:123456";
    expect(fixedOtpOverride("9613000777")).toBe("123456");
    // the same number typed differently normalizes to 9613000777
    expect(fixedOtpOverride("+961 3 000 777")).toBe("123456");
    expect(fixedOtpOverride("009613000777")).toBe("123456");
    expect(fixedOtpOverride("03000777")).toBe("123456");
  });

  it("returns null for numbers not listed", () => {
    process.env.FIXED_OTP_OVERRIDES = "9613000777:123456";
    expect(fixedOtpOverride("962790000001")).toBeNull();
  });

  it("is empty by default", () => {
    delete process.env.FIXED_OTP_OVERRIDES;
    expect(fixedOtpOverride("9613000777")).toBeNull();
  });

  it("reads several pairs and ignores malformed entries", () => {
    process.env.FIXED_OTP_OVERRIDES = "9613000777:123456, 0790000777:654321, garbage, :999";
    expect(fixedOtpOverride("9613000777")).toBe("123456");
    expect(fixedOtpOverride("962790000777")).toBe("654321");
  });
});
