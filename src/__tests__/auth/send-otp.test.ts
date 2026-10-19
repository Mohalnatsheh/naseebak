import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  otp: { deleteMany: vi.fn(), create: vi.fn(async () => ({ id: "o1" })), delete: vi.fn() },
}));
const sms = vi.hoisted(() => ({ sendSms: vi.fn(async () => true) }));
const settings = vi.hoisted(() => ({
  getMaintenanceState: vi.fn(async () => ({ enabled: false })),
  isRegistrationOpen: vi.fn(async () => true),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/sms", () => sms);
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/rate-limit-db", () => ({ rateLimitDb: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/test-accounts", () => ({ TEST_OTP: "111111", hasFixedOtp: () => false }));

import { POST } from "@/app/api/auth/send-otp/route";

const send = (body: object) =>
  POST(new Request("http://x/api/auth/send-otp", { method: "POST", body: JSON.stringify(body), headers: { "x-real-ip": "1.1.1.1" } }));

beforeEach(() => {
  vi.clearAllMocks();
  settings.isRegistrationOpen.mockResolvedValue(true);
});

describe("POST /api/auth/send-otp, sign-up (G58)", () => {
  it("sends the code and answers the same whether or not the number is registered", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "u1" });
    const existing = await send({ phone: "0790000001", context: "register" });
    db.user.findUnique.mockResolvedValueOnce(null);
    const fresh = await send({ phone: "0790000002", context: "register" });
    expect(existing.status).toBe(200);
    expect(fresh.status).toBe(200);
    const a = await existing.json();
    const b = await fresh.json();
    expect(a).toEqual(b);
    expect(a).not.toHaveProperty("userExists");
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
  });

  it("with registration closed, refuses every number alike", async () => {
    settings.isRegistrationOpen.mockResolvedValue(false);
    db.user.findUnique.mockResolvedValueOnce({ id: "u1" });
    expect((await send({ phone: "0790000001", context: "register" })).status).toBe(403);
    db.user.findUnique.mockResolvedValueOnce(null);
    expect((await send({ phone: "0790000002", context: "register" })).status).toBe(403);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("sign-in keeps working for a registered number while registration is closed", async () => {
    settings.isRegistrationOpen.mockResolvedValue(false);
    db.user.findUnique.mockResolvedValue({ id: "u1" });
    const res = await send({ phone: "0790000001" });
    expect(res.status).toBe(200);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });
});
