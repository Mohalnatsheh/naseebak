import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO" }) }));

import { MessageBubble } from "@/components/chat/message-bubble";
import type { UiMessage } from "@/components/chat/chat-utils";

afterEach(cleanup);

const message = (extra: Partial<UiMessage> = {}): UiMessage => ({
  id: "m1",
  body: "Hello, how are you?",
  createdAt: new Date(2026, 10, 10, 13, 5).toISOString(),
  mine: true,
  readAt: null,
  kind: "TEXT",
  media: null,
  replyTo: null,
  reactions: [],
  ...extra,
});

describe("MessageBubble", () => {
  it("the first of a run has a tail and 8 px above; the rest none and 2 px", () => {
    const first = render(<MessageBubble message={message()} tail />);
    expect(first.queryByTestId("bubble-tail")).not.toBeNull();
    expect(first.container.firstElementChild?.className).toContain("mt-2");
    cleanup();
    const next = render(<MessageBubble message={message()} tail={false} />);
    expect(next.queryByTestId("bubble-tail")).toBeNull();
    expect(next.container.firstElementChild?.className).toContain("mt-0.5");
  });

  it("keeps the time and ticks inside the bubble, and the text's own direction", () => {
    const { container, getByLabelText, getByText } = render(<MessageBubble message={message()} tail />);
    const text = getByText("Hello, how are you?");
    expect(text.getAttribute("dir")).toBe("auto");
    const bubble = text.parentElement!;
    expect(bubble.contains(getByLabelText("تم الإرسال"))).toBe(true);
    expect(bubble.textContent).toMatch(/1:05/);
    expect(container.querySelector("[data-message-id='m1']")).not.toBeNull();
  });

  it("read ticks once the other person read it; theirs carry no ticks", () => {
    const read = render(<MessageBubble message={message({ readAt: new Date().toISOString() })} tail />);
    expect(read.getByLabelText("تمت القراءة")).toBeTruthy();
    cleanup();
    const theirs = render(<MessageBubble message={message({ mine: false })} tail />);
    expect(theirs.queryByLabelText("تم الإرسال")).toBeNull();
    expect(theirs.getByTestId("bubble-tail").className).toContain("-end-2");
  });
});
