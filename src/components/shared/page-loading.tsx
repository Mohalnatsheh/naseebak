import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A dashboard page's loading state. It takes the page's own width and most of the screen's height, so the loaded
 * page replaces it without the footer and the content jumping (QA WA-06, layout shift).
 */
export function PageLoading({
  label = "جارٍ التحميل…",
  width = "max-w-2xl",
  className,
}: {
  label?: string;
  /** The loaded page's max width class */
  width?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("mx-auto flex min-h-[70vh] w-full flex-col items-center justify-center gap-4", width, className)}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
