/**
 * A paid Pro invoice that must not make Pro live:
 * - "duplicate": a second subscription of a member who already has a live one (two checkouts paid, e.g. the website
 *   and the app, or two tabs). The older one stays the member's Pro;
 * - "ended": a renewal of a subscription that already ended here (ENDED or CANCELED: a refund whose Stripe cancel
 *   failed, or Stripe `unpaid`/`paused` whose open invoice was paid later). Pro does not come back.
 *
 * Refunds are made only by an admin, by hand (owner, 2026-11-09): nothing here refunds. The webhook
 * (lib/pro/stripe-events) grants the invoice's credits as for any paid invoice (an admin refund of that payment takes
 * them back through `applyRefund`); this cancels the subscription at Stripe at once so it never charges again (real
 * subscriptions only, never a local mock) and emails the admins naming the payments, to decide on a refund.
 * Never throws: whatever fails is in the admins' email, to finish by hand.
 */
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { sendAdminAlert } from "@/lib/admin-alert";
import { cancelOnStripe } from "@/lib/pro/manage";
import { PRO_AFTER_END_BODY, PRO_DUPLICATE_BODY, PRO_NOT_LIVE_TITLE, proNotLiveCreditsLine } from "@/lib/pro/notices";
import { arabicCount } from "@/lib/utils";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";

const isMock = (id: string) => id.startsWith("mock_");

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function settleNotLiveProInvoice(a: {
  reason: "duplicate" | "ended";
  userId: string | null;
  stripeSubscriptionId: string;
  /** The row's status when the invoice arrived (ENDED / CANCELED for "ended") */
  previousStatus: string;
  /** "duplicate": the membership the member keeps, and its latest payment */
  kept: { stripeSubscriptionId: string | null; paymentId: string | null } | null;
  paymentId: string;
  invoiceId: string;
  /** Credits granted now from this invoice (0 when it was granted before, or nothing to grant) */
  credits: number;
  /** The first time this invoice is seen: only then are the admins emailed (unless something failed) */
  firstSeen: boolean;
}): Promise<void> {
  const problems: string[] = [];
  const mock = isMock(a.stripeSubscriptionId) || isMock(a.invoiceId);

  if (!mock) {
    try {
      // Also on a repeat: a cancel that failed before is tried again; one already cancelled counts as done
      await cancelOnStripe(a.stripeSubscriptionId);
    } catch (e) {
      problems.push(`Cancelling subscription ${a.stripeSubscriptionId} in Stripe failed (${errText(e)}): cancel it in the Stripe dashboard so it does not charge again.`);
    }
  }

  const ended = a.reason === "ended";

  // Admin → Payments marks the payment for a refund decision (QA WEB-PAY-05); repeats write the same value
  try {
    await db.payment.updateMany({ where: { id: a.paymentId }, data: { proNotLive: a.reason } });
  } catch (e) {
    problems.push(`Marking payment ${a.paymentId} for a refund decision failed (${errText(e)}).`);
  }
  // The member is told once, the first time this invoice is seen: a second payment never goes unexplained
  if (a.firstSeen && a.userId) {
    try {
      await notify({
        userId: a.userId,
        type: "PAYMENT",
        title: PRO_NOT_LIVE_TITLE,
        body: [
          ended ? PRO_AFTER_END_BODY : PRO_DUPLICATE_BODY,
          ...(a.credits > 0
            ? [proNotLiveCreditsLine(arabicCount(a.credits, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" }))]
            : []),
        ].join(" "),
        url: PRO_PAGE_PATH,
        metadata: { paymentId: a.paymentId },
        sms: false,
      });
    } catch (e) {
      problems.push(`Telling the member about payment ${a.paymentId} failed (${errText(e)}).`);
    }
  }

  console.warn(`[pro] ${ended ? "renewal of an ended" : "duplicate"} subscription cancelled:`, a.stripeSubscriptionId, problems.length ? "with problems" : "");
  if (problems.length === 0 && !a.firstSeen) return;

  const member = a.userId ?? "(deleted account)";
  const what = ended ? "Pro renewal paid after Pro ended" : "Duplicate Pro subscription";
  await sendAdminAlert(
    problems.length ? `${what}: action needed` : `${what}: refund decision needed`,
    [
      ended
        ? `Stripe charged invoice ${a.invoiceId} (payment ${a.paymentId}) of member ${member}'s Pro subscription ${a.stripeSubscriptionId}, which had already ended here (${a.previousStatus}). Pro did not come back.`
        : `Member ${member} paid a second Pro subscription ${a.stripeSubscriptionId} (payment ${a.paymentId}, invoice ${a.invoiceId}) while ${a.kept?.stripeSubscriptionId ?? "another one"} (latest payment ${a.kept?.paymentId ?? "?"}) was live. The older one stays the member's Pro.`,
      mock
        ? "Local mock: nothing was sent to Stripe."
        : `Subscription ${a.stripeSubscriptionId} was ${problems.length ? "NOT " : ""}cancelled in Stripe, so it does not charge again.`,
      a.credits > 0 ? `The payment's ${a.credits} credits were granted, as for any paid invoice.` : "No credits were granted now.",
      `Nothing was refunded. The member was told the team will refund this payment (the policy refunds a payment that didn't make Pro live): use Admin → Payments on payment ${a.paymentId}; it takes back that payment's credits.`,
      ...problems,
    ].join("\n"),
    { userId: a.userId },
  );
}
