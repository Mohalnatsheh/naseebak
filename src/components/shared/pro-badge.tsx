import { cn } from "@/lib/utils";

/**
 * Gold «Pro» pill for members with a live Pro subscription. Display only: it never changes who is
 * suggested or in what order. No db imports, so client components can use it.
 */
export function ProBadge({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-label="عضو Pro"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-accent/30 bg-accent/15 font-bold leading-none text-accent-foreground",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      Pro
    </span>
  );
}
