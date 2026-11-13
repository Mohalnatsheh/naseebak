import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: { gender: "MALE" }, country: "JO", counts: { pro: { isPro: true } } }),
}));
vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/notifications-client", () => ({
  markPageNotificationsRead: vi.fn(),
  notifyChatChanged: vi.fn(),
  notifyChatSent: vi.fn(),
  notifyNotificationsRead: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { useChatRoom } from "@/components/chat/use-chat-room";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const at = (min: number) => new Date(Date.UTC(2026, 10, 10, 10, min)).toISOString();
const msg = (id: string, min: number, mine: boolean, read: boolean) => ({
  id, body: id, createdAt: at(min), mine, readAt: read ? at(min) : null, kind: "TEXT", media: null, replyTo: null, reactions: [],
});

function chatData(messages: ReturnType<typeof msg>[]) {
  return {
    conversation: {
      id: "c1", matchId: "mt1", matchHidden: true, status: "ACTIVE", blocked: false,
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(), canExtend: false,
      partner: { id: "u2", firstName: "سلمى", isVerified: false, isPro: false, activityLabel: null },
      lastMessage: null,
    },
    messages,
    hasMore: false,
    chatEnabled: true,
    deleteEnabled: false,
    polledAt: at(30),
  };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(messages: ReturnType<typeof msg>[], post: (url: string) => Response = () => json({})) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chats/ably-token") return json({ enabled: false });
    if (url === "/api/pro") return json({ isPro: true, canBuy: false });
    if (init?.method === "POST") return post(url);
    if (url.startsWith("/api/chats/c1?after=")) return json({ ...chatData([]), messages: [] });
    if (url.startsWith("/api/chats/c1")) return json(chatData(messages));
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A stand-in scroller, scrolled far up from the bottom */
function scrolledUp() {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 500, configurable: true });
  el.scrollTop = 600;
  return el;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", RO);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = globalThis.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useChatRoom: the jump button's count on open (audit B22)", () => {
  it("counts only the partner's messages from the unread divider on, not the ones read before", async () => {
    stubFetch([msg("p1", 1, false, true), msg("p2", 2, false, true), msg("me", 3, true, true), msg("u1", 4, false, false), msg("u2", 5, false, false)]);
    const { result } = renderHook(() => useChatRoom("c1"));
    await waitFor(() => expect(result.current.unreadFromId).toBe("u1"));
    result.current.scroller.current = scrolledUp();
    act(() => result.current.onScroll());
    expect(result.current.away).toBe(true);
    expect(result.current.unseen).toBe(2);
  });

  it("nothing unread on open: scrolling up counts nothing until something new arrives", async () => {
    stubFetch([msg("p1", 1, false, true), msg("me", 2, true, true), msg("p2", 3, false, true)]);
    const { result } = renderHook(() => useChatRoom("c1"));
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    result.current.scroller.current = scrolledUp();
    act(() => result.current.onScroll());
    expect(result.current.away).toBe(true);
    expect(result.current.unseen).toBe(0);
  });
});

describe("useChatRoom: dismissFailed", () => {
  it("removes a failed text message", async () => {
    stubFetch([msg("p1", 1, false, true)], (url) => (url.includes("/messages") ? json({ error: "x" }, 500) : json({})));
    const { result } = renderHook(() => useChatRoom("c1"));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => {
      await result.current.send("مرحبا");
    });
    await waitFor(() => expect(result.current.messages.find((m) => m.pending === "failed")).toBeTruthy());
    const failed = result.current.messages.find((m) => m.pending === "failed")!;
    act(() => result.current.dismissFailed(failed.id));
    expect(result.current.messages.map((m) => m.id)).toEqual(["p1"]);
  });

  it("removes a failed photo and releases its local preview", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:local-1", revokeObjectURL: revoke }));
    stubFetch([msg("p1", 1, false, true)], (url) => (url.includes("/media") ? json({ error: "x" }, 500) : json({})));
    const { result } = renderHook(() => useChatRoom("c1"));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => {
      await result.current.sendMedia({ kind: "IMAGE", blob: new Blob(["x"], { type: "image/jpeg" }), width: 10, height: 10 });
    });
    const failed = result.current.messages.find((m) => m.pending === "failed")!;
    expect(failed).toBeTruthy();
    act(() => result.current.dismissFailed(failed.id));
    expect(result.current.messages.map((m) => m.id)).toEqual(["p1"]);
    expect(revoke).toHaveBeenCalledWith("blob:local-1");
  });

  it("never removes a message that isn't a failed send", async () => {
    stubFetch([msg("p1", 1, false, true)]);
    const { result } = renderHook(() => useChatRoom("c1"));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => result.current.dismissFailed("p1"));
    expect(result.current.messages.map((m) => m.id)).toEqual(["p1"]);
  });
});
