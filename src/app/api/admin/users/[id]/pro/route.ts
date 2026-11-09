import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPro } from "@/lib/pro/status";
import { cancelProNow } from "@/lib/pro/manage";

/** A member's Pro memberships for the admin user page, newest first, and whether they are Pro now */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;

    const [pro, subscriptions] = await Promise.all([
      isPro(id),
      db.proSubscription.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, plan: true, status: true, country: true, price: true, currency: true, creditsPerGrant: true,
          currentPeriodEnd: true, cancelAtPeriodEnd: true, endedAt: true, createdAt: true,
          stripeSubscriptionId: true, stripeCustomerId: true,
        },
      }),
    ]);
    return NextResponse.json({ isPro: pro, subscriptions });
  } catch (error) {
    console.error("Admin Pro status error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const bodySchema = z.object({ action: z.literal("cancel_now"), subscriptionId: z.string().min(1).optional() });

/**
 * «Cancel now»: cancels the Stripe subscription at once and ends Pro. No refund and no credit take-back:
 * a refund goes through the payment's refund action. Admin web session only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;
    const { id } = await params;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    // The membership Stripe can still charge (also PAST_DUE after its period: Stripe keeps retrying)
    const sub = await db.proSubscription.findFirst({
      where: {
        userId: id,
        status: { in: ["ACTIVE", "PAST_DUE"] },
        ...(parsed.data.subscriptionId ? { id: parsed.data.subscriptionId } : {}),
      },
      orderBy: { currentPeriodEnd: "desc" },
      select: { id: true },
    });
    if (!sub) return NextResponse.json({ error: "No active Pro membership" }, { status: 404 });

    let outcome;
    try {
      outcome = await cancelProNow(sub.id, { adminId: session.user.id, reason: "admin" });
    } catch (e) {
      console.error("Admin Pro cancel: Stripe failed", sub.id, e);
      return NextResponse.json({ error: "Stripe could not cancel the subscription. Nothing was changed." }, { status: 502 });
    }
    console.log(`[admin-pro] cancel now: subscription ${sub.id} of user ${id} by admin ${session.user.id}: ${outcome}`);
    if (outcome !== "ended") return NextResponse.json({ error: "Membership already ended" }, { status: 409 });
    return NextResponse.json({ message: "Pro membership cancelled" });
  } catch (error) {
    console.error("Admin Pro cancel error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
