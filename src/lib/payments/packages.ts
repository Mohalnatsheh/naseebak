/**
 * The one list of credit packages (db-free: the payments page may import it).
 * Prices are shown in JOD but Stripe charges the USD amount (owner's choice, Oct 2026):
 * `priceUsdCents` is what the card is actually charged (JOD→USD ≈ 1.41).
 */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  /** Display price in JOD */
  priceJod: number;
  /** Amount charged by Stripe, in USD cents */
  priceUsdCents: number;
  popular?: boolean;
  /** Opening offer: what this package would cost at the old rate (shown struck through) */
  wasJod?: number;
}

/** The old best rate (10 for 7 JD): the «قبل» price of the opening packages is counted with it */
const OLD_JOD_PER_CREDIT = 0.7;
const was = (credits: number) => Math.round(credits * OLD_JOD_PER_CREDIT * 10) / 10;

/** Opening offer (owner decision 2026-10-23): 10 credits for 3 JD, the bigger packages a little cheaper per credit */
export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  { id: "launch_10", name: "10 أرصدة", credits: 10, priceJod: 3, priceUsdCents: 423, wasJod: was(10) },
  { id: "launch_25", name: "25 رصيداً", credits: 25, priceJod: 6, priceUsdCents: 846, popular: true, wasJod: was(25) },
  { id: "launch_50", name: "50 رصيداً", credits: 50, priceJod: 10, priceUsdCents: 1410, wasJod: was(50) },
];

/** Packages no longer sold: kept so a refund of an older purchase takes back the right credits */
const RETIRED_PACKAGES: readonly CreditPackage[] = [
  { id: "credits_3", name: "3 أرصدة", credits: 3, priceJod: 3, priceUsdCents: 423 },
  { id: "credits_5", name: "5 أرصدة", credits: 5, priceJod: 4, priceUsdCents: 564 },
  { id: "credits_10", name: "10 أرصدة", credits: 10, priceJod: 7, priceUsdCents: 987 },
];

/** A package on sale (checkout) */
export function findPackage(id: string | null | undefined): CreditPackage | undefined {
  return id ? CREDIT_PACKAGES.find((p) => p.id === id) : undefined;
}

/** Any package ever sold (refunds) */
export function findAnyPackage(id: string | null | undefined): CreditPackage | undefined {
  return findPackage(id) ?? (id ? RETIRED_PACKAGES.find((p) => p.id === id) : undefined);
}

/** «10 أرصدة بـ 3 د.أ، أو 25 رصيداً بـ 6 د.أ، أو 50 رصيداً بـ 10 د.أ» (FAQ) */
export function packagesSentence(): string {
  return CREDIT_PACKAGES.map((p) => `${p.name} بـ ${p.priceJod} د.أ`).join("، أو ");
}

/** Percent saved against the «قبل» price, or null */
export function discountPercent(p: { priceJod: number; wasJod?: number | null }): number | null {
  return p.wasJod && p.wasJod > p.priceJod ? Math.round((1 - p.priceJod / p.wasJod) * 100) : null;
}

/** "4.23$" — the amount actually charged */
export function formatUsd(cents: number): string {
  return `${(cents / 100).toFixed(2)}$`;
}

/**
 * A checkout stays payable this long (Stripe's minimum is 30 minutes). The session is created with
 * this expiry, and the history marks a still-pending row as cancelled only after it, so the app and
 * Stripe agree on when an abandoned checkout is over.
 */
export const CHECKOUT_TTL_MS = 35 * 60 * 1000;
