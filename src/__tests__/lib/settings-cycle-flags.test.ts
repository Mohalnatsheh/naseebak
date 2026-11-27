import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ systemSetting: { findUnique: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { getCycleFlags, setSetting } from "@/lib/settings";

const KEYS = ["intro_requests_enabled", "new_suggestions_flow", "respect_age_range", "suggest_today_first"];

async function withSettings(values: Record<string, string>) {
  db.systemSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
    where.key in values ? { key: where.key, value: values[where.key] } : null,
  );
}

beforeEach(async () => {
  db.systemSetting.findUnique.mockReset();
  db.systemSetting.upsert.mockReset();
  for (const k of KEYS) await setSetting(k, "x"); // clears the 30s cache
});

describe("getCycleFlags — better cards switches", () => {
  it("both are off by default", async () => {
    await withSettings({ intro_requests_enabled: "true", new_suggestions_flow: "true" });
    const f = await getCycleFlags();
    expect(f.respectAgeRange).toBe(false);
    expect(f.todayFirst).toBe(false);
  });

  it("both turn on with the shared flow", async () => {
    await withSettings({ intro_requests_enabled: "true", new_suggestions_flow: "true", respect_age_range: "true", suggest_today_first: "true" });
    const f = await getCycleFlags();
    expect(f.respectAgeRange).toBe(true);
    expect(f.todayFirst).toBe(true);
  });

  it("stay off while the shared flow is off", async () => {
    await withSettings({ intro_requests_enabled: "true", new_suggestions_flow: "false", respect_age_range: "true", suggest_today_first: "true" });
    const f = await getCycleFlags();
    expect(f.respectAgeRange).toBe(false);
    expect(f.todayFirst).toBe(false);
  });
});
