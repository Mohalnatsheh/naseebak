"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Box = { left: number; right: number; padLeft: number; padRight: number; height: number };

const same = (a: Box | null, b: Box) =>
  !!a && a.left === b.left && a.right === b.right && a.padLeft === b.padLeft && a.padRight === b.padRight && a.height === b.height;

/**
 * An action bar fixed to the bottom of the screen. `position: sticky` never engages in the dashboard (its wrapper
 * clips overflow, which makes it a scroll container), so the bar is fixed instead:
 * - phones (below `md`, where the tab bar shows): above the tab bar (`min-h-16` + its 1px top border + the safe area);
 * - from `md`: at the bottom, spanning only the content column (the `<main>` next to the sidebar, measured, so the
 *   collapsed sidebar works too), its content lined up with the page's own column. `staticFromMd` keeps it in the
 *   page's flow from `md` instead.
 * An in-flow spacer of the bar's height keeps the end of the page from hiding behind it.
 */
export function FixedBottomBar({
  children,
  className,
  spacerClassName,
  staticFromMd = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Margin above the bar while it is fixed (on the spacer) */
  spacerClassName?: string;
  staticFromMd?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Layout effect: the bar is placed before the first paint (it only mounts in the browser after a change)
  useLayoutEffect(() => {
    const spacer = spacerRef.current;
    const bar = barRef.current;
    if (!spacer || !bar) return;
    const column = spacer.closest("main") ?? document.documentElement;
    const measure = () => {
      const c = column.getBoundingClientRect();
      const s = spacer.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const next: Box = {
        left: Math.max(0, Math.round(c.left)),
        right: Math.max(0, Math.round(viewport - c.right)),
        padLeft: Math.max(0, Math.round(s.left - c.left)),
        padRight: Math.max(0, Math.round(c.right - s.right)),
        height: bar.offsetHeight,
      };
      setBox((prev) => (same(prev, next) ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    if (typeof ResizeObserver === "undefined") return () => window.removeEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(spacer);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const vars = (
    box ? { "--bar-left": `${box.left}px`, "--bar-right": `${box.right}px`, "--bar-pad-left": `${box.padLeft}px`, "--bar-pad-right": `${box.padRight}px` } : {}
  ) as CSSProperties;

  return (
    <>
      <div
        ref={spacerRef}
        aria-hidden
        className={cn(spacerClassName, staticFromMd && "md:hidden")}
        style={{ height: box?.height ?? 0 }}
      />
      <div
        ref={barRef}
        {...rest}
        style={vars}
        className={cn(
          "fixed bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-30 left-[var(--bar-left,0px)] right-[var(--bar-right,0px)] pl-[var(--bar-pad-left,1rem)] pr-[var(--bar-pad-right,1rem)]",
          staticFromMd ? "md:static md:pl-0 md:pr-0" : "md:bottom-0",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
