import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhotoBubble, VoiceBubble } from "@/components/chat/media-bubble";

const media = (url: string) => ({ url, type: "image/webp", durationSec: null, width: 400, height: 300 });

afterEach(cleanup);

describe("PhotoBubble", () => {
  it("a local preview the browser can't show (HEIC in Chrome) says it is being prepared, not an error", () => {
    render(<PhotoBubble media={media("blob:http://x/1")} mine />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("status").textContent).toContain("جارٍ تجهيز الصورة…");
    expect(screen.queryByText("تعذّر عرض الصورة")).toBeNull();
  });

  it("the server's copy replaces the placeholder when it arrives", () => {
    const { rerender } = render(<PhotoBubble media={media("blob:http://x/1")} mine />);
    fireEvent.error(screen.getByRole("img"));
    rerender(<PhotoBubble media={media("/api/chats/c1/media/m1")} mine />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toContain("/api/chats/c1/media/m1");
  });

  it("a saved photo that fails offers a tap to try again, which reloads it", () => {
    render(<PhotoBubble media={media("/api/chats/c1/media/m1")} mine={false} />);
    fireEvent.error(screen.getByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /تعذّر عرض الصورة/ }));
    expect(screen.getByRole("img").getAttribute("src")).toContain("retry=1");
  });

  it("a preview that can't show and whose upload failed says so, with no spinner (the retry button is the bubble's)", () => {
    const { container } = render(<PhotoBubble media={media("blob:http://x/1")} mine sendFailed />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("status").textContent).toContain("صورة لم تُرسل");
    expect(screen.queryByText("جارٍ تجهيز الصورة…")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});

describe("VoiceBubble", () => {
  const voice = (durationSec: number) => ({ url: "/api/chats/c1/media/v1", type: "audio/mp4", durationSec, width: null, height: null });
  function audioWith(duration: number) {
    const el = document.querySelector("audio")!;
    Object.defineProperty(el, "duration", { configurable: true, get: () => duration });
    return el;
  }
  const bar = () => Number(screen.getByRole("slider").getAttribute("aria-valuenow"));
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the bar follows the file's own length, not the declared one (rounded up)", () => {
    render(<VoiceBubble media={voice(4)} mine={false} messageId="v1" />);
    expect(screen.getByText("0:04")).toBeTruthy();
    const el = audioWith(3.2);
    fireEvent.loadedMetadata(el);
    expect(screen.getByText("0:03")).toBeTruthy();
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => 3.2 });
    fireEvent.timeUpdate(el);
    expect(bar()).toBe(100);
  });

  it("an endless WebM length keeps the declared one", () => {
    render(<VoiceBubble media={voice(4)} mine messageId="v1" />);
    const el = audioWith(Infinity);
    fireEvent.loadedMetadata(el);
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => 2 });
    fireEvent.timeUpdate(el);
    expect(bar()).toBe(50);
  });

  it("a tap on the waveform seeks (from the start edge), before and while playing", () => {
    render(<VoiceBubble media={voice(10)} mine messageId="v1" />);
    const slider = screen.getByRole("slider");
    slider.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 32, right: 200, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 50 });
    expect(bar()).toBe(25);
    expect(screen.getByText("0:02")).toBeTruthy();
    // Loaded later: the seek is applied to the file
    const el = audioWith(10);
    let set = 0;
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => set, set: (v: number) => void (set = v) });
    fireEvent.loadedMetadata(el);
    expect(set).toBe(2.5);
  });

  it("speed 1× → 1.5× → 2× while playing, applied to the audio", () => {
    render(<VoiceBubble media={voice(10)} mine messageId="v1" />);
    expect(screen.queryByRole("button", { name: /سرعة التشغيل/ })).toBeNull();
    const el = document.querySelector("audio")!;
    fireEvent.playing(el);
    fireEvent.click(screen.getByRole("button", { name: "سرعة التشغيل 1×" }));
    expect(el.playbackRate).toBe(1.5);
    fireEvent.click(screen.getByRole("button", { name: "سرعة التشغيل 1.5×" }));
    expect(el.playbackRate).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "سرعة التشغيل 2×" }));
    expect(el.playbackRate).toBe(1);
  });

  it("the other person's note carries a dot until played here; mine never", async () => {
    render(<VoiceBubble media={voice(10)} mine={false} messageId="v9" />);
    expect(screen.getByTestId("voice-unplayed")).toBeTruthy();
    // Screen readers hear it on the play button (the dot itself is decoration)
    expect(screen.getByTestId("voice-unplayed").getAttribute("aria-label")).toBeNull();
    expect(screen.getByTestId("voice-unplayed").getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "تشغيل الرسالة الصوتية · لم تُسمع بعد" }));
    expect(screen.getByRole("button", { name: /^(إيقاف مؤقت|تشغيل الرسالة الصوتية)$/ })).toBeTruthy();
    expect(screen.queryByTestId("voice-unplayed")).toBeNull();
    cleanup();
    render(<VoiceBubble media={voice(10)} mine={false} messageId="v9" />);
    expect(screen.queryByTestId("voice-unplayed")).toBeNull();
    cleanup();
    render(<VoiceBubble media={voice(10)} mine messageId="v10" />);
    expect(screen.queryByTestId("voice-unplayed")).toBeNull();
  });
});
