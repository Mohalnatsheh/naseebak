/**
 * Credit packages per country (db-free: the payments page may import it).
 *   Jordan: shown in JOD, Stripe charges the USD amount (owner's choice, Oct 2026; JOD→USD ≈ 1.41). With the switch
 *   `jod_charging` on (2026-11-11), new Jordanian purchases are charged in JOD instead (`jod` flag below, fils).
 *   Saudi Arabia: shown and charged in SAR (no "was" price — the Saudi market never had an earlier price).
 * A member only ever sees and buys their own country's packages (checkout checks it).
 * The prices here are defaults: Admin → Countries can set others (`country_settings.packagePrices`), passed in as
 * `prices`. Which credits a package id gives never changes, because refunds of past purchases read it from here.
 */
import { toCountry, type CountryCode } from "@/lib/countries";
import { arabicCount } from "@/lib/utils";

/** Set on every Naseebak checkout (metadata.app); the Stripe account also serves other sites */
export const CHECKOUT_APP = "naseebak";

/** A currency Stripe charges in. JOD has 1,000 fils to the dinar, the others 100 */
export type ChargeCurrency = "usd" | "sar" | "jod";

/** Minor units per major unit: 1000 for JOD, 100 otherwise (Stripe amounts) */
export function minorUnits(currency: string): number {
  return currency.toLowerCase() === "jod" ? 1000 : 100;
}

/** A Stripe amount in major units: 3000 jod → 3, 423 usd → 4.23 */
export function fromMinor(amount: number, currency: string): number {
  return amount / minorUnits(currency);
}

export interface CreditPackage {
  id: string;
  country: CountryCode;
  name: string;
  credits: number;
  /** Display price, in `currency` */
  price: number;
  currency: "JOD" | "SAR" | "USD";
  /** What Stripe charges: currency + amount in minor units (cents / halalas / fils) */
  chargeCurrency: ChargeCurrency;
  chargeAmount: number;
  popular?: boolean;
  /** Opening offer (Jordan): what this package would cost at the old rate (shown struck through) */
  wasPrice?: number;
}

/** The old best Jordanian rate (10 for 7 JD): the «قبل» price of the opening packages is counted with it */
const OLD_JOD_PER_CREDIT = 0.7;
const was = (credits: number) => Math.round(credits * OLD_JOD_PER_CREDIT * 10) / 10;

/** Jordan is charged in USD: cents per dinar */
const USD_CENTS_PER_JOD = 141;
/**
 * What Stripe charges for a display price. `jod` (switch `jod_charging`, Jordan only): a dinar price is charged in JOD,
 * in whole 10 fils (Stripe refuses a last fils digit other than 0; admin prices have at most 2 decimals anyway).
 */
export const chargeFor = (
  price: number,
  currency: CreditPackage["currency"],
  jod = false,
): { chargeCurrency: ChargeCurrency; chargeAmount: number } =>
  currency === "JOD" && jod
    ? { chargeCurrency: "jod", chargeAmount: Math.round(price * 100) * 10 }
    : currency === "JOD"
    ? { chargeCurrency: "usd" as const, chargeAmount: Math.round(price * USD_CENTS_PER_JOD) }
    : currency === "USD"
      ? { chargeCurrency: "usd" as const, chargeAmount: Math.round(price * 100) } // Lebanon: dollars shown and charged
      : { chargeCurrency: "sar" as const, chargeAmount: Math.round(price * 100) };

/** Prices set in admin, by package id */
export type PackagePrices = Record<string, number>;

/** The usable prices in a stored value, or null */
export function readPackagePrices(value: unknown): PackagePrices | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter(([, price]) => typeof price === "number" && price > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function withPrice(p: CreditPackage, prices?: PackagePrices | null, jod = false): CreditPackage {
  const price = prices?.[p.id];
  if (!price || !(price > 0)) return jod ? { ...p, ...chargeFor(p.price, p.currency, true) } : p;
  const { wasPrice, ...rest } = p;
  return { ...rest, price, ...chargeFor(price, p.currency, jod), ...(wasPrice && wasPrice > price && { wasPrice }) };
}

const jo = (id: string, name: string, credits: number, price: number, usdCents: number, popular = false): CreditPackage => ({
  id, country: "JO", name, credits, price, currency: "JOD", chargeCurrency: "usd", chargeAmount: usdCents, ...(popular && { popular }), wasPrice: was(credits),
});
const sa = (id: string, name: string, credits: number, price: number, popular = false): CreditPackage => ({
  id, country: "SA", name, credits, price, currency: "SAR", chargeCurrency: "sar", chargeAmount: price * 100, ...(popular && { popular }),
});

const lb = (id: string, name: string, credits: number, price: number, popular = false): CreditPackage => ({
  id, country: "LB", name, credits, price, currency: "USD", chargeCurrency: "usd", chargeAmount: Math.round(price * 100), ...(popular && { popular }),
});

const PACKAGES: Record<CountryCode, readonly CreditPackage[]> = {
  // Opening offer (owner decision 2026-10-23): 10 credits for 3 JD, the bigger packages a little cheaper per credit
  JO: [jo("launch_10", "10 أرصدة", 10, 3, 423), jo("launch_25", "25 رصيداً", 25, 6, 846, true), jo("launch_50", "50 رصيداً", 50, 10, 1410)],
  SA: [sa("sa_10", "10 أرصدة", 10, 15), sa("sa_25", "25 رصيداً", 25, 30, true), sa("sa_50", "50 رصيداً", 50, 50)],
  // Draft prices in dollars (never sold until «Prices approved» is on in Admin → Countries)
  LB: [lb("lb_10", "10 أرصدة", 10, 3), lb("lb_25", "25 رصيداً", 25, 6, true), lb("lb_50", "50 رصيداً", 50, 10)],
};

/**
 * Whether a country's prices are approved until Admin → Countries says otherwise. Saudi prices above are a draft:
 * Saudi purchases stay off even if an admin switches them on, until «Prices approved» is on there.
 */
export const PRICES_APPROVED: Record<CountryCode, boolean> = {
  JO: true,
  SA: false,
  LB: false, // draft, like Saudi Arabia
};

/** Jordanian packages no longer sold: kept so a refund of an older purchase takes back the right credits */
const RETIRED_PACKAGES: readonly CreditPackage[] = [
  { id: "credits_3", country: "JO", name: "3 أرصدة", credits: 3, price: 3, currency: "JOD", chargeCurrency: "usd", chargeAmount: 423 },
  { id: "credits_5", country: "JO", name: "5 أرصدة", credits: 5, price: 4, currency: "JOD", chargeCurrency: "usd", chargeAmount: 564 },
  { id: "credits_10", country: "JO", name: "10 أرصدة", credits: 10, price: 7, currency: "JOD", chargeCurrency: "usd", chargeAmount: 987 },
];

/** Packages on sale in a country. `jod`: the switch `jod_charging` is on for this country (`jodChargingFor`) */
export function packagesFor(country: unknown, prices?: PackagePrices | null, jod = false): readonly CreditPackage[] {
  const list = PACKAGES[toCountry(country)];
  return prices || jod ? list.map((p) => withPrice(p, prices, jod)) : list;
}

/** Jordan's list (kept for older callers and tests) */
export const CREDIT_PACKAGES = PACKAGES.JO;

/** A package on sale; with `country`, only that country's */
export function findPackage(
  id: string | null | undefined,
  country?: CountryCode,
  prices?: PackagePrices | null,
  jod = false,
): CreditPackage | undefined {
  if (!id) return undefined;
  const lists = country ? [PACKAGES[country]] : Object.values(PACKAGES);
  for (const list of lists) {
    const p = list.find((x) => x.id === id);
    if (p) return withPrice(p, prices, jod);
  }
  return undefined;
}

/** Any package ever sold, at its price in code: for its name and credits. A payment's price is on the payment */
export function findAnyPackage(id: string | null | undefined): CreditPackage | undefined {
  return findPackage(id) ?? (id ? RETIRED_PACKAGES.find((p) => p.id === id) : undefined);
}

export const CURRENCY_SYMBOL = { JOD: "د.أ", SAR: "ر.س", USD: "$" } as const;
const SYMBOL = CURRENCY_SYMBOL;

/** «3 د.أ» / «15 ر.س» */
export function formatPrice(p: Pick<CreditPackage, "price" | "currency">): string {
  return `${p.price} ${SYMBOL[p.currency]}`;
}

/** «10 أرصدة بـ 3 د.أ، أو 25 رصيداً بـ 6 د.أ، أو 50 رصيداً بـ 10 د.أ» (FAQ) */
export function packagesSentence(country: unknown = "JO", prices?: PackagePrices | null): string {
  return packagesFor(country, prices).map((p) => `${p.name} بـ ${formatPrice(p)}`).join("، أو ");
}

/** Percent saved against the «قبل» price, or null */
export function discountPercent(p: { price: number; wasPrice?: number | null }): number | null {
  return p.wasPrice && p.wasPrice > p.price ? Math.round((1 - p.price / p.wasPrice) * 100) : null;
}

/** "4.23$" — a USD amount in cents */
export function formatUsd(cents: number): string {
  return `${(cents / 100).toFixed(2)}$`;
}

/** What the card is actually charged: «4.23$» (Jordan before JOD, Lebanon) / «15 ر.س» (Saudi Arabia) / «3 د.أ» (JOD) */
export function formatCharge(p: Pick<CreditPackage, "chargeCurrency" | "chargeAmount">): string {
  if (p.chargeCurrency === "usd") return formatUsd(p.chargeAmount);
  const symbol = p.chargeCurrency === "jod" ? SYMBOL.JOD : SYMBOL.SAR;
  return `${fromMinor(p.chargeAmount, p.chargeCurrency).toLocaleString("en-US")} ${symbol}`;
}

/** A stored payment: display price and currency, and (rows since 2026-11-11) the currency the card was charged in */
export interface PaidRow {
  amount: unknown;
  currency: string;
  /** null on older rows: a JOD row was then charged in USD at 1.41 */
  chargeCurrency?: string | null;
}

/** What a past payment was charged, from its stored display price (prices may have changed since) */
export function formatPaidCharge(payment: PaidRow): string {
  const shown = payment.currency === "SAR" ? "SAR" : payment.currency === "USD" ? "USD" : "JOD";
  return formatCharge(chargeFor(Number(payment.amount), shown, payment.chargeCurrency === "jod"));
}

/**
 * A past payment as the member saw it, with the charge when it differs (QA WEB-PAY-08): «35 د.أ (49.35$)», «15 ر.س».
 * Rows in another currency (old USD rows) come back as stored.
 */
export function formatPaidAmount(payment: PaidRow): string {
  if (payment.currency !== "JOD" && payment.currency !== "SAR" && payment.currency !== "USD") return formatPaidCharge(payment);
  const shown = `${Number(payment.amount).toLocaleString("en-US")} ${SYMBOL[payment.currency]}`;
  if (payment.currency === "USD") return shown; // shown and charged in dollars
  const charged = formatPaidCharge(payment);
  return charged === shown ? shown : `${shown} (${charged})`;
}

const PACK_CREDITS = { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" };

/** «شراء 25 رصيداً في نصيبك» (QA WEB-PAY-06): the stored description of a pack payment, and how history shows any pack row */
export function packPurchaseDescription(credits: number): string {
  return `شراء ${arabicCount(credits, PACK_CREDITS)} في نصيبك`;
}

/**
 * A checkout stays payable this long (Stripe's minimum is 30 minutes). The session is created with
 * this expiry, and the history marks a still-pending row as cancelled only after it, so the app and
 * Stripe agree on when an abandoned checkout is over.
 */
export const CHECKOUT_TTL_MS = 35 * 60 * 1000;
