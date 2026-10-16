import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ systemSetting: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

/** Settings are cached per module instance, so load a fresh copy for every case. */
async function flagsWith(values: Record<string, string>) {
  vi.resetModules();
  db.systemSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
    where.key in values ? { value: values[where.key] } : null,
  );
  const { getCycleFlags } = await import("@/lib/settings");
  return getCycleFlags();
}

const allOn = {
  intro_requests_enabled: "true",
  new_suggestions_flow: "true",
  credit_on_interest: "true",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCycleFlags.creditOnInterest", () => {
  it("is true only when intro requests, shared suggestions and credit_on_interest are all on", async () => {
    expect((await flagsWith(allOn)).creditOnInterest).toBe(true);
  });

  it("is false when shared suggestions (new_suggestions_flow) is off", async () => {
    expect((await flagsWith({ ...allOn, new_suggestions_flow: "false" })).creditOnInterest).toBe(false);
  });

  it("is false when intro requests are off", async () => {
    expect((await flagsWith({ ...allOn, intro_requests_enabled: "false" })).creditOnInterest).toBe(false);
  });

  it("is false when credit_on_interest itself is off", async () => {
    expect((await flagsWith({ ...allOn, credit_on_interest: "false" })).creditOnInterest).toBe(false);
  });

  it("defaults to false when nothing is stored", async () => {
    expect((await flagsWith({})).creditOnInterest).toBe(false);
  });
});
