import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  notification: { findMany: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
}));
const sms = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/sms", () => sms);

import { catchUpQuietSms, hasPushDevice, isQuietHour, sendSmsNotice, SMS_NOTICE_TEXT } from "@/lib/sms-notice";

const fetchMock = vi.fn();
const member = (over: Record<string, unknown> = {}) => ({
  phone: "962791234567",
  role: "USER",
  status: "ACTIVE",
  isDeactivated: false,
  lastSmsNoticeAt: null,
  lastActiveAt: new Date("2026-10-17T10:00:00Z"),
  updatedAt: new Date("2026-10-17T10:00:00Z"),
  ...over,
});
const noDevice = () => fetchMock.mockResolvedValue({ status: 404, ok: false });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID = "app";
  process.env.ONESIGNAL_REST_API_KEY = "key";
  db.user.findUnique.mockResolvedValue(member());
  db.user.updateMany.mockResolvedValue({ count: 1 });
  sms.sendSms.mockResolvedValue(true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EXTRA_TEST_PHONES;
});

describe("hasPushDevice", () => {
  it("reads OneSignal: an enabled push subscription counts, email/SMS or disabled ones don't", async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ subscriptions: [{ type: "ChromePush", enabled: true, notification_types: 1 }] }) });
    expect(await hasPushDevice("u1")).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.onesignal.com/apps/app/users/by/external_id/u1");
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ subscriptions: [{ type: "SafariPush", enabled: false }, { type: "Email", enabled: true }] }) });
    expect(await hasPushDevice("u1")).toBe(false);
  });

  it("404 = no device; errors or no config = unknown", async () => {
    noDevice();
    expect(await hasPushDevice("u1")).toBe(false);
    fetchMock.mockResolvedValue({ status: 500, ok: false });
    expect(await hasPushDevice("u1")).toBeNull();
    delete process.env.ONESIGNAL_REST_API_KEY;
    expect(await hasPushDevice("u1")).toBeNull();
  });
});

describe("sendSmsNotice", () => {
  it("texts a member with no push device, once, and keeps their last-seen time", async () => {
    noDevice();
    expect(await sendSmsNotice("u1", "match")).toBe("sent");
    expect(sms.sendSms).toHaveBeenCalledWith("962791234567", SMS_NOTICE_TEXT.match);
    const { where, data } = db.user.updateMany.mock.calls[0][0];
    expect(where.id).toBe("u1");
    expect(data).toEqual({ lastSmsNoticeAt: expect.any(Date) });
  });

  it("keeps updatedAt as last seen for members with no lastActiveAt", async () => {
    noDevice();
    const updatedAt = new Date("2026-09-01T00:00:00Z");
    db.user.findUnique.mockResolvedValue(member({ lastActiveAt: null, updatedAt }));
    await sendSmsNotice("u1", "interest");
    expect(db.user.updateMany.mock.calls[0][0].data.lastActiveAt).toBe(updatedAt);
  });

  it("at most one per Amman day", async () => {
    noDevice();
    const now = new Date("2026-10-18T12:00:00Z");
    db.user.findUnique.mockResolvedValue(member({ lastSmsNoticeAt: new Date("2026-10-18T05:00:00Z") }));
    expect(await sendSmsNotice("u1", "match", now)).toBe("already_today");
    // Lost the claim to a parallel notice
    db.user.findUnique.mockResolvedValue(member());
    db.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await sendSmsNotice("u1", "match", now)).toBe("already_today");
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("admin «send now» skips the push check but never the once-a-day cap", async () => {
    const now = new Date("2026-10-18T12:00:00Z");
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ subscriptions: [{ type: "iOSPush", enabled: true }] }) });
    expect(await sendSmsNotice("u1", "message", now, { skipPushCheck: true })).toBe("sent");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.user.updateMany.mock.calls[0][0].where.OR).toBeDefined(); // the daily claim is still atomic

    db.user.findUnique.mockResolvedValue(member({ lastSmsNoticeAt: new Date("2026-10-18T05:00:00Z") }));
    expect(await sendSmsNotice("u1", "message", now, { skipPushCheck: true })).toBe("already_today");
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it("never when push can reach them or reachability is unknown", async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ subscriptions: [{ type: "iOSPush", enabled: true }] }) });
    expect(await sendSmsNotice("u1", "match")).toBe("has_push");
    fetchMock.mockResolvedValue({ status: 503, ok: false });
    expect(await sendSmsNotice("u1", "match")).toBe("unknown_push");
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("never for test accounts, admins, paused or suspended members", async () => {
    noDevice();
    process.env.EXTRA_TEST_PHONES = "0791234567";
    expect(await sendSmsNotice("u1", "match")).toBe("skipped");
    delete process.env.EXTRA_TEST_PHONES;
    for (const over of [{ role: "ADMIN" }, { isDeactivated: true }, { status: "SUSPENDED" }, { phone: null }]) {
      db.user.findUnique.mockResolvedValue(member(over));
      expect(await sendSmsNotice("u1", "match")).toBe("skipped");
    }
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the texts carry no names or message content", () => {
    for (const text of Object.values(SMS_NOTICE_TEXT)) {
      expect(text.startsWith("نصيبك:")).toBe(true);
      expect(text).toContain("naseebak.com/dashboard/");
      expect(text.length).toBeLessThan(140);
    }
  });

  it("the waiting text is neutral (never says someone is interested)", () => {
    expect(SMS_NOTICE_TEXT.waiting).not.toContain("اهتمام");
    expect(SMS_NOTICE_TEXT.waiting).toContain("بانتظار قرارك");
  });
});

describe("quiet hours (23:00–09:00 Amman)", () => {
  it("no notice SMS at night, nothing claimed", async () => {
    noDevice();
    const night = new Date("2026-10-18T21:30:00Z"); // 00:30 Amman
    expect(isQuietHour(night)).toBe(true);
    expect(await sendSmsNotice("u1", "interest", night)).toBe("quiet");
    expect(await sendSmsNotice("u1", "message", night, { skipPushCheck: true })).toBe("quiet");
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("after 09:00 sends one held SMS per member, the most important event", async () => {
    noDevice();
    const morning = new Date("2026-10-19T06:15:00Z"); // 09:15 Amman
    db.notification.findMany.mockResolvedValue([
      { userId: "u1", type: "SUGGESTION", title: "اقتراح بانتظار قرارك", createdAt: new Date("2026-10-19T03:00:00Z") }, // 06:00 — held
      { userId: "u1", type: "MATCH", title: "توافق متبادل!", createdAt: new Date("2026-10-18T22:00:00Z") }, // 01:00 — held
      { userId: "u2", type: "SUGGESTION", title: "شخص أبدى اهتمامه بك", createdAt: new Date("2026-10-18T17:00:00Z") }, // 20:00 — not held
    ]);
    const counts = await catchUpQuietSms(morning);
    expect(counts).toEqual({ sent: 1 });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(sms.sendSms).toHaveBeenCalledWith("962791234567", SMS_NOTICE_TEXT.match);
  });

  it("respects a turned-off notice type and does nothing at night", async () => {
    noDevice();
    db.notification.findMany.mockResolvedValue([
      { userId: "u1", type: "MATCH", title: "توافق متبادل!", createdAt: new Date("2026-10-18T22:00:00Z") },
    ]);
    db.notificationPreference.findUnique.mockResolvedValue({ matches: false });
    expect(await catchUpQuietSms(new Date("2026-10-19T07:00:00Z"))).toEqual({ opted_out: 1 });
    expect(await catchUpQuietSms(new Date("2026-10-19T02:00:00Z"))).toEqual({ skipped: 1 });
    expect(sms.sendSms).not.toHaveBeenCalled();
  });
});
