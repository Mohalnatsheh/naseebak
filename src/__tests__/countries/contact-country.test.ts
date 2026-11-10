import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ contactMessage: { create: vi.fn() }, countrySetting: { findMany: vi.fn(async () => []) } }));
const visitor = vi.hoisted(() => ({ country: "SA" as "SA" | "JO" | "LB" }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendContactNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/countries/server", () => ({ getVisitorCountry: vi.fn(async () => visitor.country) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));

import { POST } from "@/app/api/contact/route";

let n = 0;
const post = (body: unknown) =>
  new Request("http://x/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.0.${++n}` },
    body: JSON.stringify(body),
  });
const msg = () => ({ name: "نورة", subject: "سؤال", message: "كيف أسجّل في المنصة؟ شكراً لكم." });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/contact stores the visitor's country", () => {
  it("Saudi visitor: Saudi mobile normalised to 966…, country SA", async () => {
    visitor.country = "SA";
    const res = await POST(post({ ...msg(), phone: "0512345670" }));
    expect(res.status).toBe(201);
    expect(db.contactMessage.create.mock.calls[0][0].data).toMatchObject({ phone: "966512345670", country: "SA" });
  });

  it("Saudi visitor with a Jordanian number is asked for a Saudi one", async () => {
    visitor.country = "SA";
    const res = await POST(post({ ...msg(), phone: "0791234560" }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("phone");
    expect(db.contactMessage.create).not.toHaveBeenCalled();
  });

  it("the country the page showed wins over an old Saudi cookie", async () => {
    visitor.country = "SA";
    const res = await POST(post({ ...msg(), phone: "0791234560", country: "JO" }));
    expect(res.status).toBe(201);
    expect(db.contactMessage.create.mock.calls[0][0].data).toMatchObject({ phone: "962791234560", country: "JO" });
  });

  it("Lebanese visitor: Lebanese mobile normalised to 961…, country LB", async () => {
    visitor.country = "LB";
    const res = await POST(post({ ...msg(), phone: "71123456", country: "LB" }));
    expect(res.status).toBe(201);
    expect(db.contactMessage.create.mock.calls[0][0].data).toMatchObject({ phone: "96171123456", country: "LB" });
  });

  it("Jordanian visitor: country JO", async () => {
    visitor.country = "JO";
    const res = await POST(post({ ...msg(), email: "a@example.com" }));
    expect(res.status).toBe(201);
    expect(db.contactMessage.create.mock.calls[0][0].data.country).toBe("JO");
  });
});
