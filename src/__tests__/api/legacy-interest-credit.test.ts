import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    suggestion: { findUnique: vi.fn(), updateMany: vi.fn() },
    like: { create: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    creditLedger: { create: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation((fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const flags = vi.hoisted(() => ({ value: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true } }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => flags.value) }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn(async () => ({ matchId: "m1" })) }));

import { POST as like } from "@/app/api/suggestions/[id]/like/route";
import { POST as accept } from "@/app/api/interests/[id]/accept/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://localhost/x", { method: "POST" });
let balance: number;

beforeEach(() => {
  vi.clearAllMocks();
  flags.value = { ...flags.value, creditOnInterest: true };
  balance = 3;
  db.suggestion.findUnique.mockResolvedValue({
    id: "s1", flow: "LEGACY", recipientId: "u1", candidateId: "f1", status: "PENDING",
  });
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  db.like.create.mockResolvedValue({});
  db.like.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) =>
    where.id ? { id: "l1", fromUserId: "f1", toUserId: "u1", suggestionId: "s1", fromUser: { id: "f1", firstName: "هديل" } } : null
  );
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    gender: where.id.startsWith("f") ? "FEMALE" : "MALE",
    matchCredits: balance,
  }));
  db.user.updateMany.mockImplementation(async () => {
    if (balance < 1) return { count: 0 };
    balance -= 1;
    return { count: 1 };
  });
  db.creditLedger.create.mockResolvedValue({});
});

describe("legacy like / accept with credit on interest", () => {
  it("like charges 1 when flag on", async () => {
    const res = await like(req(), params("s1"));
    expect(res.status).toBe(200);
    expect(balance).toBe(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: { userId: "u1", delta: -1, reason: "INTEREST", refId: "s1" },
    });
    expect(db.like.create).toHaveBeenCalledTimes(1);
  });

  it("like at 0 credits is refused with NO_CREDITS and records nothing", async () => {
    balance = 0;
    const res = await like(req(), params("s1"));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("NO_CREDITS");
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(db.like.create).not.toHaveBeenCalled();
  });

  it("like charges nothing when the claim is lost", async () => {
    db.suggestion.updateMany.mockResolvedValue({ count: 0 });
    const res = await like(req(), params("s1"));
    expect(res.status).toBe(404);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  it("like sends the exhausted notice when the balance reaches 0", async () => {
    balance = 1;
    await like(req(), params("s1"));
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT" }));
  });

  it("accept charges 1 when flag on", async () => {
    const res = await accept(req(), params("l1"));
    expect(res.status).toBe(200);
    expect(balance).toBe(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: { userId: "u1", delta: -1, reason: "INTEREST", refId: "s1" },
    });
  });

  it("accept at 0 credits is refused with NO_CREDITS", async () => {
    balance = 0;
    const res = await accept(req(), params("l1"));
    expect(res.status).toBe(402);
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  it("both free when flag off", async () => {
    flags.value = { ...flags.value, creditOnInterest: false };
    expect((await like(req(), params("s1"))).status).toBe(200);
    expect((await accept(req(), params("l1"))).status).toBe(200);
    expect(balance).toBe(3);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(db.like.create).toHaveBeenCalledTimes(2);
  });
});
