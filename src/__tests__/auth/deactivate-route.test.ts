import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  accountDeletionRequest: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const requireUser = vi.hoisted(() => vi.fn());
const leave = vi.hoisted(() => ({ closeActivityForLeaving: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/matches/leave", () => leave);

import { POST } from "@/app/api/profile/deactivate/route";

const req = (body?: unknown) =>
  new Request("http://x/api/profile/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.user.findUnique.mockResolvedValue({ isDeactivated: false });
  db.accountDeletionRequest.findUnique.mockResolvedValue(null);
  leave.closeActivityForLeaving.mockResolvedValue(undefined);
});

describe("POST /api/profile/deactivate (explicit pause / resume, G02)", () => {
  it("pauses an active account and ends its activity", async () => {
    const res = await POST(req({ action: "pause" }));
    expect((await res.json()).isDeactivated).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isDeactivated: true } });
    expect(leave.closeActivityForLeaving).toHaveBeenCalledWith("u1", "paused");
  });

  it("no body means pause (older clients only paused)", async () => {
    await POST(req());
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isDeactivated: true } });
  });

  it("a second pause (stale tab) never wakes a paused account", async () => {
    db.user.findUnique.mockResolvedValue({ isDeactivated: true });
    const res = await POST(req({ action: "pause" }));
    expect((await res.json()).isDeactivated).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("resume reactivates and cancels a pending deletion", async () => {
    db.user.findUnique.mockResolvedValue({ isDeactivated: true });
    db.accountDeletionRequest.findUnique.mockResolvedValue({ userId: "u1", cancelledAt: null });
    const res = await POST(req({ action: "resume" }));
    expect(await res.json()).toMatchObject({ isDeactivated: false, cancelledDeletion: true });
    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { cancelledAt: expect.any(Date) } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isDeactivated: false } });
  });

  it("resume on an active account is a no-op", async () => {
    const res = await POST(req({ action: "resume" }));
    expect((await res.json()).isDeactivated).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown action", async () => {
    expect((await POST(req({ action: "toggle" }))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
