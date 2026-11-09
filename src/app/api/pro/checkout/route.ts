import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appPaymentsFor } from "@/lib/mobile-config";
import { PRO_PLAN_IDS } from "@/lib/pro/plans";
import { PRO_ERROR_MESSAGES, PRO_ROUTE_MESSAGES, ProError, startProCheckout } from "@/lib/pro/checkout";

const bodySchema = z.object({ plan: z.enum(PRO_PLAN_IDS) });

/** Stripe's error fields worth logging (never the full request) */
function stripeErrorInfo(error: unknown) {
  const e = error as { type?: string; code?: string; statusCode?: number; message?: string; requestId?: string };
  return { type: e?.type, code: e?.code, statusCode: e?.statusCode, message: e?.message, requestId: e?.requestId };
}

/** Starts a Pro subscription checkout → `{ url }` (Stripe-hosted page; the app opens it). */
export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  const userId = result.session.user.id;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: PRO_ERROR_MESSAGES.UNKNOWN_PLAN, code: "UNKNOWN_PLAN" }, { status: 400 });

  // Same rule as payments: the app follows the app-only payments switch, and test accounts (store review) never buy there
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    const me = await db.user.findUnique({ where: { id: userId }, select: { phone: true } });
    if (!(await appPaymentsFor(me?.phone))) {
      return NextResponse.json({ error: PRO_ROUTE_MESSAGES.APP_PURCHASES_DISABLED, code: "APP_PURCHASES_DISABLED" }, { status: 403 });
    }
  }

  try {
    const { url } = await startProCheckout(userId, parsed.data.plan);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof ProError) {
      const status = error.code === "UNKNOWN_PLAN" ? 400 : error.code === "ALREADY_PRO" ? 409 : 403;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[pro] checkout failed:", stripeErrorInfo(error), { userId });
    return NextResponse.json({ error: PRO_ROUTE_MESSAGES.CHECKOUT_FAILED, code: "CHECKOUT_FAILED" }, { status: 502 });
  }
}
