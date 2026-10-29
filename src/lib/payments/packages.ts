/**
 * Credit packages per country (db-free: the payments page may import it).
 *   Jordan: shown in JOD, Stripe charges the USD amount (owner's choice, Oct 2026; JOD→USD ≈ 1.41).
 *   Saudi Arabia: shown and charged in SAR (prices `[NEEDS INPUT]` owner confirmation; no "was" price —
 *   the Saudi market never had an earlier price).
 * A member only ever sees and buys their own country's packages (checkout checks it).
 */
import { toCountry, type CountryCode } from "@/lib/countries";

export interface CreditPackage {
  id: string;
  country: CountryCode;
  name: string;
  credits: number;
  /** Display price, in `currency` */
  price: number;
  currency: "JOD" | "SAR";
  /** What Stripe charges: currency + amount in minor units (cents / halalas) */
  chargeCurrency: "usd" | "sar";
  chargeAmount: number;
  popular?: boolean;
  /** Opening offer (Jordan): what this package would cost at the old rate (shown struck through) */
  wasPrice?: number;
}

/** The old best Jordanian rate (10 for 7 JD): the «قبل» price of the opening packages is counted with it */
const OLD_JOD_PER_CREDIT = 0.7;
const was = (credits: number) => Math.round(credits * OLD_JOD_PER_CREDIT * 10) / 10;

const jo = (id: string, name: string, credits: number, price: number, usdCents: number, popular = false): CreditPackage => ({
  id, country: "JO", name, credits, price, currency: "JOD", chargeCurrency: "usd", chargeAmount: usdCents, ...(popular && { popular }), wasPrice: was(credits),
});
const sa = (id: string, name: string, credits: number, price: number, popular = false): CreditPackage => ({
  id, country: "SA", name, credits, price, currency: "SAR", chargeCurrency: "sar", chargeAmount: price * 100, ...(popular && { popular }),
});

const PACKAGES: Record<CountryCode, readonly CreditPackage[]> = {
  // Opening offer (owner decision 2026-10-23): 10 credits for 3 JD, the bigger packages a little cheaper per credit
  JO: [jo("launch_10", "10 أرصدة", 10, 3, 423), jo("launch_25", "25 رصيداً", 25, 6, 846, true), jo("launch_50", "50 رصيداً", 50, 10, 1410)],
  SA: [sa("sa_10", "10 أرصدة", 10, 15), sa("sa_25", "25 رصيداً", 25, 30, true), sa("sa_50", "50 رصيداً", 50, 50)],
};

/**
 * Prices the owner approved for sale. Saudi prices above are a draft ([NEEDS INPUT] owner + Stripe SAR check): Saudi
 * purchases stay off even if an admin switches them on, until this says true (src/lib/countries/settings.ts).
 */
export const PRICES_APPROVED: Record<CountryCode, boolean> = { JO: true, SA: false };

/** Jordanian packages no longer sold: kept so a refund of an older purchase takes back the right credits */
const RETIRED_PACKAGES: readonly CreditPackage[] = [
  { id: "credits_3", country: "JO", name: "3 أرصدة", credits: 3, price: 3, currency: "JOD", chargeCurrency: "usd", chargeAmount: 423 },
  { id: "credits_5", country: "JO", name: "5 أرصدة", credits: 5, price: 4, currency: "JOD", chargeCurrency: "usd", chargeAmount: 564 },
  { id: "credits_10", country: "JO", name: "10 أرصدة", credits: 10, price: 7, currency: "JOD", chargeCurrency: "usd", chargeAmount: 987 },
];

/** Packages on sale in a country */
export function packagesFor(country: unknown): readonly CreditPackage[] {
  return PACKAGES[toCountry(country)];
}

/** Jordan's list (kept for older callers and tests) */
export const CREDIT_PACKAGES = PACKAGES.JO;

/** A package on sale; with `country`, only that country's */
export function findPackage(id: string | null | undefined, country?: CountryCode): CreditPackage | undefined {
  if (!id) return undefined;
  const lists = country ? [PACKAGES[country]] : Object.values(PACKAGES);
  for (const list of lists) {
    const p = list.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

/** Any package ever sold (refunds) */
export function findAnyPackage(id: string | null | undefined): CreditPackage | undefined {
  return findPackage(id) ?? (id ? RETIRED_PACKAGES.find((p) => p.id === id) : undefined);
}

const SYMBOL = { JOD: "د.أ", SAR: "ر.س" } as const;

/** «3 د.أ» / «15 ر.س» */
export function formatPrice(p: Pick<CreditPackage, "price" | "currency">): string {
  return `${p.price} ${SYMBOL[p.currency]}`;
}

/** «10 أرصدة بـ 3 د.أ، أو 25 رصيداً بـ 6 د.أ، أو 50 رصيداً بـ 10 د.أ» (FAQ) */
export function packagesSentence(country: unknown = "JO"): string {
  return packagesFor(country).map((p) => `${p.name} بـ ${formatPrice(p)}`).join("، أو ");
}

/** Percent saved against the «قبل» price, or null */
export function discountPercent(p: { price: number; wasPrice?: number | null }): number | null {
  return p.wasPrice && p.wasPrice > p.price ? Math.round((1 - p.price / p.wasPrice) * 100) : null;
}

/** "4.23$" — a USD amount in cents */
export function formatUsd(cents: number): string {
  return `${(cents / 100).toFixed(2)}$`;
}

/** What the card is actually charged: «4.23$» (Jordan) / «15 ر.س» (Saudi Arabia) */
export function formatCharge(p: Pick<CreditPackage, "chargeCurrency" | "chargeAmount">): string {
  return p.chargeCurrency === "usd" ? formatUsd(p.chargeAmount) : `${(p.chargeAmount / 100).toLocaleString("en-US")} ر.س`;
}

/**
 * A checkout stays payable this long (Stripe's minimum is 30 minutes). The session is created with
 * this expiry, and the history marks a still-pending row as cancelled only after it, so the app and
 * Stripe agree on when an abandoned checkout is over.
 */
export const CHECKOUT_TTL_MS = 35 * 60 * 1000;
