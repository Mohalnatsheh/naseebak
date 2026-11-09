import { cn } from "@/lib/utils";

/**
 * Gold «Pro» pill for members with a live Pro subscription. Display only: it never changes who is
 * suggested or in what order. No db imports, so client components can use it.
 * `onDark`: on navy / primary backgrounds (the dashboard greeting card) the pill is solid gold with dark text,
 * since the light pill's dark text on a faint gold tint disappears there.
 */
export function ProBadge({
  size = "sm",
  onDark = false,
  inText = false,
  className,
}: {
  size?: "sm" | "md";
  onDark?: boolean;
  /** Inside text that already says «عضوية»: read as plain «Pro», never «عضوية عضوية Pro» (QA WEB-PAY-14) */
  inText?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-label={inText ? undefined : "عضوية Pro"}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border font-bold leading-none text-accent-foreground",
        onDark ? "border-accent bg-accent shadow-sm shadow-black/20" : "border-accent/30 bg-accent/15",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      Pro
    </span>
  );
}
