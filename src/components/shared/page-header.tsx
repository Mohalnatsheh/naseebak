import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one page title for dashboard pages: a small gold-ringed icon, the title in the display face
 * (Reem Kufi, `font-display`), an optional count and a short line under it. Actions (buttons, tabs)
 * go in `children`, after the text on wide screens and under it on phones. No box, no gradient text.
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
        <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-4 ring-accent/25">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display flex items-center gap-2.5 text-3xl leading-tight text-primary sm:text-4xl">
            {title}
            {!!count && (
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-2 font-sans text-sm font-bold text-accent-foreground">
                {count}
              </span>
            )}
          </h1>
          {description && <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</div>}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
