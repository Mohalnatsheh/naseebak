import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => ({ conversation: { findMany: vi.fn() }, chatSmsNotice: { upsert: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(async () => "true") }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));

import { runUnreadSms } from "@/lib/chat/unread-sms";

describe("runUnreadSms (narrowed SMS, 2026-11-07)", () => {
  it("sends and records nothing while chat SMS are not an SMS event, even with notice SMS on", async () => {
    expect(await runUnreadSms(new Date("2026-11-07T12:00:00Z"))).toEqual({ skipped: "chat_sms_off" });
    expect(db.conversation.findMany).not.toHaveBeenCalled();
    expect(db.chatSmsNotice.upsert).not.toHaveBeenCalled();
  });
});

describe("sendChatSmsNow with notice SMS off (ADM-20)", () => {
  it("refuses before sending and records nothing, so the row never reads «switched off» as a result", async () => {
    const { getSetting } = await import("@/lib/settings");
    vi.mocked(getSetting).mockResolvedValueOnce("false");
    const { sendChatSmsNow } = await import("@/lib/chat/unread-sms");
    expect(await sendChatSmsNow("c1", "admin1")).toEqual({ ok: false, reason: "sms_off" });
    expect(db.chatSmsNotice.upsert).not.toHaveBeenCalled();
  });
});
