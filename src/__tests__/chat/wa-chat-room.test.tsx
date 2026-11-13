import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: { gender: "MALE" }, country: "JO", counts: { pro: { isPro: false } } }),
}));
vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/payments/pro-offer-dialog", () => ({ ProOfferDialog: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { WaChatRoom } from "@/components/chat/wa-chat-room";
import type { ChatRoomModel, ChatRoomReady } from "@/components/chat/use-chat-room";
import type { UiMessage } from "@/components/chat/chat-utils";
import type { MessageActions } from "@/components/chat/message-menu";
import { endedChatNote } from "@/components/chat/chat-look";

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = (min: number) => new Date(Date.UTC(2026, 10, 10, 10, min)).toISOString();
const msg = (id: string, min: number, extra: Partial<UiMessage> = {}): UiMessage => ({
  id, body: `نص ${id}`, createdAt: at(min), mine: false, readAt: null, kind: "TEXT", media: null, replyTo: null, reactions: [], ...extra,
});

const actions = (extra: Partial<MessageActions> = {}): MessageActions => ({
  canInteract: true,
  onReply: vi.fn(),
  onReact: vi.fn(),
  onReport: vi.fn(),
  onOpenQuote: vi.fn(),
  onOpenPhoto: vi.fn(),
  deleteMode: null,
  canDeleteForEveryone: true,
  onDelete: vi.fn(),
  ...extra,
});

type Over = Partial<Omit<ChatRoomModel, "ready">> & { ready?: Partial<ChatRoomReady>; conversation?: Partial<ChatRoomReady["conversation"]> };

function makeModel(over: Over = {}): ChatRoomModel {
  const { ready: readyOver, conversation: convOver, ...rest } = over;
  const conversation = {
    id: "c1",
    matchId: "mt1",
    matchHidden: false,
    status: "ACTIVE",
    blocked: false,
    expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    canExtend: true,
    partner: { id: "u2", firstName: "سلمى", isVerified: false, isPro: false, activityLabel: null },
    lastMessage: null,
    ...convOver,
  } as ChatRoomReady["conversation"];
  const ready: ChatRoomReady = {
    conversation,
    left: 5,
    open: conversation.status === "ACTIVE",
    canSend: true,
    endable: true,
    familyStep: null,
    statusBar: null,
    activity: null,
    typingLabel: null,
    startersShown: false,
    closedFamily: null,
    mediaMode: null,
    composerMedia: undefined,
    messageActions: actions(),
    viewerPhotos: [],
    ...readyOver,
  } as ChatRoomReady;
  const noop = vi.fn();
  return {
    conversationId: "c1",
    router: { push: vi.fn() },
    conversation,
    messages: [msg("a", 1, { mine: true, readAt: at(1) }), msg("b", 2, { readAt: at(2) })],
    notFound: false,
    loadError: false,
    hasMore: false,
    loadingOlder: false,
    online: true,
    mode: "polling",
    viewport: null,
    scroller: createRef<HTMLDivElement>(),
    composer: createRef(),
    optionsButton: createRef<HTMLButtonElement>(),
    returnFocus: { current: null },
    ready,
    activeRowId: undefined,
    familyOpenUntil: null,
    family: undefined,
    familyFree: true,
    intro: null,
    deleteMode: "use",
    myGender: "MALE",
    country: "JO",
    starters: [],
    refusal: null,
    setRefusal: noop,
    composerError: null,
    setComposerError: noop,
    replyTo: null,
    setReplyTo: noop,
    highlightId: null,
    unreadFromId: null,
    away: false,
    unseen: 0,
    viewerId: null,
    setViewerId: noop,
    busy: false,
    endDialog: null,
    setEndDialog: vi.fn(),
    extendConfirm: false,
    setExtendConfirm: vi.fn(),
    familyDialog: false,
    setFamilyDialog: noop,
    offerOpen: false,
    setOfferOpen: noop,
    reportMessage: null,
    setReportMessage: noop,
    pushChip: { pushOff: false, dismissed: true, blocked: false, dismiss: noop },
    chatDelete: { settle: noop, onDeleted: noop, onCleared: noop, requestDelete: vi.fn(), requestDeleteChoice: vi.fn(), requestClear: vi.fn(), dialogs: null },
    send: vi.fn(async () => true),
    sendMedia: vi.fn(async () => {}),
    fetchLatest: vi.fn(async () => {}),
    loadOlder: vi.fn(async () => {}),
    onScroll: vi.fn(),
    extend: vi.fn(async () => {}),
    end: vi.fn(async () => true),
    requestFamily: vi.fn(async () => {}),
    typing: { notify: noop, reset: noop },
    wake: noop,
    setActiveRow: noop,
    jumpToNewest: vi.fn(),
    markSeenNow: vi.fn(),
    dismissFailed: vi.fn(),
    ...rest,
  } as unknown as ChatRoomModel;
}

const bubbleOf = (text: string) => screen.getByText(text).closest<HTMLElement>("[data-wa-bubble]")!;

function longPress(el: HTMLElement) {
  vi.useFakeTimers();
  fireEvent.pointerDown(el, { pointerType: "touch", clientX: 10, clientY: 10 });
  act(() => {
    vi.advanceTimersByTime(500);
  });
  fireEvent.pointerUp(el, { pointerType: "touch", clientX: 10, clientY: 10 });
  vi.useRealTimers();
}

describe("WaChatRoom: top bar", () => {
  it("the subtitle shows «يكتب الآن…» while the partner types", () => {
    render(<WaChatRoom model={makeModel({ ready: { typingLabel: "يكتب الآن…", activity: "نشط اليوم" } })} />);
    expect(screen.getByTestId("chat-status-line").textContent).toContain("يكتب الآن…");
    expect(screen.getByTestId("chat-status-line").textContent).not.toContain("نشط اليوم");
  });

  it("else the activity label", () => {
    render(<WaChatRoom model={makeModel({ ready: { activity: "نشط اليوم" } })} />);
    expect(screen.getByTestId("chat-status-line").textContent).toContain("نشط اليوم");
  });

  it("⋮ lists the days left, «صفحة التوافق», «تمديد 7 أيام», «مسح المحادثة», «إبلاغ», «إنهاء المحادثة» in that order", async () => {
    render(<WaChatRoom model={makeModel()} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "خيارات المحادثة" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    const text = menu.textContent ?? "";
    const order = ["على المحادثة", "صفحة التوافق", "تمديد 7 أيام", "مسح المحادثة", "إبلاغ", "إنهاء المحادثة"].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    const items = within(menu).getAllByRole("menuitem");
    expect(items.at(-1)!.textContent).toContain("إنهاء المحادثة");
    expect(items.at(-2)!.textContent).toContain("إبلاغ");
  });
});

describe("WaChatRoom: message area", () => {
  it("shows the safety note as a gold chip", () => {
    render(<WaChatRoom model={makeModel()} />);
    const note = screen.getByText("محادثة خاصة · لا تشارك الأرقام أو الحسابات");
    expect(note.className).toContain("bg-safety-chip");
    expect(note.className).toContain("text-accent-ink");
  });

  it("two partner messages from the unread point: «رسالتان غير مقروءتين», on the divider the room scrolls to", () => {
    const messages = [msg("a", 1, { mine: true, readAt: at(1) }), msg("u1", 2), msg("u2", 3)];
    const { container } = render(<WaChatRoom model={makeModel({ messages, unreadFromId: "u1" })} />);
    const divider = container.querySelector<HTMLElement>("[data-unread-divider]")!;
    expect(divider.textContent).toBe("رسالتان غير مقروءتين");
    expect(divider.className).toContain("bg-chat-chip");
  });

  it("a failed message's «حذف» calls dismissFailed", async () => {
    const model = makeModel({ messages: [msg("f1", 1, { mine: true, pending: "failed" })] });
    render(<WaChatRoom model={model} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "لم تُرسل" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "حذف" }));
    expect(model.dismissFailed).toHaveBeenCalledWith("f1");
  });

  it("the jump button carries the unseen count in a navy badge", () => {
    render(<WaChatRoom model={makeModel({ away: true, unseen: 3 })} />);
    const jump = screen.getByRole("button", { name: /الانتقال لآخر رسالة/ });
    expect(jump.textContent).toBe("3");
    expect(jump.querySelector("span")!.className).toContain("bg-primary");
  });
});

describe("WaChatRoom: selection", () => {
  it("a long press on a bubble shows the selection bar in place of the top bar, with the reaction pill", () => {
    render(<WaChatRoom model={makeModel()} />);
    longPress(bubbleOf("نص b"));
    expect(screen.getByRole("button", { name: "إلغاء التحديد" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "خيارات المحادثة" })).toBeNull();
    expect(screen.getByRole("group", { name: "تفاعل" })).toBeTruthy();
    const row = screen.getByText("نص b").closest<HTMLElement>("[data-message-id]")!;
    expect(row.getAttribute("aria-current")).toBe("true");
  });

  it("✕, Escape and a tap on the background each end it", () => {
    render(<WaChatRoom model={makeModel()} />);
    const bar = () => screen.queryByRole("button", { name: "إلغاء التحديد" });
    fireEvent.contextMenu(bubbleOf("نص b"));
    fireEvent.click(bar()!);
    expect(bar()).toBeNull();
    fireEvent.contextMenu(bubbleOf("نص b"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(bar()).toBeNull();
    fireEvent.contextMenu(bubbleOf("نص b"));
    fireEvent.click(screen.getByRole("log"));
    expect(bar()).toBeNull();
  });

  it("ends when the selected message is deleted for everyone and the chat closes (Review Focus 3)", () => {
    const model = makeModel({ messages: [msg("a", 1, { mine: true, readAt: at(1) })] });
    const { rerender } = render(<WaChatRoom model={model} />);
    fireEvent.contextMenu(bubbleOf("نص a"));
    expect(screen.getByRole("button", { name: "إلغاء التحديد" })).toBeTruthy();
    const after = makeModel({
      messages: [msg("a", 1, { mine: true, readAt: at(1), deleted: true, body: "تم حذف الرسالة" })],
      ready: { canSend: false, messageActions: actions({ canInteract: false, canDeleteForEveryone: false }) },
    });
    rerender(<WaChatRoom model={after} />);
    expect(screen.queryByRole("button", { name: "إلغاء التحديد" })).toBeNull();
    expect(screen.getByRole("button", { name: "خيارات المحادثة" })).toBeTruthy();
  });

  it("the bar's «حذف» opens the delete choice and points the focus back at the message's row", () => {
    const model = makeModel({ ready: { messageActions: actions({ deleteMode: "use" }) } });
    render(<WaChatRoom model={model} />);
    fireEvent.contextMenu(bubbleOf("نص a"));
    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    expect(model.chatDelete.requestDeleteChoice).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(model.returnFocus.current?.getAttribute("data-message-id")).toBe("a");
    expect(screen.queryByRole("button", { name: "إلغاء التحديد" })).toBeNull();
  });

  it("a tap on the reaction pill opens the selection with my reaction ringed", () => {
    const messages = [msg("b", 2, { readAt: at(2), reactions: [{ emoji: "❤️", mine: true }] })];
    render(<WaChatRoom model={makeModel({ messages })} />);
    fireEvent.click(screen.getByTestId("reaction-pill"));
    expect(screen.getByRole("button", { name: "إلغاء التحديد" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "تفاعل ❤️" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("WaChatRoom: bottom", () => {
  it("a closed chat shows the read-only bar with endedChatNote, and no composer", () => {
    const model = makeModel({ conversation: { status: "ENDED", endedBy: "partner", endedByMe: false } as never, ready: { canSend: false, endable: false } });
    render(<WaChatRoom model={model} />);
    const note = endedChatNote(model.ready!.conversation);
    expect(screen.getByTestId("chat-read-only").textContent).toContain(note);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
