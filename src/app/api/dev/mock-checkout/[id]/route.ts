import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHECKOUT_APP, fulfilCheckoutSession } from "@/lib/payments/fulfil";
import { MOCK_SESSION_PREFIX, paymentsMockEnabled } from "@/lib/payments/mock";
import { findAnyPackage } from "@/lib/payments/packages";

const bodySchema = z.object({ outcome: z.enum(["paid", "cancelled"]) });

/**
 * Development only: finish a mock checkout as paid or cancelled. «paid» goes through the real `fulfilCheckoutSession`
 * with a session object shaped like Stripe's, so credits are added exactly once (a repeat answers "already"). 404 on any
 * real server, and only the member who started the checkout can finish it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!paymentsMockEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await requireUser();
  if ("error" in result) return result.error;
  const userId = result.session.user.id;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "outcome must be paid or cancelled" }, { status: 400 });

  const payment = await db.payment.findFirst({ where: { id, userId }, select: { id: true, status: true, stripeSessionId: true, planName: true } });
  if (!payment || !payment.stripeSessionId?.startsWith(MOCK_SESSION_PREFIX)) return NextResponse.json({ error: "Not a mock checkout" }, { status: 404 });

  if (parsed.data.outcome === "cancelled") {
    const { count } = await db.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
    return NextResponse.json({ result: count ? "cancelled" : "unchanged" });
  }
  const pkg = findAnyPackage(payment.planName);
  if (!pkg) return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  const session = {
    id: payment.stripeSessionId,
    payment_status: "paid",
    payment_intent: null,
    metadata: { app: CHECKOUT_APP, paymentId: payment.id, userId, packageId: pkg.id, credits: String(pkg.credits) },
  } as unknown as Stripe.Checkout.Session;
  return NextResponse.json({ result: await fulfilCheckoutSession(session) });
}
