import { describe, it, expect, vi, beforeEach } from "vitest";

const member = vi.hoisted(() => ({ country: "JO" }));
const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn(), upsert: vi.fn() },
  // The member's country: «المذهب» is kept for Lebanon only
  user: { findUnique: vi.fn(async () => ({ country: member.country })) },
}));
vi.mock("@/lib/db", () => ({ db }));
const flags = vi.hoisted(() => ({ religion: false }));
vi.mock("@/lib/settings", () => ({ getReligionEnabled: vi.fn(async () => flags.religion) }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1", role: "USER" } } })),
}));

import { PATCH } from "@/app/api/profile/draft/route";
import { reviewedChanges } from "@/lib/profile-review";

const stored = {
  userId: "u1",
  isComplete: true,
  setupStep: 5,
  dateOfBirth: new Date("1995-01-01T00:00:00.000Z"),
  city: "عمان",
  religiosity: "ملتزم",
  hijab: false,
  prefCity: ["عمان", "إربد"],
  job: null,
  aboutMe: null,
};

const patch = async (body: unknown): Promise<Response> =>
  (await PATCH(new Request("http://x/api/profile/draft", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })))!;

beforeEach(() => {
  vi.clearAllMocks();
  member.country = "JO";
  flags.religion = false;
  db.profile.upsert.mockResolvedValue({ id: "p1" });
});

describe("PATCH /api/profile/draft", () => {
  it("saves freely while the setup is not finished (incl. the wizard step)", async () => {
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false });
    const res = await patch({ setupStep: 3, city: "الزرقاء" });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ setupStep: 3, city: "الزرقاء" });
  });

  it("saves for a brand-new user (no profile row)", async () => {
    db.profile.findUnique.mockResolvedValue(null);
    expect((await patch({ setupStep: 2, city: "عمان" })).status).toBe(200);
    expect(db.profile.upsert).toHaveBeenCalledOnce();
  });

  it("after completion: rejects changing a stored value with 409 and writes nothing", async () => {
    db.profile.findUnique.mockResolvedValue(stored);
    const res = await patch({ setupStep: 2, city: "الزرقاء" });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data).toMatchObject({ code: "PROFILE_EDIT_NEEDS_REVIEW", fields: ["city"], editUrl: "/dashboard/profile/edit" });
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });

  it("after completion: rejects clearing a stored value", async () => {
    db.profile.findUnique.mockResolvedValue(stored);
    const res = await patch({ religiosity: "" });
    expect(res.status).toBe(409);
    expect((await res.json()).fields).toEqual(["religiosity"]);
  });

  it("after completion: same values and empty fields pass; the wizard step is not written", async () => {
    db.profile.findUnique.mockResolvedValue(stored);
    const res = await patch({ setupStep: 4, city: "عمان", prefCity: ["إربد", "عمان"], dateOfBirth: "1995-01-01", job: "مهندس" });
    expect(res.status).toBe(200);
    const update = db.profile.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ city: "عمان", job: "مهندس" });
    expect(update).not.toHaveProperty("setupStep");
  });

  it("after completion: a step-only autosave is a no-op", async () => {
    db.profile.findUnique.mockResolvedValue(stored);
    expect((await patch({ setupStep: 5 })).status).toBe(200);
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });
});

describe("reviewedChanges", () => {
  it("lists only stored values that would change", () => {
    expect(
      reviewedChanges(
        { city: "عمان", job: null, prefCity: [], hijab: false, height: 170, aboutMe: "" },
        { city: "عمان", job: "مهندس", prefCity: ["عمان"], hijab: true, height: undefined, aboutMe: "مرحباً" }
      )
    ).toEqual(["hijab"]);
  });
});

describe("PATCH /api/profile/draft — niqab", () => {
  it("saves niqab with hijab true, and hijab false clears it", async () => {
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false });
    let res = await patch({ niqab: true });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ hijab: true, niqab: true });
    res = await patch({ hijab: false });
    expect(res.status).toBe(200);
    expect(db.profile.upsert.mock.calls[1][0].update).toMatchObject({ hijab: false, niqab: false });
  });

  it("hijab alone never touches niqab", async () => {
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false });
    await patch({ hijab: true });
    expect("niqab" in db.profile.upsert.mock.calls[0][0].update).toBe(false);
  });
});

describe("PATCH /api/profile/draft: «المذهب» (Lebanon only)", () => {
  it("saves a Lebanese member's sect and preference", async () => {
    member.country = "LB";
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false });
    expect((await patch({ sect: "أفضّل عدم الذكر", prefSect: ["شيعي"] })).status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toMatchObject({ sect: "أفضّل عدم الذكر", prefSect: ["شيعي"] });
  });

  it("drops them for a Saudi member", async () => {
    member.country = "SA";
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false });
    expect((await patch({ city: "الرياض", sect: "سني", prefSect: ["سني"] })).status).toBe(200);
    const update = db.profile.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ city: "الرياض" });
    expect(update).not.toHaveProperty("sect");
    expect(update).not.toHaveProperty("prefSect");
  });
});

describe("PATCH /api/profile/draft: «الديانة»", () => {
  it("strips and clears for a Christian during setup", async () => {
    flags.religion = true;
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false, hijab: true, dealbreakers: ["age", "hijab"] });
    const res = await patch({ religion: "مسيحي", beard: true, prefHijab: "نعم", prefReligion: "لا مانع" });
    expect(res.status).toBe(200);
    const { create, update } = db.profile.upsert.mock.calls[0][0];
    // Only what is stored gets cleared: hijab and the hijab condition
    const cleared = { religion: "مسيحي", prefReligion: "لا مانع", hijab: null, dealbreakers: ["age"] };
    expect(update).toEqual(cleared);
    expect(create).toMatchObject(cleared);
  });

  it("clears every stored Muslim-only answer, and nothing that is already empty", async () => {
    flags.religion = true;
    db.profile.findUnique.mockResolvedValue({
      ...stored, isComplete: false, hijab: false, niqab: false, beard: null, sect: "سني", prefSect: ["سني"],
      prefHijab: "لا", prefBeard: null, dealbreakers: ["sect", "age"],
    });
    expect((await patch({ religion: "مسيحي" })).status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toEqual({
      religion: "مسيحي", hijab: null, niqab: null, sect: null, prefSect: [], prefHijab: null, dealbreakers: ["age"],
    });
  });

  it("a Christian's autosave with nothing left to clear never writes dealbreakers (no race with the final save)", async () => {
    flags.religion = true;
    db.profile.findUnique.mockResolvedValue({
      ...stored, isComplete: false, religion: "مسيحي", hijab: null, niqab: null, beard: null, sect: null, prefSect: [],
      prefHijab: null, prefBeard: null, dealbreakers: ["age", "city"],
    });
    expect((await patch({ job: "مهندس" })).status).toBe(200);
    expect(db.profile.upsert.mock.calls[0][0].update).toEqual({ job: "مهندس" });
  });

  it("drops religion while the switch is off", async () => {
    db.profile.findUnique.mockResolvedValue({ ...stored, isComplete: false });
    expect((await patch({ city: "عمان", religion: "مسيحي", prefReligion: "لا مانع", beard: true })).status).toBe(200);
    const update = db.profile.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ city: "عمان", beard: true });
    expect("religion" in update).toBe(false);
    expect("prefReligion" in update).toBe(false);
  });

  it("an old app's hijab for a stored Christian is dropped, even with the switch off", async () => {
    db.profile.findUnique.mockResolvedValue({ ...stored, religion: "مسيحي", hijab: null });
    expect((await patch({ hijab: true, job: "مهندس" })).status).toBe(200);
    const update = db.profile.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ job: "مهندس" });
    expect("hijab" in update).toBe(false);
  });

  it("after completion a null religion switching to مسيحي needs review", async () => {
    flags.religion = true;
    db.profile.findUnique.mockResolvedValue({ ...stored, religion: null });
    const res = await patch({ religion: "مسيحي" });
    expect(res.status).toBe(409);
    expect((await res.json()).fields).toEqual(["religion"]);
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });
});
