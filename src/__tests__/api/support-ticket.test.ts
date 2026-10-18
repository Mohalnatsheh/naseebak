import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  supportTicket: { count: vi.fn(), create: vi.fn() },
}));
const requireUser = vi.hoisted(() => vi.fn());
const sendAdminAlert = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/admin-alert", () => ({ sendAdminAlert }));

import { POST } from "@/app/api/support/route";

const body = { type: "ISSUE", subject: "مشكلة في الصفحة", description: "لا تظهر الاقتراحات عندي منذ يومين" };
const req = (b: unknown) => new Request("http://x/api/support", { method: "POST", body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ session: { user: { id: "u1", name: "أحمد" } } });
  db.supportTicket.count.mockResolvedValue(0);
  db.supportTicket.create.mockResolvedValue({ id: "t1" });
});

describe("POST /api/support (G27)", () => {
  it("creates the ticket and emails the admins", async () => {
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
    const [subject, text] = sendAdminAlert.mock.calls[0] as unknown as [string, string];
    expect(subject).toContain("تذكرة دعم");
    expect(text).toContain("t1");
    expect(text).toContain(body.subject);
  });

  it("no email when the ticket is refused", async () => {
    db.supportTicket.count.mockResolvedValue(5);
    expect((await POST(req(body))).status).toBe(400);
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });

  it("a failing alert never fails the request", async () => {
    sendAdminAlert.mockImplementationOnce(() => new Promise(() => undefined)); // never settles
    expect((await POST(req(body))).status).toBe(201);
  });
});
