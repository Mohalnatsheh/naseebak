import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  accountDeletionRequest: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  photo: { findMany: vi.fn() },
  identityDoc: { findUnique: vi.fn() },
  profile: { findUnique: vi.fn() },
  report: { deleteMany: vi.fn() },
  block: { deleteMany: vi.fn() },
  notification: { deleteMany: vi.fn() },
  like: { deleteMany: vi.fn() },
  suggestion: { deleteMany: vi.fn() },
  user: { delete: vi.fn() },
  message: { findMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
const bunny = vi.hoisted(() => ({ deleteFromBunny: vi.fn(), getBunnyPathFromUrl: vi.fn((u: string) => u) }));
const reports = vi.hoisted(() => ({ snapshotReportEvidence: vi.fn() }));
const leave = vi.hoisted(() => ({ closeActivityForLeaving: vi.fn() }));
const pro = vi.hoisted(() => ({ cancelProForDeletion: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/bunny", () => bunny);
vi.mock("@/lib/reports", () => reports);
vi.mock("@/lib/matches/leave", () => leave);
vi.mock("@/lib/pro/manage", () => pro);

import { processAccountDeletions } from "@/lib/cron/deletions";

beforeEach(() => {
  vi.clearAllMocks();
  db.accountDeletionRequest.findMany.mockResolvedValue([{ id: "d1", userId: "u1" }]);
  db.accountDeletionRequest.findUnique.mockResolvedValue({
    cancelledAt: null,
    scheduledAt: new Date(Date.now() - 1000),
    user: { isDeactivated: true },
  });
  db.photo.findMany.mockResolvedValue([{ url: "photos/u1/a.jpg" }]);
  db.identityDoc.findUnique.mockResolvedValue(null);
  db.profile.findUnique.mockResolvedValue(null);
  db.$transaction.mockResolvedValue([]);
  bunny.deleteFromBunny.mockResolvedValue(undefined);
  reports.snapshotReportEvidence.mockResolvedValue(0);
  leave.closeActivityForLeaving.mockResolvedValue(undefined);
  pro.cancelProForDeletion.mockResolvedValue(0);
  db.message.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe("processAccountDeletions", () => {
  it("deletes users whose grace period is over (files first)", async () => {
    expect(await processAccountDeletions()).toBe(1);
    expect(db.accountDeletionRequest.findMany.mock.calls[0][0].where.cancelledAt).toBeNull();
    expect(bunny.deleteFromBunny).toHaveBeenCalledWith("photos/u1/a.jpg");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("only lists accounts that are still paused (G02)", async () => {
    await processAccountDeletions();
    expect(db.accountDeletionRequest.findMany.mock.calls[0][0].where.user).toEqual({ isDeactivated: true });
  });

  it("skips an account that was resumed or whose request was cancelled since the list was read", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValueOnce({
      cancelledAt: null, scheduledAt: new Date(Date.now() - 1000), user: { isDeactivated: false },
    });
    expect(await processAccountDeletions()).toBe(0);
    db.accountDeletionRequest.findUnique.mockResolvedValueOnce({
      cancelledAt: new Date(), scheduledAt: new Date(Date.now() - 1000), user: { isDeactivated: true },
    });
    expect(await processAccountDeletions()).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(bunny.deleteFromBunny).not.toHaveBeenCalled();
  });

  it("keeps reports: saves their evidence first and never deletes them", async () => {
    await processAccountDeletions();
    expect(reports.snapshotReportEvidence).toHaveBeenCalledWith("u1");
    expect(reports.snapshotReportEvidence.mock.invocationCallOrder[0]).toBeLessThan(db.$transaction.mock.invocationCallOrder[0]);
    expect(db.report.deleteMany).not.toHaveBeenCalled();
  });

  it("a failed evidence snapshot stops that deletion (retried next run)", async () => {
    reports.snapshotReportEvidence.mockRejectedValueOnce(new Error("db"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await processAccountDeletions()).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps going when one deletion fails", async () => {
    db.accountDeletionRequest.findMany.mockResolvedValue([{ id: "d1", userId: "u1" }, { id: "d2", userId: "u2" }]);
    db.$transaction.mockRejectedValueOnce(new Error("fk")).mockResolvedValue([]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await processAccountDeletions()).toBe(1);
    spy.mockRestore();
  });

  it("cancels the member's Pro subscriptions on Stripe before any file or row goes", async () => {
    await processAccountDeletions();
    expect(pro.cancelProForDeletion).toHaveBeenCalledWith("u1");
    const order = pro.cancelProForDeletion.mock.invocationCallOrder[0];
    expect(order).toBeLessThan(bunny.deleteFromBunny.mock.invocationCallOrder[0]);
    expect(order).toBeLessThan(db.$transaction.mock.invocationCallOrder[0]);
  });

  it("a failed Stripe cancel stops that deletion (retried next run)", async () => {
    pro.cancelProForDeletion.mockRejectedValueOnce(new Error("stripe down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await processAccountDeletions()).toBe(0);
    expect(bunny.deleteFromBunny).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe("chat photos and voice notes", () => {
    it("deletes the media of every message that goes with the account, after the rows are gone", async () => {
      db.message.findMany.mockResolvedValue([{ mediaPath: "chat/c1/a.webp" }, { mediaPath: "chat/c1/b.m4a" }]);
      await processAccountDeletions();
      // Every message in the member's chats goes (the match cascades), the partner's too
      const where = db.message.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        mediaPath: { not: null },
        OR: [
          { senderId: "u1" },
          { conversation: { match: { OR: [{ femaleId: "u1" }, { maleId: "u1" }] } } },
        ],
      });
      expect(bunny.deleteFromBunny).toHaveBeenCalledWith("chat/c1/a.webp");
      expect(bunny.deleteFromBunny).toHaveBeenCalledWith("chat/c1/b.m4a");
      const lastDelete = Math.max(...bunny.deleteFromBunny.mock.invocationCallOrder);
      expect(db.$transaction.mock.invocationCallOrder[0]).toBeLessThan(lastDelete);
      // The list is read after the evidence snapshot, so the snapshot's references count
      expect(reports.snapshotReportEvidence.mock.invocationCallOrder[0]).toBeLessThan(db.message.findMany.mock.invocationCallOrder[0]);
    });

    it("keeps files referenced in a report's evidence", async () => {
      db.message.findMany.mockResolvedValue([{ mediaPath: "chat/c1/kept.webp" }, { mediaPath: "chat/c1/gone.webp" }]);
      db.$queryRaw.mockResolvedValue([{ path: "chat/c1/kept.webp" }]);
      await processAccountDeletions();
      expect(bunny.deleteFromBunny).toHaveBeenCalledWith("chat/c1/gone.webp");
      expect(bunny.deleteFromBunny).not.toHaveBeenCalledWith("chat/c1/kept.webp");
    });

    it("a failed file delete is logged, not fatal; nothing is deleted when the account stays", async () => {
      db.message.findMany.mockResolvedValue([{ mediaPath: "chat/c1/a.webp" }]);
      bunny.deleteFromBunny.mockRejectedValue(new Error("bunny"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await processAccountDeletions()).toBe(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("chat/c1/a.webp");
      warn.mockRestore();

      vi.clearAllMocks();
      db.$transaction.mockRejectedValueOnce(new Error("fk"));
      db.message.findMany.mockResolvedValue([{ mediaPath: "chat/c1/a.webp" }]);
      db.$queryRaw.mockResolvedValue([]);
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await processAccountDeletions()).toBe(0);
      expect(bunny.deleteFromBunny).not.toHaveBeenCalledWith("chat/c1/a.webp");
      err.mockRestore();
    });
  });
});
