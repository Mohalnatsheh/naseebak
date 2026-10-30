import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(async (k: string) => store.get(k) ?? ""),
  setSetting: vi.fn(async (k: string, v: string) => void store.set(k, v)),
}));

import { getMobileConfig, isVersion, updateMobileConfig } from "@/lib/mobile-config";
import { GET } from "@/app/api/mobile/config/route";

beforeEach(() => store.clear());

describe("mobile app version gate", () => {
  it("no settings: no gate, the Play Store link by default", async () => {
    const c = await getMobileConfig();
    expect(c.android).toEqual({
      minVersion: "",
      latestVersion: "",
      storeUrl: "https://play.google.com/store/apps/details?id=com.naseebak.naseebak_app",
    });
    expect(c.ios.storeUrl).toBe("");
  });

  it("saves required and optional versions per platform, independently", async () => {
    expect(await updateMobileConfig({ android: { minVersion: "1.2.0", latestVersion: "1.3.0" }, ios: { latestVersion: " 1.1.0 " } })).toBeNull();
    const c = await getMobileConfig();
    expect(c.android).toMatchObject({ minVersion: "1.2.0", latestVersion: "1.3.0" });
    expect(c.ios).toMatchObject({ minVersion: "", latestVersion: "1.1.0" });
    // The public endpoint the app reads
    expect(await (await GET()).json()).toMatchObject({ android: { minVersion: "1.2.0" }, ios: { latestVersion: "1.1.0" } });
  });

  it("refuses bad versions and non-https store links; clearing a field removes the gate", async () => {
    expect(await updateMobileConfig({ android: { minVersion: "1.2" } })).toMatch(/1\.2\.3/);
    expect(await updateMobileConfig({ ios: { storeUrl: "http://x" } })).toMatch(/https/);
    expect(await updateMobileConfig("x")).toBe("Invalid body");
    await updateMobileConfig({ android: { minVersion: "2.0.0" } });
    await updateMobileConfig({ android: { minVersion: "" } });
    expect((await getMobileConfig()).android.minVersion).toBe("");
  });

  it("a stored value that isn't a version is ignored rather than blocking everyone", async () => {
    store.set("mobile_android_min_version", "latest");
    expect((await getMobileConfig()).android.minVersion).toBe("");
    expect(isVersion("10.0.12")).toBe(true);
  });
});

describe("payments in the app", () => {
  it("on by default; the admin switch turns it off for everyone", async () => {
    const { appPaymentsFor, getMobileAdminSettings } = await import("@/lib/mobile-config");
    expect(await appPaymentsFor("962791112233")).toBe(true);
    expect((await getMobileAdminSettings()).paymentsEnabled).toBe(true);
    expect(await updateMobileConfig({ paymentsEnabled: false })).toBeNull();
    expect(await appPaymentsFor("962791112233")).toBe(false);
    expect(await updateMobileConfig({ paymentsEnabled: "no" })).toMatch(/true or false/);
  });

  it("never for a test account (the store review login), even with the switch on", async () => {
    const { appPaymentsFor } = await import("@/lib/mobile-config");
    process.env.EXTRA_TEST_PHONES = "0796922292";
    try {
      expect(await appPaymentsFor("962796922292")).toBe(false);
      expect(await appPaymentsFor("962791112233")).toBe(true);
    } finally {
      delete process.env.EXTRA_TEST_PHONES;
    }
  });
});
