import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordCredit } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { arabicCount } from "@/lib/utils";
import { liveProWhere } from "@/lib/pro/status";
import { addMonth, addMonths } from "@/lib/pro/dates";
import { PRO_PAGE_PATH, proPlanName } from "@/lib/pro/plans";

const MAX_YEARLY_GRANTS_PER_RUN = 500;
const YEARLY_GRANT_MONTHS = 12;

class NoMemberError extends Error {}

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
  /** No «رصيد Pro» notice: the caller tells the member in its own (a payment that didn't make Pro live, QA WP2-08) */
  silent?: boolean;
  /** A sale offer's bonus (key offer:<invoiceId>): never counts in `grantsMade`, which paces the yearly drip (12 a year) */
  extra?: boolean;
}): Promise<"granted" | "already"> {
  const { subscriptionId, paymentId, key, credits, advanceNextTo, restartYear, silent, extra } = args;
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
      if (!extra) {
        await tx.proSubscription.update({
          where: { id: subscriptionId },
          data: { grantsMade: restartYear ? 1 : { increment: 1 }, ...(advanceNextTo ? { nextCreditGrantAt: advanceNextTo } : {}) },
        });
      }
      return sub.userId;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return "already";
    if (e instanceof NoMemberError) {
      // The member was deleted (the row is kept for the records): nobody to credit, nothing to retry
      console.warn("[pro-grants] no member on the subscription, nothing granted", subscriptionId, key);
      return "already";
    }
    throw e;
  }

  if (silent) return "granted";
  const count = arabicCount(credits, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" });
  try {
    await notify({
      userId,
      type: "PAYMENT",
      title: "رصيد Pro",
      body: `أُضيف ${count} إلى رصيدك من اشتراك Pro.`,
      url: PRO_PAGE_PATH,
      sms: false,
    });
  } catch (e) {
    // The credits are already in: a failed notice must never reach the caller
    console.error("[pro-grants] notice failed", subscriptionId, e);
  }
  return "granted";
}

/** How far the per-month clamp can put an anchored date past "one month after the planned one" (28th → 31st) */
const MONTH_CLAMP_SLACK_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The date of the grant after month `month` of a paid year, anchored on the year's start day (the period end minus
 * twelve months) and clamped per month: 31 Jan → 28 Feb → 31 Mar, never drifting to the 28th. Falls back to one month
 * after the planned date if the period end can't anchor it (never earlier than that planned date), and never more
 * than a month (plus the short-month clamp) after it: if the morning job fell behind until the renewal moved the
 * period end a year on, the owed month still comes next month, not a year later.
 * Known trade-off (Pro review minor 6): when a fallback is taken, the date is one month after the planned one, so it
 * can lose the anchor day by a day or two (31 Dec planned from 30 Nov comes out 30 Dec). Only in that rare fell-behind
 * case; the next yearly invoice re-anchors the schedule.
 */
export function nextYearlyGrantDate(planned: Date, periodEnd: Date | null | undefined, month: number): Date {
  const oneMonthOn = addMonth(planned);
  if (!periodEnd || Number.isNaN(periodEnd.getTime())) return oneMonthOn;
  const anchored = addMonths(periodEnd, month - 12);
  if (anchored <= planned) return oneMonthOn;
  // 28 Feb → 31 Mar is 3 days past "one month on": the clamp's largest step
  return anchored.getTime() - oneMonthOn.getTime() > MONTH_CLAMP_SLACK_MS ? oneMonthOn : anchored;
}

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
      const nextDate = nextYearlyGrantDate(sub.nextCreditGrantAt ?? now, sub.currentPeriodEnd, sub.grantsMade + 1);
      const result = await grantProCredits({
        subscriptionId: sub.id,
        paymentId: payment.id,
        key: `yearly:${payment.id}:${sub.grantsMade + 1}`,
        credits: sub.creditsPerGrant,
        // Anchored on the paid year's start day so twelve grants fit the year; a late run just catches up daily
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
