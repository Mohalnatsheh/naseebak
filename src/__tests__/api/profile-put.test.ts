import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1", role: "USER" } } })),
}));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestForUser: vi.fn(async () => 0) }));
vi.mock("@/lib/referral", () => ({ maybeAwardReferral: vi.fn(async () => undefined) }));

import { PUT } from "@/app/api/profile/route";

// What the setup wizard sends (required fields + a couple of optional ones)
const payload = {
  dateOfBirth: "1995-01-01",
  city: "عمان",
  nationality: "أردني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  childrenCount: 0,
  religiosity: "ملتزم",
  hijab: false,
  beard: true,
  drivingLicense: false,
  prefAgeMin: 22,
  prefAgeMax: 30,
  prefCity: ["عمان", "إربد"],
};

const storedProfile = {
  userId: "u1",
  isComplete: true,
  dateOfBirth: new Date("1995-01-01T00:00:00.000Z"),
  city: "عمان",
  nationality: "أردني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  childrenCount: 0,
  religiosity: "ملتزم",
  hijab: false,
  beard: true,
  drivingLicense: false,
  prefAgeMin: 22,
  prefAgeMax: 30,
  prefCity: ["إربد", "عمان"],
  job: null,
  aboutMe: null,
  height: null,
  prefEducation: [],
};

const put = async (body: unknown): Promise<Response> =>
  (await PUT(new Request("http://x/api/profile", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })))!;

beforeEach(() => {
  vi.clearAllMocks();
  db.profile.upsert.mockResolvedValue({ id: "p1" });
});

describe("PUT /api/profile", () => {
  it("saves the first setup submit (no profile yet)", async () => {
    db.profile.findUnique.mockResolvedValue(null);
    const res = await put(payload);
    expect(res.status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledOnce();
  });

  it("saves while the setup is still a draft (isComplete false), even when values change", async () => {
    db.profile.findUnique.mockResolvedValue({ ...storedProfile, isComplete: false, city: "الزرقاء" });
    const res = await put(payload);
    expect(res.status).toBe(200);
  });

  it("allows re-sending the same values after completion (setup retry), ignoring list order", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    const res = await put(payload);
    expect(res.status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledOnce();
  });

  it("allows filling in optional fields that are still empty after completion", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    const res = await put({ ...payload, job: "مهندس", aboutMe: "مرحباً", height: 175, prefEducation: ["بكالوريوس"] });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ job: "مهندس", height: 175, isComplete: true });
  });

  it("rejects changing a stored reviewed field after completion with 409 and does not write", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    const res = await put({ ...payload, city: "الزرقاء", prefAgeMax: 35 });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("PROFILE_EDIT_NEEDS_REVIEW");
    expect(data.fields).toEqual(expect.arrayContaining(["city", "prefAgeMax"]));
    expect(data.editUrl).toBe("/dashboard/profile/edit");
    expect(data.error).toMatch(/تعديل الملف الشخصي/);
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });

  it("rejects clearing a stored optional value or flipping a stored boolean", async () => {
    db.profile.findUnique.mockResolvedValue({ ...storedProfile, job: "مهندس" });
    let res = await put({ ...payload, job: "" });
    expect(res.status).toBe(409);
    res = await put({ ...payload, beard: false });
    expect(res.status).toBe(409);
    expect((await res.json()).fields).toEqual(["beard"]);
  });

  it("rejects a different birth date but accepts the same day", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    expect((await put({ ...payload, dateOfBirth: "1996-05-05" })).status).toBe(409);
    expect((await put({ ...payload, dateOfBirth: "1995-01-01" })).status).toBe(200);
  });
});
