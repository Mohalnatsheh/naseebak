"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";

/**
 * A collapsed part of Admin → Settings, so the page stays short on a phone. A link to `#id`
 * (from Countries, say) opens it. The content stays mounted, so unsaved edits survive closing it.
 */
export function SettingsSection({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (ref.current && window.location.hash === `#${id}`) ref.current.open = true;
  }, [id]);

  return (
    <details ref={ref} id={id} className="group scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** One line saying how a switch combines with its twin elsewhere in the admin panel, with a link to it */
export function SettingsNote({ href, linkText, children }: { href: string; linkText: string; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {children}{" "}
        <Link href={href} className="text-primary hover:underline">{linkText}</Link>
      </span>
    </p>
  );
}
