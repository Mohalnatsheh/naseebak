import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  accountDeletionRequest: { findMany: vi.fn(), count: vi.fn() },
  visitRequest: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  profileUpdateRequest: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));

import { GET as getDeletions } from "@/app/api/admin/deletions/route";
import { GET as getVisits } from "@/app/api/admin/visits/route";
import { GET as getProfileRequests } from "@/app/api/admin/profile-requests/route";

/** No admin_country cookie = Jordan */
const JO_MATCH = { match: { female: { country: "JO" } } };
const withCountry = (url: string, country: string) => new Request(url, { headers: { cookie: `admin_country=${country}` } });

beforeEach(() => {
  vi.clearAllMocks();
  db.accountDeletionRequest.findMany.mockResolvedValue([{ id: "d1" }]);
  db.accountDeletionRequest.count.mockResolvedValue(45);
  db.visitRequest.findMany.mockResolvedValue([{ id: "v1" }]);
  db.visitRequest.count.mockResolvedValue(21);
  db.visitRequest.groupBy.mockResolvedValue([
    { status: "REQUESTED", _count: { _all: 21 } },
    { status: "COMPLETED", _count: { _all: 4 } },
  ]);
  db.profileUpdateRequest.findMany.mockResolvedValue([{ id: "r1" }]);
  db.profileUpdateRequest.count.mockResolvedValue(3);
});

describe("admin list paging", () => {
  it("deletions: pages 20 at a time, active requests only", async () => {
    const res = (await getDeletions(new Request("http://x/api/admin/deletions?page=3")))!;
    const body = await res.json();
    expect(db.accountDeletionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cancelledAt: null, user: { country: "JO" } }, skip: 40, take: 20 }),
    );
    expect(body).toMatchObject({ requests: [{ id: "d1" }], total: 45, page: 3, totalPages: 3 });
  });

  it("visits: filters by a valid status on the server and returns counts for every status", async () => {
    const res = (await getVisits(new Request("http://x/api/admin/visits?page=2&status=REQUESTED")))!;
    const body = await res.json();
    expect(db.visitRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...JO_MATCH, status: "REQUESTED" }, skip: 20, take: 20 }),
    );
    expect(db.visitRequest.count).toHaveBeenCalledWith({ where: { ...JO_MATCH, status: "REQUESTED" } });
    expect(body).toMatchObject({ total: 21, page: 2, totalPages: 2, counts: { REQUESTED: 21, COMPLETED: 4 } });
  });

  it("visits: ignores an unknown status and a bad page instead of failing", async () => {
    const res = (await getVisits(new Request("http://x/api/admin/visits?page=abc&status=NOPE")))!;
    expect(res.status).toBe(200);
    expect(db.visitRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: JO_MATCH, skip: 0 }));
  });

  it("profile requests: pending only, oldest first, paged", async () => {
    const res = (await getProfileRequests(new Request("http://x/api/admin/profile-requests")))!;
    const body = await res.json();
    expect(db.profileUpdateRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING", user: { country: "JO" } }, skip: 0, take: 20, orderBy: { createdAt: "asc" } }),
    );
    expect(body).toMatchObject({ total: 3, page: 1, totalPages: 1 });
  });
});

describe("admin lists follow the selected country (admin_country cookie)", () => {
  it("Saudi Arabia: only Saudi members' rows, counts included", async () => {
    await getDeletions(withCountry("http://x/api/admin/deletions", "SA"));
    expect(db.accountDeletionRequest.findMany.mock.calls[0][0].where).toEqual({ cancelledAt: null, user: { country: "SA" } });
    await getVisits(withCountry("http://x/api/admin/visits", "SA"));
    expect(db.visitRequest.groupBy.mock.calls[0][0].where).toEqual({ match: { female: { country: "SA" } } });
    await getProfileRequests(withCountry("http://x/api/admin/profile-requests", "SA"));
    expect(db.profileUpdateRequest.count.mock.calls[0][0].where).toEqual({ status: "PENDING", user: { country: "SA" } });
  });

  it("All countries: no country filter at all (rows of deleted members stay visible)", async () => {
    await getDeletions(withCountry("http://x/api/admin/deletions", "ALL"));
    expect(db.accountDeletionRequest.findMany.mock.calls[0][0].where).toEqual({ cancelledAt: null });
    await getVisits(withCountry("http://x/api/admin/visits?status=REQUESTED", "ALL"));
    expect(db.visitRequest.count).toHaveBeenCalledWith({ where: { status: "REQUESTED" } });
  });

  it("an unknown cookie value falls back to Jordan", async () => {
    await getProfileRequests(withCountry("http://x/api/admin/profile-requests", "XX"));
    expect(db.profileUpdateRequest.findMany.mock.calls[0][0].where).toEqual({ status: "PENDING", user: { country: "JO" } });
  });
});
