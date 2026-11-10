import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one page title for every dashboard page (design review P1-6): a small gold-ringed icon, the title on the
 * display step of the type scale (Cairo 800, 28/36 on phones, 34/42 above), an optional count (a navy count badge)
 * and a short line under it. Actions (buttons, tabs) go in `children`, after the text on wide screens and under it on
 * phones. No box, no gradient text. The banner slot sits above it; an identity card, when a page has one, below it.
 */
export function PageHeader({
  icon: Icon,
  title,
  count,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  /** Shown next to the title (e.g. unread or total), hidden when 0 / undefined */
  count?: number;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-4 ring-accent/25">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display flex items-center gap-2.5 text-display-sm text-primary sm:text-display">
            {title}
            {!!count && (
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 font-sans text-label font-bold tabular-nums text-primary-foreground">
                {count}
              </span>
            )}
          </h1>
          {description && <div className="mt-1 max-w-2xl text-label font-normal text-muted-ink sm:text-body">{description}</div>}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
