import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { nextPollDelay, POLL_MAX_MS, POLL_MIN_MS, useChatChannel } from "@/components/chat/use-chat-channel";

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  // No Ably: the token route answers { enabled: false } (QA chat WC-20)
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: false }) }) as Response));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const handlers = (poll: () => Promise<boolean>) => ({ onMessage: vi.fn(), onRead: vi.fn(), onStatus: vi.fn(), poll });

describe("useChatChannel polling (QA chat WC-06)", () => {
  it("backs off while quiet and is fast again after activity", () => {
    expect(nextPollDelay(POLL_MIN_MS, false)).toBe(6000);
    expect(nextPollDelay(7000, false)).toBe(POLL_MAX_MS);
    expect(POLL_MAX_MS).toBe(8000);
    expect(nextPollDelay(POLL_MAX_MS, true)).toBe(POLL_MIN_MS);
  });

  it("{ enabled: false } falls back to polling, which slows down when nothing arrives and pauses in a hidden tab", async () => {
    const poll = vi.fn(async () => false);
    const { result } = renderHook(() => useChatChannel("c1", handlers(poll)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.mode).toBe("polling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS);
    });
    expect(poll).toHaveBeenCalledTimes(1);
    // Next one after 6 s, not 4 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(poll).toHaveBeenCalledTimes(2);

    // Hidden tab: no polls at all
    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(poll).toHaveBeenCalledTimes(2);

    // Back: fast pace again
    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS);
    });
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("wake() polls at the fast pace again", async () => {
    const poll = vi.fn(async () => false);
    const { result } = renderHook(() => useChatChannel("c1", handlers(poll)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS + 6000 + 9000);
    });
    expect(poll).toHaveBeenCalledTimes(3); // 4 s, +6 s, +9 s; next would be +13.5 s
    act(() => result.current.wake());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS);
    });
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it("wake() during a poll on its way keeps the fast pace (review minor 9)", async () => {
    let release: (v: boolean) => void = () => {};
    const poll = vi.fn(() => new Promise<boolean>((r) => (release = r)));
    const { result } = renderHook(() => useChatChannel("c1", handlers(poll)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS);
    });
    expect(poll).toHaveBeenCalledTimes(1);
    act(() => result.current.wake());
    await act(async () => {
      release(false);
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS);
    });
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("wake() every few seconds (my own typing) never postpones the poll that is due: it still comes within 4 s", async () => {
    const poll = vi.fn(async () => false);
    const { result } = renderHook(() => useChatChannel("c1", handlers(poll)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MIN_MS + 6000 + 9000);
    });
    expect(poll).toHaveBeenCalledTimes(3);
    // Typing: a wake every 3 s (the typing signal's pace). Polls keep coming at the fast pace, not pushed back each time
    for (let i = 0; i < 4; i++) {
      act(() => result.current.wake());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
    }
    expect(poll.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
