import { arabicCount } from "@/lib/utils";
import type { UiMessage } from "./chat-utils";
import { menuItemsForActions, type MessageActions } from "./message-menu";

/** Inward drag (px) at which a swipe becomes a reply */
export const SWIPE_REPLY_PX = 64;

/**
 * A swipe on a bubble goes toward the screen's centre. `side` is where the bubble sits (logical): in the WhatsApp
 * layout mine are on the end side (left in RTL), so inward is right (positive dx), and the partner's on the start side
 * (right in RTL), inward is left (negative dx); mirrored in LTR.
 */
export function swipeReplyStep({
  dx,
  dy,
  rtl,
  side,
}: {
  dx: number;
  dy: number;
  rtl: boolean;
  side: "start" | "end";
}): "none" | "track" | "reply" {
  if (Math.abs(dy) > Math.abs(dx)) return "none";
  // On the right edge (start in RTL, end in LTR) inward is a negative dx
  const inwardIsNegative = rtl === (side === "start");
  const inward = inwardIsNegative ? -dx : dx;
  if (inward <= 0) return "none";
  return inward >= SWIPE_REPLY_PX ? "reply" : "track";
}

/** Enter sends on a keyboard device; never on a touch keyboard, with Shift, or while an IME composes */
export function enterSends({
  coarsePointer,
  shiftKey,
  composing,
}: {
  coarsePointer: boolean;
  shiftKey: boolean;
  composing: boolean;
}): boolean {
  return !coarsePointer && !shiftKey && !composing;
}

export function unreadStripLabel(n: number): string {
  return arabicCount(n, {
    one: "رسالة غير مقروءة",
    two: "رسالتان غير مقروءتين",
    few: "رسائل غير مقروءة",
    many: "رسالة غير مقروءة",
  });
}

/** Which tools the selection bar offers for one selected message */
export function selectionTools(m: UiMessage, a: MessageActions) {
  const i = menuItemsForActions(m, a);
  return {
    react: i.react,
    reply: i.reply,
    // a message still sending (or failed) has nothing to copy from the bar
    copy: i.copy && !m.pending,
    delete: i.deleteMe || i.deleteEveryone,
    report: i.report,
  };
}
