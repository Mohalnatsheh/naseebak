import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO" }) }));
vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));

import { ChatComposer } from "@/components/chat/chat-composer";

afterEach(cleanup);

describe("send button after an error on this device", () => {
  it("stops the spinner and keeps the text when sending throws (2026-11-13: iOS 16.3 spun forever)", async () => {
    const onSend = vi.fn(async () => {
      throw new SyntaxError("Invalid regular expression: invalid group specifier name");
    });
    render(<ChatComposer onSend={onSend} error={null} onTyping={vi.fn()} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "السلام عليكم" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button", { name: "إرسال" });
    expect(button.querySelector(".animate-spin")).toBeNull();
    expect(button).not.toBeDisabled();
    expect(box.value).toBe("السلام عليكم");
  });
});
