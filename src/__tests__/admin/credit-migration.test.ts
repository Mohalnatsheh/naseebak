import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const tx = vi.hoisted(() => ({
  systemSetting: { create: vi.fn() },
  user: { findMany: vi.fn(), updateMany: vi.fn() },
  notification: { createMany: vi.fn() },
  creditLedger: { createMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  systemSetting: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
}));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => settings);

import { runCreditMigration } from "@/lib/admin/credit-migration";

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true });
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.user.findMany.mockResolvedValue([
    { id: "a", matchCredits: 0 },
    { id: "b", matchCredits: 2 },
    { id: "c", matchCredits: 7 },
  ]);
});

describe("runCreditMigration", () => {
  it("refuses while intro requests are off", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: false });
    expect(await runCreditMigration("admin")).toEqual({ ok: false, reason: "SWITCH_OFF" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("tops up below 3, notifies everyone and records the gift", async () => {
    const res = await runCreditMigration("admin");
    expect(res).toMatchObject({ ok: true, users: 3, toppedUp: 2 });
    expect(tx.systemSetting.create).toHaveBeenCalledBefore(tx.user.updateMany);
    expect(tx.notification.createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(tx.creditLedger.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ userId: "a", delta: 3, reason: "MIGRATION_GIFT", adminId: "admin" }),
      expect.objectContaining({ userId: "b", delta: 1 }),
    ]);
  });

  it("changes nothing the second time", async () => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "7" })
    );
    db.systemSetting.findUnique.mockResolvedValue({ value: "2026-10-16T10:00:00.000Z" });
    expect(await runCreditMigration("admin")).toEqual({ ok: false, reason: "ALREADY_DONE", at: "2026-10-16T10:00:00.000Z" });
  });
});
