/**
 * Managing a Pro membership: the member cancels (at the period end) or resumes; an admin, a refund or an account
 * deletion ends it at once. Stripe is called first and the local row mirrors it after, so a Stripe failure leaves the
 * row as it was. Mock subscriptions (`mock_…`, local `PAYMENTS_MOCK`) only change locally.
 * The `customer.subscription.updated/deleted` webhook that follows finds the row already in that state.
 */
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { notify } from "@/lib/notify";
import { currentProSubscription } from "@/lib/pro/status";
import { PRO_ENDED_BODY, PRO_ENDED_TITLE } from "@/lib/pro/stripe-events";

/** A Stripe subscription we may call: real ids only, never a local mock or a missing id */
function stripeIdOf(sub: { stripeSubscriptionId: string | null }): string | null {
  const id = sub.stripeSubscriptionId;
  return id && !id.startsWith("mock_") ? id : null;
}

async function setCancelAtPeriodEnd(userId: string, cancel: boolean): Promise<"ok" | "none"> {
  const sub = await currentProSubscription(userId);
  if (!sub) return "none";
  if (sub.cancelAtPeriodEnd === cancel) return "ok";
  const stripeId = stripeIdOf(sub);
  if (stripeId) await getStripe().subscriptions.update(stripeId, { cancel_at_period_end: cancel });
  await db.proSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: cancel } });
  return "ok";
}

/** Stop renewing: Pro stays until the paid period ends. "none" without a live membership */
export function cancelPro(userId: string): Promise<"ok" | "none"> {
  return setCancelAtPeriodEnd(userId, true);
}

/** Undo a cancel before the period ends («متابعة الاشتراك») */
export function resumePro(userId: string): Promise<"ok" | "none"> {
  return setCancelAtPeriodEnd(userId, false);
}

/** Cancels on Stripe now, with no proration and no final invoice. One Stripe already cancelled counts as done */
async function cancelOnStripe(stripeId: string): Promise<void> {
  try {
    await getStripe().subscriptions.cancel(stripeId, { invoice_now: false, prorate: false });
  } catch (e) {
    const current = await getStripe().subscriptions.retrieve(stripeId).catch(() => null);
    if (current?.status !== "canceled") throw e;
  }
}

/** Marks the row ENDED here only (also when Stripe could not be reached: the caller alerts the admins) */
export async function endProLocally(subscriptionId: string): Promise<boolean> {
  const ended = await db.proSubscription.updateMany({
    where: { id: subscriptionId, status: { not: "ENDED" } },
    data: { status: "ENDED", endedAt: new Date() },
  });
  return ended.count === 1;
}

/**
 * Ends a membership at once: Stripe `subscriptions.cancel`, then ENDED. No refund and no credit take-back (a refund
 * goes through the admin refund action). An admin cancel tells the member; a deletion or a refund does not
 * (the refund has its own notice). Throws when Stripe fails, leaving the row as it was.
 */
export async function cancelProNow(
  subscriptionId: string,
  by: { adminId?: string; reason: "admin" | "deletion" | "refund" },
): Promise<"ended" | "already" | "not_found"> {
  const sub = await db.proSubscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, userId: true, status: true, stripeSubscriptionId: true },
  });
  if (!sub) return "not_found";
  if (sub.status === "ENDED") return "already";

  const stripeId = stripeIdOf(sub);
  if (stripeId) await cancelOnStripe(stripeId);
  if (!(await endProLocally(sub.id))) return "already";
  console.log("[pro] ended now:", sub.id, by.reason, by.adminId ? `admin ${by.adminId}` : "");

  if (by.reason === "admin" && sub.userId) {
    try {
      await notify({ userId: sub.userId, type: "PAYMENT", title: PRO_ENDED_TITLE, body: PRO_ENDED_BODY, url: "/dashboard/payments", sms: false });
    } catch (e) {
      console.error("[pro] ended notice failed", sub.id, e);
    }
  }
  return "ended";
}

/**
 * Account deletion: ends every membership of the member that Stripe could still charge, including a PAST_DUE one
 * whose period is over (Stripe keeps retrying it). Throws on a Stripe failure, so that deletion stops and is retried.
 */
export async function cancelProForDeletion(userId: string): Promise<number> {
  const subs = await db.proSubscription.findMany({
    where: { userId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    select: { id: true },
  });
  let ended = 0;
  for (const sub of subs) {
    if ((await cancelProNow(sub.id, { reason: "deletion" })) === "ended") ended += 1;
  }
  return ended;
}
