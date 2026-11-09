import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO" }) }));
vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));

import { MessageBubble } from "@/components/chat/message-bubble";
import type { MessageActions } from "@/components/chat/message-menu";
import { ChatComposer } from "@/components/chat/chat-composer";
import { EndChatDialog } from "@/components/chat/end-chat-dialog";
import { usePartnerTyping, useTypingSignal } from "@/components/chat/use-typing";
import type { UiMessage } from "@/components/chat/chat-utils";

// Radix popper / dialog need these in jsdom
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", RO);
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    ...extra,
  };
}

const openMenu = () => fireEvent.contextMenu(screen.getByText("كيف حالك؟").parentElement!);

describe("message menu (hover / right-click / long press)", () => {
  it("the other person's message: four reactions, «رد», «نسخ», «إبلاغ عن الرسالة»", () => {
    const a = actions();
    render(<MessageBubble message={message()} tail actions={a} partnerName="سلمى" />);
    openMenu();
    const menu = screen.getByRole("menu");
    for (const e of ["❤️", "👍", "😊", "🤲"]) expect(within(menu).getByRole("menuitem", { name: `تفاعل ${e}` })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /رد/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /نسخ/ })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /إبلاغ عن الرسالة/ }));
    expect(a.onReport).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
  });

  it("my message: no report; a closed chat: no reply or reactions (copy stays); no delete anywhere", () => {
    render(<MessageBubble message={message({ mine: true })} tail actions={actions()} />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /إبلاغ/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /حذف/ })).toBeNull();
    cleanup();
    render(<MessageBubble message={message()} tail actions={actions({ canInteract: false })} />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /رد/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /تفاعل/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /نسخ/ })).toBeTruthy();
  });

  it("a reaction from the menu and «رد» reach the room", () => {
    const a = actions();
    render(<MessageBubble message={message()} tail actions={a} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "تفاعل 🤲" }));
    expect(a.onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "🤲");
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /رد/ }));
    expect(a.onReply).toHaveBeenCalled();
  });

  it("«نسخ» copies the text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MessageBubble message={message()} tail actions={actions()} />);
    openMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /نسخ/ }));
    });
    expect(writeText).toHaveBeenCalledWith("كيف حالك؟");
  });

  it("a long press on a touch screen opens the menu; a scroll doesn't", () => {
    vi.useFakeTimers();
    render(<MessageBubble message={message()} tail actions={actions()} />);
    const bubble = screen.getByText("كيف حالك؟").parentElement!;
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 10, clientY: 60 });
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("an unsent bubble has no reply or reactions", () => {
    render(<MessageBubble message={message({ mine: true, pending: "sending", id: "tmp-1" })} tail actions={actions()} />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /رد/ })).toBeNull();
  });
});

describe("reply quote and reactions in the bubble", () => {
  it("shows the quote with its author; a tap opens the original", () => {
    const a = actions();
    render(
      <MessageBubble
        message={message({ mine: true, replyTo: { id: "q1", mine: false, kind: "TEXT", snippet: "ما خططك؟" } })}
        tail
        actions={a}
        partnerName="سلمى"
      />
    );
    const quote = screen.getByRole("button", { name: /الرسالة الأصلية/ });
    expect(quote.textContent).toContain("سلمى");
    expect(quote.textContent).toContain("ما خططك؟");
    fireEvent.click(quote);
    expect(a.onOpenQuote).toHaveBeenCalledWith("q1");
  });

  it("chips: one per emoji with a count; mine marked; a tap toggles through the room", () => {
    const a = actions();
    render(
      <MessageBubble
        message={message({ reactions: [{ emoji: "❤️", mine: false }, { emoji: "❤️", mine: true }, { emoji: "👍", mine: false }] })}
        tail
        actions={a}
      />
    );
    const heart = screen.getByRole("button", { name: "❤️ 2 · تفاعلك" });
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(heart);
    expect(a.onReact).toHaveBeenCalledWith(expect.anything(), "❤️");
    expect(screen.getByRole("button", { name: "👍 1" })).toBeTruthy();
  });

  it("the highlight marks the original after a quote tap", () => {
    const { container } = render(<MessageBubble message={message()} tail actions={actions()} highlighted />);
    expect(container.firstElementChild?.className).toContain("bg-accent/20");
  });
});

describe("composer extras", () => {
  it("the reply strip shows the author and snippet; ✕ drops it", () => {
    const onCancelReply = vi.fn();
    render(
      <ChatComposer
        onSend={vi.fn(async () => true)}
        error={null}
        onTyping={vi.fn()}
        replyTo={{ id: "q1", mine: true, kind: "VOICE", snippet: "🎤 رسالة صوتية" }}
        partnerName="سلمى"
        onCancelReply={onCancelReply}
      />
    );
    const strip = screen.getByTestId("reply-strip");
    expect(strip.textContent).toContain("أنت");
    expect(strip.textContent).toContain("🎤 رسالة صوتية");
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الرد" }));
    expect(onCancelReply).toHaveBeenCalled();
  });

  it("a starter chip fills the box (to edit before sending); typing reports through onTyping", () => {
    const onTyping = vi.fn();
    const onSend = vi.fn(async () => true);
    render(<ChatComposer onSend={onSend} error={null} onTyping={onTyping} starters={["ما خططك للسنوات القادمة؟"]} />);
    fireEvent.click(screen.getByRole("button", { name: "ما خططك للسنوات القادمة؟" }));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.value).toBe("ما خططك للسنوات القادمة؟");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByTestId("starter-chips")).toBeNull(); // the box has text now
    fireEvent.change(box, { target: { value: "ما خططك؟" } });
    expect(onTyping).toHaveBeenCalled();
  });

  it("one round button: send while there is text (no media = no mic)", () => {
    render(<ChatComposer onSend={vi.fn(async () => true)} error={null} onTyping={vi.fn()} />);
    expect((screen.getByRole("button", { name: "إرسال" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "سلام" } });
    expect((screen.getByRole("button", { name: "إرسال" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("typing", () => {
  it("signals at most every 3 s, only while enabled; reset lets the next one through", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useTypingSignal("c1", on), { initialProps: { on: true } });
    result.current.notify();
    result.current.notify();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/chats/c1/typing", { method: "POST" });
    vi.advanceTimersByTime(3000);
    result.current.notify();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    result.current.reset();
    result.current.notify();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    rerender({ on: false });
    vi.advanceTimersByTime(5000);
    result.current.notify();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("the other side shows for 5 s after the last signal, or until cleared", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePartnerTyping());
    act(() => result.current.mark());
    expect(result.current.typing).toBe(true);
    act(() => void vi.advanceTimersByTime(4000));
    act(() => result.current.mark());
    act(() => void vi.advanceTimersByTime(4000));
    expect(result.current.typing).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.typing).toBe(false);
    act(() => result.current.mark());
    act(() => result.current.clear());
    expect(result.current.typing).toBe(false);
  });
});

describe("«إبلاغ عن الرسالة»", () => {
  it("the report opens with that message in its details, still editable", () => {
    render(
      <EndChatDialog open onOpenChange={vi.fn()} report partnerName="سلمى" busy={false} onConfirm={vi.fn()} initialDetails="بخصوص الرسالة: «نص»" />
    );
    expect((screen.getByPlaceholderText("تفاصيل إضافية (اختياري)") as HTMLTextAreaElement).value).toBe("بخصوص الرسالة: «نص»");
  });
});
