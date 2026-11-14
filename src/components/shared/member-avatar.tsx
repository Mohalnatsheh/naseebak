"use client";

import Image from "next/image";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirstReveal } from "@/lib/photo-reveal";

/**
 * One avatar for every member everywhere (design review P2-5 / DS-24; the app's `MemberAvatar`): always a circle.
 * - Photo hidden (or none): the first letter on a navy gradient with a faint star veil; `locked` adds a small gold
 *   lock under the letter (photos show only after a mutual match).
 * - Photo shown: the photo (pass `photoUrl` only once it may be shown).
 * - Locked with `photoPreview` (spec 2026-11-14, blurred photo preview): the server's tiny pre-blurred copy of their main
 *   photo covers the circle under a further CSS blur, with the lock and no letter. Only a `data:image/` string is drawn;
 *   anything else (or none) keeps the letter veil.
 * - `matched`: a gold ring around it. `pro`: a small gold dot on the corner. `dimmed`: over (ended chat, closed match).
 * Decorative by default (the name is next to it); pass `alt` when the photo is the only place the name appears.
 */
export function MemberAvatar({
  name,
  size = 48,
  photoUrl,
  photoPreview,
  locked = false,
  matched = false,
  pro = false,
  dimmed = false,
  onNavy = false,
  timeLeft,
  reveal = false,
  className,
}: {
  name: string;
  /** Diameter in px (the whole avatar, ring included) */
  size?: number;
  photoUrl?: string | null;
  /** Before a match: the server's 16 px pre-blurred copy (`data:image/webp;base64,…`); used only with `locked` */
  photoPreview?: string | null;
  locked?: boolean;
  matched?: boolean;
  pro?: boolean;
  dimmed?: boolean;
  /** Sits on a navy card (the home greeting, the account identity card): a light veil so it doesn't vanish */
  onNavy?: boolean;
  /**
   * S4, the time arc: 0–1, what is left of the chat's time, drawn as a thin gold arc around the avatar (the gold ring
   * gives way to it). null / undefined: no arc.
   */
  timeLeft?: number | null;
  /** S2: the photo fades from blurred to sharp (300 ms), once per photo and session — the first time it shows */
  reveal?: boolean;
  className?: string;
}) {
  const revealNow = useFirstReveal(photoUrl, reveal);
  const initial = name.trim().charAt(0) || "؟";
  const arc = typeof timeLeft === "number" ? Math.min(1, Math.max(0, timeLeft)) : null;
  if (arc !== null) return <ArcAvatar {...{ name, size, photoUrl, photoPreview, locked, pro, dimmed, onNavy, className }} reveal={revealNow} fraction={arc} />;
  const inner = matched ? size - 6 : size;
  const showLock = locked && !photoUrl && size >= 36;
  const preview = locked && !photoUrl && typeof photoPreview === "string" && photoPreview.startsWith("data:image/") ? photoPreview : null;
  const lockSize = Math.round(inner * 0.2);
  return (
    <span
      data-slot="member-avatar"
      data-state={photoUrl ? "photo" : preview ? "preview" : locked ? "locked" : "initial"}
      data-matched={matched || undefined}
      data-pro={pro || undefined}
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", matched && "ring-2 ring-accent ring-offset-2 ring-offset-card", className)}
      style={{ width: matched ? inner : size, height: matched ? inner : size, margin: matched ? 3 : undefined }}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={`صورة ${name}`}
          width={inner}
          height={inner}
          unoptimized
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className={cn("h-full w-full rounded-full object-cover", revealNow && "photo-reveal")}
        />
      ) : preview ? (
        <span aria-hidden className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: preview of a few hundred bytes; next/image cannot optimise data: URLs */}
          <img
            src={preview}
            alt=""
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute inset-0 h-full w-full scale-125 object-cover"
            style={{ filter: `blur(${Math.max(3, Math.round(inner * 0.08))}px)` }}
          />
          {showLock && (
            <span
              data-slot="avatar-lock"
              className="relative flex items-center justify-center rounded-full bg-primary/70 text-accent"
              style={{ width: lockSize + 10, height: lockSize + 10 }}
            >
              <Lock style={{ width: lockSize, height: lockSize }} />
            </span>
          )}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "member-veil relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full font-display leading-none",
            dimmed
              ? "bg-muted text-muted-foreground"
              : onNavy
                ? "bg-white/15 text-white ring-1 ring-inset ring-accent/60"
                : "bg-gradient-to-br from-primary to-primary-2 text-primary-foreground",
          )}
          style={{ fontSize: Math.max(12, Math.round(inner * 0.4)) }}
        >
          <span className={cn(showLock && "-mt-[12%]")}>{initial}</span>
          {showLock && <Lock className="absolute bottom-[12%] text-accent" style={{ width: inner * 0.2, height: inner * 0.2 }} />}
        </span>
      )}
      {showLock && <span className="sr-only">{preview ? "الصور تظهر بوضوح بعد الاهتمام المتبادل" : "الصور تظهر بعد الاهتمام المتبادل"}</span>}
      {pro && (
        <span
          aria-hidden
          data-slot="avatar-pro-dot"
          className="absolute bottom-0 end-0 rounded-full border-2 border-card bg-accent"
          style={{ width: Math.max(10, Math.round(size * 0.24)), height: Math.max(10, Math.round(size * 0.24)) }}
        />
      )}
    </span>
  );
}

/** The avatar inside the S4 arc: a faint gold track and the gold share of time left, starting at the top */
function ArcAvatar({
  fraction,
  size,
  className,
  ...face
}: {
  fraction: number;
  name: string;
  size: number;
  photoUrl?: string | null;
  photoPreview?: string | null;
  locked: boolean;
  pro: boolean;
  dimmed: boolean;
  onNavy: boolean;
  reveal: boolean;
  className?: string;
}) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      data-slot="time-arc"
      data-fraction={fraction.toFixed(2)}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeOpacity={0.2} strokeWidth={stroke} />
        {fraction > 0 && (
          <circle
            data-arc=""
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * fraction} ${c}`}
          />
        )}
      </svg>
      <MemberAvatar {...face} size={size - 8} />
    </span>
  );
}

/**
 * Share of a chat's time still left (the app's `chatTimeFraction`): 14 days, or 21 once extended (more than 14 left).
 * null when there is no end or it has passed.
 */
export function chatTimeFraction(expiresAt: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - now;
  if (!(left > 0)) return null;
  const day = 24 * 60 * 60 * 1000;
  const total = (left > 14 * day ? 21 : 14) * day;
  return Math.min(1, Math.max(0, left / total));
}
