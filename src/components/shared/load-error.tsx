"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A load failed: say so (instead of a misleading empty state) and offer a retry.
 */
export function LoadError({
  message = "تعذّر تحميل البيانات. تحقّق من الاتصال وحاول مرة أخرى.",
  onRetry,
  className = "",
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-8 text-center ${className}`}
    >
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <p className="text-sm text-foreground max-w-sm leading-relaxed">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="h-11 gap-2 rounded-xl">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
