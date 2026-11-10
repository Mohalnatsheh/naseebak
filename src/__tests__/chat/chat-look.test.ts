import { describe, expect, it } from "vitest";
import {
  chatRowLayout,
  chatStatusBar,
  familyStepOf,
  closedChatFamilyNote,
  endedChatNote,
  firstUnreadId,
  groupByDay,
  isActiveChat,
  splitChats,
} from "@/components/chat/chat-look";
import type { UiMessage } from "@/components/chat/chat-utils";

function msg(id: string, mine: boolean, createdAt: string, extra: Partial<UiMessage> = {}): UiMessage {
  return { id, body: id, createdAt, mine, readAt: null, kind: "TEXT", media: null, replyTo: null, reactions: [], ...extra };
}

// Local noon times, so the day boundaries don't depend on the machine's zone
const day1 = (h: number, m = 0) => new Date(2026, 10, 9, h, m).toISOString();
const day2 = (h: number, m = 0) => new Date(2026, 10, 10, h, m).toISOString();

describe("chatRowLayout: runs and tails", () => {
  const list = [
    msg("a", false, day1(10)),
    msg("b", false, day1(10, 1)),
    msg("c", true, day1(10, 2)),
    msg("d", true, day1(14)), // a long pause stays in the run
    msg("e", true, day2(9)), // a new day starts a new run
    msg("f", false, day2(9, 1)),
  ];

  it("puts a tail on the first bubble of each run only", () => {
    expect(list.map((_, i) => chatRowLayout(list, i).tail)).toEqual([true, false, true, false, true, true]);
  });

  it("starts a day chip on the first message and on each new day", () => {
    expect(list.map((_, i) => chatRowLayout(list, i).daySeparator)).toEqual([true, false, false, false, true, false]);
  });

  it("breaks a run at the unread divider", () => {
    const l = chatRowLayout(list, 1, "b");
    expect(l.unreadDivider).toBe(true);
    expect(l.tail).toBe(true);
    expect(chatRowLayout(list, 0, "b").unreadDivider).toBe(false);
  });
});

describe("groupByDay", () => {
  it("splits by day and keeps each message's index", () => {
    const list = [msg("a", true, day1(10)), msg("b", false, day1(11)), msg("c", true, day2(8))];
    const days = groupByDay(list);
    expect(days.map((d) => d.items.map((m) => m.id))).toEqual([["a", "b"], ["c"]]);
    expect(days.map((d) => d.first)).toEqual([0, 2]);
  });
});

describe("firstUnreadId: where «رسائل جديدة» goes", () => {
  it("is the oldest unread partner message after my last one", () => {
    const list = [
      msg("a", false, day1(9)),
      msg("b", true, day1(10)),
      msg("c", false, day1(11)),
      msg("d", false, day1(12)),
    ];
    expect(firstUnreadId(list)).toBe("c");
  });

  it("is null when everything of theirs was read, or I replied after it", () => {
    expect(firstUnreadId([msg("a", false, day1(9), { readAt: day1(9) })])).toBeNull();
    expect(firstUnreadId([msg("a", false, day1(9)), msg("b", true, day1(10))])).toBeNull();
    expect(firstUnreadId([])).toBeNull();
  });

  it("skips my unsent bubbles and read partner messages", () => {
    const list = [msg("a", false, day1(9), { readAt: day1(9) }), msg("b", false, day1(10))];
    expect(firstUnreadId(list)).toBe("b");
  });
});

describe("chatStatusBar: one bar, by priority", () => {
  const base = { open: true, daysLeft: 10, canExtend: false, family: null, pushOff: false, pushDismissed: false };

  it("(1) ending soon while it can be extended beats the family step and the push chip", () => {
    expect(chatStatusBar({ ...base, daysLeft: 3, canExtend: true, family: "offer", pushOff: true })).toBe("expiry");
    expect(chatStatusBar({ ...base, daysLeft: 0, canExtend: true })).toBe("expiry");
  });

  it("(2) a family step to act on (offer, request received) beats an expiry that can't be extended", () => {
    expect(chatStatusBar({ ...base, daysLeft: 2, family: "offer", pushOff: true })).toBe("family");
    expect(chatStatusBar({ ...base, daysLeft: 1, family: "pending_received" })).toBe("family");
    expect(chatStatusBar({ ...base, family: "pending_sent", pushOff: true })).toBe("family");
  });

  it("(3) ending soon with no action beats the push chip and a family step with nothing to do (as the app)", () => {
    expect(chatStatusBar({ ...base, daysLeft: 2, pushOff: true })).toBe("expiry");
    expect(chatStatusBar({ ...base, daysLeft: 2, family: "pending_sent" })).toBe("expiry");
    expect(chatStatusBar({ ...base, daysLeft: 1, family: "accepted" })).toBe("expiry");
  });

  it("the family offer waits until both have written (chat design P1)", () => {
    expect(chatStatusBar({ ...base, family: "offer", bothWrote: false })).toBe("none");
    expect(chatStatusBar({ ...base, family: "offer", bothWrote: false, pushOff: true })).toBe("push");
    expect(chatStatusBar({ ...base, family: "offer", bothWrote: true })).toBe("family");
    // A request received is an action: it shows at once
    expect(chatStatusBar({ ...base, family: "pending_received", bothWrote: false })).toBe("family");
  });

  it("(4) the push chip until dismissed", () => {
    expect(chatStatusBar({ ...base, pushOff: true })).toBe("push");
    expect(chatStatusBar({ ...base, pushOff: true, pushDismissed: true })).toBe("none");
  });

  it("nothing in a closed chat or while the keyboard is open", () => {
    expect(chatStatusBar({ ...base, open: false, daysLeft: 1, canExtend: true, family: "offer", pushOff: true })).toBe("none");
    expect(chatStatusBar({ ...base, daysLeft: 1, canExtend: true, keyboardOpen: true })).toBe("none");
    expect(chatStatusBar(base)).toBe("none");
  });
});

describe("familyStepOf", () => {
  it("maps the request state while requests are on and the match is open", () => {
    const on = { introRequests: true, closed: null };
    expect(familyStepOf("none", on)).toBe("offer");
    expect(familyStepOf("pending_sent", on)).toBe("pending_sent");
    expect(familyStepOf("pending_received", on)).toBe("pending_received");
    expect(familyStepOf("accepted", on)).toBe("accepted");
    expect(familyStepOf("declined", on)).toBeNull();
  });

  it("shows nothing with requests off, a closed match or no state yet", () => {
    expect(familyStepOf("none", { introRequests: false, closed: null })).toBeNull();
    expect(familyStepOf("none", { introRequests: true, closed: "NOT_A_MATCH" })).toBeNull();
    expect(familyStepOf(undefined, { introRequests: true, closed: null })).toBeNull();
  });
});

describe("chats list tabs", () => {
  const chats = [
    { id: "1", status: "ACTIVE" as const, blocked: false, unread: 2 },
    { id: "2", status: "EXPIRED" as const, blocked: false, unread: 1 },
    { id: "3", status: "ACTIVE" as const, blocked: true, unread: 0 },
    { id: "4", status: "ENDED" as const, blocked: false, unread: 0 },
    { id: "5", status: "ACTIVE" as const, blocked: false, unread: 3 },
  ];

  it("«النشطة» holds open, unblocked chats; the rest go under «المنتهية», order kept", () => {
    const { active, ended } = splitChats(chats);
    expect(active.map((c) => c.id)).toEqual(["1", "5"]);
    expect(ended.map((c) => c.id)).toEqual(["2", "3", "4"]);
  });

  it("totals the unread per tab", () => {
    const { activeUnread, endedUnread } = splitChats(chats);
    expect(activeUnread).toBe(5);
    expect(endedUnread).toBe(1);
  });

  it("a blocked chat is not active", () => {
    expect(isActiveChat({ status: "ACTIVE", blocked: true })).toBe(false);
  });
});

describe("closedChatFamilyNote: an expired chat keeps its family links (Task 2 review minor 2)", () => {
  it("a request on its way, one received, or guardian details: one line, with the match link where there is something to do", () => {
    expect(closedChatFamilyNote("pending_sent", "MALE")).toEqual({ text: "طلب التعارف العائلي بانتظار الرد.", link: false });
    expect(closedChatFamilyNote("pending_received", "MALE")).toEqual({ text: "وصلك طلب تعارف عائلي.", link: true });
    expect(closedChatFamilyNote("pending_received", "FEMALE")).toEqual({ text: "وصلكِ طلب تعارف عائلي.", link: true });
    expect(closedChatFamilyNote("accepted", "MALE")).toEqual({ text: "تم قبول التعارف العائلي · بيانات وليّ الأمر في صفحة التوافق.", link: true });
  });

  it("nothing for the offer (the footer has its own button) or no step", () => {
    expect(closedChatFamilyNote("offer", "MALE")).toBeNull();
    expect(closedChatFamilyNote(null, "MALE")).toBeNull();
  });
});

describe("endedChatNote", () => {
  it("names me or the partner only when one of us ended it", () => {
    expect(endedChatNote({ endedByMe: true, endedBy: "me" })).toBe("أنهيت هذه المحادثة.");
    expect(endedChatNote({ endedByMe: false, endedBy: "partner" })).toBe("أنهى الطرف الآخر هذه المحادثة.");
  });

  it("names nobody when an admin or a paused account closed it", () => {
    expect(endedChatNote({ endedByMe: false, endedBy: "system" })).toBe("انتهت هذه المحادثة.");
  });

  it("reads an answer without endedBy as before", () => {
    expect(endedChatNote({ endedByMe: true })).toBe("أنهيت هذه المحادثة.");
    expect(endedChatNote({ endedByMe: false })).toBe("أنهى الطرف الآخر هذه المحادثة.");
  });
});
