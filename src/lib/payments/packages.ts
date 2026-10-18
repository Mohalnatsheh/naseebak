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
}

export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  { id: "credits_3", name: "3 أرصدة", credits: 3, priceJod: 3, priceUsdCents: 423 },
  { id: "credits_5", name: "5 أرصدة", credits: 5, priceJod: 4, priceUsdCents: 564, popular: true },
  { id: "credits_10", name: "10 أرصدة", credits: 10, priceJod: 7, priceUsdCents: 987 },
];

export function findPackage(id: string | null | undefined): CreditPackage | undefined {
  return id ? CREDIT_PACKAGES.find((p) => p.id === id) : undefined;
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
