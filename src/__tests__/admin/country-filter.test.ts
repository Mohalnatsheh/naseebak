import { describe, it, expect, vi, beforeEach } from "vitest";

/** Admin panel per country: every list / stat route reads the admin_country cookie (JO default, SA, ALL). */
const db = vi.hoisted(() => ({
  user: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  identityDoc: { count: vi.fn() },
  mutualMatch: { count: vi.fn(), findMany: vi.fn() },
  suggestion: { count: vi.fn(), findMany: vi.fn() },
  subscription: { count: vi.fn() },
  payment: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  report: { count: vi.fn() },
  profileUpdateRequest: { count: vi.fn() },
  supportTicket: { count: vi.fn() },
  introRequest: { findMany: vi.fn() },
  conversation: { count: vi.fn() },
  creditLedger: { aggregate: vi.fn() },
  contactMessage: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => settings);
const notifyMock = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/notify", () => notifyMock);
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));

import { GET as getUsers } from "@/app/api/admin/users/route";
import { GET as getStats } from "@/app/api/admin/stats/route";
import { GET as getPayments } from "@/app/api/admin/payments/route";
import { GET as getContactMessages } from "@/app/api/admin/contact-messages/route";
import { POST as sendNotification } from "@/app/api/admin/notifications/route";
import { paymentCountryWhere, reportCountryWhere } from "@/lib/admin/country-filter";

const req = (url: string, country?: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { ...(country && { cookie: `theme=x; admin_country=${country}` }), ...(init.headers ?? {}) } });

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: false, chat: false, mutualSuggestions: false, creditOnInterest: false });
  db.user.count.mockResolvedValue(0);
  db.user.findMany.mockResolvedValue([]);
  db.identityDoc.count.mockResolvedValue(0);
  db.mutualMatch.count.mockResolvedValue(0);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.suggestion.count.mockResolvedValue(0);
  db.suggestion.findMany.mockResolvedValue([]);
  db.subscription.count.mockResolvedValue(0);
  db.payment.findMany.mockResolvedValue([]);
  db.payment.count.mockResolvedValue(0);
  db.payment.groupBy.mockResolvedValue([]);
  db.report.count.mockResolvedValue(0);
  db.profileUpdateRequest.count.mockResolvedValue(0);
  db.supportTicket.count.mockResolvedValue(0);
  db.introRequest.findMany.mockResolvedValue([]);
  db.conversation.count.mockResolvedValue(0);
  db.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 0 } });
  db.contactMessage.findMany.mockResolvedValue([]);
  db.contactMessage.count.mockResolvedValue(0);
});

describe("admin users list", () => {
  it("Jordan by default, with the country in each row", async () => {
    await getUsers(req("http://x/api/admin/users"));
    const args = db.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ country: "JO" });
    expect(args.select.country).toBe(true);
    expect(db.user.count).toHaveBeenCalledWith({ where: { country: "JO" } });
  });

  it("Saudi Arabia, combined with search and gender", async () => {
    await getUsers(req("http://x/api/admin/users?search=ali&gender=FEMALE", "SA"));
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ country: "SA", gender: "FEMALE", OR: expect.any(Array) });
  });

  it("All countries: no filter", async () => {
    await getUsers(req("http://x/api/admin/users", "ALL"));
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe("admin dashboard stats", () => {
  it("counts only the selected country's members, matches, suggestions, payments and queues", async () => {
    db.payment.groupBy.mockResolvedValueOnce([{ currency: "SAR", _sum: { amount: 45 } }]).mockResolvedValueOnce([{ currency: "SAR", _sum: { amount: 15 } }]);
    const res = (await getStats(req("http://x/api/admin/stats", "SA")))!;
    const body = await res.json();
    expect(body.country).toBe("SA");
    for (const call of db.user.count.mock.calls) expect(call[0].where).toMatchObject({ role: "USER", country: "SA" });
    expect(db.mutualMatch.count).toHaveBeenCalledWith({ where: { female: { country: "SA" } } });
    expect(db.suggestion.count).toHaveBeenCalledWith({ where: { recipient: { country: "SA" } } });
    expect(db.identityDoc.count.mock.calls[0][0].where).toMatchObject({ user: { country: "SA" } });
    expect(db.supportTicket.count.mock.calls[0][0].where).toMatchObject({ user: { country: "SA" } });
    expect(db.profileUpdateRequest.count.mock.calls[0][0].where).toMatchObject({ user: { country: "SA" } });
    expect(db.report.count.mock.calls[0][0].where).toMatchObject(reportCountryWhere("SA"));
    expect(db.payment.count.mock.calls[0][0].where).toMatchObject(paymentCountryWhere("SA"));
    // Money in its own currency
    expect(body.stats.revenue).toEqual([{ currency: "SAR", total: 45, thisWeek: 15 }]);
  });

  it("All countries: totals, revenue kept per currency (never JOD + SAR added up)", async () => {
    db.payment.groupBy
      .mockResolvedValueOnce([{ currency: "SAR", _sum: { amount: 45 } }, { currency: "JOD", _sum: { amount: 10 } }])
      .mockResolvedValueOnce([{ currency: "JOD", _sum: { amount: 3 } }]);
    const body = await (await getStats(req("http://x/api/admin/stats", "ALL")))!.json();
    expect(db.user.count.mock.calls[0][0].where).toEqual({ role: "USER" });
    expect(db.mutualMatch.count).toHaveBeenCalledWith({ where: {} });
    expect(body.stats.revenue).toEqual([
      { currency: "JOD", total: 10, thisWeek: 3 },
      { currency: "SAR", total: 45, thisWeek: 0 },
    ]);
  });

  it("new-cycle numbers follow the country too", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    await getStats(req("http://x/api/admin/stats", "SA"));
    expect(db.introRequest.findMany.mock.calls[0][0].where).toEqual({ sender: { country: "SA" } });
    expect(db.conversation.count.mock.calls[0][0].where).toMatchObject({ match: { female: { country: "SA" } } });
    expect(db.creditLedger.aggregate.mock.calls[0][0].where).toMatchObject({ user: { country: "SA" } });
    // funnel: registered members of the country
    expect(db.user.findMany.mock.calls.some((c) => c[0].where?.country === "SA" && c[0].where?.role === "USER")).toBe(true);
  });
});

describe("admin payments", () => {
  it("filters by the member's country, a deleted member's payment by its currency", async () => {
    await getPayments(req("http://x/api/admin/payments?status=COMPLETED", "SA"));
    const where = db.payment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ OR: [{ user: { country: "SA" } }, { userId: null, currency: "SAR" }], status: "COMPLETED" });
  });

  it("Jordan by default; summary per currency", async () => {
    db.payment.groupBy
      .mockResolvedValueOnce([{ currency: "JOD", _sum: { amount: 12 }, _count: 4 }])
      .mockResolvedValueOnce([{ currency: "JOD", _sum: { amount: 3 } }]);
    const body = await (await getPayments(req("http://x/api/admin/payments")))!.json();
    expect(db.payment.findMany.mock.calls[0][0].where).toMatchObject({ OR: [{ user: { country: "JO" } }, { userId: null, currency: "JOD" }] });
    expect(body.summary).toEqual({ revenue: [{ currency: "JOD", total: 12, monthly: 3, count: 4 }], completedCount: 4, failed30d: [] });
  });

  it("All countries: no filter, one total per currency", async () => {
    db.payment.groupBy
      .mockResolvedValueOnce([{ currency: "SAR", _sum: { amount: 30 }, _count: 1 }, { currency: "JOD", _sum: { amount: 12 }, _count: 4 }])
      .mockResolvedValueOnce([]);
    const body = await (await getPayments(req("http://x/api/admin/payments", "ALL")))!.json();
    expect(db.payment.findMany.mock.calls[0][0].where).toEqual({ NOT: { status: "PENDING", createdAt: { lt: expect.any(Date) } } });
    expect(body.summary.revenue.map((r: { currency: string }) => r.currency)).toEqual(["JOD", "SAR"]);
    expect(body.summary.completedCount).toBe(5);
  });
});

describe("admin payments filters", () => {
  it("«This month» starts at midnight on the 1st in Amman, not server time", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-31T22:00:00Z") }); // already 1 Nov in Amman
    try {
      await getPayments(req("http://x/api/admin/payments", "ALL"));
    } finally {
      vi.useRealTimers();
    }
    expect(db.payment.groupBy.mock.calls[1][0].where.createdAt.gte).toEqual(new Date("2026-10-31T21:00:00Z"));
  });

  it("disputed, a failure reason and a member search", async () => {
    await getPayments(req("http://x/api/admin/payments?status=DISPUTED", "ALL"));
    expect(db.payment.findMany.mock.calls[0][0].where).toEqual({ disputedAt: { not: null } });
    await getPayments(req("http://x/api/admin/payments?reason=UNKNOWN", "ALL"));
    expect(db.payment.findMany.mock.calls[1][0].where).toEqual({ status: "FAILED", failureReason: null });
    await getPayments(req("http://x/api/admin/payments?status=COMPLETED&search=0790000001", "ALL"));
    expect(db.payment.findMany.mock.calls[2][0].where).toMatchObject({ status: "COMPLETED", user: { OR: expect.any(Array) } });
  });

  it("gives each row the credits a refund takes back and the Stripe intent", async () => {
    db.payment.findMany.mockResolvedValue([
      { id: "p1", planName: "nope", providerTxId: "pi_1", stripePaymentIntentId: null },
      { id: "p2", planName: null, providerTxId: "cs_2", stripePaymentIntentId: null },
    ]);
    const body = await (await getPayments(req("http://x/api/admin/payments", "ALL")))!.json();
    expect(body.payments).toEqual([
      { id: "p1", planName: "nope", credits: 0, endsPro: false, renewal: false, stripePaymentIntent: "pi_1" },
      { id: "p2", planName: null, credits: 0, endsPro: false, renewal: false, stripePaymentIntent: null },
    ]);
  });
});

describe("admin contact messages", () => {
  it("lists and counts only the selected country's messages", async () => {
    await getContactMessages(req("http://x/api/admin/contact-messages?filter=all", "SA"));
    expect(db.contactMessage.findMany.mock.calls[0][0].where).toEqual({ country: "SA" });
    expect(db.contactMessage.count).toHaveBeenCalledWith({ where: { country: "SA" } });
    // the "open" badge is per country too
    expect(db.contactMessage.count).toHaveBeenCalledWith({ where: { country: "SA", handledAt: null } });
  });

  it("Jordan by default, open messages", async () => {
    await getContactMessages(req("http://x/api/admin/contact-messages"));
    expect(db.contactMessage.findMany.mock.calls[0][0].where).toEqual({ country: "JO", handledAt: null });
  });
});

describe("admin notifications", () => {
  const post = (body: unknown, country?: string) =>
    req("http://x/api/admin/notifications", country, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

  it("a broadcast only reaches the selected country", async () => {
    db.user.findMany.mockResolvedValue([{ id: "s1" }]);
    const res = (await sendNotification(post({ title: "t", body: "b" }, "SA")))!;
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ role: "USER", country: "SA" });
    expect((await res.json()).message).toMatch(/Saudi Arabia/);
  });

  it("refuses to message one member of another country", async () => {
    db.user.findUnique.mockResolvedValue({ id: "j1", country: "JO" });
    const res = (await sendNotification(post({ title: "t", body: "b", userId: "j1" }, "SA")))!;
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Jordan/);
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("All countries: anyone", async () => {
    db.user.findUnique.mockResolvedValue({ id: "j1", country: "JO" });
    const res = (await sendNotification(post({ title: "t", body: "b", userId: "j1" }, "ALL")))!;
    expect(res.status).toBe(200);
    expect(notifyMock.notify).toHaveBeenCalled();
  });
});
