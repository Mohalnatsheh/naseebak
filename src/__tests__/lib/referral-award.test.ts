import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  referral: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const credits = vi.hoisted(() => ({ recordCredit: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => settings);

import { MAX_REWARDED_REFERRALS, maybeAwardReferral } from "@/lib/referral";

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.referral.findUnique.mockResolvedValue({ id: "r1", referrerId: "ref", creditsAwarded: false });
  db.referral.updateMany.mockResolvedValue({ count: 1 });
  db.referral.count.mockResolvedValue(0);
  settings.getCycleFlags.mockResolvedValue({ introRequests: true });
  // Finished short setup, no guardian
  db.user.findUnique.mockResolvedValue({ profile: { isComplete: true }, photos: [], parentInfo: null, identityDoc: null, personalityResult: null });
});

describe("maybeAwardReferral (new cycle)", () => {
  it("pays when the referred member finishes setup, without a guardian", async () => {
    await maybeAwardReferral("u1");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 1 } } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "ref" }, data: { matchCredits: { increment: 2 } } });
    expect(credits.recordCredit).toHaveBeenCalledTimes(2);
    expect(notifyMod.notify).toHaveBeenCalledTimes(2);
  });

  it("does not pay before setup is finished", async () => {
    db.user.findUnique.mockResolvedValue({ profile: { isComplete: false }, photos: [], parentInfo: { id: "p" } });
    await maybeAwardReferral("u1");
    expect(db.referral.updateMany).not.toHaveBeenCalled();
  });

  it("past the cap the friend still gets +1, the referrer nothing more", async () => {
    db.referral.count.mockResolvedValue(MAX_REWARDED_REFERRALS);
    await maybeAwardReferral("u1");
    expect(db.user.update).toHaveBeenCalledTimes(1);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 1 } } });
    expect(credits.recordCredit).toHaveBeenCalledTimes(1);
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
  });

  it("pays once", async () => {
    db.referral.updateMany.mockResolvedValue({ count: 0 });
    await maybeAwardReferral("u1");
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
