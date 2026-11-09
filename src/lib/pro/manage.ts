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
import { PRO_ENDED_BODY, PRO_ENDED_TITLE, PRO_LEAVE_TITLE, proLeaveBody } from "@/lib/pro/notices";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import { sendAdminAlert } from "@/lib/admin-alert";
import { formatDate } from "@/lib/countries";

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

/**
 * Cancels on Stripe now, with no proration and no final invoice. One Stripe already cancelled, or no longer knows
 * (`resource_missing`: it can never charge again), counts as done
 */
export async function cancelOnStripe(stripeId: string): Promise<void> {
  try {
    await getStripe().subscriptions.cancel(stripeId, { invoice_now: false, prorate: false });
  } catch (e) {
    if ((e as { code?: string })?.code === "resource_missing") {
      console.warn("[pro] Stripe no longer knows subscription, counted as cancelled:", stripeId);
      return;
    }
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
  if (!(await endProLocally(sub.id))) {
    // Our Stripe cancel went through and its `customer.subscription.deleted` webhook ended the row first (and told the
    // member): this cancel still did it. Without a Stripe call, someone else ended it
    if (!stripeId) return "already";
    console.log("[pro] ended now (row ended by the webhook first):", sub.id, by.reason);
    return "ended";
  }
  console.log("[pro] ended now:", sub.id, by.reason, by.adminId ? `admin ${by.adminId}` : "");

  if (by.reason === "admin" && sub.userId) {
    try {
      await notify({ userId: sub.userId, type: "PAYMENT", title: PRO_ENDED_TITLE, body: PRO_ENDED_BODY, url: PRO_PAGE_PATH, sms: false });
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

/**
 * The member paused the account or asked to delete it (IOS-H01 ruling, 2026-11-10): a paused member must not keep
 * paying, so the live membership stops renewing at the period end, with no refund, and the member is told. Coming back
 * never resumes it on its own: «متابعة الاشتراك» on the Pro page does. (Deletion itself ends Pro at once:
 * cancelProForDeletion.) Never throws: a Stripe failure is logged and emailed to the admins to stop it by hand.
 */
export async function stopProRenewalOnLeave(userId: string, reason: "paused" | "deletion"): Promise<"stopped" | "none" | "already" | "failed"> {
  try {
    const sub = await currentProSubscription(userId);
    if (!sub) return "none";
    if (sub.cancelAtPeriodEnd) return "already";
    await cancelPro(userId);
    const me = await db.user.findUnique({ where: { id: userId }, select: { country: true } });
    const date = formatDate(sub.currentPeriodEnd, me?.country, { year: "numeric", month: "long", day: "numeric" });
    await notify({ userId, type: "PAYMENT", title: PRO_LEAVE_TITLE, body: proLeaveBody(reason, date), url: PRO_PAGE_PATH, sms: false }).catch((e) =>
      console.error("[pro] leave notice failed", userId, e),
    );
    return "stopped";
  } catch (e) {
    console.error("[pro] stopping renewal on leave failed", userId, e);
    await sendAdminAlert(
      "Pro renewal not stopped for a member who left",
      `Member ${userId} ${reason === "paused" ? "paused the account" : "asked to delete the account"}, but stopping the Pro renewal failed ` +
        `(${e instanceof Error ? e.message : String(e)}). Set it to cancel at the period end in Stripe by hand (no refund).`,
      { userId },
    ).catch(() => {});
    return "failed";
  }
}
