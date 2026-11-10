import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
}));
const revoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/session-revocation", () => ({ revokeWebSessions: revoke }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed") } }));

import { POST } from "@/app/api/admin/settings/admins/route";
import { DELETE } from "@/app/api/admin/settings/admins/[id]/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/admin/settings/admins", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const del = (id: string) => DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  db.user.findFirst.mockResolvedValue(null);
  db.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "n1", ...data }));
});

describe("Add Admin (ADM-08)", () => {
  const good = { firstName: " Lina ", lastName: "Haddad", email: " Lina@Example.COM ", password: "longenough" };

  it("lowercases the email, trims names and checks duplicates without case", async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "lina@example.com", mode: "insensitive" } },
      select: { id: true },
    });
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({ firstName: "Lina", email: "lina@example.com", role: "ADMIN" });
  });

  it("refuses a bad email, a short or non-string password and a broken body with 400", async () => {
    expect((await post({ ...good, email: "not-an-email" })).status).toBe(400);
    expect((await post({ ...good, password: "short" })).status).toBe(400);
    expect((await post({ ...good, password: 12345678 })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("refuses an email already in use", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u9" });
    expect((await post(good)).status).toBe(409);
  });
});

describe("Remove admin (ADM-08)", () => {
  it("never removes yourself", async () => {
    const res = await del("admin1");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("SELF");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("404 for someone who isn't an admin", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "u2", role: "USER", phone: "962790000001" });
    expect((await del("u2")).status).toBe(404);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("never removes the last admin", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "a2", role: "ADMIN", phone: null });
    tx.user.count.mockResolvedValue(1);
    const res = await del("a2");
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("LAST_ADMIN");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("demotes an admin-only account, suspends it and revokes its sessions", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "a2", role: "ADMIN", phone: null });
    tx.user.count.mockResolvedValue(2);
    expect((await del("a2")).status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "a2" },
      data: { role: "USER", passwordHash: null, status: "SUSPENDED" },
    });
    expect(revoke).toHaveBeenCalledWith("a2");
  });

  it("a member made admin keeps their member account", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "a3", role: "ADMIN", phone: "962790000001" });
    tx.user.count.mockResolvedValue(3);
    expect((await del("a3")).status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "a3" }, data: { role: "USER", passwordHash: null } });
  });
});
