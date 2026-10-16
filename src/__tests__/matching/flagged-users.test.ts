import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  suggestion: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
  notification: { create: vi.fn() },
  creditLedger: { create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
const flags = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => flags);
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));

import { autoSuggestForUser } from "@/lib/matching/auto-suggest";
import { POST as generate } from "@/app/api/admin/suggestions/generate/route";

const profile = {
  isComplete: true,
  dateOfBirth: "1995-01-01",
  city: "عمان",
  nationality: "أردني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  religiosity: "ملتزم",
  prefAgeMin: 20,
  prefAgeMax: 40,
};

const person = (id: string, gender: "MALE" | "FEMALE", isFlagged = false) => ({
  id,
  gender,
  matchCredits: 10,
  role: "USER",
  isDeactivated: false,
  status: "VERIFIED",
  isFlagged,
  profile,
  personalityResult: null,
  photos: [],
  identityDoc: null,
  parentInfo: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.suggestion.count.mockResolvedValue(0);
  db.suggestion.findMany.mockResolvedValue([]);
  db.suggestion.groupBy.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  db.suggestion.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true });
});

describe("flagged users and automatic suggestions", () => {
  it("a flagged user gets no new automatic suggestions (no candidate scan, nothing created)", async () => {
    db.user.findUnique.mockResolvedValue(person("flagged-recipient", "MALE", true));
    const created = await autoSuggestForUser("flagged-recipient");
    expect(created).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.suggestion.createMany).not.toHaveBeenCalled();
  });

  it("flagged users are left out of the candidate query", async () => {
    db.user.findUnique.mockResolvedValue(person("ok-recipient", "MALE"));
    await autoSuggestForUser("ok-recipient");
    expect(db.user.findMany).toHaveBeenCalledOnce();
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ isFlagged: false });
  });

  it("admin Generate only considers unflagged users (both sides come from that list)", async () => {
    const res = (await generate())!;
    expect(res.status).toBe(200);
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ isFlagged: false });
  });
});
