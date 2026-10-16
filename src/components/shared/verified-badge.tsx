import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "موثّق" badge for accounts verified earlier with a selfie. Verification is no longer offered,
 * so unverified accounts show nothing.
 */
export function VerifiedBadge({ verified, className }: { verified?: boolean; className?: string }) {
  if (verified) {
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
