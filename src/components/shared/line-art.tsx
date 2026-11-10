import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Line-art for empty states (design review P2-2 / S5; the app's `LineArt`): navy lines with one gold touch, 120 px,
 * drawn inline — no files, never a face. Same drawings as the app (120 × 120 grid).
 */
export type LineArtKind = "dallah" | "envelope" | "cupsTray" | "door" | "window" | "lantern" | "wallet";

const NAVY = { stroke: "var(--primary)", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
const GOLD = { stroke: "var(--accent)", strokeWidth: 2.2, strokeLinecap: "round", fill: "none" } as const;
const GOLD_FILL = { fill: "var(--accent)", fillOpacity: 0.9 } as const;

function cup(x: number) {
  return `M${x - 6} 82 L${x - 4} 92 L${x + 4} 92 L${x + 6} 82`;
}

const DRAWINGS: Record<LineArtKind, ReactNode> = {
  // A dallah (coffee pot) and two small cups
  dallah: (
    <>
      <path {...NAVY} d="M38 92 L66 92 Q70 70 60 58 L60 48 Q52 40 44 48 L44 58 Q34 70 38 92 Z" />
      <path {...NAVY} d="M60 60 Q76 54 84 42" />
      <path {...NAVY} d="M52 40 L52 34" />
      <circle {...GOLD_FILL} cx="52" cy="32" r="2.5" />
      <path {...NAVY} d={cup(82)} />
      <path {...NAVY} d={cup(98)} />
      <path {...GOLD} d="M28 96 L106 96" />
    </>
  ),
  // A sealed envelope
  envelope: (
    <>
      <rect {...NAVY} x="22" y="38" width="76" height="50" rx="6" />
      <path {...NAVY} d="M24 40 L60 66 L96 40" />
      <circle {...GOLD_FILL} cx="60" cy="66" r="7" />
    </>
  ),
  // Two cups on a tray
  cupsTray: (
    <>
      {[46, 74].map((x) => (
        <g key={x}>
          <path {...NAVY} d={`M${x - 11} 58 L${x - 8} 80 L${x + 8} 80 L${x + 11} 58`} />
          <path {...GOLD} d={`M${x - 2} 52 Q${x + 3} 46 ${x - 1} 40`} />
        </g>
      ))}
      <path {...NAVY} d="M22 84 L98 84 Q94 92 86 92 L34 92 Q26 92 22 84 Z" />
    </>
  ),
  // A carved, arched door
  door: (
    <>
      <path {...NAVY} d="M36 98 L36 50 A24 24 0 0 1 84 50 L84 98 Z" />
      <path {...NAVY} d="M60 30 L60 98" />
      <g {...GOLD}>
        <rect x="55" y="47" width="10" height="10" />
        <rect x="55" y="47" width="10" height="10" transform="rotate(45 60 52)" />
      </g>
      <circle {...GOLD_FILL} cx="54" cy="76" r="2" />
      <circle {...GOLD_FILL} cx="66" cy="76" r="2" />
    </>
  ),
  // An arched Amman window
  window: (
    <>
      <path {...NAVY} d="M38 96 L38 54 A22 22 0 0 1 82 54 L82 96 Z" />
      <path {...NAVY} d="M60 32 L60 96 M38 68 L82 68" />
      <path {...GOLD} d="M30 98 L90 98" />
    </>
  ),
  // A wallet with two coins (an empty payment history)
  wallet: (
    <>
      <rect {...NAVY} x="24" y="44" width="68" height="46" rx="8" />
      <path {...NAVY} d="M30 44 L74 30 L80 44" />
      <path {...NAVY} d="M92 58 L78 58 Q72 58 72 64 L72 70 Q72 76 78 76 L92 76" />
      <circle {...GOLD_FILL} cx="80" cy="67" r="2.5" />
      <circle {...GOLD} cx="98" cy="36" r="7" />
      <circle {...GOLD} cx="88" cy="24" r="5" />
    </>
  ),
  // A hanging lantern
  lantern: (
    <>
      <path {...NAVY} d="M60 18 L60 30" />
      <path {...NAVY} d="M48 36 L72 36 L66 30 L54 30 Z" />
      <path {...NAVY} d="M46 38 L74 38 L78 80 L42 80 Z" />
      <path {...NAVY} d="M60 38 L60 50 M60 70 L60 80" />
      <path {...GOLD} d="M60 70 Q52 60 60 50 Q68 60 60 70" />
      <path {...NAVY} d="M44 86 L76 86" />
    </>
  ),
};

export function LineArt({ kind, size = 120, className }: { kind: LineArtKind; size?: number; className?: string }) {
  return (
    <svg
      data-line-art={kind}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {DRAWINGS[kind]}
    </svg>
  );
}

/**
 * The one empty state: the drawing, a headline, a short line and optional actions. Never a fake empty state for a
 * failed load (that is `LoadError`).
 */
export function EmptyState({
  art,
  title,
  description,
  children,
  className,
  headingLevel = 2,
}: {
  art: LineArtKind;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      data-slot="empty-state"
      className={cn("animate-appear flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center", className)}
    >
      <LineArt kind={art} />
      <H className="text-headline text-ink">{title}</H>
      {description && <div className="mx-auto max-w-sm text-label font-normal text-muted-ink">{description}</div>}
      {children && <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{children}</div>}
    </div>
  );
}
