import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { chatSmsTargets, isQuietHour } = await import("@/lib/chat/unread-sms");
const { SMS_NOTICE_TEXT } = await import("@/lib/sms-notice");

const now = new Date("2026-10-22T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
const base = { femaleId: "F", maleId: "M", createdAt: ago(5) };

describe("which chats get the one SMS", () => {
  it("nobody wrote yet (2 h+) → both members get «chat opened»", () => {
    expect(chatSmsTargets({ ...base, messages: [] }, now)).toEqual([{ userId: "F", event: "chat_open" }, { userId: "M", event: "chat_open" }]);
    expect(chatSmsTargets({ ...base, createdAt: ago(1), messages: [] }, now)).toEqual([]);
  });
  it("only one wrote, still unread 2 h+ → the silent member gets «new message»", () => {
    expect(chatSmsTargets({ ...base, messages: [{ senderId: "F", readAt: null, createdAt: ago(3) }] }, now)).toEqual([{ userId: "M", event: "message" }]);
    expect(chatSmsTargets({ ...base, messages: [{ senderId: "F", readAt: null, createdAt: ago(1) }] }, now)).toEqual([]);
  });
  it("only one wrote but the other already read it → no SMS", () => {
    expect(chatSmsTargets({ ...base, messages: [{ senderId: "F", readAt: ago(1), createdAt: ago(3) }] }, now)).toEqual([]);
  });
  it("both have written → never an SMS, even with unread messages", () => {
    const messages = [{ senderId: "F", readAt: ago(4), createdAt: ago(5) }, { senderId: "M", readAt: null, createdAt: ago(4) }];
    expect(chatSmsTargets({ ...base, messages }, now)).toEqual([]);
    expect(chatSmsTargets({ ...base, messages }, now, true)).toEqual([]);
  });
  it("admin «send now» skips the 2-hour wait", () => {
    expect(chatSmsTargets({ ...base, createdAt: ago(0.1), messages: [] }, now, true)).toHaveLength(2);
  });
});

describe("timing and text", () => {
  it("is quiet from 23:00 to 09:00 Amman (UTC+3)", () => {
    expect(isQuietHour(new Date("2026-10-22T20:00:00Z"))).toBe(true);
    expect(isQuietHour(new Date("2026-10-22T05:59:00Z"))).toBe(true);
    expect(isQuietHour(new Date("2026-10-22T06:00:00Z"))).toBe(false);
    expect(isQuietHour(new Date("2026-10-22T19:59:00Z"))).toBe(false);
  });
  it("the SMS never contains names or message text", () => {
    for (const t of [SMS_NOTICE_TEXT.message, SMS_NOTICE_TEXT.chat_open]) {
      expect(t).toContain("naseebak.com/dashboard/chats");
      expect(t).not.toMatch(/\{|name/);
    }
  });
});
