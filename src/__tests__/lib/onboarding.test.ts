import { describe, it, expect } from "vitest";
import { clampStep, readOnboardingDone, shouldShowOnboarding, writeOnboardingDone, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-18T12:00:00Z");

describe("clampStep", () => {
  it("keeps the step inside a list that shrank", () => {
    expect(clampStep(4, 3)).toBe(2);
    expect(clampStep(1, 3)).toBe(1);
    expect(clampStep(-1, 3)).toBe(0);
    expect(clampStep(2, 0)).toBe(0);
  });
});

describe("readOnboardingDone / writeOnboardingDone", () => {
  it("reads the stored flag", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readOnboardingDone(storage)).toBe(false);
    writeOnboardingDone(storage);
    expect(store.get(ONBOARDING_STORAGE_KEY)).toBe("true");
    expect(readOnboardingDone(storage)).toBe(true);
  });

  it("never throws when storage is blocked", () => {
    const blocked = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    expect(readOnboardingDone(blocked)).toBe(true);
    expect(() => writeOnboardingDone(blocked)).not.toThrow();
    expect(readOnboardingDone(undefined)).toBe(false);
  });
});

describe("shouldShowOnboarding", () => {
  const base = { loading: false, completed: false, setupDone: false, createdAt: new Date(NOW - DAY).toISOString(), now: NOW };

  it("waits until profile and switches have loaded", () => {
    expect(shouldShowOnboarding({ ...base, loading: true })).toBe(false);
    expect(shouldShowOnboarding(base)).toBe(true);
  });

  it("stays closed once finished on this browser", () => {
    expect(shouldShowOnboarding({ ...base, completed: true })).toBe(false);
  });

  it("skips returning members (setup done, account older than a week) on a new device", () => {
    const old = new Date(NOW - 8 * DAY).toISOString();
    expect(shouldShowOnboarding({ ...base, setupDone: true, createdAt: old })).toBe(false);
    // A new member who just finished setup still sees it
    expect(shouldShowOnboarding({ ...base, setupDone: true })).toBe(true);
    // An old account that never finished setup still gets the guide
    expect(shouldShowOnboarding({ ...base, createdAt: old })).toBe(true);
  });
});
