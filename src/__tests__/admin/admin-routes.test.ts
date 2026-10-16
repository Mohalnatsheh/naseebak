import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  payment: { updateMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  creditLedger: { create: vi.fn() },
  accountDeletionRequest: { updateMany: vi.fn() },
  profileUpdateRequest: { updateMany: vi.fn(), findUnique: vi.fn() },
  profile: { update: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  payment: { findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  visitRequest: { findUnique: vi.fn(), update: vi.fn() },
  supportTicket: { update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  accountDeletionRequest: { findUnique: vi.fn() },
  profileUpdateRequest: { findUnique: vi.fn() },
}));
const notifyMock = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const refundsCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMock);
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ refunds: { create: refundsCreate } }) }));

import { POST as refund } from "@/app/api/admin/payments/[id]/refund/route";
import { PATCH as patchVisit } from "@/app/api/admin/visits/route";
import { GET as getTickets, PATCH as patchTicket } from "@/app/api/admin/support/route";
import { POST as sendNotification } from "@/app/api/admin/notifications/route";
import { DELETE as cancelDeletion } from "@/app/api/admin/deletions/[id]/route";
import { PATCH as reviewProfileRequest } from "@/app/api/admin/profile-requests/route";

function jsonReq(body: unknown, url = "http://x/api") {
  return new Request(url, { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("refund", () => {
  const params = { params: Promise.resolve({ id: "p1" }) };
  beforeEach(() => {
    db.payment.findUnique.mockResolvedValue({
      id: "p1", status: "COMPLETED", providerTxId: "pi_1", provider: "STRIPE", userId: "u1", amount: 4, planName: "credits_5",
    });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue({ matchCredits: 2 });
  });

  it("refunds with an idempotency key, floors credits at 0 in one transaction, then notifies", async () => {
    const res = await refund(new Request("http://x", { method: "POST" }), params);
    expect(res?.status).toBe(200);
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund-p1" });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: 0 } });
    expect(tx.creditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", delta: -2, reason: "REFUND", refId: "p1", adminId: "admin1" }),
    });
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT" }));
  });

  it("does not deduct or notify when the payment was refunded concurrently", async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    const res = await refund(new Request("http://x", { method: "POST" }), params);
    expect(res?.status).toBe(409);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });
});

describe("visits PATCH", () => {
  beforeEach(() => {
    db.visitRequest.update.mockResolvedValue({ id: "v1", match: { femaleId: "f", maleId: "m" } });
  });

  it("rejects an unknown status with 400", async () => {
    const res = await patchVisit(jsonReq({ visitId: "v1", status: "BOGUS" }));
    expect(res?.status).toBe(400);
    expect(db.visitRequest.update).not.toHaveBeenCalled();
  });

  it("notifies only when the status changes and clears empty fields", async () => {
    db.visitRequest.findUnique.mockResolvedValue({ status: "SCHEDULED" });
    await patchVisit(jsonReq({ visitId: "v1", status: "SCHEDULED", location: "", adminNotes: "", scheduledDate: null }));
    expect(db.visitRequest.update.mock.calls[0][0].data).toMatchObject({ location: null, adminNotes: null, scheduledDate: null });
    expect(notifyMock.notifyMany).not.toHaveBeenCalled();

    db.visitRequest.findUnique.mockResolvedValue({ status: "REQUESTED" });
    await patchVisit(jsonReq({ visitId: "v1", status: "SCHEDULED", scheduledDate: "2026-11-01T15:00:00.000Z" }));
    expect(db.visitRequest.update.mock.calls[1][0].data.scheduledDate.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(db.visitRequest.update.mock.calls[1][0].data.location).toBeUndefined();
    expect(notifyMock.notifyMany).toHaveBeenCalledWith(["f", "m"], expect.objectContaining({ type: "VISIT_UPDATE" }));
  });
});

describe("support", () => {
  beforeEach(() => {
    db.supportTicket.update.mockResolvedValue({ id: "t1", userId: "u1", subject: "s" });
  });

  it("keeps the admin note when none is sent and notifies with a relative URL", async () => {
    await patchTicket(jsonReq({ ticketId: "t1", status: "IN_PROGRESS" }));
    expect(db.supportTicket.update.mock.calls[0][0].data).toEqual({ status: "IN_PROGRESS" });
    expect(notifyMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SUPPORT", url: "/dashboard/support" })
    );
  });

  it("ignores bad list filters and pages", async () => {
    db.supportTicket.findMany.mockResolvedValue([]);
    db.supportTicket.count.mockResolvedValue(0);
    const res = await getTickets(new Request("http://x/api/admin/support?page=abc&status=NOPE&type=X"));
    expect(res?.status).toBe(200);
    expect(db.supportTicket.findMany.mock.calls[0][0]).toMatchObject({ where: {}, skip: 0 });
  });
});

describe("notifications broadcast", () => {
  it("only targets active users and routes through notifyMany", async () => {
    db.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const res = await sendNotification(jsonReq({ title: "t", body: "b", url: "https://evil.example" }));
    expect(res?.status).toBe(200);
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      role: "USER", isDeactivated: false, status: { not: "SUSPENDED" },
    });
    expect(notifyMock.notifyMany).toHaveBeenCalledWith(["a", "b"], expect.objectContaining({ type: "SYSTEM", url: "/dashboard" }));
  });
});

describe("deletion cancel", () => {
  it("reactivates in a transaction and notifies the user", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({ id: "d1", userId: "u1", cancelledAt: null });
    tx.accountDeletionRequest.updateMany.mockResolvedValue({ count: 1 });
    const res = await cancelDeletion(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "d1" }) });
    expect(res?.status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isDeactivated: false } });
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "SYSTEM" }));
  });
});

describe("profile request review", () => {
  beforeEach(() => {
    db.profileUpdateRequest.findUnique.mockResolvedValue({
      id: "r1", userId: "u1", status: "PENDING", changes: { willingToRelocate: "نعم", childrenCount: "" },
    });
    tx.profileUpdateRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.profileUpdateRequest.findUnique.mockResolvedValue({ id: "r1", status: "APPROVED" });
  });

  it("applies the changes and notifies with the admin note", async () => {
    const res = await reviewProfileRequest(jsonReq({ requestId: "r1", action: "APPROVED", adminNote: "تم" }));
    expect(res?.status).toBe(200);
    expect(tx.profile.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { willingToRelocate: "نعم", childrenCount: 0 },
    });
    expect(notifyMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "SYSTEM", title: "تمت الموافقة على تعديل ملفك", body: expect.stringContaining("تم") })
    );
  });

  it("does not touch the profile on reject", async () => {
    await reviewProfileRequest(jsonReq({ requestId: "r1", action: "REJECTED" }));
    expect(tx.profile.update).not.toHaveBeenCalled();
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "تم رفض تعديل ملفك" }));
  });
});
