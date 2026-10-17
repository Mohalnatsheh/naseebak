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
      expect.objectContaining({ where: { cancelledAt: null }, skip: 40, take: 20 }),
    );
    expect(body).toMatchObject({ requests: [{ id: "d1" }], total: 45, page: 3, totalPages: 3 });
  });

  it("visits: filters by a valid status on the server and returns counts for every status", async () => {
    const res = (await getVisits(new Request("http://x/api/admin/visits?page=2&status=REQUESTED")))!;
    const body = await res.json();
    expect(db.visitRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "REQUESTED" }, skip: 20, take: 20 }),
    );
    expect(db.visitRequest.count).toHaveBeenCalledWith({ where: { status: "REQUESTED" } });
    expect(body).toMatchObject({ total: 21, page: 2, totalPages: 2, counts: { REQUESTED: 21, COMPLETED: 4 } });
  });

  it("visits: ignores an unknown status and a bad page instead of failing", async () => {
    const res = (await getVisits(new Request("http://x/api/admin/visits?page=abc&status=NOPE")))!;
    expect(res.status).toBe(200);
    expect(db.visitRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {}, skip: 0 }));
  });

  it("profile requests: pending only, oldest first, paged", async () => {
    const res = (await getProfileRequests(new Request("http://x/api/admin/profile-requests")))!;
    const body = await res.json();
    expect(db.profileUpdateRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING" }, skip: 0, take: 20, orderBy: { createdAt: "asc" } }),
    );
    expect(body).toMatchObject({ total: 3, page: 1, totalPages: 1 });
  });
});
