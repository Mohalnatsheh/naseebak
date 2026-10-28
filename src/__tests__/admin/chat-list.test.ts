import { describe, it, expect } from "vitest";
import { chatSummary, matchesView, sortChats, type ChatActivity } from "@/lib/admin/chat-list";

const NOW = new Date("2026-10-28T12:00:00Z");
const H = 60 * 60 * 1000;
const chat = (over: Partial<ChatActivity> = {}): ChatActivity => ({
  id: "c",
  createdAt: new Date(NOW.getTime() - 48 * H),
  expiresAt: new Date(NOW.getTime() + 10 * 24 * H),
  status: "ACTIVE",
  endedByAdminId: null,
  messages: 0,
  bySender: {},
  lastAt: null,
  lastSenderId: null,
  reported: false,
  ...over,
});

describe("matchesView", () => {
  it("tells talking, one-sided and not started apart", () => {
    const talking = chat({ messages: 5, bySender: { a: 3, b: 2 }, lastAt: NOW });
    const oneSided = chat({ messages: 2, bySender: { a: 2 }, lastAt: NOW });
    const none = chat();
    expect(matchesView(talking, "talking", NOW)).toBe(true);
    expect(matchesView(oneSided, "one_sided", NOW)).toBe(true);
    expect(matchesView(oneSided, "talking", NOW)).toBe(false);
    expect(matchesView(none, "not_started", NOW)).toBe(true);
  });

  it("finds open chats ending within 3 days, quiet for 48 h, paused or reported", () => {
    expect(matchesView(chat({ expiresAt: new Date(NOW.getTime() + 2 * 24 * H) }), "expiring", NOW)).toBe(true);
    expect(matchesView(chat({ status: "ENDED", expiresAt: new Date(NOW.getTime() + 2 * 24 * H) }), "expiring", NOW)).toBe(false);
    expect(matchesView(chat({ messages: 3, bySender: { a: 3 }, lastAt: new Date(NOW.getTime() - 50 * H) }), "quiet", NOW)).toBe(true);
    expect(matchesView(chat({ messages: 3, bySender: { a: 3 }, lastAt: new Date(NOW.getTime() - 5 * H) }), "quiet", NOW)).toBe(false);
    expect(matchesView(chat({ status: "ENDED", endedByAdminId: "system:report-review" }), "paused", NOW)).toBe(true);
    expect(matchesView(chat({ reported: true }), "reported", NOW)).toBe(true);
  });
});

describe("sortChats", () => {
  const a = chat({ id: "a", lastAt: new Date(NOW.getTime() - 1 * H), messages: 4, expiresAt: new Date(NOW.getTime() + 9 * 24 * H) });
  const b = chat({ id: "b", lastAt: new Date(NOW.getTime() - 5 * H), messages: 40, expiresAt: new Date(NOW.getTime() + 1 * 24 * H) });
  const c = chat({ id: "c", lastAt: null, createdAt: NOW });
  const d = chat({ id: "d", status: "ENDED", lastAt: new Date(NOW.getTime() - 30 * H), messages: 2 });

  it("orders by last message, chats with none last", () => {
    expect(sortChats([c, b, d, a], "last_message").map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
  });
  it("orders by most messages and by ending soonest (closed chats last)", () => {
    expect(sortChats([a, b, c], "most_messages")[0].id).toBe("b");
    expect(sortChats([d, a, b], "expiring").map((x) => x.id)).toEqual(["b", "a", "d"]);
  });
  it("orders by newest chat", () => {
    expect(sortChats([a, c], "newest")[0].id).toBe("c");
  });
});

describe("chatSummary", () => {
  it("counts open chats, today's talk and the problem groups", () => {
    const s = chatSummary(
      [
        chat({ messages: 4, bySender: { a: 2, b: 2 }, lastAt: new Date(NOW.getTime() - 2 * H) }),
        chat({ messages: 1, bySender: { a: 1 }, lastAt: new Date(NOW.getTime() - 60 * H) }),
        chat(),
        chat({ status: "ENDED", reported: true }),
      ],
      NOW,
    );
    expect(s).toEqual({ open: 3, talkedToday: 1, notStarted: 1, oneSided: 1, quiet: 1, expiring: 0, reported: 1 });
  });
});
