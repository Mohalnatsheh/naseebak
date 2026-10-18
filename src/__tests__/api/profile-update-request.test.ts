import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  profile: { update: vi.fn(), findUnique: vi.fn() },
  profileUpdateRequest: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));
const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/suggestions/dealbreaker-sweep", () => ({ closeSuggestionsBreakingDealbreakers: vi.fn(async () => undefined) }));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestForUser: vi.fn(async () => undefined) }));
const sendAdminAlert = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/admin-alert", () => ({ sendAdminAlert }));

import { POST } from "@/app/api/profile/update-request/route";
import { POST as withdraw } from "@/app/api/profile/update-request/withdraw/route";

const req = (changes: Record<string, unknown>) =>
  new Request("http://x/api/profile/update-request", { method: "POST", body: JSON.stringify({ changes }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  db.profileUpdateRequest.findFirst.mockResolvedValue(null);
  db.profileUpdateRequest.create.mockResolvedValue({ id: "r1" });
  db.profile.findUnique.mockResolvedValue({ prefAgeMin: 22, prefAgeMax: 30 });
});

describe("POST /api/profile/update-request", () => {
  it("with a review pending, refuses BEFORE saving any preference (G29)", async () => {
    db.profileUpdateRequest.findFirst.mockResolvedValue({ id: "old" });
    const res = await POST(req({ prefAgeMax: 35, job: "طبيب" }));
    expect(res.status).toBe(409);
    expect(db.profile.update).not.toHaveBeenCalled();
    expect(db.profileUpdateRequest.create).not.toHaveBeenCalled();
  });

  it("preferences alone still save while a review is pending", async () => {
    db.profileUpdateRequest.findFirst.mockResolvedValue({ id: "old" });
    const res = await POST(req({ prefAgeMax: 35 }));
    expect(res.status).toBe(200);
    expect(db.profile.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { prefAgeMax: 35 } });
  });

  it("checks min ≤ max against the stored other end", async () => {
    const res = await POST(req({ prefAgeMin: 40 }));
    expect(res.status).toBe(400);
    expect(db.profile.update).not.toHaveBeenCalled();
  });

  it("a new review request emails the admins (G27)", async () => {
    const res = await POST(req({ job: "طبيب", prefAgeMax: 35 }));
    expect(res.status).toBe(200);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
    const [subject, text] = sendAdminAlert.mock.calls[0] as unknown as [string, string];
    expect(subject).toContain("طلب تعديل");
    expect(text).toContain("job");
    expect(text).not.toContain("prefAgeMax");
  });

  it("preferences alone (no review request) send no admin email", async () => {
    await POST(req({ prefAgeMax: 35 }));
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });

  it("uses the same partner age maximum as the wizards (70)", async () => {
    expect((await POST(req({ prefAgeMax: 75 }))).status).toBe(400);
  });
});

describe("POST /api/profile/update-request/withdraw («سحب الطلب»)", () => {
  it("withdraws the pending request", async () => {
    db.profileUpdateRequest.updateMany.mockResolvedValue({ count: 1 });
    const res = await withdraw();
    expect(res.status).toBe(200);
    expect(db.profileUpdateRequest.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "PENDING" },
      data: { status: "WITHDRAWN" },
    });
  });

  it("404 when nothing is pending", async () => {
    db.profileUpdateRequest.updateMany.mockResolvedValue({ count: 0 });
    expect((await withdraw()).status).toBe(404);
  });
});
