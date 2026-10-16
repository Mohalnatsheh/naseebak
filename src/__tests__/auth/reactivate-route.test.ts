import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  accountDeletionRequest: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const requireUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/auth", () => ({ requireUser }));

import { POST } from "@/app/api/profile/reactivate/route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.user.findUnique.mockResolvedValue({ isDeactivated: true });
  db.accountDeletionRequest.findUnique.mockResolvedValue(null);
});

describe("POST /api/profile/reactivate", () => {
  it("asks requireUser to let deactivated users through", async () => {
    await POST();
    expect(requireUser).toHaveBeenCalledWith({ allowDeactivated: true });
  });

  it("returns the guard error (e.g. suspended) untouched", async () => {
    requireUser.mockResolvedValue({ error: NextResponse.json({ error: "تم إيقاف حسابك" }, { status: 403 }) });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("reactivates a paused account and notifies", async () => {
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ reactivated: true, cancelledDeletion: false });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isDeactivated: false } });
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
    expect(notifyMod.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "SYSTEM", title: "تم إعادة تفعيل حسابك" }),
    );
  });

  it("cancels a pending deletion request", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({ userId: "u1", scheduledAt: new Date(), cancelledAt: null });
    const res = await POST();
    expect((await res.json()).cancelledDeletion).toBe(true);
    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { cancelledAt: expect.any(Date) },
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isDeactivated: false } });
  });

  it("ignores an already-cancelled deletion request", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({ userId: "u1", cancelledAt: new Date() });
    await POST();
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
  });

  it("is a no-op for an active account", async () => {
    db.user.findUnique.mockResolvedValue({ isDeactivated: false });
    const res = await POST();
    expect((await res.json()).reactivated).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("returns 404 when the user row is gone", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await POST()).status).toBe(404);
  });
});
