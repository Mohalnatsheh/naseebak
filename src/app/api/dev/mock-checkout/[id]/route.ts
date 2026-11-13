import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHECKOUT_APP, fulfilCheckoutSession } from "@/lib/payments/fulfil";
import { MOCK_SESSION_PREFIX, paymentsMockEnabled } from "@/lib/payments/mock";
import { findAnyPackage } from "@/lib/payments/packages";
import { planFromName, type ProPlanId } from "@/lib/pro/plans";
import { addPlanPeriod } from "@/lib/pro/dates";
import { fakeProInvoice, fakeProSession, fakeProSubscription, mockProCustomerId, mockProSubscriptionId } from "@/lib/pro/mock";
import { handleProCheckoutCompleted, handleProInvoiceFailed, handleProInvoicePaid, handleProSubscriptionChanged } from "@/lib/pro/stripe-events";

const bodySchema = z.object({ outcome: z.enum(["paid", "cancelled", "renew", "fail", "end"]) });
type Outcome = z.infer<typeof bodySchema>["outcome"];

/**
 * Development only: finish a mock checkout as paid or cancelled. «paid» goes through the real `fulfilCheckoutSession`
 * with a session object shaped like Stripe's, so credits are added exactly once (a repeat answers "already"). 404 on any
 * real server, and only the member who started the checkout can finish it.
 * Pro checkouts (`pro_*`) go through the real Pro webhook handlers instead, and add «renew», «fail» and «end».
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!paymentsMockEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await requireUser();
  if ("error" in result) return result.error;
  const userId = result.session.user.id;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "outcome must be paid, cancelled, renew, fail or end" }, { status: 400 });

  const payment = await db.payment.findFirst({
    where: { id, userId },
    select: { id: true, status: true, stripeSessionId: true, planName: true, amount: true, currency: true, createdAt: true, bonusCredits: true },
  });
  if (!payment || !payment.stripeSessionId?.startsWith(MOCK_SESSION_PREFIX)) return NextResponse.json({ error: "Not a mock checkout" }, { status: 404 });

  const outcome = parsed.data.outcome;
  if (outcome === "cancelled") {
    const { count } = await db.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } });
    return NextResponse.json({ result: count ? "cancelled" : "unchanged" });
  }

  const plan = planFromName(payment.planName);
  if (plan) return proOutcome(outcome, { ...payment, stripeSessionId: payment.stripeSessionId }, plan, userId);
  if (outcome !== "paid") return NextResponse.json({ error: "Only Pro checkouts renew, fail or end" }, { status: 400 });

  const pkg = findAnyPackage(payment.planName);
  if (!pkg) return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  const session = {
    id: payment.stripeSessionId,
    payment_status: "paid",
    payment_intent: null,
    metadata: {
      app: CHECKOUT_APP,
      paymentId: payment.id,
      userId,
      packageId: pkg.id,
      credits: String(pkg.credits + (payment.bonusCredits ?? 0)),
      ...(payment.bonusCredits ? { bonusCredits: String(payment.bonusCredits) } : {}),
    },
  } as unknown as Stripe.Checkout.Session;
  return NextResponse.json({ result: await fulfilCheckoutSession(session) });
}

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** A Pro mock checkout: Stripe-shaped fakes through the same handlers as the webhook */
async function proOutcome(
  outcome: Exclude<Outcome, "cancelled">,
  payment: { id: string; stripeSessionId: string; amount: unknown; currency: string; createdAt: Date; bonusCredits: number | null },
  plan: ProPlanId,
  userId: string
) {
  const subscriptionId = mockProSubscriptionId(payment.id);
  const customerId = mockProCustomerId(userId);
  const amountPaid = Math.max(1, Math.round(Number(payment.amount) * 100));
  const currency = payment.currency.toLowerCase();

  if (outcome === "paid") {
    const me = await db.user.findUnique({ where: { id: userId }, select: { country: true } });
    const metadata = {
      app: CHECKOUT_APP,
      kind: "pro",
      userId,
      plan,
      country: me?.country ?? "JO",
      paymentId: payment.id,
      ...(payment.bonusCredits ? { offerBonus: String(payment.bonusCredits) } : {}),
    };
    // Anchored on the checkout's time, so a repeat sends the very same invoice
    const start = payment.createdAt;
    const checkout = await handleProCheckoutCompleted(
      fakeProSession({ id: payment.stripeSessionId, subscriptionId, customerId, metadata, created: seconds(start) })
    );
    const invoice = await handleProInvoicePaid(
      fakeProInvoice({
        id: `mock_in_${payment.id}`, subscriptionId, customerId, metadata, periodStart: seconds(start), periodEnd: seconds(addPlanPeriod(start, plan)),
        amountPaid, currency, billingReason: "subscription_create",
      })
    );
    return NextResponse.json({ result: invoice, checkout });
  }

  const sub = await db.proSubscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, country: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  if (!sub) return NextResponse.json({ error: "Pay the mock checkout first" }, { status: 409 });
  const metadata = { app: CHECKOUT_APP, kind: "pro", userId, plan, country: sub.country, paymentId: payment.id };
  // Every invoice of this subscription has its own Payment: their count numbers the next mock invoice
  const n = await db.payment.count({ where: { proSubscriptionId: sub.id } });

  // Like Stripe: a subscription set to cancel at the period end never renews, it ends there (QA round 2 test note)
  if (outcome === "renew" && sub.cancelAtPeriodEnd) {
    const result = await handleProSubscriptionChanged(
      fakeProSubscription({
        id: subscriptionId, metadata, status: "canceled", periodEnd: seconds(sub.currentPeriodEnd), cancelAtPeriodEnd: true,
        endedAt: seconds(sub.currentPeriodEnd), customerId,
      }),
      "deleted"
    );
    return NextResponse.json({ result, renewed: false, ended: true });
  }
  if (outcome === "renew") {
    const start = sub.currentPeriodEnd;
    const result = await handleProInvoicePaid(
      fakeProInvoice({
        id: `mock_in_${payment.id}_${n}`, subscriptionId, customerId, metadata, periodStart: seconds(start), periodEnd: seconds(addPlanPeriod(start, plan)),
        amountPaid, currency, billingReason: "subscription_cycle",
      })
    );
    return NextResponse.json({ result });
  }
  if (outcome === "fail") {
    const start = sub.currentPeriodEnd;
    const result = await handleProInvoiceFailed(
      fakeProInvoice({
        id: `mock_in_${payment.id}_${n}_failed`, subscriptionId, customerId, metadata, periodStart: seconds(start), periodEnd: seconds(addPlanPeriod(start, plan)),
        amountPaid: 0, currency, billingReason: "subscription_cycle",
      })
    );
    return NextResponse.json({ result });
  }
  const result = await handleProSubscriptionChanged(
    fakeProSubscription({
      id: subscriptionId, metadata, status: "canceled", periodEnd: seconds(sub.currentPeriodEnd), cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      endedAt: seconds(new Date()), customerId,
    }),
    "deleted"
  );
  return NextResponse.json({ result });
}
