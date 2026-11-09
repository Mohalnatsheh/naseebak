import { planFromName } from "@/lib/pro/plans";
import { findAnyPackage } from "@/lib/payments/packages";

const NAMES = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;

/** A Pro plan id in English for admin screens: «monthly» or «MONTHLY» → «Pro · Monthly» */
export function proPlanLabel(plan: string | null | undefined): string {
  const key = plan?.toLowerCase() ?? "";
  const id = key in NAMES ? (key as keyof typeof NAMES) : null;
  return id ? `Pro · ${NAMES[id]}` : plan || "—";
}

/**
 * Payment.planName for admin screens (one helper for Admin → Payments and the member page, QA WEB-PAY-09):
 * «pro_monthly» → «Pro · Monthly», «launch_10» → «Pack · 10 credits», `renewal` → «Pro · Monthly · renewal»
 */
export function paymentPlanLabel(planName: string | null | undefined, opts: { renewal?: boolean } = {}): string {
  const id = planFromName(planName);
  if (id) return `${proPlanLabel(id)}${opts.renewal ? " · renewal" : ""}`;
  const pkg = findAnyPackage(planName);
  if (pkg) return `Pack · ${pkg.credits} credit${pkg.credits === 1 ? "" : "s"}`;
  return planName || "—";
}

/** CreditLedger.reason in English for the admin member page */
export const CREDIT_REASON_LABELS: Record<string, string> = {
  REGISTRATION: "Registration",
  PURCHASE: "Pack purchase",
  REQUEST: "Family/chat request",
  SUGGESTION: "Suggestion (legacy)",
  ADMIN_ADJUST: "Admin adjustment",
  MIGRATION_GIFT: "New-cycle top-up",
  REFUND: "Refund",
  REFERRAL: "Referral reward",
  INTEREST: "Interest",
  POLL_REWARD: "Question answered",
  PRO_GRANT: "Pro credits",
};
