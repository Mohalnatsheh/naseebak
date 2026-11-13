import { describe, it, expect, vi } from "vitest";
import {
  SWIPE_REPLY_PX,
  swipeReplyStep,
  enterSends,
  unreadStripLabel,
  selectionTools,
} from "@/components/chat/wa-chat-logic";
import type { UiMessage } from "@/components/chat/chat-utils";
import type { MessageActions } from "@/components/chat/message-menu";

const msg = (o: Partial<UiMessage> = {}): UiMessage => ({
  id: "m1",
  body: "مرحبا",
  createdAt: "2026-11-13T10:00:00.000Z",
  mine: false,
  readAt: null,
  kind: "TEXT",
  media: null,
  replyTo: null,
  reactions: [],
  ...o,
});

const actions = (o: Partial<MessageActions> = {}): MessageActions => ({
  canInteract: true,
  onReply: vi.fn(),
  onReact: vi.fn(),
  onReport: vi.fn(),
  onOpenQuote: vi.fn(),
  onOpenPhoto: vi.fn(),
  ...o,
});

describe("swipeReplyStep", () => {
  it("threshold is 64", () => expect(SWIPE_REPLY_PX).toBe(64));
  it("rtl partner (left side): inward is right", () => {
    expect(swipeReplyStep({ dx: 70, dy: 5, rtl: true, mine: false })).toBe("reply");
    expect(swipeReplyStep({ dx: 30, dy: 2, rtl: true, mine: false })).toBe("track");
    expect(swipeReplyStep({ dx: 70, dy: 80, rtl: true, mine: false })).toBe("none");
    expect(swipeReplyStep({ dx: -70, dy: 0, rtl: true, mine: false })).toBe("none");
    expect(swipeReplyStep({ dx: 64, dy: 0, rtl: true, mine: false })).toBe("reply");
  });
  it("rtl mine (right side): inward is left", () => {
    expect(swipeReplyStep({ dx: -70, dy: 5, rtl: true, mine: true })).toBe("reply");
    expect(swipeReplyStep({ dx: -30, dy: 2, rtl: true, mine: true })).toBe("track");
    expect(swipeReplyStep({ dx: -70, dy: 80, rtl: true, mine: true })).toBe("none");
    expect(swipeReplyStep({ dx: 70, dy: 0, rtl: true, mine: true })).toBe("none");
  });
  it("ltr is mirrored", () => {
    expect(swipeReplyStep({ dx: -70, dy: 5, rtl: false, mine: false })).toBe("reply");
    expect(swipeReplyStep({ dx: 30, dy: 2, rtl: false, mine: true })).toBe("track");
    expect(swipeReplyStep({ dx: 70, dy: 0, rtl: false, mine: false })).toBe("none");
    expect(swipeReplyStep({ dx: -70, dy: 0, rtl: false, mine: true })).toBe("none");
  });
  it("no movement is none", () => {
    expect(swipeReplyStep({ dx: 0, dy: 0, rtl: true, mine: false })).toBe("none");
  });
});

describe("enterSends", () => {
  it("rules", () => {
    expect(enterSends({ coarsePointer: true, shiftKey: false, composing: false })).toBe(false);
    expect(enterSends({ coarsePointer: false, shiftKey: false, composing: false })).toBe(true);
    expect(enterSends({ coarsePointer: false, shiftKey: true, composing: false })).toBe(false);
    expect(enterSends({ coarsePointer: false, shiftKey: false, composing: true })).toBe(false);
  });
});

describe("unreadStripLabel", () => {
  it("forms", () => {
    expect(unreadStripLabel(1)).toBe("رسالة غير مقروءة");
    expect(unreadStripLabel(2)).toBe("رسالتان غير مقروءتين");
    expect(unreadStripLabel(7)).toBe("7 رسائل غير مقروءة");
  });
});

describe("selectionTools", () => {
  it("deleted-for-everyone partner message: only report", () => {
    const t = selectionTools(msg({ deleted: true }), actions());
    expect(t).toMatchObject({ react: false, reply: false, copy: false, report: true });
  });
  it("my pending message: nothing", () => {
    const t = selectionTools(msg({ mine: true, pending: "sending" }), actions());
    expect(t).toEqual({ react: false, reply: false, copy: false, delete: false, report: false });
  });
  it("cannot interact: copy stays", () => {
    const t = selectionTools(msg(), actions({ canInteract: false }));
    expect(t).toMatchObject({ react: false, reply: false, copy: true });
  });
  it("delete follows the delete mode", () => {
    const on = actions({ deleteMode: "use", onDelete: vi.fn() });
    expect(selectionTools(msg(), on).delete).toBe(true);
    expect(selectionTools(msg(), actions()).delete).toBe(false);
  });
});
