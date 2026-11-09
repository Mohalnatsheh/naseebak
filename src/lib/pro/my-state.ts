import { db } from "@/lib/db";
import { toCountry } from "@/lib/countries";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { appPaymentsFor } from "@/lib/mobile-config";
import { getProEnabled } from "@/lib/settings";
import type { ProPlan } from "@prisma/client";
import { proOffersFor, type ProPlanId } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";
import { currentProSubscription } from "@/lib/pro/status";

const PLAN_IDS: Record<ProPlan, ProPlanId> = { WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };

/**
 * The member's Pro state and, while sales are on, the offers of their country (GET /api/pro, and the Pro page link
 * rule in /api/me/counts). `app`: the request came from the app (Bearer), which follows the app-only payments switch
 * and never sells to test accounts (same rule as POST /api/pro/checkout).
 */
export async function getMyProState(userId: string, { app }: { app: boolean }): Promise<MyProState> {
  const [enabled, sub, me] = await Promise.all([
    getProEnabled(),
    currentProSubscription(userId),
    db.user.findUnique({ where: { id: userId }, select: { country: true, phone: true } }),
  ]);
  const country = toCountry(me?.country);
  const [countrySettings, sellable] = await Promise.all([
    getCountrySettings(country),
    app ? appPaymentsFor(me?.phone) : Promise.resolve(true),
  ]);
  const offers = enabled && sellable ? proOffersFor(country, countrySettings.proPlans) : [];
  return {
    enabled,
    isPro: !!sub,
    plan: sub ? PLAN_IDS[sub.plan] : null,
    renewsAt: sub ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    pastDue: sub?.status === "PAST_DUE",
    canBuy: enabled && sellable && purchasesAvailable(countrySettings) && !sub && offers.length > 0,
    offers,
  };
}

/** The request came from the app (its Bearer token), not the website session */
export function isAppRequest(request: Request | undefined): boolean {
  return !!request?.headers.get("authorization")?.startsWith("Bearer ");
}
