import { describe, it, expect, vi, beforeEach } from "vitest";

const member = vi.hoisted(() => ({ country: "JO" }));
const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn(), upsert: vi.fn() },
  parentInfo: { findUnique: vi.fn() },
  // The member's country: «المذهب» is kept for Lebanon only
  user: { findUnique: vi.fn(async () => ({ country: member.country })) },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1", role: "USER" } } })),
}));
vi.mock("@/lib/suggestions/refresh", () => ({ refreshOpenSuggestionsInBackground: vi.fn() }));
vi.mock("@/lib/referral", () => ({ maybeAwardReferral: vi.fn(async () => undefined) }));
const flags = vi.hoisted(() => ({ introRequests: false }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => flags) }));

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
  member.country = "JO";
  flags.introRequests = false;
  db.parentInfo.findUnique.mockResolvedValue({ id: "g1" });
  db.profile.upsert.mockResolvedValue({ id: "p1" });
});

describe("PUT /api/profile", () => {
  it("new cycle: finishes the setup without a guardian (asked for at the family introduction)", async () => {
    flags.introRequests = true;
    db.profile.findUnique.mockResolvedValue(null);
    db.parentInfo.findUnique.mockResolvedValue(null);
    const res = await put(payload);
    expect(res.status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledOnce();
  });

  it("legacy: refuses to finish the setup before the guardian is saved", async () => {
    db.profile.findUnique.mockResolvedValue(null);
    db.parentInfo.findUnique.mockResolvedValue(null);
    const res = await put(payload);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("GUARDIAN_REQUIRED");
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });

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

  // The app (store builds since launch) keeps the profile it loaded at the start of the setup. Its
  // «تعديل ملفي» then fills "empty" fields with the required basics from that stale copy, so they
  // arrive missing (no partner ages, or nothing at all) and the save failed with Zod's English
  // "Invalid input: expected number, received undefined". Missing basics = unchanged.
  it("finished profile: a fill that leaves out the required basics keeps the stored ones", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    const stale = { dateOfBirth: "1995-01-01", city: "عمان", nationality: "أردني", education: "بكالوريوس",
      maritalStatus: "أعزب/عزباء", religiosity: "ملتزم", childrenCount: 0, height: 175 };
    const res = await put(stale);
    expect(res.status).toBe(200);
    const update = db.profile.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ height: 175, prefAgeMin: 22, prefAgeMax: 30, isComplete: true });
  });

  it("finished profile: a fill with no basics at all (cached before any draft) still saves", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    const res = await put({ childrenCount: 0, job: "مهندس" });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ job: "مهندس", city: "عمان", prefAgeMin: 22 });
  });

  it("finished profile: a stale fill that changes a stored value is still a reviewed edit (409)", async () => {
    db.profile.findUnique.mockResolvedValue(storedProfile);
    const res = await put({ childrenCount: 0, city: "الزرقاء" });
    expect(res.status).toBe(409);
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });

  it("setup not finished: a missing required field is refused in Arabic, never Zod's English", async () => {
    flags.introRequests = true;
    db.profile.findUnique.mockResolvedValue(null);
    for (const body of [{ ...payload, prefAgeMin: undefined }, { ...payload, height: null }, { childrenCount: 0 }]) {
      const res = await put(body);
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error).not.toMatch(/[A-Za-z]/);
    }
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });
});

describe("PUT /api/profile — niqab", () => {
  const woman = { ...storedProfile, hijab: true, niqab: null };
  const body = { ...payload, hijab: true };

  it("fills an empty niqab directly on a finished profile and keeps hijab true", async () => {
    db.profile.findUnique.mockResolvedValue(woman);
    const res = await put({ ...body, niqab: true });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ hijab: true, niqab: true });
  });

  it("niqab alone stores hijab true (first setup)", async () => {
    db.profile.findUnique.mockResolvedValue(null);
    const res = await put({ ...payload, hijab: undefined, niqab: true });
    expect(res.status).toBe(200);
    const call = db.profile.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ hijab: true, niqab: true });
    expect(call.update).toMatchObject({ hijab: true, niqab: true });
  });

  it("a body without niqab (app 1.0.0) leaves the stored niqab untouched", async () => {
    db.profile.findUnique.mockResolvedValue({ ...woman, niqab: true });
    const res = await put(body);
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update.niqab).toBeUndefined();
  });

  it("hijab false clears niqab (draft profile)", async () => {
    db.profile.findUnique.mockResolvedValue({ ...woman, niqab: true, isComplete: false });
    const res = await put({ ...payload, hijab: false });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ hijab: false, niqab: false });
  });

  it("changing a stored niqab after completion needs review", async () => {
    db.profile.findUnique.mockResolvedValue({ ...woman, niqab: true });
    const res = await put({ ...body, niqab: false });
    expect(res.status).toBe(409);
    expect((await res.json()).fields).toEqual(["niqab"]);
  });
});

describe("PUT /api/profile: «المذهب» (Lebanon only)", () => {
  const withSect = { ...payload, sect: "سني", prefSect: ["سني"], dealbreakers: ["age", "sect"] };

  it("a Lebanese member's sect, preference and «شرط أساسي» are saved", async () => {
    member.country = "LB";
    db.profile.findUnique.mockResolvedValue(null);
    expect((await put(withSect)).status).toBe(200);
    const { create, update } = db.profile.upsert.mock.calls[0][0];
    expect(create).toMatchObject({ sect: "سني", prefSect: ["سني"], dealbreakers: ["age", "sect"] });
    expect(update).toMatchObject({ sect: "سني", prefSect: ["سني"], dealbreakers: ["age", "sect"] });
  });

  it("a Jordanian member's sect, preference and «شرط أساسي» are dropped", async () => {
    db.profile.findUnique.mockResolvedValue(null);
    expect((await put(withSect)).status).toBe(200);
    const { create, update } = db.profile.upsert.mock.calls[0][0];
    expect(create.sect).toBeUndefined();
    expect(create.prefSect).toEqual([]);
    expect(create.dealbreakers).toEqual(["age"]);
    expect(update.sect).toBeUndefined();
    expect(update.prefSect).toBeUndefined();
    expect(update.dealbreakers).toEqual(["age"]);
  });

  it("refuses a sect outside the three values", async () => {
    member.country = "LB";
    db.profile.findUnique.mockResolvedValue(null);
    expect((await put({ ...payload, sect: "درزي" })).status).toBe(400);
    expect((await put({ ...payload, prefSect: ["أفضّل عدم الذكر"] })).status).toBe(400);
  });
});
