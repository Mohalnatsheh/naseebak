import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE" },
    country: "JO",
    unreadCount: 0,
    counts: { unreadChats: 0, flags: { creditOnInterest: true, mutualSuggestions: true } },
  }),
}));
vi.mock("@/lib/notifications-client", () => ({ markPageNotificationsRead: vi.fn() }));

import { WaChatList } from "@/components/chat/wa-chat-list";
import type { ChatSummary } from "@/lib/chat/service";

const DAY = 24 * 60 * 60 * 1000;
function chat(over: Partial<ChatSummary> & { id: string }): ChatSummary {
  return {
    matchId: "m" + over.id,
    partner: { id: "p" + over.id, firstName: "سارة" + over.id, isVerified: false, isPro: false, activityLabel: null },
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 10 * DAY).toISOString(),
    canExtend: false,
    endedByMe: false,
    blocked: false,
    matchHidden: false,
    lastMessage: { body: "مرحبا", createdAt: new Date().toISOString(), mine: false, read: false },
    unread: 0,
    ...over,
  } as ChatSummary;
}

const unread = chat({ id: "a", unread: 2 });
const read = chat({ id: "b" });
const ended = chat({ id: "c", status: "ENDED", unread: 3 });
const data = (chats: ChatSummary[]) => ({ chats, loadFailed: false, reload: vi.fn() });
const rows = () => screen.getAllByRole("link");

beforeEach(() => vi.clearAllMocks());

describe("WaChatList", () => {
  it("«الكل» shows the two active chats", () => {
    render(<WaChatList data={data([unread, read, ended])} />);
    expect(screen.getByRole("heading", { name: "المحادثات" })).toBeTruthy();
    expect(rows()).toHaveLength(2);
  });

  it("«غير مقروءة 1» shows one", () => {
    render(<WaChatList data={data([unread, read, ended])} />);
    fireEvent.click(screen.getByRole("button", { name: /غير مقروءة/ }));
    expect(screen.getByRole("button", { name: "غير مقروءة 1" })).toBeTruthy();
    expect(rows()).toHaveLength(1);
  });

  it("«المنتهية» shows the ended one, without a badge", () => {
    render(<WaChatList data={data([unread, read, ended])} />);
    fireEvent.click(screen.getByRole("button", { name: "المنتهية" }));
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).queryByText("3")).toBeNull();
  });

  it("an ended chat open beside the list starts on «المنتهية»", () => {
    render(<WaChatList activeId="c" data={data([unread, read, ended])} />);
    expect(rows()).toHaveLength(1);
  });

  it("two days left shows «باقي يومان»", () => {
    const soon = chat({ id: "d", expiresAt: new Date(Date.now() + 1.5 * DAY).toISOString() });
    render(<WaChatList data={data([soon])} />);
    expect(screen.getByText("باقي يومان")).toBeTruthy();
  });

  it("an ended chat with no messages says «لا توجد رسائل», not «ابدأ المحادثة»", () => {
    render(<WaChatList activeId="c" data={data([chat({ id: "c", status: "ENDED", lastMessage: null })])} />);
    expect(screen.getByText("لا توجد رسائل")).toBeTruthy();
    expect(screen.queryByText("ابدأ المحادثة")).toBeNull();
  });

  it("an active chat with no messages still says «ابدأ المحادثة»", () => {
    render(<WaChatList data={data([chat({ id: "e", lastMessage: null })])} />);
    expect(screen.getByText("ابدأ المحادثة")).toBeTruthy();
  });

  it("a failed first load shows the retry", () => {
    const d = { chats: null, loadFailed: true, reload: vi.fn() };
    render(<WaChatList data={d} />);
    fireEvent.click(screen.getByRole("button", { name: /مرة أخرى|إعادة/ }));
    expect(d.reload).toHaveBeenCalled();
  });
});
