import { afterEach, describe, expect, it } from "vitest";
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
  const bar = () => Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));

  it("the bar follows the file's own length, not the declared one (rounded up)", () => {
    render(<VoiceBubble media={voice(4)} mine={false} />);
    expect(screen.getByText("0:04")).toBeTruthy();
    const el = audioWith(3.2);
    fireEvent.loadedMetadata(el);
    expect(screen.getByText("0:03")).toBeTruthy();
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => 3.2 });
    fireEvent.timeUpdate(el);
    expect(bar()).toBe(100);
  });

  it("an endless WebM length keeps the declared one", () => {
    render(<VoiceBubble media={voice(4)} mine />);
    const el = audioWith(Infinity);
    fireEvent.loadedMetadata(el);
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => 2 });
    fireEvent.timeUpdate(el);
    expect(bar()).toBe(50);
  });
});
