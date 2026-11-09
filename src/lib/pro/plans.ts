/**
 * Pro membership plans per country (db-free: client pages may import it).
 * Prices and credits are set in Admin → Countries (`country_settings.proPlans`); this module only reads and shapes them.
 * Jordan: shown in JOD, charged in USD cents. Saudi Arabia: SAR.
 */
import { toCountry } from "@/lib/countries";
import { chargeFor } from "@/lib/payments/packages";

export type ProPlanId = "weekly" | "monthly" | "yearly";

// A type alias, not an interface, so Prisma accepts it as Json input
export type ProPlanConfig = {
  enabled: boolean;
  price: number;
  /** Credits per grant. For yearly, per month */
  credits: number;
};

export type ProPlans = Partial<Record<ProPlanId, ProPlanConfig>>;

export interface ProPlanOffer {
  id: ProPlanId;
  price: number;
  currency: "JOD" | "SAR";
  chargeCurrency: "usd" | "sar";
  chargeAmount: number;
  credits: number;
  interval: "week" | "month" | "year";
}

export const PRO_PLAN_IDS = ["weekly", "monthly", "yearly"] as const satisfies readonly ProPlanId[];
export const PRO_PLAN_LABELS: Record<ProPlanId, string> = { weekly: "أسبوعي", monthly: "شهري", yearly: "سنوي" };
const INTERVALS: Record<ProPlanId, ProPlanOffer["interval"]> = { weekly: "week", monthly: "month", yearly: "year" };

/** The usable plans in a stored value, or null */
export function readProPlans(value: unknown): ProPlans | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;
  const out: ProPlans = {};
  for (const id of PRO_PLAN_IDS) {
    const c = src[id];
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const { enabled, price, credits } = c as Record<string, unknown>;
    if (typeof enabled !== "boolean") continue;
    if (typeof price !== "number" || !Number.isFinite(price) || !(price > 0)) continue;
    if (typeof credits !== "number" || !Number.isInteger(credits) || credits < 0 || credits > 100) continue;
    out[id] = { enabled, price, credits };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Enabled plans of a country as sellable offers, weekly then monthly then yearly. An unknown country is read as the
 * default one (`toCountry`), like every other country lookup.
 */
export function proOffersFor(country: unknown, plans: ProPlans | null): ProPlanOffer[] {
  if (!plans) return [];
  const currency = toCountry(country) === "SA" ? "SAR" : "JOD";
  const offers: ProPlanOffer[] = [];
  for (const id of PRO_PLAN_IDS) {
    const c = plans[id];
    if (!c || !c.enabled || !Number.isFinite(c.price) || !(c.price > 0)) continue;
    offers.push({ id, price: c.price, currency, ...chargeFor(c.price, currency), credits: c.credits, interval: INTERVALS[id] });
  }
  return offers;
}

/** Payment.planName of a Pro payment */
export function proPlanName(id: ProPlanId): string {
  return `pro_${id}`;
}

export function planFromName(name: string | null | undefined): ProPlanId | null {
  if (!name?.startsWith("pro_")) return null;
  const id = name.slice(4);
  return (PRO_PLAN_IDS as readonly string[]).includes(id) ? (id as ProPlanId) : null;
}
