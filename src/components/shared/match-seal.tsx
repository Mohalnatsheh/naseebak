import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * S1, the match seal (the app's `MatchSeal` / `SealMark`): a gold eight-point star — two squares turned 45° apart —
 * around a navy centre. At the match moment the star draws itself in 600 ms (`animate-seal-draw`); under
 * prefers-reduced-motion the global rule ends the animation at once, so it is simply drawn. The small mark stays on the
 * match card and the chat header. Db-free and server-safe.
 */

/** The eight-point star on a 0–100 grid: each square as its own closed path, so both draw at the same pace */
const STAR_SQUARES = [
  "M22 22 H78 V78 H22 Z",
  // The same square turned 45° around the centre (corners on the axes)
  "M50 10.4 L89.6 50 L50 89.6 L10.4 50 Z",
] as const;

function Star({ animate, strokeWidth }: { animate: boolean; strokeWidth: number }) {
  return (
    <g fill="none" stroke="var(--accent)" strokeWidth={strokeWidth} strokeLinejoin="round">
      {STAR_SQUARES.map((d) => (
        <path
          key={d}
          d={d}
          // pathLength 1: the dash maths is the same for any size; the keyframe runs the offset 1 → 0
          pathLength={1}
          strokeDasharray={animate ? 1 : undefined}
          className={animate ? "animate-seal-draw" : undefined}
        />
      ))}
    </g>
  );
}

/** «س · ر» from two first names (either may be missing) */
export function sealInitials(a?: string | null, b?: string | null): string {
  const first = (n?: string | null) => (n ?? "").trim().charAt(0);
  return [first(a), first(b)].filter(Boolean).join(" · ");
}

/** The large seal at the match moment */
export function MatchSeal({
  initials,
  size = 104,
  animate = true,
  className,
}: {
  initials: string;
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="توافق متبادل"
      data-slot="match-seal"
      data-animate={animate || undefined}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="absolute inset-0">
        <Star animate={animate} strokeWidth={2} />
      </svg>
      <span
        aria-hidden
        className="relative flex items-center justify-center rounded-full bg-primary font-display text-primary-foreground"
        style={{ width: size * 0.44, height: size * 0.44, fontSize: Math.max(12, Math.round(size * 0.15)) }}
      >
        {initials || <Check style={{ width: size * 0.2, height: size * 0.2 }} />}
      </span>
    </span>
  );
}

/** The small «توافق متبادل» seal for a match card or the chat header: already drawn, never animated */
export function SealMark({
  size = 18,
  label = "توافق متبادل",
  icon: Icon = Check,
  className,
}: {
  size?: number;
  label?: string;
  /** The centre: a check for a match; the crown for «اشتراكي» (as in the app) */
  icon?: typeof Check;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-slot="seal-mark"
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="absolute inset-0">
        <Star animate={false} strokeWidth={7} />
      </svg>
      <Icon aria-hidden className="relative text-primary" style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={Icon === Check ? 3 : 2.25} />
    </span>
  );
}
