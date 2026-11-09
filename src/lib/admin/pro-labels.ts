import { planFromName } from "@/lib/pro/plans";

const NAMES = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;

/** A Pro plan id in English for admin screens: «monthly» or «MONTHLY» → «Pro · Monthly» */
export function proPlanLabel(plan: string | null | undefined): string {
  const key = plan?.toLowerCase() ?? "";
  const id = key in NAMES ? (key as keyof typeof NAMES) : null;
  return id ? `Pro · ${NAMES[id]}` : plan || "—";
}

/** Payment.planName for the admin payments list: «pro_monthly» → «Pro · Monthly», credit packages as they are */
export function paymentPlanLabel(planName: string | null | undefined): string {
  const id = planFromName(planName);
  return id ? proPlanLabel(id) : planName || "—";
}
