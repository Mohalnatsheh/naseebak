import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  accountDeletionRequest: { findMany: vi.fn(), delete: vi.fn() },
  photo: { findMany: vi.fn() },
  identityDoc: { findUnique: vi.fn() },
  profile: { findUnique: vi.fn() },
  report: { deleteMany: vi.fn() },
  block: { deleteMany: vi.fn() },
  notification: { deleteMany: vi.fn() },
  like: { deleteMany: vi.fn() },
  suggestion: { deleteMany: vi.fn() },
  user: { delete: vi.fn() },
  $transaction: vi.fn(),
}));
const bunny = vi.hoisted(() => ({ deleteFromBunny: vi.fn(), getBunnyPathFromUrl: vi.fn((u: string) => u) }));
const reports = vi.hoisted(() => ({ snapshotReportEvidence: vi.fn() }));
const leave = vi.hoisted(() => ({ closeActivityForLeaving: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/bunny", () => bunny);
vi.mock("@/lib/reports", () => reports);
vi.mock("@/lib/matches/leave", () => leave);

import { processAccountDeletions } from "@/lib/cron/deletions";
import { GET } from "@/app/api/cron/process-deletions/route";

beforeEach(() => {
  vi.clearAllMocks();
  db.accountDeletionRequest.findMany.mockResolvedValue([{ id: "d1", userId: "u1" }]);
  db.photo.findMany.mockResolvedValue([{ url: "photos/u1/a.jpg" }]);
  db.identityDoc.findUnique.mockResolvedValue(null);
  db.profile.findUnique.mockResolvedValue(null);
  db.$transaction.mockResolvedValue([]);
  bunny.deleteFromBunny.mockResolvedValue(undefined);
  reports.snapshotReportEvidence.mockResolvedValue(0);
  leave.closeActivityForLeaving.mockResolvedValue(undefined);
});

describe("processAccountDeletions", () => {
  it("deletes users whose grace period is over (files first)", async () => {
    expect(await processAccountDeletions()).toBe(1);
    expect(db.accountDeletionRequest.findMany.mock.calls[0][0].where.cancelledAt).toBeNull();
    expect(bunny.deleteFromBunny).toHaveBeenCalledWith("photos/u1/a.jpg");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
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
});

describe("GET /api/cron/process-deletions (old route)", () => {
  it("still uses the ?token= secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(new Request("http://x/api/cron/process-deletions?token=nope"))).status).toBe(401);
    const ok = await GET(new Request("http://x/api/cron/process-deletions?token=s3cret"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ count: 1 });
    delete process.env.CRON_SECRET;
  });
});
