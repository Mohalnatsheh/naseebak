/** Admin → Payments refund confirmation text (client-safe) */
export interface RefundPreviewRow {
  amount: string;
  currency: string;
  user: { firstName: string; lastName: string; matchCredits: number } | null;
  credits: number;
  endsPro?: boolean;
}

/** "Refund 5.00 JOD…": what the admin is about to do, with a warning when the balance can't cover it */
export function refundQuestion(p: RefundPreviewRow): { title: string; lines: string[] } {
  const title = `Refund ${Number(p.amount).toFixed(2)} ${p.currency} to ${p.user ? `${p.user.firstName} ${p.user.lastName}` : "this deleted account"}?`;
  const lines: string[] = [];
  if (p.user) {
    lines.push(`${p.credits} credit(s) will be taken back. Current balance: ${p.user.matchCredits}.`);
    if (p.user.matchCredits < p.credits) {
      lines.push(`Warning: the balance is lower than the credits, so it stops at 0 and ${p.credits - p.user.matchCredits} credit(s) already used stay used.`);
    }
  }
  if (p.endsPro) lines.push("This payment paid the current Pro period: Pro ends now, and the subscription is cancelled at Stripe.");
  return { title, lines };
}
