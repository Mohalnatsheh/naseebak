import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findUnique: vi.fn() },
  block: { findFirst: vi.fn() },
  profile: { update: vi.fn(), findUnique: vi.fn() },
  profileUpdateRequest: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/suggestions/refresh", () => ({ refreshOpenSuggestionsInBackground: vi.fn() }));
vi.mock("@/lib/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => undefined) }));

import { GET as visitStatus } from "@/app/api/matches/[id]/visit-status/route";
import { POST as updateRequest } from "@/app/api/profile/update-request/route";

const params = { params: Promise.resolve({ id: "m1" }) };
const post = (body: unknown) =>
  updateRequest(new Request("http://x/api/profile/update-request", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.block.findFirst.mockResolvedValue(null);
  db.profileUpdateRequest.findFirst.mockResolvedValue(null);
  db.profileUpdateRequest.create.mockResolvedValue({ id: "r1" });
  db.profile.findUnique.mockResolvedValue({ prefAgeMin: 22, prefAgeMax: 30 });
});

describe("GET /api/matches/[id]/visit-status (G68)", () => {
  it("selects only the visit's status fields (no admin notes)", async () => {
    db.mutualMatch.findUnique.mockResolvedValue({
      femaleId: "f1", maleId: "u1", visitRequest: { id: "v1", status: "SCHEDULED", scheduledDate: null, location: "عمّان" },
    });
    const res = await visitStatus(new Request("http://x"), params);
    expect(res.status).toBe(200);
    expect(db.mutualMatch.findUnique.mock.calls[0][0].select.visitRequest).toEqual({
      select: { id: true, status: true, scheduledDate: true, location: true },
    });
    expect((await res.json()).visitRequest).toEqual({ id: "v1", status: "SCHEDULED", scheduledDate: null, location: "عمّان" });
  });

  it("404s when the partner blocked me", async () => {
    db.mutualMatch.findUnique.mockResolvedValue({ femaleId: "f1", maleId: "u1", visitRequest: null });
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    expect((await visitStatus(new Request("http://x"), params)).status).toBe(404);
    expect(db.block.findFirst).toHaveBeenCalledWith({ where: { blockerId: "f1", blockedId: "u1" }, select: { id: true } });
  });
});

describe("POST /api/profile/update-request validation (G68)", () => {
  it.each([
    ["an array birth date", { dateOfBirth: ["2000-01-01"] }],
    ["a numeric birth date", { dateOfBirth: 946684800000 }],
    ["an under-18 birth date", { dateOfBirth: new Date().toISOString().slice(0, 10) }],
    ["an unknown key", { isVerified: true }],
    ["a value outside the wizard's options", { maritalStatus: "متزوج" }],
    ["a too-long short field", { job: "x".repeat(101) }],
    ["a too-long text", { aboutMe: "x".repeat(501) }],
    ["too many list items", { prefCity: Array.from({ length: 31 }, (_, i) => `مدينة ${i}`) }],
    ["a height out of range", { height: "999" }],
  ])("refuses %s, saving nothing", async (_label, changes) => {
    const res = await post({ changes });
    expect(res.status).toBe(400);
    expect(db.profile.update).not.toHaveBeenCalled();
    expect(db.profileUpdateRequest.create).not.toHaveBeenCalled();
  });

  it("refuses a message over 1000 characters", async () => {
    expect((await post({ changes: { job: "طبيب" }, message: "م".repeat(1001) })).status).toBe(400);
  });

  it("accepts what the edit page sends (numeric strings, cleared values, wizard options)", async () => {
    const res = await post({
      changes: { height: "175", childrenCount: 2, job: "طبيب", skinColor: "", hijab: null, maritalStatus: "مطلق/مطلقة", prefAgeMax: 35 },
      message: "تحديث",
    });
    expect(res.status).toBe(200);
    expect(db.profileUpdateRequest.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        changes: { height: "175", childrenCount: 2, job: "طبيب", skinColor: "", hijab: null, maritalStatus: "مطلق/مطلقة" },
        message: "تحديث",
      },
    });
  });
});
