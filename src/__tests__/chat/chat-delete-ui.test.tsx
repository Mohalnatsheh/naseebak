import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";

const dashboard = vi.hoisted(() => ({ value: { profile: { gender: "MALE" }, country: "JO", counts: { pro: { isPro: false } } } as Record<string, unknown> }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dashboard.value }));
vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/notifications-client", () => ({
  markPageNotificationsRead: vi.fn(),
  notifyChatChanged: vi.fn(),
  notifyChatSent: vi.fn(),
  notifyNotificationsRead: vi.fn(),
}));
vi.mock("@/components/payments/pro-offer-dialog", () => ({ ProOfferDialog: () => null }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }));

// A stand-in Ably client: connects at once and hands the channel subscriber to the test
const subscriber: { fn: ((msg: { name: string; data: unknown }) => void) | null } = { fn: null };
vi.mock("ably", () => ({
  Realtime: class {
    connection = { on: (cb: (c: { current: string }) => void) => cb({ current: "connected" }) };
    channels = { get: () => ({ subscribe: async (fn: (msg: { name: string; data: unknown }) => void) => void (subscriber.fn = fn) }) };
    close() {}
  },
}));

import { MessageBubble } from "@/components/chat/message-bubble";
import type { MessageActions } from "@/components/chat/message-menu";
import type { UiMessage } from "@/components/chat/chat-utils";
import { ChatRoom } from "@/components/chat/chat-room";
import { useChatDelete, useHeldWhileClosed, type DeleteEntryMode } from "@/components/chat/delete-dialogs";
import { useEffect, useRef, useState } from "react";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", RO);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = globalThis.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { escape: (s: string) => s });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  subscriber.fn = null;
  dashboard.value = { profile: { gender: "MALE" }, country: "JO", counts: { pro: { isPro: false } } };
});

const message = (extra: Partial<UiMessage> = {}): UiMessage => ({
  id: "m1",
  body: "كيف حالك؟",
  createdAt: new Date(2026, 10, 10, 13, 5).toISOString(),
  mine: false,
  readAt: null,
  kind: "TEXT",
  media: null,
  replyTo: null,
  reactions: [],
  ...extra,
});

function actions(extra: Partial<MessageActions> = {}): MessageActions {
  return {
    canInteract: true,
    onReply: vi.fn(),
    onReact: vi.fn(),
    onReport: vi.fn(),
    onOpenQuote: vi.fn(),
    onOpenPhoto: vi.fn(),
    deleteMode: "use",
    canDeleteForEveryone: true,
    onDelete: vi.fn(),
    ...extra,
  };
}

const openMenuOn = (text: string) => fireEvent.contextMenu(screen.getByText(text).parentElement!);
const item = (name: string) => within(screen.getByRole("menu")).queryByRole("menuitem", { name: new RegExp(name) });

describe("message menu: delete entries", () => {
  it("mode use, my message: «حذف لديّ» and «حذف لدى الجميع»", () => {
    const a = actions();
    render(<MessageBubble message={message({ mine: true })} tail actions={a} />);
    openMenuOn("كيف حالك؟");
    expect(item("حذف لديّ")).not.toBeNull();
    fireEvent.click(item("حذف لدى الجميع")!);
    expect(a.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "everyone");
  });

  it("mode use, the partner's message: only «حذف لديّ»", () => {
    const a = actions();
    render(<MessageBubble message={message()} tail actions={a} />);
    openMenuOn("كيف حالك؟");
    expect(item("حذف لدى الجميع")).toBeNull();
    fireEvent.click(item("حذف لديّ")!);
    expect(a.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "me");
  });

  it("«حذف لدى الجميع» is absent when the chat can't send", () => {
    render(<MessageBubble message={message({ mine: true })} tail actions={actions({ canDeleteForEveryone: false, canInteract: false })} />);
    openMenuOn("كيف حالك؟");
    expect(item("حذف لديّ")).not.toBeNull();
    expect(item("حذف لدى الجميع")).toBeNull();
  });

  it("the partner's trace: «إبلاغ عن الرسالة» and «حذف لديّ», nothing else", () => {
    render(<MessageBubble message={message({ deleted: true, body: "تم حذف الرسالة" })} tail actions={actions()} />);
    openMenuOn("تم حذف الرسالة");
    expect(item("إبلاغ عن الرسالة")).not.toBeNull();
    expect(item("حذف لديّ")).not.toBeNull();
    expect(item("رد")).toBeNull();
    expect(item("نسخ")).toBeNull();
    expect(item("تفاعل")).toBeNull();
    expect(item("حذف لدى الجميع")).toBeNull();
  });

  it("mode null: no delete entries", () => {
    render(<MessageBubble message={message({ mine: true })} tail actions={actions({ deleteMode: null })} />);
    openMenuOn("كيف حالك؟");
    expect(item("حذف")).toBeNull();
  });
});

// ── The room: upsell, header clear, live events ─────────────────────────────────────────────────────────────────

type Opts = {
  isPro?: boolean; canBuy?: boolean; deleteEnabled?: boolean; status?: string; blocked?: boolean; clear?: Response; del?: Response;
  hasMore?: boolean; poll?: Record<string, unknown>;
};
const T1 = "2026-11-10T10:00:00.000Z";
const T2 = "2026-11-10T10:05:00.000Z";

function chatData(o: Opts) {
  return {
    conversation: {
      id: "c1",
      matchId: "mt1",
      matchHidden: true,
      status: o.status ?? "ACTIVE",
      blocked: !!o.blocked,
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      canExtend: false,
      partner: { id: "u2", firstName: "سلمى", isVerified: false, isPro: false, activityLabel: null },
      lastMessage: null,
    },
    messages: [
      { id: "a", body: "رسالتي", createdAt: T1, mine: true, readAt: T2, kind: "TEXT", media: null, replyTo: null, reactions: [] },
      { id: "b", body: "رسالتها", createdAt: T2, mine: false, readAt: T2, kind: "TEXT", media: null, replyTo: null, reactions: [] },
    ],
    hasMore: !!o.hasMore,
    chatEnabled: true,
    deleteEnabled: o.deleteEnabled ?? true,
    clearedBefore: null,
    polledAt: T2,
  };
}

function setup(o: Opts = {}) {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chats/ably-token") return json({ enabled: true, keyName: "k" });
    if (url === "/api/pro") return json({ isPro: !!o.isPro, canBuy: !!o.canBuy });
    if (url.startsWith("/api/matches/")) return json({}, 404);
    if (url === "/api/chats/c1/clear") return o.clear ?? json({ clearedBefore: new Date().toISOString() });
    if (url.includes("/delete")) return o.del ?? json({ ok: true });
    if (url.startsWith("/api/chats/c1/read")) return json({});
    if (url.startsWith("/api/chats/c1?after=") && o.poll) return json({ ...chatData(o), messages: [], ...o.poll });
    if (url.startsWith("/api/chats/c1?before=")) return json({ ...chatData(o), messages: [], hasMore: false });
    if (url.startsWith("/api/chats/c1") && (!init || init.method === undefined)) return json(chatData(o));
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ChatRoom conversationId="c1" />);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof setup>, part: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).includes(part) && (init as RequestInit | undefined)?.method === "POST");

async function ready() {
  await screen.findByText("رسالتها");
  // The Pro state comes in its own request
  await act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

const openHeader = async () => {
  const trigger = screen.getByRole("button", { name: "خيارات المحادثة" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  await screen.findByRole("menu");
};

describe("chat room: delete for Pro", () => {
  it("«مسح المحادثة» offers «مسح لديّ» / «مسح لدى الجميع», each confirmed before it posts", async () => {
    const fetchMock = setup({ isPro: true });
    await ready();
    await openHeader();
    fireEvent.click(item("مسح المحادثة")!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "مسح لدى الجميع" }));
    expect(await screen.findByText("ستُمسح كل رسائل هذه المحادثة لديك ولدى الطرف الآخر. تبقى المحادثة مفتوحة ويمكنكما متابعة الكتابة.")).toBeTruthy();
    expect(posts(fetchMock, "/clear")).toHaveLength(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "مسح لدى الجميع" }));
    await waitFor(() => expect(posts(fetchMock, "/clear")).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchMock, "/clear")[0][1]!.body))).toEqual({ scope: "everyone" });
    await waitFor(() => expect(screen.queryByText("رسالتها")).toBeNull());
    expect(screen.queryByText("رسالتي")).toBeNull();
  });

  it("«مسح لديّ» has its own confirm text", async () => {
    const fetchMock = setup({ isPro: true });
    await ready();
    await openHeader();
    fireEvent.click(item("مسح المحادثة")!);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "مسح لديّ" }));
    expect(await screen.findByText("ستُمسح الرسائل من عندك فقط، ويبقى كل شيء لدى الطرف الآخر.")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "مسح لديّ" }));
    await waitFor(() => expect(posts(fetchMock, "/clear")).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchMock, "/clear")[0][1]!.body))).toEqual({ scope: "me" });
  });

  it("a closed chat: «مسح لدى الجميع» is absent", async () => {
    setup({ isPro: true, status: "EXPIRED" });
    await ready();
    await openHeader();
    fireEvent.click(item("مسح المحادثة")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "مسح لديّ" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "مسح لدى الجميع" })).toBeNull();
  });

  it("«حذف لدى الجميع» on my message asks first, then shows the trace", async () => {
    const fetchMock = setup({ isPro: true });
    await ready();
    openMenuOn("رسالتي");
    fireEvent.click(item("حذف لدى الجميع")!);
    expect(await screen.findByText("ستُحذف الرسالة لديك ولدى الطرف الآخر، ويظهر مكانها «تم حذف الرسالة».")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "حذف لدى الجميع" }));
    await waitFor(() => expect(posts(fetchMock, "/messages/a/delete")).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchMock, "/messages/a/delete")[0][1]!.body))).toEqual({ scope: "everyone" });
    expect(await screen.findByText("تم حذف الرسالة")).toBeTruthy();
    expect(screen.queryByText("رسالتي")).toBeNull();
  });

  it("a refused «حذف لديّ» puts the message back with the server's reason", async () => {
    const del = new Response(JSON.stringify({ error: "لا يمكن حذف هذه الرسالة", code: "NOT_ALLOWED" }), { status: 403 });
    setup({ isPro: true, del });
    await ready();
    openMenuOn("رسالتها");
    fireEvent.click(item("حذف لديّ")!);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("لا يمكن حذف هذه الرسالة"));
    expect(screen.getByText("رسالتها")).toBeTruthy();
  });

  it("PRO_REQUIRED from the server opens the upsell and reloads the Pro state", async () => {
    const del = new Response(JSON.stringify({ error: "حذف الرسائل ومسح المحادثة متاح لأعضاء Pro", code: "PRO_REQUIRED" }), { status: 403 });
    const fetchMock = setup({ isPro: true, del });
    await ready();
    const proCalls = fetchMock.mock.calls.filter(([u]) => u === "/api/pro").length;
    openMenuOn("رسالتها");
    fireEvent.click(item("حذف لديّ")!);
    expect(await screen.findByRole("link", { name: /Pro/ })).toBeTruthy();
    expect(screen.getByText("رسالتها")).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === "/api/pro").length).toBe(proCalls + 1));
  });

  it("mode upsell: the entries show, a tap opens the upsell (link to /dashboard/pro) and sends nothing", async () => {
    const fetchMock = setup({ isPro: false, canBuy: true });
    await ready();
    openMenuOn("رسالتي");
    expect(item("حذف لديّ")).not.toBeNull();
    fireEvent.click(item("حذف لدى الجميع")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("حذف الرسائل ومسح المحادثة متاح لأعضاء Pro")).toBeTruthy();
    expect(within(dialog).getByRole("link").getAttribute("href")).toBe("/dashboard/pro");
    expect(posts(fetchMock, "/delete")).toHaveLength(0);
    expect(screen.getByText("رسالتي")).toBeTruthy();
  });

  it("«مسح المحادثة» carries the Pro lock in upsell mode only (like the message menu)", async () => {
    setup({ isPro: false, canBuy: true });
    await ready();
    await openHeader();
    expect(within(item("مسح المحادثة")!).getByLabelText("ميزة Pro")).toBeTruthy();
    cleanup();
    setup({ isPro: true });
    await ready();
    await openHeader();
    expect(within(item("مسح المحادثة")!).queryByLabelText("ميزة Pro")).toBeNull();
  });

  it("mode upsell: «مسح المحادثة» opens the upsell and sends nothing", async () => {
    const fetchMock = setup({ isPro: false, canBuy: true });
    await ready();
    await openHeader();
    fireEvent.click(item("مسح المحادثة")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link").getAttribute("href")).toBe("/dashboard/pro");
    expect(posts(fetchMock, "/clear")).toHaveLength(0);
  });

  it("mode null (switch off, or no Pro to buy): no delete entries anywhere", async () => {
    setup({ isPro: true, deleteEnabled: false });
    await ready();
    openMenuOn("رسالتي");
    expect(item("حذف")).toBeNull();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await openHeader();
    expect(item("مسح المحادثة")).toBeNull();
  });

  it("live: a `deleted` event shows the trace; a `cleared` event drops everything up to its time", async () => {
    setup({ isPro: false });
    await ready();
    await waitFor(() => expect(subscriber.fn).not.toBeNull());
    act(() => subscriber.fn!({ name: "deleted", data: { messageId: "b" } }));
    expect(screen.getByText("تم حذف الرسالة")).toBeTruthy();
    expect(screen.queryByText("رسالتها")).toBeNull();
    act(() => subscriber.fn!({ name: "cleared", data: { before: T1 } }));
    expect(screen.queryByText("رسالتي")).toBeNull();
    expect(screen.getByText("تم حذف الرسالة")).toBeTruthy();
  });

  it("a poll whose `deletedIds` names a message not loaded changes nothing (no row, same load-older cursor)", async () => {
    const fetchMock = setup({ isPro: true, hasMore: true, poll: { deletedIds: ["older-unloaded"], hiddenIds: [] } });
    await ready();
    const before = screen.getByRole("log").querySelectorAll("[data-message-id]");
    expect([...before].map((el) => el.getAttribute("data-message-id"))).toEqual(["a", "b"]);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/chats/c1?after="))).toBe(true);
    const after = screen.getByRole("log").querySelectorAll("[data-message-id]");
    expect([...after].map((el) => el.getAttribute("data-message-id"))).toEqual(["a", "b"]);
    expect(screen.queryByText("تم حذف الرسالة")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تحميل رسائل أقدم" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/chats/c1?before="))).toBe(true));
    const olderUrl = String(fetchMock.mock.calls.find(([u]) => String(u).startsWith("/api/chats/c1?before="))![0]);
    expect(olderUrl).toBe(`/api/chats/c1?before=${encodeURIComponent(T1)}`);
  });
});

// ── requestDeleteChoice: one dialog, no second confirm (the WhatsApp-style selection bar) ─────────────────────

function ChoiceHarness({ mode, canEveryone, target }: { mode: DeleteEntryMode; canEveryone: boolean; target: UiMessage }) {
  const [messages, setMessages] = useState<UiMessage[]>([target]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const hasMoreRef = useRef(false);
  const d = useChatDelete({
    conversationId: "c1",
    mode,
    canEveryone,
    messagesRef,
    setMessages,
    setHasMore: () => {},
    hasMoreRef,
    onProRequired: () => {},
    onRefused: () => {},
  });
  return (
    <>
      <button type="button" onClick={() => d.requestDeleteChoice(target)}>
        اختيار الحذف
      </button>
      {d.dialogs}
    </>
  );
}

function choiceSetup(mode: DeleteEntryMode, target: UiMessage, canEveryone = true) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ChoiceHarness mode={mode} canEveryone={canEveryone} target={target} />);
  fireEvent.click(screen.getByRole("button", { name: "اختيار الحذف" }));
  return fetchMock;
}

describe("requestDeleteChoice", () => {
  it("my message in an open chat: both choices; «حذف لدى الجميع» posts once with no second dialog", async () => {
    const fetchMock = choiceSetup("use", message({ mine: true }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("حذف الرسالة؟")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "حذف لديّ" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "إلغاء" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف لدى الجميع" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chats/c1/messages/m1/delete");
    expect(JSON.parse(String(init.body))).toEqual({ scope: "everyone" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("«حذف لديّ» posts scope me", async () => {
    const fetchMock = choiceSetup("use", message({ mine: true }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "حذف لديّ" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ scope: "me" });
  });

  it("the partner's message, my closed chat, or my trace: only «حذف لديّ»", async () => {
    for (const [target, open] of [
      [message(), true],
      [message({ mine: true }), false],
      [message({ mine: true, deleted: true }), true],
    ] as const) {
      choiceSetup("use", target, open);
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("button", { name: "حذف لديّ" })).toBeTruthy();
      expect(within(dialog).queryByRole("button", { name: "حذف لدى الجميع" })).toBeNull();
      cleanup();
    }
  });

  it("the choice dialog's text holds while it fades out (useHeldWhileClosed)", () => {
    const { result, rerender } = renderHook(({ v, open }) => useHeldWhileClosed(v, open), { initialProps: { v: true, open: true } });
    expect(result.current).toBe(true);
    // closing: the ask is gone, so «لدى الجميع» would read false
    rerender({ v: false, open: false });
    expect(result.current).toBe(true);
    // the next open shows the new question
    rerender({ v: false, open: true });
    expect(result.current).toBe(false);
    rerender({ v: true, open: false });
    expect(result.current).toBe(false);
  });

  it("«إلغاء» closes and sends nothing", async () => {
    const fetchMock = choiceSetup("use", message({ mine: true }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upsell: opens the Pro offer and sends nothing", async () => {
    const fetchMock = choiceSetup("upsell", message({ mine: true }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("حذف الرسائل ومسح المحادثة متاح لأعضاء Pro")).toBeTruthy();
    expect(within(dialog).getByRole("link").getAttribute("href")).toBe("/dashboard/pro");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
