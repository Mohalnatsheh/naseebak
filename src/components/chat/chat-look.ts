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

export type ChatBar = "none" | "expiry" | "family" | "push";

/** Under this many days left, the chat counts as ending soon */
export const EXPIRY_SOON_DAYS = 3;

/**
 * The one slim bar under the header, by priority (owner ruling 2026-11-10, same order in the app):
 * 1. ending soon while it can still be extended (the bar carries «تمديد 7 أيام»);
 * 2. the family step (in the last days it also states the days left, so the way to family stays visible);
 * 3. ending soon with nothing to do about it;
 * 4. the push chip, until dismissed.
 * Nothing in a chat that can't be written in, nor while the phone keyboard is open.
 */
export function chatStatusBar(input: {
  open: boolean;
  daysLeft: number;
  canExtend: boolean;
  family: FamilyStep | null;
  pushOff: boolean;
  pushDismissed: boolean;
  keyboardOpen?: boolean;
}): ChatBar {
  if (!input.open || input.keyboardOpen) return "none";
  const endingSoon = input.daysLeft <= EXPIRY_SOON_DAYS;
  if (endingSoon && input.canExtend) return "expiry";
  if (input.family) return "family";
  if (endingSoon) return "expiry";
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

/**
 * The soft backdrop behind the messages (same pattern as the app's ChatPatternPainter): eight-point stars in navy and
 * small rhombi in gold at a few percent, with dots, on a warm off-white. A small inline SVG tile: no file to serve,
 * no photo, no faces.
 */
const PATTERN_TILE = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">`,
  `<g fill="none" stroke="#22476a" stroke-opacity=".05" stroke-width="1.1">`,
  `<path d="M31 22 22 31 13 22 22 13Z M28.4 15.6V28.4H15.6V15.6Z"/>`,
  `<path d="M75 66 66 75 57 66 66 57Z M72.4 59.6V72.4H59.6V59.6Z"/>`,
  `</g>`,
  `<g fill="none" stroke="#c19250" stroke-opacity=".12" stroke-width="1.1">`,
  `<path d="M66 16 70 22 66 28 62 22Z"/><path d="M22 60 26 66 22 72 18 66Z"/>`,
  `</g>`,
  `<g fill="#22476a" fill-opacity=".05"><circle cx="44" cy="11" r="1.4"/><circle cx="0" cy="55" r="1.4"/><circle cx="88" cy="55" r="1.4"/></g>`,
  `</svg>`,
].join("");

export const CHAT_BACKDROP_STYLE = {
  backgroundColor: "color-mix(in oklch, var(--accent) 7%, var(--background))",
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(PATTERN_TILE)}")`,
  backgroundSize: "88px 88px",
} as const;
