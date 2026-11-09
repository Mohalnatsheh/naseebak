import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordCredit } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { arabicCount } from "@/lib/utils";
import { liveProWhere } from "@/lib/pro/status";

const MAX_YEARLY_GRANTS_PER_RUN = 500;
const YEARLY_GRANT_MONTHS = 12;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** One calendar month later, clamped to the month's last day (31 Jan -> 28 Feb) */
function addMonth(d: Date): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + 1);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/**
 * Give a Pro member their credits once per `key` (invoice:<id>, or yearly:<subscriptionId>:<n>).
 * The grant row, the balance, the ledger row and the counter change in one transaction; a repeated
 * key (webhook retry, second run) is a no-op.
 */
export async function grantProCredits(args: {
  subscriptionId: string;
  paymentId: string | null;
  key: string;
  credits: number;
}): Promise<"granted" | "already"> {
  const { subscriptionId, paymentId, key, credits } = args;
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
      await tx.proSubscription.update({ where: { id: subscriptionId }, data: { grantsMade: { increment: 1 } } });
      return sub.userId;
    });
  } catch (e) {
    if (isUniqueViolation(e) || e instanceof NoMemberError) return "already";
    throw e;
  }

  const count = arabicCount(credits, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" });
  await notify({
    userId,
    type: "PAYMENT",
    title: "رصيد Pro",
    body: `أُضيف ${count} إلى رصيدك من اشتراك Pro.`,
    url: "/dashboard/payments",
    sms: false,
  });
  return "granted";
}

class NoMemberError extends Error {}

/** Morning task: the monthly grant of live yearly memberships (months 2 to 12; month 1 comes with the invoice) */
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
      const payment = await db.payment.findFirst({
        where: { proSubscriptionId: sub.id, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const result = await grantProCredits({
        subscriptionId: sub.id,
        paymentId: payment?.id ?? null,
        key: `yearly:${sub.id}:${sub.grantsMade + 1}`,
        credits: sub.creditsPerGrant,
      });
      if (result === "granted") granted += 1;
      // Anchored on the planned date so twelve grants fit the year; a late run just catches up daily
      await db.proSubscription.update({
        where: { id: sub.id },
        data: { nextCreditGrantAt: addMonth(sub.nextCreditGrantAt ?? now) },
      });
    } catch (e) {
      console.error("[pro-grants] yearly grant failed", sub.id, e);
    }
  }
  return { granted };
}
