/** Admin → Payments refund confirmation text (client-safe) */
import { chargeFor } from "@/lib/payments/packages";

/**
 * «6.00 JOD (8.46 USD charged)»: Jordan shows dinars but the card paid dollars, and Stripe refunds what was charged
 * (WP2-07). Dinars charged in JOD and riyals are charged as shown; other (old) currencies come back as stored.
 */
export function refundAmountText(p: { amount: string | number; currency: string; chargeCurrency?: string | null }): string {
  const shown = `${Number(p.amount).toFixed(2)} ${p.currency}`;
  // A row charged in JOD (switch jod_charging) was charged as shown
  if (p.currency !== "JOD" || p.chargeCurrency === "jod") return shown;
  const charge = chargeFor(Number(p.amount), "JOD");
  return `${shown} (${(charge.chargeAmount / 100).toFixed(2)} USD charged)`;
}

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;
export interface RefundPreviewRow {
  amount: string;
  currency: string;
  user: { firstName: string; lastName: string; matchCredits: number } | null;
  credits: number;
  endsPro?: boolean;
}

/** "Refund 5.00 JOD…": what the admin is about to do, with a warning when the balance can't cover it */
export function refundQuestion(p: RefundPreviewRow): { title: string; lines: string[] } {
  const title = `Refund ${refundAmountText(p)} to ${p.user ? `${p.user.firstName} ${p.user.lastName}` : "this deleted account"}?`;
  const lines: string[] = [];
  if (p.user) {
    lines.push(`${credits(p.credits)} will be taken back. Current balance: ${p.user.matchCredits}.`);
    if (p.user.matchCredits < p.credits) {
      lines.push(`Warning: the balance is lower than the credits, so it stops at 0 and ${credits(p.credits - p.user.matchCredits)} already used stay used.`);
    }
  }
  if (p.endsPro) lines.push("This payment paid the current Pro period: Pro ends now, and the subscription is cancelled at Stripe.");
  return { title, lines };
}
