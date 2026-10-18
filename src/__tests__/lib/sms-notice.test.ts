import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const sms = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/sms", () => sms);

import { hasPushDevice, sendSmsNotice, SMS_NOTICE_TEXT } from "@/lib/sms-notice";

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
});
