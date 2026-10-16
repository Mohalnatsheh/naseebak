/**
 * Credits (User.matchCredits). Bought in /dashboard/payments (Stripe webhook adds them).
 * Legacy mode: every suggestion a user receives uses 1 credit.
 * Per-request mode (switch `intro_requests_enabled`): suggestions are free (WEEKLY_FREE_SUGGESTIONS
 * per rolling 7 days) and each family/chat request costs the sender 1 credit, never refunded.
 * Credit-on-interest mode (switch `credit_on_interest`): "مهتم" on a suggestion costs 1 credit
 * (reason INTEREST, never refunded); "لا" is free.
 */
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { getCycleFlags } from "@/lib/settings";
import type { CreditReason } from "@prisma/client";

/** Free credits granted at registration in legacy mode. */
export const FREE_MATCH_CREDITS = 2;
/** Free credits granted at registration in per-request mode. */
export const NEW_CYCLE_FREE_CREDITS = 3;
/** Free suggestions per user per rolling 7 days in per-request mode. */
export const WEEKLY_FREE_SUGGESTIONS = 3;

export async function getRegistrationCredits(): Promise<number> {
  const { introRequests } = await getCycleFlags();
  return introRequests ? NEW_CYCLE_FREE_CREDITS : FREE_MATCH_CREDITS;
}

/**
 * Atomically take `count` credits from the user. Returns false (and takes nothing)
 * if the balance is lower than `count` — safe against concurrent requests.
 */
export async function reserveCredits(
  userId: string,
  count: number,
  client: Pick<typeof db, "user"> = db
): Promise<boolean> {
  if (count <= 0) return true;
  const res = await client.user.updateMany({
    where: { id: userId, matchCredits: { gte: count } },
    data: { matchCredits: { decrement: count } },
  });
  return res.count === 1;
}

export interface CreditEntry {
  userId: string;
  delta: number;
  reason: CreditReason;
  refId?: string;
  adminId?: string;
  note?: string;
}

/**
 * Add a row to the credit history (CreditLedger). Call it next to every change to matchCredits.
 * With a transaction client the write is part of that transaction (errors propagate); without one
 * it is best-effort — a missing history row must never fail the user's action.
 */
export async function recordCredit(
  entry: CreditEntry,
  client?: Pick<typeof db, "creditLedger">
): Promise<void> {
  if (!entry.delta) return;
  if (client) {
    await client.creditLedger.create({ data: entry });
    return;
  }
  try {
    await db.creditLedger.create({ data: entry });
  } catch (error) {
    console.error("Credit ledger write failed:", entry, error);
  }
}

/** Give back credits that were reserved but not used. */
export async function refundCredits(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await db.user.update({ where: { id: userId }, data: { matchCredits: { increment: count } } });
}

/** Tell the user their suggestion credits ran out (in-app notification + push → payments page). */
export async function notifyCreditsExhausted(userId: string): Promise<void> {
  const title = "انتهى رصيد الاقتراحات";
  const body = "استخدمت كل رصيد اقتراحاتك. اشحن رصيدك لتستمر باستلام اقتراحات جديدة.";
  await notify({ userId, type: "PAYMENT", title, body, url: "/dashboard/payments" });
}

/** Per-request mode: the user spent their last credit on a request. */
export async function notifyRequestCreditsExhausted(userId: string): Promise<void> {
  await notify({
    userId,
    type: "PAYMENT",
    title: "انتهى رصيدك",
    body: "استخدمت كل رصيدك. اشحن رصيدك لإرسال طلبات تعارف أو محادثة جديدة.",
    url: "/dashboard/payments",
  });
}

/** Credit-on-interest mode: the user spent their last credit on a "مهتم". */
export async function notifyInterestCreditsExhausted(userId: string): Promise<void> {
  await notify({
    userId,
    type: "PAYMENT",
    title: "انتهى رصيدك",
    body: "انتهى رصيدك — اشحن لتتابع",
    url: "/dashboard/payments",
  });
}
