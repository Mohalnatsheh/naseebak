import { BadgeCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shows whether the other person verified their account with a selfie (optional verification).
 * Verified → emerald "موثّق"; not verified → muted "غير موثّق".
 */
export function VerifiedBadge({ verified, className }: { verified?: boolean; className?: string }) {
  if (verified) {
    return (
      <span
        title="تم التحقق من هوية صاحب الحساب بصورة سيلفي"
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
  return (
    <span
      title="لم يوثّق صاحب الحساب حسابه بصورة سيلفي بعد (التوثيق اختياري)"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <ShieldQuestion className="h-3.5 w-3.5" />
      غير موثّق
    </span>
  );
}
