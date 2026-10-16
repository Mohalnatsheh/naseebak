import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
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
