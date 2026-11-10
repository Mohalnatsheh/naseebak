/** Shared Pro types (db-free: client pages may import it) */
import type { ProPlanId, ProPlanOffer } from "@/lib/pro/plans";

export interface MyProState {
  /** `pro_enabled` switch (sales and offers only) */
  enabled: boolean;
  isPro: boolean;
  plan: ProPlanId | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  pastDue: boolean;
  /** Credits each grant gives (yearly: each month); 0 when the plan gives none. Absent: not Pro */
  creditsPerGrant?: number;
  /** When the next credits are due (yearly: the next monthly drip; weekly/monthly: the renewal), or null when none is
   *  coming (renewal cancelled, payment failing, or the year's grants are done) */
  nextGrantAt?: string | null;
  canBuy: boolean;
  offers: ProPlanOffer[];
}
