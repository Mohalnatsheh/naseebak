import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhotoBubble } from "@/components/chat/media-bubble";

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
});
