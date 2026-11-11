import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ systemSetting: { findUnique: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { jodChargingFor, setSetting } from "@/lib/settings";

beforeEach(async () => {
  db.systemSetting.findUnique.mockReset();
  db.systemSetting.upsert.mockReset();
  await setSetting("jod_charging", "x"); // clears the 30s cache
});

describe("jodChargingFor", () => {
  it("is off by default", async () => {
    db.systemSetting.findUnique.mockResolvedValue(null);
    expect(await jodChargingFor("JO")).toBe(false);
  });

  it("is on for Jordan only when the switch is on", async () => {
    db.systemSetting.findUnique.mockResolvedValue({ key: "jod_charging", value: "true" });
    expect(await jodChargingFor("JO")).toBe(true);
    expect(await jodChargingFor("SA")).toBe(false);
    expect(await jodChargingFor("LB")).toBe(false);
    expect(await jodChargingFor(null)).toBe(false);
  });
});
