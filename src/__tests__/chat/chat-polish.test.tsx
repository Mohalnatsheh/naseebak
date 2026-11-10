import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/shared/notification-bar", () => ({ openPushSetup: vi.fn() }));

import { TimeArcButton } from "@/components/chat/time-arc-button";
import { ChatStatusBar } from "@/components/chat/chat-status-bar";
import { BubbleQuote, ReplyStrip } from "@/components/chat/reply-strip";
import { rowAfterKey } from "@/components/chat/row-focus";
import { MemberAvatar } from "@/components/shared/member-avatar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* Chat polish on the web (design review P2-1, S4, review X3 minor 9) */

describe("S4 time arc in the chat header", () => {
  it("names the days left; a tap shows «متبقي N أيام» and it goes away", () => {
    vi.useFakeTimers();
    render(<TimeArcButton daysLeftLabel="متبقي 9 أيام" avatar={<MemberAvatar name="ريم" size={42} timeLeft={9 / 14} />} />);
    const btn = screen.getByRole("button", { name: "متبقي 9 أيام على المحادثة" });
    expect(btn.getAttribute("title")).toBe("متبقي 9 أيام");
    expect(btn.className).toContain("h-11");
    fireEvent.click(btn);
    expect(screen.getByRole("status").textContent).toBe("متبقي 9 أيام");
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a closed chat: the avatar only, no button", () => {
    render(<TimeArcButton daysLeftLabel={null} avatar={<MemberAvatar name="ريم" size={42} dimmed />} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the next-step strip", () => {
  const common = {
    canExtend: false,
    busy: false,
    onExtend: vi.fn(),
    onFamily: vi.fn(),
    matchHref: "/dashboard/matches?match=x",
    pushBlocked: false,
    onPushDismiss: vi.fn(),
  };

  it("is a white card with a gold rule; a warning stays amber", () => {
    const { rerender } = render(<ChatStatusBar {...common} bar="family" family="offer" daysLeft={9} />);
    const card = screen.getByTestId("chat-bar-family");
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("border-s-accent");
    rerender(<ChatStatusBar {...common} bar="expiry" family={null} daysLeft={2} />);
    expect(screen.getByTestId("chat-bar-expiry").className).toContain("bg-amber-50");
  });
});

describe("quote author in dark gold", () => {
  it("on the partner's bubble and in the reply strip; light in my navy bubble", () => {
    const quote = { id: "q", mine: false, kind: "TEXT" as const, snippet: "مرحبا" };
    const { rerender } = render(<BubbleQuote quote={quote} partnerName="سلمى" mine={false} />);
    expect(screen.getByText("سلمى").className).toContain("text-accent-ink");
    rerender(<BubbleQuote quote={quote} partnerName="سلمى" mine />);
    expect(screen.getByText("سلمى").className).toContain("text-primary-foreground");
    rerender(<ReplyStrip quote={quote} partnerName="سلمى" onClose={() => {}} />);
    expect(screen.getByText("سلمى").className).toContain("text-accent-ink");
  });
});

describe("roving rows (review X3 minor 9)", () => {
  function list() {
    document.body.innerHTML = `<div data-message-list>${[0, 1, 2, 3]
      .map((i) => `<div data-message-row id="r${i}" tabindex="-1"></div>`)
      .join("")}</div>`;
    return [0, 1, 2, 3].map((i) => document.getElementById(`r${i}`)!);
  }

  it("↑ / ↓ move a row, Home / End jump, other keys and the edges do nothing", () => {
    const [a, b, c, d] = list();
    expect(rowAfterKey(b, "ArrowUp")).toBe(a);
    expect(rowAfterKey(b, "ArrowDown")).toBe(c);
    expect(rowAfterKey(c, "Home")).toBe(a);
    expect(rowAfterKey(a, "End")).toBe(d);
    expect(rowAfterKey(a, "ArrowUp")).toBeNull();
    expect(rowAfterKey(d, "ArrowDown")).toBeNull();
    expect(rowAfterKey(d, "End")).toBeNull();
    expect(rowAfterKey(b, "Enter")).toBeNull();
  });

  it("a row outside a list has no neighbours", () => {
    document.body.innerHTML = `<div data-message-row id="x"></div>`;
    expect(rowAfterKey(document.getElementById("x")!, "ArrowDown")).toBeNull();
  });
});
