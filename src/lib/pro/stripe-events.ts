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
import type { CountrySettings } from "@/lib/countries/settings";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { countryConfig, toCountry } from "@/lib/countries";
import { getCountrySettings } from "@/lib/countries/settings";
import { grantProCredits } from "@/lib/pro/grants";
import { PRO_ENDED_BODY, PRO_ENDED_TITLE, PRO_FAILED_BODY, PRO_FAILED_TITLE } from "@/lib/pro/notices";
import { liveProWhere } from "@/lib/pro/status";
import { settleNotLiveProInvoice } from "@/lib/pro/duplicate";
import { cancelOnStripe } from "@/lib/pro/manage";
import { sendAdminAlert } from "@/lib/admin-alert";
import { addMonth, addPlanPeriod } from "@/lib/pro/dates";
import { PRO_PAGE_PATH, PRO_PLAN_IDS, PRO_PLAN_LABELS, proOffersFor, proPlanName, type ProPlanId } from "@/lib/pro/plans";
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
export { PRO_ENDED_BODY, PRO_ENDED_TITLE };

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

/**
 * Serialises a member's Pro events across their subscriptions (taken after the subscription's lock, always in that
 * order): two first invoices of two subscriptions can't both see "no other live membership".
 */
async function lockMember(tx: Tx, userId: string | undefined): Promise<void> {
  if (userId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pro-user:${userId}`}))`;
}

/** The member's live membership on another Stripe subscription: one arriving now is a duplicate checkout */
function otherLiveRow(tx: Tx, userId: string, stripeSubscriptionId: string) {
  return tx.proSubscription.findFirst({
    where: { userId, stripeSubscriptionId: { not: stripeSubscriptionId }, ...liveProWhere(new Date()) },
    select: { id: true, stripeSubscriptionId: true },
  });
}

/** How far before the row's end an invoice's period must end to count as an older period delivered late */
const OLDER_PERIOD_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;

const findRow = (tx: Tx, stripeSubscriptionId: string) =>
  tx.proSubscription.findFirst({ where: { stripeSubscriptionId }, orderBy: { createdAt: "asc" } });

/** The country settings a row may need, read before taking the lock (a cold read never lengthens the locked time) */
function settingsFor(meta: Meta): Promise<CountrySettings> {
  return getCountrySettings(toCountry(meta.country));
}

/** A sale offer's first-payment bonus from the checkout metadata (lib/payments/offer); 0 when absent or out of range */
function offerBonusFromMeta(meta: Meta): number {
  const n = Number(meta.offerBonus);
  return Number.isInteger(n) && n > 0 && n <= 200 ? n : 0;
}

/** Credits per grant the member saw at checkout (metadata), or null for an older checkout without them */
function creditsFromMeta(meta: Meta): number | null {
  const n = Number(meta.credits);
  return meta.credits !== undefined && meta.credits !== "" && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Creates the subscription row from our metadata. Price and currency come from the checkout's Payment (what the member
 * saw), and credits per grant from the checkout's metadata (what the offer said; the country's plan config now for
 * an older checkout without them): a later admin change never alters a bought plan.
 */
async function createRow(
  tx: Tx,
  a: { stripeSubscriptionId: string; customerId: string | null; meta: Meta; plan: ProPlanId; periodEnd: Date; settings: CountrySettings }
): Promise<ProSubscription> {
  const country = toCountry(a.meta.country);
  const settings = a.settings;
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
    currency = offer?.currency ?? countryConfig(country).currency.code;
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
      creditsPerGrant: creditsFromMeta(a.meta) ?? config?.credits ?? 0,
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
  const settings = await settingsFor(meta!);
  return withSubscriptionLock(stripeSubscriptionId, async (tx) => {
    if (await findRow(tx, stripeSubscriptionId)) return "already";
    await lockMember(tx, meta!.userId);
    const created = new Date(session.created * 1000);
    // A second subscription while another is live is not made live here (and a subscription update never extends a
    // row with no paid invoice): its invoice.paid ends it, cancels it at Stripe and leaves any refund to an admin
    const duplicate = meta!.userId ? await otherLiveRow(tx, meta!.userId, stripeSubscriptionId) : null;
    // Paid: live for one estimated period until invoice.paid sets the exact end. Not paid yet: not live
    const periodEnd = session.payment_status === "paid" && !duplicate ? addPlanPeriod(created, plan) : created;
    await createRow(tx, { stripeSubscriptionId, customerId: idOf(session.customer), meta: meta!, plan, periodEnd, settings });
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

  const settings = await settingsFor(meta!);
  const step = await withSubscriptionLock(stripeSubscriptionId, async (tx) => {
    await lockMember(tx, meta!.userId);
    let sub =
      (await findRow(tx, stripeSubscriptionId)) ??
      (await createRow(tx, { stripeSubscriptionId, customerId: idOf(invoice.customer), meta: meta!, plan, periodEnd: period.end, settings }));

    // The member already has a live membership on another subscription: this one is never live (ENDED here, cancelled
    // at Stripe after the commit). Its invoice still grants its credits: the money was taken, and only an admin refunds
    const keep = sub.userId ? await otherLiveRow(tx, sub.userId, stripeSubscriptionId) : null;
    if (keep && sub.status !== "ENDED") {
      sub = await tx.proSubscription.update({ where: { id: sub.id }, data: { status: "ENDED", endedAt: sub.endedAt ?? new Date() } });
    }
    // This membership already ended here (ENDED or CANCELED): a paid invoice never revives it. Its credits are granted,
    // the subscription is cancelled at Stripe so it stops charging, and the admins decide on a refund by hand
    const endedHere = !keep && (sub.status === "ENDED" || sub.status === "CANCELED");

    // One invoice, one Payment: a repeat finds the one it made
    let paymentId: string;
    let paymentNew = false;
    const existing = await tx.payment.findFirst({ where: { providerTxId: invoice.id }, select: { id: true } });
    if (existing) {
      paymentId = existing.id;
    } else {
      paymentNew = true;
      const checkoutRow = meta!.paymentId
        ? await tx.payment.findUnique({ where: { id: meta!.paymentId }, select: { id: true, status: true, providerTxId: true, chargeCurrency: true } })
        : null;
      // A renewal (billing_reason subscription_cycle) delivered before the first invoice never takes the checkout's row
      const renewal = invoice.billing_reason === "subscription_cycle";
      // What the card was really charged in: the invoice's own currency (a subscription started in USD renews in USD)
      const chargeCurrency = invoice.currency ? invoice.currency.toLowerCase() : null;
      if (checkoutRow?.chargeCurrency && chargeCurrency && checkoutRow.chargeCurrency !== chargeCurrency) {
        console.warn("[pro] invoice currency differs from the checkout's:", invoice.id, checkoutRow.id, chargeCurrency, checkoutRow.chargeCurrency);
      }
      if (!renewal && checkoutRow && !checkoutRow.providerTxId && (checkoutRow.status === "PENDING" || checkoutRow.status === "FAILED")) {
        // The first invoice completes the checkout's row (also a FAILED one: the app gave up while the member paid)
        await tx.payment.update({
          where: { id: checkoutRow.id },
          data: { status: "COMPLETED", providerTxId: invoice.id, proSubscriptionId: sub.id, failureReason: null, chargeCurrency },
        });
        paymentId = checkoutRow.id;
      } else {
        const mock = invoice.id.startsWith("mock_");
        const first = !renewal && !checkoutRow && !!meta!.paymentId;
        const row = await tx.payment.create({
          data: {
            // The checkout's row never got written: it is made now under its own id, so nothing else can claim it
            ...(first ? { id: meta!.paymentId } : {}),
            userId: sub.userId,
            type: "SUBSCRIPTION",
            planName: proPlanName(plan),
            amount: sub.price,
            currency: sub.currency,
            chargeCurrency,
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

    if (keep) {
      // The kept membership's latest payment, named in the admins' email next to this one
      const kept = await tx.payment.findFirst({
        where: { proSubscriptionId: keep.id, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      return {
        sub, paymentId, paymentNew, notLive: "duplicate" as const,
        kept: { stripeSubscriptionId: keep.stripeSubscriptionId ?? null, paymentId: kept?.id ?? null },
      };
    }
    if (endedHere) return { sub, paymentId, paymentNew, notLive: "ended" as const, kept: null };

    // An older paid period first delivered after a newer one (well before the row's end: the checkout's estimate is
    // only seconds off): its credits are granted, but it never restarts the yearly count or moves the drip date
    const olderPeriod = period.end.getTime() < sub.currentPeriodEnd.getTime() - OLDER_PERIOD_MARGIN_MS;

    const data: Prisma.ProSubscriptionUpdateInput = {};
    // Never back in time: an older invoice delivered late
    if (period.end > sub.currentPeriodEnd) data.currentPeriodEnd = period.end;
    // A paid invoice clears PAST_DUE; an ended or cancelled membership stays so
    if (sub.status === "PAST_DUE") data.status = "ACTIVE";
    const customerId = idOf(invoice.customer);
    if (!sub.stripeCustomerId && customerId) data.stripeCustomerId = customerId;
    if (Object.keys(data).length > 0) await tx.proSubscription.update({ where: { id: sub.id }, data });

    return { sub, paymentId, paymentNew, notLive: null, kept: null, olderPeriod };
  });

  const { sub, paymentId, paymentNew } = step;
  if (step.notLive) {
    // Credits only, keyed by the invoice (once whatever repeats); no yearly drip and no «started»: Pro is not live
    let granted = false;
    if ((invoice.amount_paid ?? 0) > 0) {
      // Told in the «دفعة Pro إضافية» notice below, not in a separate «رصيد Pro» (QA WP2-08)
      granted = (await grantProCredits({ subscriptionId: sub.id, paymentId, key: `invoice:${invoice.id}`, credits: sub.creditsPerGrant, silent: true })) === "granted";
    }
    await settleNotLiveProInvoice({
      reason: step.notLive,
      userId: sub.userId,
      stripeSubscriptionId,
      previousStatus: sub.status,
      kept: step.kept,
      paymentId,
      invoiceId: invoice.id,
      credits: granted ? sub.creditsPerGrant : 0,
      firstSeen: paymentNew,
    });
    return paymentNew || granted ? "ok" : "already";
  }
  let granted = false;
  const grants = (invoice.amount_paid ?? 0) > 0 && sub.creditsPerGrant > 0;
  if ((invoice.amount_paid ?? 0) > 0) {
    const result = await grantProCredits({
      subscriptionId: sub.id,
      paymentId,
      key: `invoice:${invoice.id}`,
      credits: sub.creditsPerGrant,
      // Yearly: every yearly invoice is month 1 of a paid year (count restarts at 1, in the grant's transaction);
      // the morning task gives months 2 to 12 from a month after the period start
      ...(sub.plan === "YEARLY" && !step.olderPeriod ? { restartYear: true, advanceNextTo: addMonth(period.start) } : {}),
    });
    granted = result === "granted";
  } else {
    console.warn("[pro] paid invoice of 0, no credits:", invoice.id);
  }

  // Sale offer: the first invoice's bonus (metadata offerBonus), once by its own key, on the same payment so a refund
  // of that payment takes it back with the rest. Never on a renewal, never on a not-live invoice (handled above)
  const offerBonus = offerBonusFromMeta(meta!);
  if (offerBonus > 0 && invoice.billing_reason === "subscription_create" && (invoice.amount_paid ?? 0) > 0) {
    try {
      await grantProCredits({ subscriptionId: sub.id, paymentId, key: `offer:${invoice.id}`, credits: offerBonus, silent: true, extra: true });
    } catch (e) {
      // Never blocks the membership or its «started» notice; the admins can add the bonus by hand
      console.error("[pro] offer bonus grant failed", sub.id, invoice.id, e);
    }
  }

  // «started» once: by whoever grants the checkout's invoice (the grant is once per key, so two racing deliveries can't
  // both tell; a retry after a failed grant tells), or, with no credits to grant, by whoever first records its Payment
  if (sub.userId && paymentId === meta!.paymentId && (granted || (!grants && paymentNew))) {
    try {
      await notify({ userId: sub.userId, type: "PAYMENT", title: PRO_STARTED_TITLE, body: PRO_STARTED_BODY, url: PRO_PAGE_PATH, sms: false });
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
        url: PRO_PAGE_PATH,
        sms: false,
        oncePerDay: "pro-payment-failed",
      });
    } catch (e) {
      console.error("[pro] payment failed notice failed", stripeSubscriptionId, e);
    }
  }
  return step.changed ? "ok" : "already";
}

/**
 * Only `active` (and `trialing`, unused) and `past_due` (Stripe still retrying) are live. `unpaid` and `paused` mean
 * Stripe stopped collecting, and depending on the shared account's Billing settings no deletion may ever follow, so
 * they end Pro here and the subscription is cancelled at Stripe too (STOP_AT_STRIPE: paying its open invoice later
 * would otherwise revive the billing without Pro); `canceled` and `incomplete_expired` are final at Stripe.
 */
const STATUS_FROM_STRIPE: Partial<Record<Stripe.Subscription.Status, ProSubscription["status"]>> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "CANCELED",
  paused: "CANCELED",
  canceled: "CANCELED",
  incomplete_expired: "CANCELED",
};

/** Stripe statuses whose period end is a paid period the row may move on to */
const EXTENDS_PERIOD: readonly Stripe.Subscription.Status[] = ["active", "trialing", "past_due"];

/** Stripe statuses that end Pro here while the subscription still exists at Stripe: cancelled there at once */
const STOP_AT_STRIPE: readonly Stripe.Subscription.Status[] = ["unpaid", "paused"];

/**
 * customer.subscription.updated / deleted. Updated: syncs cancelAtPeriodEnd, the period end and the status; a status
 * that isn't live stamps endedAt, and `unpaid`/`paused` are also cancelled at Stripe. Deleted: ENDED with endedAt, and Pro ends at once. A local ENDED or CANCELED row
 * never comes back. The member is told once, when a live membership first gets its endedAt (never for a first payment
 * that never went through).
 */
export async function handleProSubscriptionChanged(sub: Stripe.Subscription, kind: "updated" | "deleted" = "updated"): Promise<ProEventResult> {
  if (!isOurProMetadata(sub.metadata)) return "not_ours";
  const periodEnd = subscriptionPeriodEnd(sub);

  // A real subscription Stripe keeps although Pro ended here (also on a repeat: an earlier cancel may have failed)
  const stopAtStripe = kind === "updated" && STOP_AT_STRIPE.includes(sub.status) && !sub.id.startsWith("mock_");

  const step = await withSubscriptionLock(sub.id, async (tx) => {
    const row = await findRow(tx, sub.id);
    if (!row || row.status === "ENDED") return null;

    const data: Prisma.ProSubscriptionUpdateInput = {};
    if (row.cancelAtPeriodEnd !== sub.cancel_at_period_end) data.cancelAtPeriodEnd = sub.cancel_at_period_end;
    // The period moves on only for a subscription Stripe collects on (not `incomplete`) whose row has a paid invoice:
    // an update arriving before the first invoice.paid never makes a duplicate's row live
    if (periodEnd && periodEnd > row.currentPeriodEnd && EXTENDS_PERIOD.includes(sub.status)) {
      const paid = await tx.payment.findFirst({ where: { proSubscriptionId: row.id, status: "COMPLETED" }, select: { id: true } });
      if (paid) data.currentPeriodEnd = periodEnd;
    }
    let ends = false;
    if (kind === "deleted") {
      data.status = "ENDED";
      data.endedAt = subscriptionEndedAt(sub) ?? new Date();
      ends = true;
    } else if (row.status !== "CANCELED") {
      const status = STATUS_FROM_STRIPE[sub.status];
      if (status && status !== row.status) data.status = status;
      if (status === "CANCELED") {
        data.endedAt = subscriptionEndedAt(sub) ?? new Date();
        ends = true;
      }
    }
    if (Object.keys(data).length === 0) return stopAtStripe ? { userId: row.userId, tell: false, changed: false } : null;
    await tx.proSubscription.update({ where: { id: row.id }, data });
    const wasLive = row.status === "ACTIVE" || row.status === "PAST_DUE";
    const tell = ends && wasLive && !row.endedAt && sub.status !== "incomplete_expired";
    return { userId: row.userId, tell, changed: true };
  });
  if (!step) return "already";

  if (stopAtStripe) {
    try {
      await cancelOnStripe(sub.id);
      console.log("[pro] cancelled at Stripe after", sub.status, sub.id);
    } catch (e) {
      console.error("[pro] cancel at Stripe failed after", sub.status, sub.id, (e as Error)?.message ?? e);
      await sendAdminAlert(
        "Pro subscription: cancel it in Stripe",
        `Stripe marked Pro subscription ${sub.id} ${sub.status}, so Pro ended here, but cancelling it in Stripe failed ` +
          `(${(e as Error)?.message ?? e}). Cancel it in the Stripe dashboard, or paying its open invoice would restart billing without Pro.`,
        { userId: step.userId },
      );
    }
  }

  if (step.tell && step.userId) {
    try {
      await notify({ userId: step.userId, type: "PAYMENT", title: PRO_ENDED_TITLE, body: PRO_ENDED_BODY, url: PRO_PAGE_PATH, sms: false });
    } catch (e) {
      console.error("[pro] ended notice failed", sub.id, e);
    }
  }
  return step.changed ? "ok" : "already";
}
