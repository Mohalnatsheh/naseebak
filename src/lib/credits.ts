/**
 * Suggestion credits (User.matchCredits).
 * Every suggestion a user receives uses 1 credit. New users start with FREE_MATCH_CREDITS;
 * more are bought in /dashboard/payments (Stripe webhook adds them).
 */
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

/** Free suggestion credits granted to every new user at registration. */
export const FREE_MATCH_CREDITS = 2;

/**
 * Atomically take `count` credits from the user. Returns false (and takes nothing)
 * if the balance is lower than `count` — safe against concurrent requests.
 */
export async function reserveCredits(userId: string, count: number): Promise<boolean> {
  if (count <= 0) return true;
  const res = await db.user.updateMany({
    where: { id: userId, matchCredits: { gte: count } },
    data: { matchCredits: { decrement: count } },
  });
  return res.count === 1;
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
  await db.notification.create({ data: { userId, type: "PAYMENT", title, body } });
  sendPushNotification({ userId, title, body, url: "/dashboard/payments" });
}
