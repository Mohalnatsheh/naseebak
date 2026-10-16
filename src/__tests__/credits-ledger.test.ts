import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ creditLedger: { create: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn() }));

import { recordCredit } from "@/lib/credits";

beforeEach(() => vi.clearAllMocks());

describe("recordCredit", () => {
  it("writes a ledger row", async () => {
    await recordCredit({ userId: "u1", delta: -1, reason: "REQUEST", refId: "r1" });
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: { userId: "u1", delta: -1, reason: "REQUEST", refId: "r1" },
    });
  });

  it("skips a zero change", async () => {
    await recordCredit({ userId: "u1", delta: 0, reason: "ADMIN_ADJUST" });
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  it("never fails the caller without a transaction", async () => {
    db.creditLedger.create.mockRejectedValueOnce(new Error("table missing"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordCredit({ userId: "u1", delta: 3, reason: "PURCHASE" })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("lets a transaction see the error so it rolls back", async () => {
    const tx = { creditLedger: { create: vi.fn().mockRejectedValue(new Error("boom")) } };
    await expect(
      recordCredit({ userId: "u1", delta: -1, reason: "REQUEST" }, tx as never)
    ).rejects.toThrow("boom");
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });
});
