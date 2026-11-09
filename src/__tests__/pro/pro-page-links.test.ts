import { describe, it, expect, vi, beforeEach } from "vitest";
import { proPageShown, PRO_PAGE_PATH } from "@/lib/pro/plans";
import { isLocalHostname } from "@/lib/local-host";
import { waitForProActivation } from "@/lib/pro/activation";

describe("proPageShown (nav entry and payments link card rule)", () => {
  it("shown when the member can buy a plan or is Pro, hidden otherwise", () => {
    expect(PRO_PAGE_PATH).toBe("/dashboard/pro");
    expect(proPageShown({ isPro: false, canBuy: true })).toBe(true);
    expect(proPageShown({ isPro: true, canBuy: false })).toBe(true);
    // Switch off, country not selling, no plans, or a test account in the app: canBuy is false
    expect(proPageShown({ isPro: false, canBuy: false })).toBe(false);
    expect(proPageShown(null)).toBe(false);
    expect(proPageShown(undefined)).toBe(false);
  });
});

describe("isLocalHostname (the mock Pro panel's only home)", () => {
  it("accepts this machine only", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]", "app.localhost"]) expect(isLocalHostname(h)).toBe(true);
    for (const h of ["naseebak.com", "www.naseebak.com", "localhost.naseebak.com", "127.0.0.2", "mylocalhost"]) {
      expect(isLocalHostname(h)).toBe(false);
    }
  });
});

describe("waitForProActivation (return from the Pro checkout)", () => {
  let t = 0;
  const now = () => t;
  const sleep = async (ms: number) => {
    t += ms;
  };
  beforeEach(() => {
    t = 0;
  });

  it("stops as soon as Pro is on", async () => {
    const load = vi.fn().mockResolvedValueOnce({ isPro: false }).mockResolvedValueOnce({ isPro: true });
    expect(await waitForProActivation({ load, isMounted: () => true, now, sleep })).toBe("active");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a failed load (null) is just another try", async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ isPro: true });
    expect(await waitForProActivation({ load, isMounted: () => true, now, sleep })).toBe("active");
  });

  it("gives up after 10 s", async () => {
    const load = vi.fn().mockResolvedValue({ isPro: false });
    expect(await waitForProActivation({ load, isMounted: () => true, now, sleep })).toBe("timeout");
    // 0, 1.5, 3 … 9 s: 7 looks
    expect(load).toHaveBeenCalledTimes(7);
  });

  it("stops at once when the member left the page, even mid-load", async () => {
    let mounted = true;
    const load = vi.fn(async () => {
      mounted = false;
      return { isPro: true };
    });
    expect(await waitForProActivation({ load, isMounted: () => mounted, now, sleep })).toBe("left");
    expect(load).toHaveBeenCalledTimes(1);
    expect(await waitForProActivation({ load, isMounted: () => false, now, sleep })).toBe("left");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
