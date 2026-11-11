import { describe, it, expect } from "vitest";
import {
  viewerCutoff,
  visibleMessageWhere,
  hiddenForViewer,
  isDeleteScope,
  deleteEntryMode,
  DELETED_TRACE,
} from "@/lib/chat/visibility";

describe("chat visibility", () => {
  it("has the trace text", () => {
    expect(DELETED_TRACE).toBe("تم حذف الرسالة");
  });

  it("viewerCutoff", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-02-01T00:00:00Z");
    expect(viewerCutoff(null, null)).toBeNull();
    expect(viewerCutoff(a, null)).toEqual(a);
    expect(viewerCutoff(null, b)).toEqual(b);
    expect(viewerCutoff(a, b)).toEqual(b);
    expect(viewerCutoff(b, a)).toEqual(b);
  });

  it("visibleMessageWhere", () => {
    expect(visibleMessageWhere("c", "u", null)).toEqual({
      conversationId: "c",
      hides: { none: { userId: "u" } },
    });
    const d = new Date("2026-01-01T00:00:00Z");
    expect(visibleMessageWhere("c", "u", d)).toEqual({
      conversationId: "c",
      hides: { none: { userId: "u" } },
      createdAt: { gt: d },
    });
  });

  it("hiddenForViewer", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-01-02T00:00:00Z");
    expect(hiddenForViewer({ createdAt: later, hides: [{ userId: "u" }] }, "u", null)).toBe(true);
    expect(hiddenForViewer({ createdAt: later, hides: [{ userId: "x" }] }, "u", null)).toBe(false);
    expect(hiddenForViewer({ createdAt: later }, "u", null)).toBe(false);
    expect(hiddenForViewer({ createdAt: d }, "u", d)).toBe(true);
    expect(hiddenForViewer({ createdAt: later }, "u", d)).toBe(false);
  });

  it("isDeleteScope", () => {
    expect(isDeleteScope("me")).toBe(true);
    expect(isDeleteScope("everyone")).toBe(true);
    expect(isDeleteScope("all")).toBe(false);
    expect(isDeleteScope(undefined)).toBe(false);
  });

  it("deleteEntryMode", () => {
    expect(deleteEntryMode({ deleteEnabled: false, isPro: true, canBuy: true })).toBeNull();
    expect(deleteEntryMode({ deleteEnabled: true, isPro: true, canBuy: false })).toBe("use");
    expect(deleteEntryMode({ deleteEnabled: true, isPro: false, canBuy: true })).toBe("upsell");
    expect(deleteEntryMode({ deleteEnabled: true, isPro: false, canBuy: false })).toBeNull();
  });
});
