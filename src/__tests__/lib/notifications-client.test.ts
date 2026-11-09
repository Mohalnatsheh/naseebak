import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { markPageNotificationsRead } from "@/lib/notifications-client";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ marked: 0 }) })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("markPageNotificationsRead (QA cycle WC-07)", () => {
  it("marks a page once, even when it mounts twice while loading", () => {
    markPageNotificationsRead("/dashboard/x1");
    markPageNotificationsRead("/dashboard/x1");
    expect(fetch).toHaveBeenCalledTimes(1);
    markPageNotificationsRead("/dashboard/x2");
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(6000);
    markPageNotificationsRead("/dashboard/x1");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
