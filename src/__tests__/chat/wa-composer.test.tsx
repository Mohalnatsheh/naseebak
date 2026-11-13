/**
 * The WhatsApp-style composer (switch `chat_whatsapp_layout`): attach menu and camera follow the Pro media rules,
 * Enter follows the pointer (phones add a line), one round button (mic / send), the ref handle, and the emoji panel.
 */
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WaComposer } from "@/components/chat/wa-composer";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import type { ComposerMedia } from "@/components/chat/media-buttons";
import { EMOJI_GROUPS } from "@/components/chat/emoji-data";

let coarse = false;
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  coarse = false;
  vi.stubGlobal("ResizeObserver", RO);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("coarse") ? coarse : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  window.matchMedia = globalThis.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function media(mode: ComposerMedia["mode"]): ComposerMedia {
  return { mode, onPhoto: vi.fn(), onVoice: vi.fn(), onLocked: vi.fn(), onError: vi.fn() };
}

function renderComposer(props: Partial<React.ComponentProps<typeof WaComposer>> = {}) {
  const onSend = vi.fn(async () => true);
  const ref = createRef<ChatComposerHandle>();
  render(
    <div dir="rtl">
      <WaComposer ref={ref} onSend={onSend} error={null} onTyping={vi.fn()} {...props} />
    </div>
  );
  return { onSend, ref, box: () => screen.getByRole("textbox") as HTMLTextAreaElement };
}

describe("WaComposer: attach and camera", () => {
  it("shows neither «إرفاق» nor «الكاميرا» without media", () => {
    coarse = true;
    renderComposer();
    expect(screen.queryByRole("button", { name: /إرفاق/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /الكاميرا/ })).toBeNull();
  });

  it("locked: «إرفاق» and the camera open the Pro offer", () => {
    coarse = true;
    const m = media("locked");
    renderComposer({ media: m });
    fireEvent.click(screen.getByRole("button", { name: /إرفاق/ }));
    expect(m.onLocked).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /الكاميرا/ }));
    expect(m.onLocked).toHaveBeenCalledTimes(2);
  });

  it("enabled: «إرفاق» opens «المعرض» and «الكاميرا»", () => {
    renderComposer({ media: media("enabled") });
    const attach = screen.getByRole("button", { name: "إرفاق" });
    fireEvent.keyDown(attach, { key: "Enter" });
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "المعرض" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "الكاميرا" })).toBeTruthy();
  });

  it("the camera button shows on a coarse pointer only", () => {
    renderComposer({ media: media("enabled") });
    expect(screen.queryByRole("button", { name: "الكاميرا" })).toBeNull();
    cleanup();
    coarse = true;
    renderComposer({ media: media("enabled") });
    expect(screen.getByRole("button", { name: "الكاميرا" })).toBeTruthy();
    const input = document.querySelector('input[capture="environment"]') as HTMLInputElement;
    expect(input.accept).toBe("image/*");
  });
});

describe("WaComposer: Enter", () => {
  it("on a phone (coarse pointer) Enter adds a line and does not send", () => {
    coarse = true;
    const { onSend, box } = renderComposer();
    fireEvent.change(box(), { target: { value: "مرحبا" } });
    const ev = fireEvent.keyDown(box(), { key: "Enter" });
    expect(ev).toBe(true); // not prevented: the browser adds the new line
    expect(onSend).not.toHaveBeenCalled();
  });

  it("on desktop Enter sends once", async () => {
    const { onSend, box } = renderComposer();
    fireEvent.change(box(), { target: { value: "مرحبا" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("مرحبا");
  });
});

describe("WaComposer: the round button and the handle", () => {
  it("is «تسجيل رسالة صوتية» while empty and «إرسال» with text", () => {
    const { box } = renderComposer({ media: media("enabled") });
    expect(screen.getByRole("button", { name: "تسجيل رسالة صوتية" })).toBeTruthy();
    fireEvent.change(box(), { target: { value: "أهلا" } });
    expect(screen.getByRole("button", { name: "إرسال" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تسجيل رسالة صوتية" })).toBeNull();
  });

  it("fill() and focus() work through the ref", () => {
    const { ref, box } = renderComposer();
    act(() => ref.current!.fill("السلام عليكم"));
    expect(box().value).toBe("السلام عليكم");
    act(() => ref.current!.fill("غيره", { onlyIfEmpty: true }));
    expect(box().value).toBe("السلام عليكم");
    act(() => ref.current!.focus());
    expect(document.activeElement).toBe(box());
  });
});

describe("WaComposer: emoji", () => {
  it("has about 200 emoji in 5 Arabic groups", () => {
    expect(EMOJI_GROUPS.map((g) => g.label)).toEqual(["وجوه", "إيماءات", "قلوب", "مناسبات", "طبيعة"]);
    const total = EMOJI_GROUPS.reduce((n, g) => n + g.emoji.length, 0);
    expect(total).toBeGreaterThanOrEqual(180);
    expect(total).toBeLessThanOrEqual(240);
  });

  it("inserts a picked emoji at the cursor", async () => {
    const { box } = renderComposer();
    fireEvent.change(box(), { target: { value: "ابدأ النهاية" } });
    box().setSelectionRange(5, 5);
    fireEvent.select(box());
    fireEvent.click(screen.getByRole("button", { name: "الرموز التعبيرية" }));
    const smile = await screen.findByRole("button", { name: "😊" });
    fireEvent.click(smile);
    expect(box().value).toBe("ابدأ 😊النهاية");
  });
});

describe("WaComposer: voice", () => {
  class FakeRecorder {
    static isTypeSupported = () => true;
    mimeType = "audio/mp4";
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
      queueMicrotask(() => this.onstop?.());
    }
  }
  const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  let grant: () => void;
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          grant = () => resolve({ getTracks: () => [{ stop: vi.fn() }] });
        })
    );
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (original) Object.defineProperty(navigator, "mediaDevices", original);
    else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
  });

  const mic = () => screen.getByRole("button", { name: "تسجيل رسالة صوتية" });

  it.each([
    [false, "تم السماح بالميكروفون، اضغط مطولاً للتسجيل"],
    [true, "تم السماح بالميكروفون، اضغطي مطولاً للتسجيل"],
  ])("a tap while the microphone prompt was open (> 600 ms) says the microphone is allowed (female %s)", async (female, text) => {
    renderComposer({ media: media("enabled"), female });
    fireEvent.pointerDown(mic(), { pointerId: 1, button: 0, clientX: 300, clientY: 700 });
    fireEvent.pointerUp(mic(), { pointerId: 1, clientX: 300, clientY: 700 });
    now = 2500;
    await act(async () => {
      grant();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("a quick tap (fast start) keeps the usual hint", async () => {
    renderComposer({ media: media("enabled") });
    fireEvent.pointerDown(mic(), { pointerId: 1, button: 0, clientX: 300, clientY: 700 });
    fireEvent.pointerUp(mic(), { pointerId: 1, clientX: 300, clientY: 700 });
    now = 1200;
    await act(async () => {
      grant();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("اضغط مطولاً للتسجيل، وارفع إصبعك للإرسال")).toBeInTheDocument();
  });

  it("locked recording: delete and send, no stop or pause", async () => {
    const m = media("enabled");
    renderComposer({ media: m });
    fireEvent.pointerDown(mic(), { pointerId: 1, button: 0, clientX: 300, clientY: 700 });
    await act(async () => {
      grant();
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 300, clientY: 500 }); // slide up: lock
    expect(screen.getByRole("button", { name: "إلغاء التسجيل" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "إيقاف التسجيل" })).toBeNull();
    now = 4000;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إرسال الرسالة الصوتية" }), { detail: 0 });
    });
    expect(m.onVoice).toHaveBeenCalledTimes(1);
  });
});
