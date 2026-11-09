/**
 * Pro membership's Stripe events (webhook, and the local mock with Stripe-shaped fakes). The Stripe account is shared
 * with other sites: every handler first checks our marker and answers "not_ours" without touching the database.
 *
 * Stripe sends `checkout.session.completed` and `invoice.paid` in either order, and may send each more than once.
 * - Every write for one Stripe subscription runs under a Postgres advisory lock on its id, so two events of the same
 *   subscription never both create its row or both record one invoice.
 * - The Payment of an invoice is found by `providerTxId` = invoice id first: one invoice, one Payment.
 * - The credits go through `grantProCredits` keyed `invoice:<id>`: once, whatever repeats.
 */
import type Stripe from "stripe";
import type { Prisma, ProPlan, ProSubscription } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { toCountry } from "@/lib/countries";
import { getCountrySettings } from "@/lib/countries/settings";
import { grantProCredits } from "@/lib/pro/grants";
import { addMonth, addPlanPeriod } from "@/lib/pro/dates";
import { PRO_PLAN_IDS, PRO_PLAN_LABELS, proOffersFor, proPlanName, type ProPlanId } from "@/lib/pro/plans";
import {
  idOf,
  invoiceMetadata,
  invoicePeriod,
  invoiceSubscriptionId,
  isOurProMetadata,
  subscriptionEndedAt,
  subscriptionPeriodEnd,
} from "@/lib/pro/stripe-shapes";

export { isOurProMetadata };

export type ProEventResult = "ok" | "already" | "not_ours";

type Tx = Prisma.TransactionClient;
type Meta = Record<string, string>;

const PRO_STARTED_TITLE = "أصبحت عضوية Pro فعّالة";
const PRO_STARTED_BODY = "يمكنك الآن إرسال الصور والرسائل الصوتية في المحادثات.";
const PRO_FAILED_TITLE = "تعذّر تجديد اشتراك Pro";
const PRO_FAILED_BODY = "يمكنك تحديث بطاقتك من صفحة الدفع لمواصلة Pro.";
const PRO_ENDED_TITLE = "انتهت عضوية Pro";
const PRO_ENDED_BODY = "يمكنك الاشتراك في Pro من جديد في أي وقت من صفحة الدفع.";

function planOf(meta: Meta): ProPlanId | null {
  return (PRO_PLAN_IDS as readonly string[]).includes(meta.plan) ? (meta.plan as ProPlanId) : null;
}

const toEnum = (plan: ProPlanId) => plan.toUpperCase() as ProPlan;

/** Runs `fn` in one transaction holding the lock of this Stripe subscription */
function withSubscriptionLock<T>(stripeSubscriptionId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pro:${stripeSubscriptionId}`}))`;
    return fn(tx);
  });
}

const findRow = (tx: Tx, stripeSubscriptionId: string) =>
  tx.proSubscription.findFirst({ where: { stripeSubscriptionId }, orderBy: { createdAt: "asc" } });

/**
 * Creates the subscription row from our metadata. Price and currency come from the checkout's Payment (what the member
 * saw); credits per grant from the country's plan config now: a later admin change never alters a bought plan.
 */
async function createRow(
  tx: Tx,
  a: { stripeSubscriptionId: string; customerId: string | null; meta: Meta; plan: ProPlanId; periodEnd: Date }
): Promise<ProSubscription> {
  const country = toCountry(a.meta.country);
  const settings = await getCountrySettings(country);
  const config = settings.proPlans?.[a.plan];
  const payment = a.meta.paymentId
    ? await tx.payment.findUnique({ where: { id: a.meta.paymentId }, select: { amount: true, currency: true } })
    : null;
  let price: Prisma.Decimal | number;
  let currency: string;
  if (payment) {
    price = payment.amount;
    currency = payment.currency;
  } else {
    // The checkout's row is missing: the plan's price now is the best record left
    const offer = proOffersFor(country, settings.proPlans).find((o) => o.id === a.plan);
    price = offer?.price ?? config?.price ?? 0;
    currency = offer?.currency ?? (country === "SA" ? "SAR" : "JOD");
    console.warn("[pro] subscription without its checkout payment:", a.stripeSubscriptionId, a.meta.paymentId);
  }
  // A member deleted meanwhile: the row is kept for the records, with no member
  const member = a.meta.userId ? await tx.user.findUnique({ where: { id: a.meta.userId }, select: { id: true } }) : null;
  return tx.proSubscription.create({
    data: {
      userId: member?.id ?? null,
      country,
      plan: toEnum(a.plan),
      status: "ACTIVE",
      stripeSubscriptionId: a.stripeSubscriptionId,
      stripeCustomerId: a.customerId,
      currentPeriodEnd: a.periodEnd,
      price,
      currency,
      creditsPerGrant: config?.credits ?? 0,
    },
  });
}

/** checkout.session.completed of a Pro subscription: makes sure the row exists. Credits come with the invoice */
export async function handleProCheckoutCompleted(session: Stripe.Checkout.Session): Promise<ProEventResult> {
  const meta = session.metadata;
  if (!isOurProMetadata(meta) || session.mode !== "subscription") return "not_ours";
  const stripeSubscriptionId = idOf(session.subscription);
  const plan = planOf(meta!);
  if (!stripeSubscriptionId || !plan) {
    console.error("[pro] checkout without a subscription or plan:", session.id, meta);
    return "already";
  }
  return withSubscriptionLock(stripeSubscriptionId, async (tx) => {
    if (await findRow(tx, stripeSubscriptionId)) return "already";
    const created = new Date(session.created * 1000);
    // Paid: live for one estimated period until invoice.paid sets the exact end. Not paid yet: not live
    const periodEnd = session.payment_status === "paid" ? addPlanPeriod(created, plan) : created;
    await createRow(tx, { stripeSubscriptionId, customerId: idOf(session.customer), meta: meta!, plan, periodEnd });
    return "ok";
  });
}

/** invoice.paid of a Pro subscription: the row, the period, the Payment, then the credits */
export async function handleProInvoicePaid(invoice: Stripe.Invoice): Promise<ProEventResult> {
  const meta = invoiceMetadata(invoice);
  if (!isOurProMetadata(meta)) return "not_ours";
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  const plan = planOf(meta!);
  const period = invoicePeriod(invoice);
  if (!stripeSubscriptionId || !plan || !period) {
    console.error("[pro] paid invoice without a subscription, plan or period:", invoice.id, meta);
    return "already";
  }

  const step = await withSubscriptionLock(stripeSubscriptionId, async (tx) => {
    const sub =
      (await findRow(tx, stripeSubscriptionId)) ??
      (await createRow(tx, { stripeSubscriptionId, customerId: idOf(invoice.customer), meta: meta!, plan, periodEnd: period.end }));

    // One invoice, one Payment: a repeat finds the one it made
    let paymentId: string;
    let paymentNew = false;
    const existing = await tx.payment.findFirst({ where: { providerTxId: invoice.id }, select: { id: true } });
    if (existing) {
      paymentId = existing.id;
    } else {
      paymentNew = true;
      const checkoutRow = meta!.paymentId
        ? await tx.payment.findUnique({ where: { id: meta!.paymentId }, select: { id: true, status: true, providerTxId: true } })
        : null;
      if (checkoutRow && !checkoutRow.providerTxId && (checkoutRow.status === "PENDING" || checkoutRow.status === "FAILED")) {
        // The first invoice completes the checkout's row (also a FAILED one: the app gave up while the member paid)
        await tx.payment.update({
          where: { id: checkoutRow.id },
          data: { status: "COMPLETED", providerTxId: invoice.id, proSubscriptionId: sub.id, failureReason: null },
        });
        paymentId = checkoutRow.id;
      } else {
        const mock = invoice.id.startsWith("mock_");
        const first = !checkoutRow && !!meta!.paymentId;
        const row = await tx.payment.create({
          data: {
            // The checkout's row never got written: it is made now under its own id, so nothing else can claim it
            ...(first ? { id: meta!.paymentId } : {}),
            userId: sub.userId,
            type: "SUBSCRIPTION",
            planName: proPlanName(plan),
            amount: sub.price,
            currency: sub.currency,
            provider: "STRIPE",
            status: "COMPLETED",
            providerTxId: invoice.id,
            proSubscriptionId: sub.id,
            description: `${mock ? "[MOCK] " : ""}${first ? "اشتراك" : "تجديد اشتراك"} نصيبك Pro (${PRO_PLAN_LABELS[plan]})`,
          },
        });
        paymentId = row.id;
      }
    }

    const data: Prisma.ProSubscriptionUpdateInput = {};
    // Never back in time: an older invoice delivered late
    if (period.end > sub.currentPeriodEnd) data.currentPeriodEnd = period.end;
    // A paid invoice clears PAST_DUE; an ended or cancelled membership stays so
    if (sub.status === "PAST_DUE") data.status = "ACTIVE";
    const customerId = idOf(invoice.customer);
    if (!sub.stripeCustomerId && customerId) data.stripeCustomerId = customerId;
    if (Object.keys(data).length > 0) await tx.proSubscription.update({ where: { id: sub.id }, data });

    return { sub, paymentId, paymentNew };
  });

  const { sub, paymentId, paymentNew } = step;
  let granted = false;
  if ((invoice.amount_paid ?? 0) > 0) {
    const yearlyStart = sub.plan === "YEARLY" && sub.grantsMade === 0;
    const result = await grantProCredits({
      subscriptionId: sub.id,
      paymentId,
      key: `invoice:${invoice.id}`,
      credits: sub.creditsPerGrant,
      // Yearly: this invoice is month 1, the morning task gives months 2 to 12
      ...(yearlyStart ? { advanceNextTo: addMonth(period.start) } : {}),
    });
    granted = result === "granted";
  } else {
    console.warn("[pro] paid invoice of 0, no credits:", invoice.id);
  }

  // «started» once: when the checkout's own Payment is first recorded or first credited (a retry after a failed grant)
  if (sub.userId && paymentId === meta!.paymentId && (paymentNew || granted)) {
    try {
      await notify({ userId: sub.userId, type: "PAYMENT", title: PRO_STARTED_TITLE, body: PRO_STARTED_BODY, url: "/dashboard/payments", sms: false });
    } catch (e) {
      console.error("[pro] started notice failed", sub.id, e);
    }
  }
  return paymentNew || granted ? "ok" : "already";
}

/** invoice.payment_failed: PAST_DUE (Pro stays until the period ends) and a request to update the card */
export async function handleProInvoiceFailed(invoice: Stripe.Invoice): Promise<ProEventResult> {
  const meta = invoiceMetadata(invoice);
  if (!isOurProMetadata(meta)) return "not_ours";
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return "already";

  const step = await withSubscriptionLock(stripeSubscriptionId, async (tx) => {
    const sub = await findRow(tx, stripeSubscriptionId);
    if (!sub || (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE")) return null;
    const changed = sub.status === "ACTIVE";
    if (changed) await tx.proSubscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
    return { userId: sub.userId, changed };
  });
  if (!step) return "already";

  if (step.userId) {
    try {
      // Stripe retries over several days: at most one reminder a day
      await notify({
        userId: step.userId,
        type: "PAYMENT",
        title: PRO_FAILED_TITLE,
        body: PRO_FAILED_BODY,
        url: "/dashboard/payments",
        sms: false,
        oncePerDay: "pro-payment-failed",
      });
    } catch (e) {
      console.error("[pro] payment failed notice failed", stripeSubscriptionId, e);
    }
  }
  return step.changed ? "ok" : "already";
}

const STATUS_FROM_STRIPE: Partial<Record<Stripe.Subscription.Status, ProSubscription["status"]>> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  paused: "PAST_DUE",
  canceled: "CANCELED",
  incomplete_expired: "CANCELED",
};

/**
 * customer.subscription.updated / deleted. Updated: syncs cancelAtPeriodEnd, the period end and the status.
 * Deleted: ENDED with endedAt, and Pro ends at once. A local ENDED or CANCELED row never comes back.
 */
export async function handleProSubscriptionChanged(sub: Stripe.Subscription, kind: "updated" | "deleted" = "updated"): Promise<ProEventResult> {
  if (!isOurProMetadata(sub.metadata)) return "not_ours";
  const periodEnd = subscriptionPeriodEnd(sub);

  const step = await withSubscriptionLock(sub.id, async (tx) => {
    const row = await findRow(tx, sub.id);
    if (!row || row.status === "ENDED") return null;

    const data: Prisma.ProSubscriptionUpdateInput = {};
    if (row.cancelAtPeriodEnd !== sub.cancel_at_period_end) data.cancelAtPeriodEnd = sub.cancel_at_period_end;
    if (periodEnd && periodEnd > row.currentPeriodEnd) data.currentPeriodEnd = periodEnd;
    if (kind === "deleted") {
      data.status = "ENDED";
      data.endedAt = subscriptionEndedAt(sub) ?? new Date();
    } else if (row.status !== "CANCELED") {
      const status = STATUS_FROM_STRIPE[sub.status];
      if (status && status !== row.status) data.status = status;
    }
    if (Object.keys(data).length === 0) return null;
    await tx.proSubscription.update({ where: { id: row.id }, data });
    return { userId: row.userId };
  });
  if (!step) return "already";

  if (kind === "deleted" && step.userId) {
    try {
      await notify({ userId: step.userId, type: "PAYMENT", title: PRO_ENDED_TITLE, body: PRO_ENDED_BODY, url: "/dashboard/payments", sms: false });
    } catch (e) {
      console.error("[pro] ended notice failed", sub.id, e);
    }
  }
  return "ok";
}
