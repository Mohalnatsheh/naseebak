/**
 * Pro membership plans per country (db-free: client pages may import it).
 * Prices and credits are set in Admin → Countries (`country_settings.proPlans`); this module only reads and shapes them.
 * Jordan: shown in JOD, charged in USD cents. Saudi Arabia: SAR.
 */
import { countryConfig, toCountry } from "@/lib/countries";
import { chargeFor } from "@/lib/payments/packages";

export type ProPlanId = "weekly" | "monthly" | "yearly";

/** The member's Pro page (plans, «اشتراكي», the Stripe return). Pro notices open it too. */
export const PRO_PAGE_PATH = "/dashboard/pro";

/**
 * Whether the Pro page is worth a link (navigation, the card on the payments page): plans the member can buy right now,
 * or a live subscription to manage. A switched-off or unsellable Pro is never described.
 */
export function proPageShown(state: { isPro: boolean; canBuy: boolean } | null | undefined): boolean {
  return !!state && (state.isPro || state.canBuy);
}

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
  currency: "JOD" | "SAR" | "USD";
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
  const currency = countryConfig(toCountry(country)).currency.code as ProPlanOffer["currency"];
  const offers: ProPlanOffer[] = [];
  for (const id of PRO_PLAN_IDS) {
    const c = plans[id];
    if (!c || !c.enabled || !Number.isFinite(c.price) || !(c.price > 0)) continue;
    offers.push({ id, price: c.price, currency, ...chargeFor(c.price, currency), credits: c.credits, interval: INTERVALS[id] });
  }
  return offers;
}

/** How many of a plan's periods make a year: the Pro page compares the plans by what a year of each costs */
const PERIODS_PER_YEAR: Record<ProPlanId, number> = { weekly: 52, monthly: 12, yearly: 1 };

/** The plan the discounts are measured against: the shortest one offered (weekly, else monthly) */
export function proDiscountBase(offers: Pick<ProPlanOffer, "id">[]): ProPlanId | null {
  return PRO_PLAN_IDS.find((id) => offers.some((o) => o.id === id)) ?? null;
}

export interface ProPlanValue {
  /** What the plan comes to per month, 2 decimals (weekly × 52 / 12, yearly / 12) */
  perMonth: number;
  /** Whole percent saved over a year against the shortest plan, rounded down so it is never overstated; null for none */
  discountPercent: number | null;
}

/** The Pro page comparison: each offered plan's cost per month and its discount against the shortest plan */
export function proPlanValues(offers: Pick<ProPlanOffer, "id" | "price">[]): Partial<Record<ProPlanId, ProPlanValue>> {
  const base = proDiscountBase(offers);
  const baseOffer = offers.find((o) => o.id === base);
  const baseYear = baseOffer && base ? baseOffer.price * PERIODS_PER_YEAR[base] : 0;
  const out: Partial<Record<ProPlanId, ProPlanValue>> = {};
  for (const o of offers) {
    const year = o.price * PERIODS_PER_YEAR[o.id];
    const saved = o.id !== base && baseYear > 0 ? Math.floor((1 - year / baseYear) * 100 + 1e-9) : 0;
    out[o.id] = { perMonth: Math.round((year / 12) * 100) / 100, discountPercent: saved >= 1 ? saved : null };
  }
  return out;
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
