import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  referral: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  user: { findMany: vi.fn() },
}));
const country = vi.hoisted(() => ({ current: "ALL" as string }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
vi.mock("@/lib/admin/country-filter", () => ({
  getAdminCountry: vi.fn(async () => country.current),
  userCountryWhere: (c: string) => ({ country: c }),
}));

import { GET } from "@/app/api/admin/referrals/route";
import { requireAdmin } from "@/lib/auth";

const sara = { id: "u1", firstName: "سارة", lastName: "أ", phone: "962790000001" };
const ali = { id: "u2", firstName: "علي", lastName: "ب", phone: "962790000002" };

beforeEach(() => {
  vi.clearAllMocks();
  country.current = "ALL";
  db.referral.findMany.mockResolvedValue([
    { id: "r1", createdAt: new Date("2026-10-18"), creditsAwarded: true, awardedAt: new Date("2026-10-19"), referrer: sara, referee: { ...ali, profile: { isComplete: true } } },
    { id: "r2", createdAt: new Date("2026-10-20"), creditsAwarded: false, awardedAt: null, referrer: sara, referee: { ...ali, id: "u3", profile: null } },
  ]);
  db.referral.count.mockImplementation(async ({ where }: { where: { creditsAwarded?: boolean } }) => (where.creditsAwarded ? 1 : 2));
  db.referral.groupBy.mockImplementation(async (args: { take?: number }) =>
    args.take ? [{ referrerId: "u1", _count: { _all: 2 } }] : [{ referrerId: "u1" }],
  );
  db.user.findMany.mockResolvedValue([sara]);
});

describe("GET /api/admin/referrals", () => {
  it("lists referrals with totals, setup state and top inviters", async () => {
    const res = await GET(new Request("http://x/api/admin/referrals"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stats).toEqual({ total: 2, rewarded: 1, waiting: 1, inviters: 1 });
    expect(body.referrals[0].referee).toEqual({ ...ali, setupDone: true });
    expect(body.referrals[1].referee.setupDone).toBe(false);
    expect(body.topInviters).toEqual([{ ...sara, count: 2 }]);
    expect(db.referral.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("filters by the admin's country (new member) and by inviter", async () => {
    country.current = "SA";
    await GET(new Request("http://x/api/admin/referrals?referrer=u1"));
    expect(db.referral.findMany.mock.calls[0][0].where).toEqual({ referee: { country: "SA" }, referrerId: "u1" });
    // top inviters stay country-wide, not narrowed to one inviter
    expect(db.referral.groupBy.mock.calls[0][0].where).toEqual({ referee: { country: "SA" } });
  });

  it("is admin only", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({ error: new Response(null, { status: 403 }) } as never);
    const res = await GET(new Request("http://x/api/admin/referrals"));
    expect(res.status).toBe(403);
    expect(db.referral.findMany).not.toHaveBeenCalled();
  });
});
