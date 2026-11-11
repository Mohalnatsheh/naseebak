/**
 * The chat's interactions as plain functions (db-free, client-safe): hold to record, reactions (and their polling
 * updates), reply quotes, conversation starters, the empty chat hint, the typing throttle and chat delete (traces, hides). Same rules as the app (hold_to_record.dart,
 * message_menu.dart, starter_chips.dart).
 */
import type { ChatReaction } from "@/lib/chat/reactions";
import { replySnippet, type ReplyQuote } from "@/lib/chat/reply";
import { DELETED_TRACE } from "@/lib/chat/visibility";
import type { UiMessage } from "./chat-utils";

/** Slide this far towards the start edge while holding the mic: the recording is thrown away */
export const CANCEL_SLIDE_PX = 90;
/** Slide this far up while holding the mic: recording goes on hands-free (stop / cancel / send) */
export const LOCK_SLIDE_PX = 70;

export type HoldStep = "hold" | "cancel" | "lock";

/**
 * Where a held mic press stands after the pointer moved (dx, dy) from where it went down. The start edge is the
 * right in RTL (the mic sits at the end), the left in LTR. When both pass, the stronger direction wins.
 */
export function holdGesture({ dx, dy, rtl }: { dx: number; dy: number; rtl: boolean }): HoldStep {
  const towardStart = rtl ? dx : -dx;
  const up = -dy;
  const cancel = towardStart > CANCEL_SLIDE_PX;
  const lock = up > LOCK_SLIDE_PX;
  if (cancel && lock) return towardStart / CANCEL_SLIDE_PX >= up / LOCK_SLIDE_PX ? "cancel" : "lock";
  if (cancel) return "cancel";
  if (lock) return "lock";
  return "hold";
}

/**
 * How far a held finger may wander from the mic and still send on release (the app's `holdLeaveDistance`). With
 * pointer capture `pointerleave` never fires, so a release far away pauses and waits instead (final review minor 3).
 */
export const HOLD_LEAVE_PX = 72;

/** A release this far from where the press began still sends */
export function holdReleaseSends({ dx, dy }: { dx: number; dy: number }): boolean {
  return Math.hypot(dx, dy) <= HOLD_LEAVE_PX;
}

export type ReactionChip = { emoji: string; count: number; mine: boolean };

/** Chips under a bubble: one per emoji, in the order first used, with a count and whether one is mine */
export function groupReactions(reactions: readonly ChatReaction[]): ReactionChip[] {
  const chips: ReactionChip[] = [];
  for (const r of reactions) {
    const chip = chips.find((c) => c.emoji === r.emoji);
    if (chip) {
      chip.count += 1;
      chip.mine ||= r.mine;
    } else chips.push({ emoji: r.emoji, count: 1, mine: r.mine });
  }
  return chips;
}

/** What tapping `emoji` sends: the same one as mine removes it (null), anything else becomes mine */
export function nextReaction(reactions: readonly ChatReaction[], emoji: string): string | null {
  return reactions.some((r) => r.mine && r.emoji === emoji) ? null : emoji;
}

/** My reaction applied at once (one per member): the other person's stays as it is */
export function applyMyReaction(reactions: readonly ChatReaction[], emoji: string | null): ChatReaction[] {
  const others = reactions.filter((r) => !r.mine);
  return emoji ? [...others, { emoji, mine: true }] : others;
}

/** The quote of a message, as the server builds it (the strip above the composer and the optimistic bubble) */
export function quoteOf(m: Pick<UiMessage, "id" | "mine" | "kind" | "body">): ReplyQuote {
  return { id: m.id, mine: m.mine, kind: m.kind, snippet: replySnippet(m) };
}

/** A poll asks for reaction changes from this long before the server's last answer (nothing is missed in between) */
export const REACTIONS_OVERLAP_MS = 5000;

/** `reactionsSince` for the next poll: the last answer's `polledAt` less the overlap; null before any answer */
export function reactionsSinceFor(polledAt: string | null): string | null {
  if (!polledAt || Number.isNaN(Date.parse(polledAt))) return null;
  return new Date(Date.parse(polledAt) - REACTIONS_OVERLAP_MS).toISOString();
}

const sameReactions = (a: readonly ChatReaction[], b: readonly ChatReaction[]) =>
  a.length === b.length && a.every((r, i) => r.emoji === b[i].emoji && r.mine === b[i].mine);

/**
 * A poll's `reactionUpdates` (all of a message's reactions; an empty list removes the chips) applied to the loaded
 * messages. Unsent bubbles and messages not loaded are left alone; the same list comes back when nothing differs.
 */
export function applyReactionUpdates<T extends Pick<UiMessage, "id" | "pending" | "reactions">>(
  messages: T[],
  updates: readonly { messageId: string; reactions: ChatReaction[] }[] | undefined
): { messages: T[]; changed: boolean } {
  if (!updates?.length) return { messages, changed: false };
  const byId = new Map(updates.map((u) => [u.messageId, u.reactions]));
  let changed = false;
  const next = messages.map((m) => {
    const reactions = byId.get(m.id);
    if (!reactions || m.pending || sameReactions(m.reactions, reactions)) return m;
    changed = true;
    return { ...m, reactions };
  });
  return changed ? { messages: next, changed } : { messages, changed };
}

/** The empty chat's hint: it points to the suggestions below only while they show */
export function emptyChatHint({ female, starters }: { female: boolean; starters: boolean }): string {
  if (female) return starters ? "ابدئي المحادثة برسالة، أو اختاري أحد الاقتراحات بالأسفل." : "ابدئي المحادثة برسالة.";
  return starters ? "ابدأ المحادثة برسالة، أو اختر أحد الاقتراحات بالأسفل." : "ابدأ المحادثة برسالة.";
}

/** Starter chips: in a chat I can write in, while I haven't sent anything (the server sends them only then too) */
export function showStarters({ starters, canSend, messages }: { starters: readonly string[]; canSend: boolean; messages: readonly UiMessage[] }): boolean {
  return canSend && starters.length > 0 && !messages.some((m) => m.mine);
}

/** `fn` at most once per `windowMs`; `reset()` lets the next call through at once */
export function createThrottle(fn: () => void, windowMs: number, now: () => number = Date.now) {
  let last = -Infinity;
  const throttled = () => {
    const t = now();
    if (t - last < windowMs) return;
    last = t;
    fn();
  };
  throttled.reset = () => {
    last = -Infinity;
  };
  return throttled;
}

/** A quote of a message gone from my view (deleted for everyone, hidden or cleared) reads as the trace, as the server sends it */
function traceQuotes<T extends UiMessage>(list: T[], gone: ReadonlySet<string>): T[] {
  return list.map((m) =>
    m.replyTo && gone.has(m.replyTo.id) && m.replyTo.snippet !== DELETED_TRACE
      ? { ...m, replyTo: { ...m.replyTo, kind: "TEXT" as const, snippet: DELETED_TRACE } }
      : m
  );
}

/**
 * Messages deleted for everyone become the trace (the same shape the server sends: text «تم حذف الرسالة», no media,
 * quote or reactions), and quotes of them read as the trace. The same list back when there is nothing to apply.
 */
export function applyDeletions<T extends UiMessage>(list: T[], ids: readonly string[]): T[] {
  if (ids.length === 0) return list;
  const gone = new Set(ids);
  const traced = list.map((m) =>
    gone.has(m.id) ? { ...m, deleted: true, body: DELETED_TRACE, kind: "TEXT" as const, media: null, replyTo: null, reactions: [] } : m
  );
  return traceQuotes(traced, gone);
}

/**
 * Drops what left my view: messages I hid (`ids`) and every saved message at or before my clear point. Sends still
 * on their way (pending) stay. Quotes of dropped messages read as the trace. The same list back when nothing applies.
 */
export function dropHidden<T extends UiMessage>(list: T[], ids: readonly string[], clearedBefore: string | null): T[] {
  if (ids.length === 0 && !clearedBefore) return list;
  const hidden = new Set(ids);
  const cutoff = clearedBefore ? Date.parse(clearedBefore) : NaN;
  const gone = new Set<string>();
  const kept = list.filter((m) => {
    if (m.pending) return true;
    if (hidden.has(m.id) || (!Number.isNaN(cutoff) && Date.parse(m.createdAt) <= cutoff)) {
      gone.add(m.id);
      return false;
    }
    return true;
  });
  if (gone.size === 0) return list;
  return traceQuotes(kept, new Set([...gone, ...hidden]));
}

/**
 * How many rows of a poll (`?after=`) are from the cursor on: a poll also carries older rows deleted since then (as
 * traces), which never count towards the full page that asks for the next one.
 */
export function newerRowCount(rows: readonly { createdAt: string }[], after: string): number {
  const from = Date.parse(after);
  return rows.filter((m) => Date.parse(m.createdAt) >= from).length;
}
