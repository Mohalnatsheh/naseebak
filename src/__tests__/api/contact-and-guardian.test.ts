import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contactMessage: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  parentInfo: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const sendContactNotification = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendContactNotification }));
vi.mock("@/lib/referral", () => ({ maybeAwardReferral: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })),
}));

import { POST as contact } from "@/app/api/contact/route";
import { PUT as putGuardian } from "@/app/api/profile/parent-info/route";

let ipCounter = 0;
const post = (body: unknown, ip = `10.0.0.${++ipCounter}`) =>
  new Request("http://x/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
const valid = () => ({ name: "سارة", email: `s${++ipCounter}@example.com`, subject: "سؤال", message: "أريد معرفة طريقة عمل المنصة." });

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ phone: "962790009999" });
  db.parentInfo.findUnique.mockResolvedValue(null);
  db.parentInfo.upsert.mockImplementation(async ({ create }: { create: object }) => create);
});

describe("POST /api/contact", () => {
  it("saves a valid message and notifies the admin", async () => {
    const res = await contact(post(valid()));
    expect(res.status).toBe(201);
    expect(db.contactMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ subject: "سؤال", userId: null }) });
    expect(sendContactNotification).toHaveBeenCalledTimes(1);
  });

  it("points at the invalid field", async () => {
    const res = await contact(post({ ...valid(), email: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("email");
    expect(db.contactMessage.create).not.toHaveBeenCalled();
  });

  it("drops a filled honeypot silently", async () => {
    const res = await contact(post({ ...valid(), website: "spam.example" }));
    expect(res.status).toBe(201);
    expect(db.contactMessage.create).not.toHaveBeenCalled();
  });

  it("rate-limits one address", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await contact(post(valid(), "10.9.9.9"))).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});

describe("PUT /api/profile/parent-info", () => {
  const req = (body: unknown) => new Request("http://x", { method: "PUT", body: JSON.stringify(body) });
  const ok = { parentName: "أحمد اختبار", parentPhone: "079 123 4567", relationship: "father", address: "عمّان" };

  it("stores a normalised phone", async () => {
    const res = await putGuardian(req(ok));
    expect(res.status).toBe(200);
    expect(db.parentInfo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ parentPhone: "962791234567" }),
    }));
  });

  it("refuses an English name or a broken phone", async () => {
    expect((await putGuardian(req({ ...ok, parentName: "Ahmad" }))).status).toBe(400);
    expect((await putGuardian(req({ ...ok, parentPhone: "123" }))).status).toBe(400);
    expect(db.parentInfo.upsert).not.toHaveBeenCalled();
  });

  it("refuses the user's own number", async () => {
    const res = await putGuardian(req({ ...ok, parentPhone: "0790009999" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/يختلف عن رقم هاتفك/);
  });
});
