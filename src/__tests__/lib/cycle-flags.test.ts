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

describe("getCycleFlags.activeFirstFeed", () => {
  it("is off by default", async () => {
    expect((await flagsWith(allOn)).activeFirstFeed).toBe(false);
  });

  it("is on with feed_active_first and shared suggestions", async () => {
    expect((await flagsWith({ ...allOn, feed_active_first: "true" })).activeFirstFeed).toBe(true);
  });

  it("is off while shared suggestions are off", async () => {
    expect((await flagsWith({ ...allOn, feed_active_first: "true", new_suggestions_flow: "false" })).activeFirstFeed).toBe(false);
  });
});

describe("getCycleFlags.relaxedCountries", () => {
  it("is empty by default", async () => {
    expect((await flagsWith(allOn)).relaxedCountries).toEqual([]);
  });

  it("is Saudi Arabia with sa_relaxed_matching on", async () => {
    expect((await flagsWith({ ...allOn, sa_relaxed_matching: "true" })).relaxedCountries).toEqual(["SA"]);
  });

  it("is Lebanon only with lb_relaxed_matching on", async () => {
    expect((await flagsWith({ ...allOn, lb_relaxed_matching: "true" })).relaxedCountries).toEqual(["LB"]);
  });

  it("holds both with both switches on", async () => {
    expect((await flagsWith({ ...allOn, sa_relaxed_matching: "true", lb_relaxed_matching: "true" })).relaxedCountries).toEqual(["SA", "LB"]);
  });
});

describe("getCycleFlags.freeInterestReply", () => {
  it("is off by default", async () => {
    expect((await flagsWith(allOn)).freeInterestReply).toBe(false);
  });

  it("is on with free_interest_reply and credit on interest", async () => {
    expect((await flagsWith({ ...allOn, free_interest_reply: "true" })).freeInterestReply).toBe(true);
  });

  it("is off while credit on interest is off", async () => {
    expect((await flagsWith({ ...allOn, free_interest_reply: "true", credit_on_interest: "false" })).freeInterestReply).toBe(false);
  });
});
