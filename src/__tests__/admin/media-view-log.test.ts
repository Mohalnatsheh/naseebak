import { describe, it, expect } from "vitest";
import { shouldLogMediaView } from "@/lib/admin/media-view-log";

describe("shouldLogMediaView (ADM-28)", () => {
  it("logs the first fetch, not the Range requests that follow within a minute", () => {
    const t = 1_000_000;
    expect(shouldLogMediaView("a1", "m1", t)).toBe(true);
    expect(shouldLogMediaView("a1", "m1", t + 500)).toBe(false);
    expect(shouldLogMediaView("a1", "m1", t + 59_000)).toBe(false);
  });
  it("logs again after a minute, and per admin and message", () => {
    const t = 2_000_000;
    expect(shouldLogMediaView("a2", "m2", t)).toBe(true);
    expect(shouldLogMediaView("a3", "m2", t)).toBe(true);
    expect(shouldLogMediaView("a2", "m3", t)).toBe(true);
    expect(shouldLogMediaView("a2", "m2", t + 61_000)).toBe(true);
  });
});
