import { db } from "@/lib/db";
import { toCountry } from "@/lib/countries";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { appPaymentsFor } from "@/lib/mobile-config";
import { getChatDeleteEnabled, getProEnabled, jodChargingFor } from "@/lib/settings";
import type { ProPlan } from "@prisma/client";
import { proOffersFor, type ProPlanId } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";
import { currentProSubscription } from "@/lib/pro/status";

export type ProStateUser = { country: string; phone: string | null };

const PLAN_IDS: Record<ProPlan, ProPlanId> = { WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };

/**
 * The member's Pro state and, while sales are on, the offers of their country (GET /api/pro, and the Pro page link
 * rule in /api/me/counts). `app`: the request came from the app (Bearer), which follows the app-only payments switch
 * and never sells to test accounts (same rule as POST /api/pro/checkout).
 */
export async function getMyProState(
  userId: string,
  { app, me: known }: { app: boolean; /** The member's country and phone when the caller already read them */ me?: ProStateUser | null },
): Promise<MyProState> {
  const [enabled, sub, me, chatDelete] = await Promise.all([
    getProEnabled(),
    currentProSubscription(userId),
    known !== undefined ? known : db.user.findUnique({ where: { id: userId }, select: { country: true, phone: true } }),
    getChatDeleteEnabled(),
  ]);
  const country = toCountry(me?.country);
  const [countrySettings, sellable, jod] = await Promise.all([
    getCountrySettings(country),
    app ? appPaymentsFor(me?.phone) : Promise.resolve(true),
    jodChargingFor(country),
  ]);
  // jod: the offers say what a new checkout charges (no dollar line once Jordan is charged in JOD)
  const offers = enabled && sellable ? proOffersFor(country, countrySettings.proPlans, jod) : [];
  return {
    enabled,
    isPro: !!sub,
    plan: sub ? PLAN_IDS[sub.plan] : null,
    renewsAt: sub ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    pastDue: sub?.status === "PAST_DUE",
    ...(sub && { creditsPerGrant: sub.creditsPerGrant, nextGrantAt: nextGrantOf(sub) }),
    canBuy: enabled && sellable && purchasesAvailable(countrySettings) && !sub && offers.length > 0,
    offers,
    chatDelete,
  };
}

/**
 * The next credits (QA WP2-18): yearly plans drip monthly (`nextCreditGrantAt`, while still inside the paid year);
 * weekly and monthly ones grant on the renewal, which won't come if it was cancelled or the payment is failing.
 */
export function nextGrantOf(sub: { plan: ProPlan; creditsPerGrant: number; nextCreditGrantAt: Date | null; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean; status: string }): string | null {
  if (sub.creditsPerGrant <= 0) return null;
  if (sub.plan === "YEARLY") {
    const next = sub.nextCreditGrantAt;
    return next && next < sub.currentPeriodEnd ? next.toISOString() : null;
  }
  return sub.cancelAtPeriodEnd || sub.status === "PAST_DUE" ? null : sub.currentPeriodEnd.toISOString();
}

/** The request came from the app (its Bearer token), not the website session */
export function isAppRequest(request: Request | undefined): boolean {
  return !!request?.headers.get("authorization")?.startsWith("Bearer ");
}
