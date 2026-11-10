import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO" }) }));
vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));

import { MessageBubble } from "@/components/chat/message-bubble";
import type { MessageActions } from "@/components/chat/message-menu";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatStatusBar } from "@/components/chat/chat-status-bar";
import { EndChatDialog } from "@/components/chat/end-chat-dialog";
import { PhotoViewer } from "@/components/chat/photo-viewer";
import { usePartnerTyping, useTypingSignal } from "@/components/chat/use-typing";
import type { UiMessage } from "@/components/chat/chat-utils";
import { pushChipDismissed, pushChipHideValue } from "@/components/chat/chat-push-banner";

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

  it("a photo: the time sits over the photo; a tap opens the viewer", () => {
    const a = actions();
    render(
      <MessageBubble
        message={message({ kind: "IMAGE", body: "📷 صورة", media: { url: "/api/chats/c1/media/p1", type: "image/webp", durationSec: null, width: 400, height: 300 } })}
        tail
        actions={a}
      />
    );
    const button = screen.getByRole("button", { name: "عرض الصورة بالحجم الكامل" });
    expect(button.parentElement!.textContent).toMatch(/1:05/);
    fireEvent.click(button);
    expect(a.onOpenPhoto).toHaveBeenCalledWith("m1");
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

  it("the other side shows for 8 s after the last signal (WC2-03), or until cleared", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePartnerTyping());
    act(() => result.current.mark());
    expect(result.current.typing).toBe(true);
    act(() => void vi.advanceTimersByTime(4000));
    act(() => result.current.mark());
    act(() => void vi.advanceTimersByTime(7000));
    expect(result.current.typing).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.typing).toBe(false);
    act(() => result.current.mark());
    act(() => result.current.clear());
    expect(result.current.typing).toBe(false);
  });
});

describe("status bar: the family step in the last days", () => {
  const common = {
    canExtend: false,
    busy: false,
    onExtend: vi.fn(),
    onFamily: vi.fn(),
    matchHref: "/dashboard/matches?match=x",
    pushBlocked: false,
    onPushDismiss: vi.fn(),
  };

  it("states the days left inline", () => {
    render(<ChatStatusBar {...common} bar="family" family="offer" daysLeft={2} />);
    expect(screen.getByTestId("chat-bar-family").textContent).toContain("تبقّى يومان");
    expect(screen.getByRole("button", { name: "تعارف عائلي" })).toBeTruthy();
  });

  it("not before the last days", () => {
    render(<ChatStatusBar {...common} bar="family" family="pending_received" daysLeft={9} />);
    expect(screen.getByTestId("chat-bar-family").textContent).not.toContain("تبقّى");
  });
});

describe("«إبلاغ عن الرسالة»", () => {
  it("the report shows the reported message (sent by id, not as text): the details stay the member's own", () => {
    const onConfirm = vi.fn();
    render(
      <EndChatDialog open onOpenChange={vi.fn()} report partnerName="سلمى" busy={false} onConfirm={onConfirm} reportedMessage="نص مسيء" />
    );
    expect(screen.getByTestId("reported-message").textContent).toContain("نص مسيء");
    expect((screen.getByPlaceholderText("تفاصيل إضافية (اختياري)") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "إنهاء وإبلاغ" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "HARASSMENT", details: undefined });
  });

  it("a report from the menu (no message) shows no quote", () => {
    render(<EndChatDialog open onOpenChange={vi.fn()} report partnerName="سلمى" busy={false} onConfirm={vi.fn()} />);
    expect(screen.queryByTestId("reported-message")).toBeNull();
  });
});

describe("review polish (Task 3+4 minors)", () => {
  it("reaction items carry the state in their name, not aria-pressed (invalid on menuitem)", () => {
    render(<MessageBubble message={message({ reactions: [{ emoji: "❤️", mine: true }] })} tail actions={actions()} />);
    openMenu();
    const mine = screen.getByRole("menuitem", { name: "تفاعل ❤️ · تفاعلك" });
    expect(mine.getAttribute("aria-pressed")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "تفاعل 👍" }).getAttribute("aria-pressed")).toBeNull();
  });

  it("the mic's name follows the viewer's gender", () => {
    const media = { mode: "enabled" as const, onPhoto: vi.fn(), onVoice: vi.fn(), onLocked: vi.fn(), onError: vi.fn() };
    render(<ChatComposer onSend={vi.fn(async () => true)} error={null} onTyping={vi.fn()} media={media} female />);
    expect(screen.getByRole("button", { name: "تسجيل رسالة صوتية (اضغطي مطولاً)" })).toBeTruthy();
    cleanup();
    render(<ChatComposer onSend={vi.fn(async () => true)} error={null} onTyping={vi.fn()} media={media} />);
    expect(screen.getByRole("button", { name: "تسجيل رسالة صوتية (اضغط مطولاً)" })).toBeTruthy();
  });
});

describe("photo viewer", () => {
  const photo = (id: string) => ({
    id,
    caption: `أنت · ${id}`,
    media: { url: `/api/chats/c1/media/${id}`, type: "image/webp", durationSec: null, width: 800, height: 600 },
  });

  it("black, full screen, ✕ at the end, no download; arrows move between the chat's photos", () => {
    const onClose = vi.fn();
    render(<PhotoViewer photos={[photo("p1"), photo("p2"), photo("p3")]} openId="p2" onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bg-black");
    expect(within(dialog).getByText("2 من 3")).toBeTruthy();
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /تنزيل|تحميل/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "إغلاق" }).className).toContain("end-2");
    fireEvent.click(within(dialog).getByRole("button", { name: "الصورة التالية" }));
    expect(within(dialog).getByText("3 من 3")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "الصورة السابقة" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "الصورة السابقة" }));
    expect(within(dialog).getByText("1 من 3")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a swipe moves to the next photo; zoom toggles", () => {
    render(<PhotoViewer photos={[photo("p1"), photo("p2")]} openId="p1" onClose={vi.fn()} />);
    const stage = screen.getByTestId("photo-stage");
    // RTL: a finger moving right brings the newer photo
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 150, clientY: 300 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 300, clientY: 300 });
    expect(screen.getByText("2 من 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تكبير" }));
    expect(screen.getByRole("button", { name: "تصغير" })).toBeTruthy();
  });
});

describe("push chip: ✕ hides the variant that was showing (Task 2 review minor 4)", () => {
  it("hiding «تفعيل» doesn't hide «طريقة الفتح» once notifications get blocked, and the other way round", () => {
    expect(pushChipDismissed(null, false)).toBe(false);
    expect(pushChipDismissed(pushChipHideValue(false), false)).toBe(true);
    expect(pushChipDismissed(pushChipHideValue(false), true)).toBe(false);
    expect(pushChipDismissed(pushChipHideValue(true), true)).toBe(true);
    // Hidden before this change ("1"): that was the «تفعيل» chip
    expect(pushChipDismissed("1", false)).toBe(true);
    expect(pushChipDismissed("1", true)).toBe(false);
  });
});
