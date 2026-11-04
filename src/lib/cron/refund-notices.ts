/**
 * Evening notice for credits that came back (owner decision 2026-11-04): a «مهتم» refunded because the card closed with
 * no answer (or the match was lost) used to reappear in the balance silently — ~70 a day. The evening run tells each
 * member once («رجع لك رصيد», push + bell, never SMS) about the refunds of the last 24 hours, so they come back to use them.
 */
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { isUnavailable } from "@/lib/matches/state";

export const REFUND_TITLE = "رجع لك رصيد";
const DAY_MS = 24 * 60 * 60 * 1000;

/** «رصيداً واحداً» / «رصيدين» / «3 أرصدة» / «11 رصيداً» */
export function creditsPhrase(n: number): string {
  if (n === 1) return "رصيداً واحداً";
  if (n === 2) return "رصيدين";
  if (n <= 10) return `${n} أرصدة`;
  return `${n} رصيداً`;
}

export function refundBody(n: number, female: boolean): string {
  return female
    ? `رجّعنا لكِ ${creditsPhrase(n)} من اقتراح لم يكتمل. استخدميه على «مهتم» مع اقتراح جديد يعجبكِ.`
    : `رجّعنا لك ${creditsPhrase(n)} من اقتراح لم يكتمل. استخدمه على «مهتم» مع اقتراح جديد يعجبك.`;
}

export async function notifyRefunds(now = new Date()): Promise<{ members: number; notified: number }> {
  const since = new Date(now.getTime() - DAY_MS);
  const refunds = await db.creditLedger.groupBy({
    by: ["userId"],
    where: { reason: "REFUND", delta: { gt: 0 }, createdAt: { gte: since }, userId: { not: null } },
    _sum: { delta: true },
  });
  let notified = 0;
  for (const r of refunds) {
    const userId = r.userId;
    const n = r._sum.delta ?? 0;
    if (!userId || n <= 0) continue;
    // Once per run window: a second evening run (or the admin's «Run now») never repeats it
    const told = await db.notification.findFirst({ where: { userId, title: REFUND_TITLE, createdAt: { gte: since } }, select: { id: true } });
    if (told) continue;
    const user = await db.user.findUnique({ where: { id: userId }, select: { gender: true, role: true, isDeactivated: true, status: true } });
    if (!user || user.role !== "USER" || isUnavailable(user)) continue;
    await notify({
      userId,
      type: "PAYMENT",
      title: REFUND_TITLE,
      body: refundBody(n, user.gender === "FEMALE"),
      url: "/dashboard/suggestions",
      sms: false,
    });
    notified++;
  }
  return { members: refunds.length, notified };
}
