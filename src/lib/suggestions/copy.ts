/** Shared copy for credit on interest (plain module: safe for server pages, JSON-LD and client components). */
export const CREDIT_ON_INTEREST_LINE = "يُستخدم رصيد واحد عند اختيار «مهتم»، والتوافق والطلبات والمحادثة مجانية.";

/** Switch `free_interest_reply`: answering someone who already said «مهتم» costs nothing. */
export const FREE_REPLY_LINE = "الرد بـ«مهتم» على من أبدى اهتمامه مجاني.";

/** Short line under a card that already says «أبدى اهتمامه بك» (switch `free_interest_reply`). */
export const FREE_REPLY_SHORT = "الرد بـ«مهتم» مجاني";

/** The same line next to the viewer's own button, in her words when the button says «مهتمة» (QA WM-14) */
export function freeReplyShort(female: boolean): string {
  return female ? "الرد بـ«مهتمة» مجاني" : FREE_REPLY_SHORT;
}

/** The credit rule line, plus the free-reply line while `free_interest_reply` is on. */
export function creditLine(freeReply = false): string {
  return freeReply ? `${CREDIT_ON_INTEREST_LINE} ${FREE_REPLY_LINE}` : CREDIT_ON_INTEREST_LINE;
}

/** The same lines in Lebanese dialect, for Lebanon's public pages (landing, FAQ) */
export const LB_CREDIT_ON_INTEREST_LINE = "«مهتم» بتاخد رصيد واحد، والتوافق والطلبات والمحادثة ببلاش.";
export const LB_FREE_REPLY_LINE = "والردّ بـ«مهتم» على يلّي بيّن اهتمامه ببلاش.";

export function lbCreditLine(freeReply = false): string {
  return freeReply ? `${LB_CREDIT_ON_INTEREST_LINE} ${LB_FREE_REPLY_LINE}` : LB_CREDIT_ON_INTEREST_LINE;
}

/** Dashboard home at 0 credits: what to say under «بانتظار ردّك» (null = no line). */
export function homeZeroCreditLine(o: { freeReply: boolean; likedYou: number; fresh: number; female: boolean }): string | null {
  const repliesNeedCredit = o.likedYou > 0 && !o.freeReply;
  if (!repliesNeedCredit && o.fresh <= 0) return null;
  if (o.freeReply && o.likedYou > 0) {
    return o.female
      ? "الرد بـ«مهتم» مجاني لمن أبدى اهتمامه. اشحني رصيدكِ لتقولي «مهتم» للاقتراحات الجديدة."
      : "الرد بـ«مهتم» مجاني لمن أبدى اهتمامه. اشحن رصيدك لتقول «مهتم» للاقتراحات الجديدة.";
  }
  return o.female ? "انتهى رصيدكِ: اشحني رصيدكِ لتقولي «مهتم»." : "انتهى رصيدك: اشحن رصيدك لتقول «مهتم».";
}
