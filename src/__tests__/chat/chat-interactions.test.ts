import { describe, expect, it, vi } from "vitest";
import {
  CANCEL_SLIDE_PX,
  LOCK_SLIDE_PX,
  applyMyReaction,
  createThrottle,
  groupReactions,
  holdGesture,
  nextReaction,
  quoteOf,
  reportDetailsFor,
  showStarters,
} from "@/components/chat/chat-interactions";
import type { UiMessage } from "@/components/chat/chat-utils";

const msg = (extra: Partial<UiMessage> = {}): UiMessage => ({
  id: "m1",
  body: "مرحبا",
  createdAt: "2026-11-10T10:00:00.000Z",
  mine: false,
  readAt: null,
  kind: "TEXT",
  media: null,
  replyTo: null,
  reactions: [],
  ...extra,
});

describe("holdGesture: hold to record", () => {
  it("RTL: sliding right (towards the start edge) far enough cancels", () => {
    expect(holdGesture({ dx: CANCEL_SLIDE_PX + 1, dy: 0, rtl: true })).toBe("cancel");
    expect(holdGesture({ dx: -(CANCEL_SLIDE_PX + 1), dy: 0, rtl: true })).toBe("hold");
  });

  it("LTR: the start edge is on the left", () => {
    expect(holdGesture({ dx: -(CANCEL_SLIDE_PX + 1), dy: 0, rtl: false })).toBe("cancel");
    expect(holdGesture({ dx: CANCEL_SLIDE_PX + 1, dy: 0, rtl: false })).toBe("hold");
  });

  it("sliding up far enough locks; a small wobble keeps holding", () => {
    expect(holdGesture({ dx: 0, dy: -(LOCK_SLIDE_PX + 1), rtl: true })).toBe("lock");
    expect(holdGesture({ dx: 8, dy: -10, rtl: true })).toBe("hold");
    expect(holdGesture({ dx: 0, dy: 200, rtl: true })).toBe("hold");
  });

  it("the stronger direction wins when both pass", () => {
    expect(holdGesture({ dx: CANCEL_SLIDE_PX + 40, dy: -(LOCK_SLIDE_PX + 1), rtl: true })).toBe("cancel");
    expect(holdGesture({ dx: CANCEL_SLIDE_PX + 1, dy: -(LOCK_SLIDE_PX + 60), rtl: true })).toBe("lock");
  });
});

describe("reactions", () => {
  it("groups by emoji with a count and whether one is mine", () => {
    expect(
      groupReactions([
        { emoji: "❤️", mine: false },
        { emoji: "👍", mine: true },
        { emoji: "❤️", mine: true },
      ])
    ).toEqual([
      { emoji: "❤️", count: 2, mine: true },
      { emoji: "👍", count: 1, mine: true },
    ]);
  });

  it("the same emoji again removes mine; another replaces it", () => {
    const reactions = [{ emoji: "❤️", mine: true }, { emoji: "👍", mine: false }];
    expect(nextReaction(reactions, "❤️")).toBeNull();
    expect(nextReaction(reactions, "😊")).toBe("😊");
    expect(nextReaction([], "🤲")).toBe("🤲");
  });

  it("applies mine optimistically, one per member, the other person's untouched", () => {
    const reactions = [{ emoji: "❤️", mine: true }, { emoji: "👍", mine: false }];
    expect(applyMyReaction(reactions, "😊")).toEqual([{ emoji: "👍", mine: false }, { emoji: "😊", mine: true }]);
    expect(applyMyReaction(reactions, null)).toEqual([{ emoji: "👍", mine: false }]);
  });
});

describe("reply quote and report details", () => {
  it("a quote for the strip and the optimistic bubble: one line, or the media label", () => {
    expect(quoteOf(msg({ body: "سطر\nثانٍ", mine: true }))).toEqual({ id: "m1", mine: true, kind: "TEXT", snippet: "سطر ثانٍ" });
    expect(quoteOf(msg({ kind: "IMAGE", body: "📷 صورة" })).snippet).toBe("📷 صورة");
    expect(quoteOf(msg({ kind: "VOICE", body: "x" })).snippet).toBe("🎤 رسالة صوتية");
    expect(Array.from(quoteOf(msg({ body: "ب".repeat(200) })).snippet)).toHaveLength(80);
  });

  it("the report prefill names the message (same words as the app)", () => {
    expect(reportDetailsFor(msg({ body: "نص الرسالة" }))).toBe("بخصوص الرسالة: «نص الرسالة»");
  });
});

describe("conversation starters", () => {
  it("show in an open chat while I have sent nothing", () => {
    const starters = ["سؤال"];
    expect(showStarters({ starters, canSend: true, messages: [] })).toBe(true);
    expect(showStarters({ starters, canSend: true, messages: [msg()] })).toBe(true);
    expect(showStarters({ starters, canSend: true, messages: [msg({ mine: true })] })).toBe(false);
    expect(showStarters({ starters, canSend: false, messages: [] })).toBe(false);
    expect(showStarters({ starters: [], canSend: true, messages: [] })).toBe(false);
  });
});

describe("createThrottle: typing signals", () => {
  it("at most one call per window", () => {
    let now = 0;
    const fn = vi.fn();
    const throttled = createThrottle(fn, 3000, () => now);
    throttled();
    throttled();
    now = 2999;
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    now = 3000;
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reset() lets the next call through (after sending a message)", () => {
    let now = 0;
    const fn = vi.fn();
    const throttled = createThrottle(fn, 3000, () => now);
    throttled();
    throttled.reset();
    now = 10;
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
