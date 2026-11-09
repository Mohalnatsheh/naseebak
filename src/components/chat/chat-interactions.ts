/**
 * The chat's interactions as plain functions (db-free, client-safe): hold to record, reactions, reply quotes, the
 * report prefill, conversation starters and the typing throttle. Same rules as the app (hold_to_record.dart,
 * message_menu.dart, starter_chips.dart).
 */
import type { ChatReaction } from "@/lib/chat/reactions";
import { replySnippet, type ReplyQuote } from "@/lib/chat/reply";
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

/** «إبلاغ عن الرسالة»: the report's details start with the message (still editable), same words as the app */
export function reportDetailsFor(m: Pick<UiMessage, "kind" | "body">): string {
  return `بخصوص الرسالة: «${replySnippet(m)}»`;
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
