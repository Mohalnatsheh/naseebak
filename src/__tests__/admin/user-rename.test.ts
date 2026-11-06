import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() } }));
const requireAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/lib/credits", () => ({ recordCredit: vi.fn() }));

import { PATCH } from "@/app/api/admin/users/[id]/route";

const patch = (body: object) =>
  PATCH(new Request("http://x/api/admin/users/u1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "u1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ session: { user: { id: "admin" } } });
  db.user.findUnique.mockResolvedValue({ id: "u1" });
});

describe("PATCH /api/admin/users/[id]: name", () => {
  it("saves a tidied Arabic name", async () => {
    const res = await patch({ firstName: "  محمد   علي ", lastName: "الخطيب" });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { firstName: "محمد علي", lastName: "الخطيب" } });
  });

  it.each([
    ["Latin letters", { firstName: "Mohammad", lastName: "الخطيب" }],
    ["one letter", { firstName: "م", lastName: "الخطيب" }],
    ["a missing last name", { firstName: "محمد" }],
    ["an empty first name", { firstName: "", lastName: "الخطيب" }],
  ])("refuses %s without saving", async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("needs an admin", async () => {
    requireAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await patch({ firstName: "محمد", lastName: "الخطيب" })).status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
