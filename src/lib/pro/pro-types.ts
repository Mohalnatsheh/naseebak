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
  canBuy: boolean;
  offers: ProPlanOffer[];
}
