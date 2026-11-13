import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { WaReactionPicker, WaSelectionBar, selectedMessage } from "@/components/chat/wa-selection";
import type { UiMessage } from "@/components/chat/chat-utils";
import type { MessageActions } from "@/components/chat/message-menu";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
  deleteMode: "use",
  canDeleteForEveryone: true,
  onDelete: vi.fn(),
  ...extra,
});

function bar(m: UiMessage, a = actions()) {
  const onClose = vi.fn();
  const onDelete = vi.fn();
  render(<WaSelectionBar message={m} actions={a} onClose={onClose} onDelete={onDelete} />);
  return { onClose, onDelete, a };
}

const btn = (name: string) => screen.queryByRole("button", { name });

async function openMore() {
  fireEvent.pointerDown(btn("خيارات أخرى")!, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findByRole("menu");
}

describe("WaSelectionBar", () => {
  it("my text message, delete mode use: ✕, «1», «رد», «نسخ», «حذف»; no ⋮ (nothing to report)", () => {
    bar(message());
    expect(btn("إلغاء التحديد")).not.toBeNull();
    expect(screen.getByText("1")).toBeTruthy();
    expect(btn("رد")).not.toBeNull();
    expect(btn("نسخ")).not.toBeNull();
    expect(btn("حذف")).not.toBeNull();
    expect(btn("خيارات أخرى")).toBeNull();
  });

  it("the partner's deleted message: only «حذف» and ⋮ → «إبلاغ عن الرسالة»", async () => {
    const { a, onClose } = bar(message({ mine: false, deleted: true, body: "تم حذف الرسالة" }));
    expect(btn("رد")).toBeNull();
    expect(btn("نسخ")).toBeNull();
    expect(btn("حذف")).not.toBeNull();
    const menu = await openMore();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /إبلاغ عن الرسالة/ }));
    expect(a.onReport).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("«نسخ» copies the body, then closes", () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const { onClose } = bar(message());
    fireEvent.click(btn("نسخ")!);
    expect(writeText).toHaveBeenCalledWith("مرحبا");
    expect(onClose).toHaveBeenCalled();
  });

  it("«رد» and «حذف» call their handler and close; ✕ closes", () => {
    const { a, onClose, onDelete } = bar(message());
    fireEvent.click(btn("رد")!);
    expect(a.onReply).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
    fireEvent.click(btn("حذف")!);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
    expect(a.onDelete).not.toHaveBeenCalled();
    fireEvent.click(btn("إلغاء التحديد")!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("no delete mode: no «حذف»", () => {
    bar(message(), actions({ deleteMode: null }));
    expect(btn("حذف")).toBeNull();
  });
});

describe("WaReactionPicker", () => {
  it("shows the four emoji, rings mine, a tap reacts then calls onPicked", () => {
    const a = actions();
    const onPicked = vi.fn();
    render(<WaReactionPicker message={message({ reactions: [{ emoji: "❤️", mine: true }] })} actions={a} onPicked={onPicked} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /❤️/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /🤲/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /🤲/ }));
    expect(a.onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "🤲");
    expect(onPicked).toHaveBeenCalled();
  });

  it("renders nothing where reactions aren't allowed", () => {
    const { container } = render(<WaReactionPicker message={message()} actions={actions({ canInteract: false })} onPicked={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("selectedMessage", () => {
  const a = actions();
  it("null without an id, or when the id is gone", () => {
    expect(selectedMessage([message()], null, a)).toBeNull();
    expect(selectedMessage([message()], "gone", a)).toBeNull();
  });

  it("returns the current object, not a stale one", () => {
    const fresh = message({ reactions: [{ emoji: "👍", mine: false }] });
    expect(selectedMessage([message({ id: "x" }), fresh], "m1", a)).toBe(fresh);
  });

  it("null for a pending message", () => {
    expect(selectedMessage([message({ pending: "sending" })], "m1", a)).toBeNull();
    expect(selectedMessage([message({ pending: "failed" })], "m1", a)).toBeNull();
  });

  it("null when the message became deleted for everyone and nothing is left to do with it", () => {
    const closed = actions({ canInteract: false, deleteMode: null });
    expect(selectedMessage([message({ deleted: true })], "m1", closed)).toBeNull();
    // The partner's trace stays reportable: still selectable
    expect(selectedMessage([message({ mine: false, deleted: true })], "m1", closed)).not.toBeNull();
  });
});
