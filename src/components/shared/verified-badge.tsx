"use client";

import { BadgeCheck } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { cn } from "@/lib/utils";

/**
 * "موثّق" badge for accounts verified earlier with a selfie. Verification is no longer offered,
 * so unverified accounts show nothing.
 *
 * New user cycle (`intro_requests_enabled` on): never shown, so newer (unverified) members don't
 * look less trustworthy. The switch comes from the dashboard context (`counts.flags`, from
 * `/api/me/counts`). The badge only shows once those counts have loaded with the switch off —
 * the loaded response always carries `pendingIntroMatchId`, the initial/empty context does not —
 * so it never flashes in the new cycle, and outside the dashboard provider it stays hidden.
 */
export function VerifiedBadge({ verified, className }: { verified?: boolean; className?: string }) {
  const { counts } = useDashboardData();
  const countsLoaded = "pendingIntroMatchId" in counts;
  if (verified && countsLoaded && !counts.flags.introRequests) {
    return (
      <span
        title="تم التحقق من هوية صاحب الحساب"
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700",
          className
        )}
      >
        <BadgeCheck className="h-3.5 w-3.5" />
        موثّق
      </span>
    );
  }
  return null;
}
