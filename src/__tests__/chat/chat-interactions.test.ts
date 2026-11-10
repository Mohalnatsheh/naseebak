import { describe, expect, it, vi } from "vitest";
import {
  holdReleaseSends,
  CANCEL_SLIDE_PX,
  LOCK_SLIDE_PX,
  applyMyReaction,
  createThrottle,
  groupReactions,
  holdGesture,
  nextReaction,
  quoteOf,
  applyReactionUpdates,
  emptyChatHint,
  reactionsSinceFor,
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

describe("reply quote", () => {
  it("a quote for the strip and the optimistic bubble: one line, or the media label", () => {
    expect(quoteOf(msg({ body: "سطر\nثانٍ", mine: true }))).toEqual({ id: "m1", mine: true, kind: "TEXT", snippet: "سطر ثانٍ" });
    expect(quoteOf(msg({ kind: "IMAGE", body: "📷 صورة" })).snippet).toBe("📷 صورة");
    expect(quoteOf(msg({ kind: "VOICE", body: "x" })).snippet).toBe("🎤 رسالة صوتية");
    expect(Array.from(quoteOf(msg({ body: "ب".repeat(200) })).snippet)).toHaveLength(80);
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

describe("polling: reactions on older messages", () => {
  it("reactionsSince: the last answer's polledAt less 5 s (overlap), none before the first answer", () => {
    expect(reactionsSinceFor(null)).toBeNull();
    expect(reactionsSinceFor("2026-11-10T10:00:10.000Z")).toBe("2026-11-10T10:00:05.000Z");
  });

  it("applies each update (all of a message's reactions; empty removes the chips), leaves unsent bubbles alone", () => {
    const list = [msg({ id: "a" }), msg({ id: "b", reactions: [{ emoji: "👍", mine: true }] }), msg({ id: "tmp", pending: "sending" })];
    const out = applyReactionUpdates(list, [
      { messageId: "a", reactions: [{ emoji: "❤️", mine: false }] },
      { messageId: "b", reactions: [] },
      { messageId: "tmp", reactions: [{ emoji: "😊", mine: false }] },
      { messageId: "not-loaded", reactions: [{ emoji: "🤲", mine: false }] },
    ]);
    expect(out.changed).toBe(true);
    expect(out.messages.map((m) => m.reactions)).toEqual([[{ emoji: "❤️", mine: false }], [], []]);
  });

  it("nothing different: the same list back and changed false (no re-render, no fast pace)", () => {
    const list = [msg({ id: "a", reactions: [{ emoji: "❤️", mine: false }] })];
    const out = applyReactionUpdates(list, [{ messageId: "a", reactions: [{ emoji: "❤️", mine: false }] }]);
    expect(out).toEqual({ messages: list, changed: false });
    expect(out.messages).toBe(list);
    expect(applyReactionUpdates(list, undefined).messages).toBe(list);
  });
});

describe("the empty chat hint", () => {
  it("points to the suggestions below only when they show, gendered", () => {
    expect(emptyChatHint({ female: false, starters: true })).toBe("ابدأ المحادثة برسالة، أو اختر أحد الاقتراحات بالأسفل.");
    expect(emptyChatHint({ female: true, starters: true })).toBe("ابدئي المحادثة برسالة، أو اختاري أحد الاقتراحات بالأسفل.");
    expect(emptyChatHint({ female: false, starters: false })).toBe("ابدأ المحادثة برسالة.");
    expect(emptyChatHint({ female: true, starters: false })).toBe("ابدئي المحادثة برسالة.");
  });
});

describe("holdReleaseSends (final review minor 3: the app's holdLeaveDistance)", () => {
  it("a release near the mic sends; one far away pauses and waits", () => {
    expect(holdReleaseSends({ dx: 10, dy: -20 })).toBe(true);
    expect(holdReleaseSends({ dx: 72, dy: 0 })).toBe(true);
    expect(holdReleaseSends({ dx: 60, dy: 60 })).toBe(false);
    expect(holdReleaseSends({ dx: 0, dy: 120 })).toBe(false);
  });
});
