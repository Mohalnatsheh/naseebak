import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  report: { findMany: vi.fn(), count: vi.fn() },
  supportTicket: { findMany: vi.fn(), count: vi.fn() },
  profileUpdateRequest: { findMany: vi.fn(), count: vi.fn() },
  contactMessage: { findMany: vi.fn(), count: vi.fn() },
  identityDoc: { count: vi.fn() },
  user: { findMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn(async (): Promise<unknown> => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);

import { GET } from "@/app/api/admin/inbox/route";

const req = (country?: string) => new Request("http://x/api/admin/inbox", country ? { headers: { cookie: `admin_country=${country}` } } : {});
const person = (id: string) => ({ id, firstName: id, lastName: "X", status: "PENDING" });

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of [db.report, db.supportTicket, db.profileUpdateRequest, db.contactMessage]) {
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(0);
  }
  db.identityDoc.count.mockResolvedValue(0);
  db.user.findMany.mockResolvedValue([]);
});

describe("admin inbox", () => {
  it("merges every queue, oldest first, with a link to each item", async () => {
    db.report.findMany.mockResolvedValue([
      { id: "r1", reason: "HARASSMENT", createdAt: new Date("2026-11-03"), reporter: person("a"), reported: person("b") },
    ]);
    db.supportTicket.findMany.mockResolvedValue([
      { id: "t1", type: "ISSUE", subject: "Help", status: "IN_PROGRESS", createdAt: new Date("2026-11-01"), user: person("c") },
    ]);
    db.profileUpdateRequest.findMany.mockResolvedValue([
      { id: "p1", changes: { city: "x", job: "y" }, createdAt: new Date("2026-11-04"), user: person("d") },
    ]);
    db.contactMessage.findMany.mockResolvedValue([
      { id: "m1", name: "Visitor", subject: "Hello", userId: "e", createdAt: new Date("2026-11-02") },
    ]);
    db.user.findMany.mockResolvedValue([person("e")]);
    db.report.count.mockResolvedValue(1);
    db.supportTicket.count.mockResolvedValue(1);
    db.profileUpdateRequest.count.mockResolvedValue(7);
    db.contactMessage.count.mockResolvedValue(1);

    const body = await (await GET(req()))!.json();

    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["t1", "m1", "r1", "p1"]);
    expect(body.items[0]).toMatchObject({ type: "support", href: "/admin/support?id=t1", summary: "Issue: Help (in progress)", member: { id: "c" } });
    expect(body.items[1]).toMatchObject({ type: "contact", href: "/admin/messages?id=m1", member: { id: "e" } });
    expect(body.items[2]).toMatchObject({ type: "report", href: "/admin/reports?id=r1", summary: "Harassment · from a X", member: { id: "b" } });
    expect(body.items[3]).toMatchObject({ type: "profile", href: "/admin/profile-requests?id=p1", summary: "Profile edit: 2 fields" });
    expect(body.counts).toEqual({ report: 1, support: 1, profile: 7, contact: 1 });
  });

  it("a report whose reported account was deleted falls back to the reporter; an unknown sender has no member", async () => {
    db.report.findMany.mockResolvedValue([{ id: "r1", reason: "SPAM", createdAt: new Date("2026-11-03"), reporter: person("a"), reported: null }]);
    db.contactMessage.findMany.mockResolvedValue([{ id: "m1", name: "Visitor", subject: "Hi", userId: null, createdAt: new Date("2026-11-04") }]);

    const body = await (await GET(req()))!.json();

    expect(body.items[0].member.id).toBe("a");
    expect(body.items[1].member).toBeNull();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("uses the same conditions as the to-do counts, per country", async () => {
    await GET(req("SA"));
    expect(db.supportTicket.findMany.mock.calls[0][0].where).toEqual({ status: { in: ["OPEN", "IN_PROGRESS"] }, user: { country: "SA" } });
    expect(db.profileUpdateRequest.findMany.mock.calls[0][0].where).toEqual({ status: "PENDING", user: { country: "SA" } });
    expect(db.contactMessage.findMany.mock.calls[0][0].where).toEqual({ handledAt: null, country: "SA" });
    expect(db.report.findMany.mock.calls[0][0].where.status).toBe("PENDING");
  });

  it("All countries: no country filter", async () => {
    await GET(req("ALL"));
    expect(db.contactMessage.findMany.mock.calls[0][0].where).toEqual({ handledAt: null });
    expect(db.supportTicket.findMany.mock.calls[0][0].where).toEqual({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  });

  it("refuses anyone but an admin", async () => {
    auth.requireAdmin.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    const res = await GET(req());
    expect(res?.status).toBe(403);
    expect(db.report.findMany).not.toHaveBeenCalled();
  });
});
