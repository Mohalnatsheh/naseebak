import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  notification: { create: vi.fn(), findFirst: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
}));
const web = vi.hoisted(() => vi.fn());
const app = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: web }));
vi.mock("@/lib/fcm", () => ({ sendFcmPush: app }));
vi.mock("@/lib/sms-notice", () => ({ sendSmsNotice: vi.fn(), smsEventFor: () => null }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ session: { user: { id: "a1" } } }) }));
vi.mock("@/lib/admin/country-filter", () => ({
  getAdminCountry: async () => "ALL",
  userCountryWhere: () => ({}),
  byUserCountry: () => ({}),
}));

import { notify } from "@/lib/notify";
import { POST } from "@/app/api/admin/notifications/route";

const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.notification.create.mockResolvedValue({});
  db.notificationPreference.findUnique.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
});

describe("push channel", () => {
  it("all (default): website and app push, one in-app row", async () => {
    await notify({ userId: "u1", type: "SYSTEM", title: "t", body: "b" });
    expect(web).toHaveBeenCalledTimes(1);
    expect(app).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });

  it("web: OneSignal only; app: FCM only", async () => {
    await notify({ userId: "u1", type: "SYSTEM", title: "t", body: "b", channel: "web" });
    expect(web).toHaveBeenCalledTimes(1);
    expect(app).not.toHaveBeenCalled();
    vi.clearAllMocks();
    await notify({ userId: "u1", type: "SYSTEM", title: "t", body: "b", channel: "app" });
    expect(app).toHaveBeenCalledTimes(1);
    expect(web).not.toHaveBeenCalled();
  });
});

describe("admin send", () => {
  it("an app-only broadcast reaches only members with the app and a valid sign-in", async () => {
    const res = await post({ title: "t", body: "b", channel: "app" });
    expect(res.status).toBe(200);
    expect(db.user.findMany.mock.calls[0][0].where.pushDevices).toEqual({
      some: { mobileSession: { revokedAt: null, expiresAt: { gt: expect.any(Date) } } },
    });
    expect((await res.json()).message).toMatch(/app push only/);
    expect(web).not.toHaveBeenCalled();
    expect(app).toHaveBeenCalledTimes(2);
  });

  it("a website broadcast keeps every active member; a bad channel is refused", async () => {
    await post({ title: "t", body: "b", channel: "web" });
    expect(db.user.findMany.mock.calls[0][0].where.pushDevices).toBeUndefined();
    expect(app).not.toHaveBeenCalled();
    expect((await post({ title: "t", body: "b", channel: "sms" })).status).toBe(400);
  });
});
