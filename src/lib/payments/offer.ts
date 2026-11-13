/**
 * Sale offer (e.g. «عروض الجمعة البيضاء», 2026-11-13): while an admin-set window is open, a credit purchase and the
 * first Pro payment give `percent`% more credits. Db-free (client pages may import it); the settings reader is
 * `getOfferSettings` / `activeOfferFor` in lib/settings. Off by default (percent 0).
 *
 * The bonus is fixed when the checkout is created (Stripe metadata + `Payment.bonusCredits`), so a checkout opened
 * inside the window keeps it, and a refund takes it back with the package.
 */

export type OfferSettings = { percent: number; startsAt: Date | null; endsAt: Date | null; title: string };

/** What members see while the offer is open; `endsAt` is an ISO instant */
export type ActiveOffer = { percent: number; title: string; endsAt: string };

export const DEFAULT_OFFER_TITLE = "عروض الجمعة البيضاء";

/** Extra credits, rounded up: «+50%» never gives less than half */
export function bonusFor(credits: number, percent: number): number {
  if (!(credits > 0) || !(percent > 0)) return 0;
  return Math.ceil((credits * percent) / 100);
}

export function offerOpenAt(s: OfferSettings, now: Date): boolean {
  if (!(s.percent > 0) || !s.startsAt || !s.endsAt) return false;
  const t = now.getTime();
  return s.startsAt.getTime() <= t && t < s.endsAt.getTime();
}

/** The package name while the offer runs: older apps show the name as sent, so the gift shows there too */
export function offerPackageName(baseName: string, bonus: number): string {
  return `${baseName} + ${bonus} هدية`;
}

/** Stored setting → percent 0–100 (anything else reads as 0, i.e. off) */
export function parseOfferPercent(raw: string): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 0;
}

/** Stored setting → instant, or null when empty or invalid */
export function parseOfferDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
