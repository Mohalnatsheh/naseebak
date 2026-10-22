import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { isQuietHour } = await import("@/lib/chat/unread-sms");
const { SMS_NOTICE_TEXT } = await import("@/lib/sms-notice");

describe("unread-message SMS", () => {
  it("is quiet from 23:00 to 09:00 Amman (UTC+3)", () => {
    expect(isQuietHour(new Date("2026-10-22T20:00:00Z"))).toBe(true); // 23:00
    expect(isQuietHour(new Date("2026-10-22T05:59:00Z"))).toBe(true); // 08:59
    expect(isQuietHour(new Date("2026-10-22T06:00:00Z"))).toBe(false); // 09:00
    expect(isQuietHour(new Date("2026-10-22T19:59:00Z"))).toBe(false); // 22:59
  });
  it("the SMS never contains names or message text", () => {
    expect(SMS_NOTICE_TEXT.message).toContain("naseebak.com/dashboard/chats");
    expect(SMS_NOTICE_TEXT.message).not.toMatch(/\{|name/);
  });
});
