import { describe, it, expect, vi, beforeEach } from "vitest";

const member = vi.hoisted(() => ({ country: "JO" }));
const db = vi.hoisted(() => ({
  profile: { update: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  profileUpdateRequest: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  // The member's country: «المذهب» is kept for Lebanon only
  user: { findUnique: vi.fn(async () => ({ country: member.country })) },
}));
const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser }));
const refresh = vi.hoisted(() => ({ refreshOpenSuggestionsInBackground: vi.fn() }));
vi.mock("@/lib/suggestions/refresh", () => refresh);
const sendAdminAlert = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/admin-alert", () => ({ sendAdminAlert }));

import { POST } from "@/app/api/profile/update-request/route";
import { POST as withdraw } from "@/app/api/profile/update-request/withdraw/route";

const req = (changes: Record<string, unknown>) =>
  new Request("http://x/api/profile/update-request", { method: "POST", body: JSON.stringify({ changes }) });

beforeEach(() => {
  vi.clearAllMocks();
  member.country = "JO";
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
    expect(db.profile.upsert).not.toHaveBeenCalled();
    expect(db.profileUpdateRequest.create).not.toHaveBeenCalled();
  });

  it("preferences alone still save while a review is pending", async () => {
    db.profileUpdateRequest.findFirst.mockResolvedValue({ id: "old" });
    const res = await POST(req({ prefAgeMax: 35 }));
    expect(res.status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", prefAgeMax: 35 },
      update: { prefAgeMax: 35 },
    });
  });

  it("G63: saved preferences rescore the open cards (refresh: minimum score + dealbreakers, then top-up)", async () => {
    const res = await POST(req({ prefAgeMax: 35 }));
    expect(res.status).toBe(200);
    expect(refresh.refreshOpenSuggestionsInBackground).toHaveBeenCalledWith("u1");
  });

  it("a request without preference changes doesn't refresh", async () => {
    await POST(req({ job: "طبيب" }));
    expect(refresh.refreshOpenSuggestionsInBackground).not.toHaveBeenCalled();
  });

  it("checks min ≤ max against the stored other end", async () => {
    const res = await POST(req({ prefAgeMin: 40 }));
    expect(res.status).toBe(400);
    expect(db.profile.upsert).not.toHaveBeenCalled();
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

  it("a value of the wrong kind is refused in Arabic, never Zod's English \"Invalid input\"", async () => {
    for (const changes of [{ childrenCount: 1.5 }, { height: true }, { hijab: "نعم" }]) {
      const res = await POST(req(changes));
      expect(res.status).toBe(400);
      expect((await res.json()).error).not.toMatch(/[A-Za-z]/);
    }
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

describe("a member with no profile row yet (signed up, no setup step saved)", () => {
  it("saves preferences by creating the profile row instead of failing with a server error", async () => {
    db.profileUpdateRequest.findFirst.mockResolvedValue(null);
    db.profile.upsert.mockResolvedValue({});
    const res = await POST(req({ prefAgeMin: 25, prefAgeMax: 35 }));
    expect(res.status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", prefAgeMin: 25, prefAgeMax: 35 },
      update: { prefAgeMin: 25, prefAgeMax: 35 },
    });
    expect(db.profile.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/profile/update-request — niqab", () => {
  it("accepts niqab and adds hijab true to the reviewed changes", async () => {
    const res = await POST(req({ niqab: true }));
    expect(res.status).toBe(200);
    expect(db.profileUpdateRequest.create.mock.calls[0][0].data.changes).toEqual({ niqab: true, hijab: true });
  });

  it("hijab false (app 1.0.0) also asks to clear niqab", async () => {
    const res = await POST(req({ hijab: false }));
    expect(res.status).toBe(200);
    expect(db.profileUpdateRequest.create.mock.calls[0][0].data.changes).toEqual({ hijab: false, niqab: false });
  });

  it("saves the «منتقبة» partner preference directly", async () => {
    const res = await POST(req({ prefHijab: "منتقبة" }));
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toEqual({ prefHijab: "منتقبة" });
  });
});

describe("POST /api/profile/update-request: «المذهب» (Lebanon only)", () => {
  it("Lebanon: sect is reviewed, the sect preference saves directly", async () => {
    member.country = "LB";
    const res = await POST(req({ sect: "شيعي", prefSect: ["شيعي"] }));
    expect(res.status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", prefSect: ["شيعي"] },
      update: { prefSect: ["شيعي"] },
    });
    expect(db.profileUpdateRequest.create.mock.calls[0][0].data.changes).toEqual({ sect: "شيعي" });
  });

  it("Jordan: sect and its preference are dropped (nothing left = nothing to request)", async () => {
    const res = await POST(req({ sect: "شيعي", prefSect: ["شيعي"] }));
    expect(res.status).toBe(400);
    expect(db.profile.upsert).not.toHaveBeenCalled();
    expect(db.profileUpdateRequest.create).not.toHaveBeenCalled();
  });

  it("Jordan: the rest of the request still goes through", async () => {
    const res = await POST(req({ job: "طبيب", sect: "سني" }));
    expect(res.status).toBe(200);
    expect(db.profileUpdateRequest.create.mock.calls[0][0].data.changes).toEqual({ job: "طبيب" });
  });
});
