import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// A stand-in Ably client: connects at once and hands the channel subscriber to the test
const subscriber: { fn: ((msg: { name: string; data: unknown }) => void) | null } = { fn: null };
vi.mock("ably", () => ({
  Realtime: class {
    connection = { on: (cb: (c: { current: string }) => void) => cb({ current: "connected" }) };
    channels = { get: () => ({ subscribe: async (fn: (msg: { name: string; data: unknown }) => void) => void (subscriber.fn = fn) }) };
    close() {}
  },
}));

import { useChatChannel } from "@/components/chat/use-chat-channel";

afterEach(() => {
  vi.unstubAllGlobals();
  subscriber.fn = null;
});

describe("useChatChannel: live reaction and typing events", () => {
  it("passes `reaction` and `typing` to their handlers (and still `message`)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: true, keyName: "k" }) }) as Response));
    const handlers = { onMessage: vi.fn(), onRead: vi.fn(), onStatus: vi.fn(), onReaction: vi.fn(), onTyping: vi.fn(), poll: vi.fn(async () => false) };
    renderHook(() => useChatChannel("c1", handlers));
    await act(async () => {
      for (let i = 0; i < 10 && !subscriber.fn; i++) await new Promise((r) => setTimeout(r, 0));
    });
    expect(subscriber.fn).not.toBeNull();
    const reaction = { messageId: "m1", reactions: [{ emoji: "❤️", userId: "u2" }] };
    subscriber.fn!({ name: "reaction", data: reaction });
    subscriber.fn!({ name: "typing", data: { userId: "u2" } });
    expect(handlers.onReaction).toHaveBeenCalledWith(reaction);
    expect(handlers.onTyping).toHaveBeenCalledWith({ userId: "u2" });
    expect(handlers.onMessage).not.toHaveBeenCalled();
  });
});
