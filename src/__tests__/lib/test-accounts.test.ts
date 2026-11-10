import { describe, it, expect, afterEach, vi } from "vitest";
import { isValidPhone } from "@/lib/phone";
import { TEST_OTP, hasFixedOtp, isTestPhone, testPhones } from "@/lib/test-accounts";

afterEach(() => {
  delete process.env.EXTRA_TEST_PHONES;
  delete process.env.ALLOW_BUILTIN_TEST_PHONES;
  vi.unstubAllEnvs();
});

describe("test accounts", () => {
  it("built-in fixed-code numbers log in with 111111", () => {
    expect(TEST_OTP).toBe("111111");
    expect(hasFixedOtp("962796922292")).toBe(true);
    expect(hasFixedOtp("962790000004")).toBe(false); // seeded, but no fixed code
    expect(hasFixedOtp("962791234567")).toBe(false);
  });

  it("extra numbers from EXTRA_TEST_PHONES get the fixed code and join the group, any format", () => {
    process.env.EXTRA_TEST_PHONES = "0790000777, +962 79 000 0778";
    expect(hasFixedOtp("962790000777")).toBe(true);
    expect(hasFixedOtp("962790000778")).toBe(true);
    expect(isTestPhone("962790000777")).toBe(true);
  });

  it("the group holds the built-in, seeded and extra numbers; real numbers are outside", () => {
    process.env.EXTRA_TEST_PHONES = "0790000777";
    expect(testPhones()).toEqual(expect.arrayContaining(["962796922292", "962790000004", "962790000777"]));
    expect(isTestPhone("962791234567")).toBe(false);
    expect(isTestPhone(null)).toBe(false);
  });

  it("on production only EXTRA_TEST_PHONES count", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.EXTRA_TEST_PHONES = "0790000777";
    expect(hasFixedOtp("962777000001")).toBe(false);
    expect(hasFixedOtp("962796922292")).toBe(false);
    expect(isTestPhone("962790000004")).toBe(false);
    expect(hasFixedOtp("962790000777")).toBe(true);
    expect(testPhones()).toEqual(["962790000777"]);
  });

  it("a production build can opt back in (local Docker)", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_BUILTIN_TEST_PHONES = "true";
    expect(hasFixedOtp("962777000001")).toBe(true);
    expect(isTestPhone("962790000004")).toBe(true);
  });

  it("Lebanese test numbers log in with 111111 and join the group; seeded ones join without a code", () => {
    for (const p of ["9613000001", "9613000002", "96171000003"]) {
      expect(isValidPhone(p, "LB")).toBe(true);
      expect(hasFixedOtp(p)).toBe(true);
      expect(isTestPhone(p)).toBe(true);
    }
    for (const p of ["96171000012", "96171000013", "96171000014", "96171000015", "96171000016"]) {
      expect(isValidPhone(p, "LB")).toBe(true);
      expect(isTestPhone(p)).toBe(true);
      expect(hasFixedOtp(p)).toBe(false);
    }
  });

  it("on production the Lebanese built-ins are ordinary numbers", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(hasFixedOtp("9613000001")).toBe(false);
    expect(isTestPhone("96171000012")).toBe(false);
  });
});
