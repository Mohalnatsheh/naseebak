/**
 * The chat's look, as plain functions (db-free, shared by the room and the list; same rules as the app's
 * chat_format.dart / chat_status_bar.dart): runs and tails, the «رسائل جديدة» divider, the one status bar, the tabs.
 */
import type { ChatSummary } from "@/lib/chat/service";
import { sameDay, type UiMessage } from "./chat-utils";

export interface RowLayout {
  /** A day chip starts here (first message, or a new day) */
  daySeparator: boolean;
  /** «رسائل جديدة» sits above this message */
  unreadDivider: boolean;
  /** First of a run from one sender: the bubble's tail and 8 px above; else no tail and 2 px above */
  tail: boolean;
}

/**
 * Layout of message `i` (oldest first). A run is broken by the other sender, a new day or the unread divider; every
 * bubble carries its own time, so a pause inside a run doesn't break it.
 */
export function chatRowLayout(messages: UiMessage[], i: number, unreadFromId?: string | null): RowLayout {
  const m = messages[i];
  const prev = i > 0 ? messages[i - 1] : undefined;
  const daySeparator = !prev || !sameDay(prev.createdAt, m.createdAt);
  const unreadDivider = !!unreadFromId && m.id === unreadFromId;
  const tail = !prev || daySeparator || unreadDivider || prev.mine !== m.mine;
  return { daySeparator, unreadDivider, tail };
}

/** Messages split by day (oldest first), each day with its own sticky chip */
export function groupByDay(messages: UiMessage[]): { key: string; first: number; items: UiMessage[] }[] {
  const days: { key: string; first: number; items: UiMessage[] }[] = [];
  messages.forEach((m, i) => {
    const last = days.at(-1);
    if (last && sameDay(last.items[0].createdAt, m.createdAt)) last.items.push(m);
    else days.push({ key: m.id, first: i, items: [m] });
  });
  return days;
}

/**
 * Where «رسائل جديدة» goes when the chat opens: the oldest of the other person's unread messages after my last one
 * (anything before my own reply was seen). Null when nothing of theirs is unread.
 */
export function firstUnreadId(messages: UiMessage[]): string | null {
  let first: string | null = null;
  for (const m of messages) {
    if (m.mine) first = null;
    else if (!m.readAt && !m.pending) first ??= m.id;
  }
  return first;
}

/** Where the family introduction stands, as the chat shows it */
export type FamilyStep = "offer" | "pending_sent" | "pending_received" | "accepted";

/**
 * The family step worth showing in the chat: offered only while requests are on and nothing closed the match; then
 * the request's state. A declined request (final) or a closed match shows nothing.
 */
export function familyStepOf(
  status: string | undefined,
  opts: { introRequests: boolean; closed: unknown }
): FamilyStep | null {
  if (!status || !opts.introRequests || opts.closed) return null;
  return status === "none"
    ? "offer"
    : status === "pending_sent" || status === "pending_received" || status === "accepted"
      ? status
      : null;
}

/**
 * An expired chat (read-only) keeps its way to the family step: a request on its way, one received (link to the match)
 * or guardian details shared (link). The offer has its own button in the footer; nothing else shows.
 */
export function closedChatFamilyNote(step: FamilyStep | null, viewerGender?: string): { text: string; link: boolean } | null {
  if (step === "pending_sent") return { text: "طلب التعارف العائلي بانتظار الرد.", link: false };
  if (step === "pending_received") return { text: viewerGender === "FEMALE" ? "وصلكِ طلب تعارف عائلي." : "وصلك طلب تعارف عائلي.", link: true };
  if (step === "accepted") return { text: "تم قبول التعارف العائلي · بيانات وليّ الأمر في صفحة التوافق.", link: true };
  return null;
}

export type ChatBar = "none" | "expiry" | "family" | "push";

/** Under this many days left, the chat counts as ending soon */
export const EXPIRY_SOON_DAYS = 3;

/**
 * The one slim bar under the header, by priority (owner ruling 2026-11-10, the same order as the app's
 * `chatStatusBar`):
 * 1. ending soon while it can still be extended (the bar carries «تمديد 7 أيام»);
 * 2. a family step to act on — the offer, or a request received — which then also states the days left;
 * 3. ending soon with nothing to do about it, above a family step with nothing to do (sent, accepted);
 * 4. the push chip, until dismissed.
 * The family offer waits until both have written (chat design P1): an empty chat opens on the conversation, not on a
 * family button. Nothing in a chat that can't be written in, nor while the phone keyboard is open.
 */
export function chatStatusBar(input: {
  open: boolean;
  daysLeft: number;
  canExtend: boolean;
  family: FamilyStep | null;
  pushOff: boolean;
  pushDismissed: boolean;
  keyboardOpen?: boolean;
  /** Both people have sent at least one message; `false` hides the family offer (undefined: shown) */
  bothWrote?: boolean;
}): ChatBar {
  if (!input.open || input.keyboardOpen) return "none";
  const family = input.family === "offer" && input.bothWrote === false ? null : input.family;
  const endingSoon = input.daysLeft <= EXPIRY_SOON_DAYS;
  if (endingSoon && input.canExtend) return "expiry";
  if (family === "offer" || family === "pending_received") return "family";
  if (endingSoon) return "expiry";
  if (family) return "family";
  if (input.pushOff && !input.pushDismissed) return "push";
  return "none";
}

/** «النشطة»: open and not blocked; everything else is read-only and goes under «المنتهية» */
export function isActiveChat(c: Pick<ChatSummary, "status" | "blocked">): boolean {
  return c.status === "ACTIVE" && !c.blocked;
}

export type ChatTab = "active" | "ended";

/** The list's two tabs, each in the server's order, with their unread totals */
export function splitChats<T extends Pick<ChatSummary, "status" | "blocked" | "unread">>(chats: T[]) {
  const active = chats.filter(isActiveChat);
  const ended = chats.filter((c) => !isActiveChat(c));
  const unread = (list: T[]) => list.reduce((n, c) => n + c.unread, 0);
  return { active, ended, activeUnread: unread(active), endedUnread: unread(ended) };
}

