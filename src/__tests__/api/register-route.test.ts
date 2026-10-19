import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  otp: { findFirst: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => ({
  getMaintenanceState: vi.fn(async () => ({ enabled: false })),
  isRegistrationOpen: vi.fn(async () => true),
}));
vi.mock("@/lib/credits", () => ({ getRegistrationCredits: vi.fn(async () => 3), recordCredit: vi.fn(async () => undefined) }));
vi.mock("@/lib/email", () => ({ sendNewUserNotification: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/auth/register/route";

const body = { firstName: "أحمد", lastName: "محمد", phone: "0791234567", gender: "MALE", otp: "123456", termsAccepted: true };
const req = (b: unknown) => new Request("http://x/api/auth/register", { method: "POST", body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  db.otp.findFirst.mockResolvedValue({ id: "o1" });
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockResolvedValue({ id: "u1", phone: "962791234567", gender: "MALE", createdAt: new Date() });
});

describe("POST /api/auth/register", () => {
  it("stores the terms acceptance time (G25)", async () => {
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(db.user.create.mock.calls[0][0].data.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("refuses without the terms tick, with the reason", async () => {
    const res = await POST(req({ ...body, termsAccepted: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("الشروط");
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("stores trimmed names (G26)", async () => {
    await POST(req({ ...body, firstName: "  أحمد  " }));
    expect(db.user.create.mock.calls[0][0].data.firstName).toBe("أحمد");
  });

  it("a simultaneous duplicate sign-up gets 409, not 500 (G48)", async () => {
    db.user.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    const res = await POST(req(body));
    expect(res.status).toBe(409);
  });

  it("G58: a registered number is revealed only after a verified code (409 PHONE_EXISTS)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u0" });
    const res = await POST(req(body));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PHONE_EXISTS");
    db.otp.findFirst.mockResolvedValue(null);
    const unverified = await POST(req(body));
    expect(unverified.status).toBe(400);
  });
});
