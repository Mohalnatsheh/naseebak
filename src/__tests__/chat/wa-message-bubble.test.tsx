import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO" }) }));

import { WaMessageBubble } from "@/components/chat/wa-message-bubble";
import type { UiMessage } from "@/components/chat/chat-utils";
import type { MessageActions } from "@/components/chat/message-menu";
import { DELETED_TRACE } from "@/lib/chat/visibility";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const message = (extra: Partial<UiMessage> = {}): UiMessage => ({
  id: "m1",
  body: "مرحبا",
  createdAt: new Date(2026, 10, 10, 13, 5).toISOString(),
  mine: true,
  readAt: null,
  kind: "TEXT",
  media: null,
  replyTo: null,
  reactions: [],
  ...extra,
});

const actions = (extra: Partial<MessageActions> = {}): MessageActions => ({
  canInteract: true,
  onReply: vi.fn(),
  onReact: vi.fn(),
  onReport: vi.fn(),
  onOpenQuote: vi.fn(),
  onOpenPhoto: vi.fn(),
  ...extra,
});

function setup(m: UiMessage, extra: Partial<Parameters<typeof WaMessageBubble>[0]> = {}) {
  const props = {
    message: m,
    tail: true,
    partnerName: "سارة",
    actions: actions(),
    selected: false,
    highlighted: false,
    onSelect: vi.fn(),
    onRetry: vi.fn(),
    onDismissFailed: vi.fn(),
    onReactionsTap: vi.fn(),
    ...extra,
  };
  const view = render(<WaMessageBubble {...props} />);
  return { ...view, props };
}

const bubbleOf = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-wa-bubble]")!;

describe("WaMessageBubble", () => {
  it("mine is the pale navy bubble with ink text; the partner's is white", () => {
    const mine = setup(message());
    expect(bubbleOf(mine.container).className).toContain("bg-bubble-mine");
    expect(bubbleOf(mine.container).className).toContain("text-foreground");
    cleanup();
    const theirs = setup(message({ mine: false }));
    expect(bubbleOf(theirs.container).className).toContain("bg-card");
  });

  it("a tail and 8 px on the first of a run; 2 px inside a run", () => {
    const first = setup(message());
    expect(first.queryByTestId("bubble-tail")).not.toBeNull();
    expect(first.container.querySelector("[data-message-id]")!.className).toContain("mt-2");
    cleanup();
    const next = setup(message(), { tail: false });
    expect(next.queryByTestId("bubble-tail")).toBeNull();
    expect(next.container.querySelector("[data-message-id]")!.className).toContain("mt-0.5");
  });

  it("read ticks in navy once read; grey double ticks are never shown for a sent-only message", () => {
    const read = setup(message({ readAt: new Date().toISOString() }));
    expect(read.getByLabelText("تمت القراءة").getAttribute("class")).toContain("text-primary");
    cleanup();
    const sent = setup(message());
    expect(sent.getByLabelText("تم الإرسال")).toBeTruthy();
  });

  it("a deleted message shows the trace and no reaction pill", () => {
    const { getByText, queryByTestId } = setup(message({ deleted: true, reactions: [{ emoji: "❤️", mine: false }] }));
    expect(getByText(DELETED_TRACE)).toBeTruthy();
    expect(queryByTestId("reaction-pill")).toBeNull();
  });

  it("one reaction pill with every emoji and a count over 1; tapping it calls onReactionsTap", () => {
    const m = message({ reactions: [{ emoji: "❤️", mine: true }, { emoji: "👍", mine: false }] });
    const { getByTestId, props } = setup(m);
    const pill = getByTestId("reaction-pill");
    expect(pill.textContent).toContain("❤️");
    expect(pill.textContent).toContain("👍");
    expect(pill.textContent).toContain("2");
    fireEvent.click(pill);
    expect(props.onReactionsTap).toHaveBeenCalledWith(m);
  });

  it("the quote in my bubble names «أنت» or the partner, on the darker quote tone", () => {
    const { getByRole } = setup(message({ replyTo: { id: "q", mine: false, kind: "TEXT", snippet: "سؤال" } }));
    const quote = getByRole("button", { name: /ردّ على سارة/ });
    expect(quote.className).toContain("bg-bubble-mine-quote");
  });

  it("a selected row carries the full-width wash and aria-selected", () => {
    const { container } = setup(message(), { selected: true });
    const row = container.querySelector<HTMLElement>("[data-message-id]")!;
    expect(row.className).toContain("bg-chat-select");
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.hasAttribute("data-selected")).toBe(true);
  });

  it("a failed message: «لم تُرسل» opens «إعادة المحاولة» and «حذف»", async () => {
    const { getByRole, findByRole, props } = setup(message({ pending: "failed" }));
    const button = getByRole("button", { name: "لم تُرسل" });
    expect(button.className).toContain("text-destructive");
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await findByRole("menuitem", { name: "إعادة المحاولة" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(getByRole("button", { name: "لم تُرسل" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await findByRole("menuitem", { name: "حذف" }));
    expect(props.onDismissFailed).toHaveBeenCalledTimes(1);
  });

  const photo = () =>
    message({
      kind: "IMAGE",
      body: "صورة",
      media: { url: "https://cdn.test/p.webp", type: "image/webp", width: 400, height: 300, durationSec: null },
    });

  it("a 450 ms touch press on a photo selects once, and the click after it does not open the photo", () => {
    vi.useFakeTimers();
    const a = actions();
    const { container, getByRole, props } = setup(photo(), { actions: a });
    const bubble = bubbleOf(container);
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 50, clientY: 50 });
    act(() => vi.advanceTimersByTime(450));
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(bubble, { pointerType: "touch", clientX: 50, clientY: 50 });
    fireEvent.click(getByRole("button", { name: "عرض الصورة بالحجم الكامل" }));
    expect(a.onOpenPhoto).not.toHaveBeenCalled();
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });

  it("a press that moves 15 px before 450 ms does nothing", () => {
    vi.useFakeTimers();
    const { container, props } = setup(photo());
    const bubble = bubbleOf(container);
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 50, clientY: 50 });
    fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 50, clientY: 65 });
    act(() => vi.advanceTimersByTime(600));
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.actions!.onReply).not.toHaveBeenCalled();
  });

  it("right-click selects", () => {
    const { container, props } = setup(message());
    fireEvent.contextMenu(bubbleOf(container));
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });

  it("desktop hover: the chevron selects and the reply arrow replies", () => {
    const m = message({ mine: false });
    const { getByRole, props } = setup(m);
    fireEvent.click(getByRole("button", { name: "خيارات الرسالة" }));
    expect(props.onSelect).toHaveBeenCalledWith(m);
    fireEvent.click(getByRole("button", { name: "رد" }));
    expect(props.actions!.onReply).toHaveBeenCalledWith(m);
  });

  it("a touch swipe inward past the threshold replies (and cancels the long press); a mouse drag does not", () => {
    vi.useFakeTimers();
    // jsdom lays out LTR: the partner's bubble sits on the right there, so inward is a negative dx
    const m = message({ mine: false });
    const { container, props } = setup(m);
    const bubble = bubbleOf(container);
    fireEvent.pointerDown(bubble, { pointerType: "mouse", clientX: 200, clientY: 50 });
    fireEvent.pointerMove(bubble, { pointerType: "mouse", clientX: 100, clientY: 50 });
    fireEvent.pointerUp(bubble, { pointerType: "mouse", clientX: 100, clientY: 50 });
    expect(props.actions!.onReply).not.toHaveBeenCalled();
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 200, clientY: 50 });
    fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 170, clientY: 50 });
    fireEvent.pointerUp(bubble, { pointerType: "touch", clientX: 170, clientY: 50 });
    expect(props.actions!.onReply).not.toHaveBeenCalled();
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 200, clientY: 50 });
    fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 120, clientY: 50 });
    act(() => vi.advanceTimersByTime(450));
    fireEvent.pointerUp(bubble, { pointerType: "touch", clientX: 120, clientY: 50 });
    expect(props.actions!.onReply).toHaveBeenCalledTimes(1);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("a tap with a few px of inward jitter still opens the photo", () => {
    const a = actions();
    const m = { ...photo(), mine: false };
    const { container, getByRole } = setup(m, { actions: a });
    const bubble = bubbleOf(container);
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 200, clientY: 50 });
    fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 196, clientY: 50 });
    fireEvent.pointerUp(bubble, { pointerType: "touch", clientX: 196, clientY: 50 });
    fireEvent.click(getByRole("button", { name: "عرض الصورة بالحجم الكامل" }));
    expect(a.onOpenPhoto).toHaveBeenCalledTimes(1);
    expect(bubble.style.transform).toBe("");
  });

  it("dragging the voice waveform seeks only: no swipe, no reply", () => {
    const m = message({
      mine: false,
      kind: "VOICE",
      body: "رسالة صوتية",
      media: { url: "https://cdn.test/v.m4a", type: "audio/mp4", durationSec: 8, width: null, height: null },
    });
    const { container, getByRole, props } = setup(m);
    const slider = getByRole("slider");
    fireEvent.pointerDown(slider, { pointerType: "touch", clientX: 200, clientY: 50 });
    fireEvent.pointerMove(slider, { pointerType: "touch", clientX: 100, clientY: 50 });
    fireEvent.pointerUp(slider, { pointerType: "touch", clientX: 100, clientY: 50 });
    expect(props.actions!.onReply).not.toHaveBeenCalled();
    expect(bubbleOf(container).style.transform).toBe("");
  });

  it("Android's contextmenu during a touch long press selects only once", () => {
    vi.useFakeTimers();
    const { container, props } = setup(message());
    const bubble = bubbleOf(container);
    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 50, clientY: 50 });
    const ev = fireEvent.contextMenu(bubble);
    expect(ev).toBe(false); // default prevented (no native menu)
    act(() => vi.advanceTimersByTime(450));
    fireEvent.contextMenu(bubble);
    fireEvent.pointerUp(bubble, { pointerType: "touch", clientX: 50, clientY: 50 });
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });

  it("Enter on the row selects (roving focus)", () => {
    const m = message();
    const { container, props } = setup(m, { rowActive: true });
    const row = container.querySelector<HTMLElement>("[data-message-row]")!;
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(props.onSelect).toHaveBeenCalledWith(m);
  });
});
