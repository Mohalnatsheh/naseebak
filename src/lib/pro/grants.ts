import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordCredit } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { arabicCount } from "@/lib/utils";
import { liveProWhere } from "@/lib/pro/status";
import { addMonth } from "@/lib/pro/dates";
import { proPlanName } from "@/lib/pro/plans";

const MAX_YEARLY_GRANTS_PER_RUN = 500;
const YEARLY_GRANT_MONTHS = 12;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Give a Pro member their credits once per `key` (invoice:<id>, or yearly:<that year's paymentId>:<n>).
 * The grant row, the balance, the ledger row and the counter change in one transaction; a repeated
 * key (webhook retry, second run) is a no-op.
 */
export async function grantProCredits(args: {
  subscriptionId: string;
  paymentId: string | null;
  key: string;
  credits: number;
  /** Yearly drip: moves the next grant date in the same transaction, so a crash can never grant twice */
  advanceNextTo?: Date;
  /**
   * A yearly invoice: this grant is month 1 of a new paid year, so `grantsMade` (yearly: grants in the current paid
   * year) restarts at 1. Only when the grant happens: a re-delivered invoice resets nothing.
   */
  restartYear?: boolean;
}): Promise<"granted" | "already"> {
  const { subscriptionId, paymentId, key, credits, advanceNextTo, restartYear } = args;
  if (credits <= 0) return "already";

  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      const sub = await tx.proSubscription.findUnique({ where: { id: subscriptionId }, select: { id: true, userId: true } });
      if (!sub?.userId) throw new NoMemberError();
      const grant = await tx.proCreditGrant.create({
        data: { key, subscriptionId, paymentId, userId: sub.userId, credits },
      });
      await tx.user.update({ where: { id: sub.userId }, data: { matchCredits: { increment: credits } } });
      await recordCredit({ userId: sub.userId, delta: credits, reason: "PRO_GRANT", refId: grant.id, note: key }, tx);
      await tx.proSubscription.update({
        where: { id: subscriptionId },
        data: { grantsMade: restartYear ? 1 : { increment: 1 }, ...(advanceNextTo ? { nextCreditGrantAt: advanceNextTo } : {}) },
      });
      return sub.userId;
    });
  } catch (e) {
    if (isUniqueViolation(e) || e instanceof NoMemberError) return "already";
    throw e;
  }

  const count = arabicCount(credits, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" });
  try {
    await notify({
      userId,
      type: "PAYMENT",
      title: "رصيد Pro",
      body: `أُضيف ${count} إلى رصيدك من اشتراك Pro.`,
      url: "/dashboard/payments",
      sms: false,
    });
  } catch (e) {
    // The credits are already in: a failed notice must never reach the caller
    console.error("[pro-grants] notice failed", subscriptionId, e);
  }
  return "granted";
}

class NoMemberError extends Error {}

/**
 * Morning task: the monthly grant of live yearly memberships, months 2 to 12 of each paid year (month 1 comes with the
 * year's invoice, which restarts `grantsMade` at 1). Each grant is keyed and linked to that year's payment, so a
 * refund of that payment takes back exactly that year's credits. After 12 it stops until the next yearly invoice.
 */
export async function runYearlyProGrants(now: Date): Promise<{ granted: number }> {
  const due = await db.proSubscription.findMany({
    where: {
      plan: "YEARLY",
      ...liveProWhere(now),
      nextCreditGrantAt: { lte: now },
      grantsMade: { lt: YEARLY_GRANT_MONTHS },
    },
    orderBy: { nextCreditGrantAt: "asc" },
    take: MAX_YEARLY_GRANTS_PER_RUN,
  });

  let granted = 0;
  for (const sub of due) {
    try {
      // The paid year now running: the latest completed yearly payment
      const payment = await db.payment.findFirst({
        where: { proSubscriptionId: sub.id, status: "COMPLETED", planName: proPlanName("yearly") },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!payment) {
        console.warn("[pro-grants] yearly subscription without a completed payment", sub.id);
        continue;
      }
      const nextDate = addMonth(sub.nextCreditGrantAt ?? now);
      const result = await grantProCredits({
        subscriptionId: sub.id,
        paymentId: payment.id,
        key: `yearly:${payment.id}:${sub.grantsMade + 1}`,
        credits: sub.creditsPerGrant,
        // Anchored on the planned date so twelve grants fit the year; a late run just catches up daily
        advanceNextTo: nextDate,
      });
      if (result === "granted") granted += 1;
      // Nothing was granted (key already used): only the date still has to move on
      else await db.proSubscription.update({ where: { id: sub.id }, data: { nextCreditGrantAt: nextDate } });
    } catch (e) {
      console.error("[pro-grants] yearly grant failed", sub.id, e);
    }
  }
  return { granted };
}
