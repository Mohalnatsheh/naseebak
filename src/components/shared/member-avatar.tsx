"use client";

import Image from "next/image";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One avatar for every member everywhere (design review P2-5 / DS-24; the app's `MemberAvatar`): always a circle.
 * - Photo hidden (or none): the first letter on a navy gradient with a faint star veil; `locked` adds a small gold
 *   lock under the letter (photos show only after a mutual match).
 * - Photo shown: the photo (pass `photoUrl` only once it may be shown).
 * - `matched`: a gold ring around it. `pro`: a small gold dot on the corner. `dimmed`: over (ended chat, closed match).
 * Decorative by default (the name is next to it); pass `alt` when the photo is the only place the name appears.
 */
export function MemberAvatar({
  name,
  size = 48,
  photoUrl,
  locked = false,
  matched = false,
  pro = false,
  dimmed = false,
  onNavy = false,
  className,
}: {
  name: string;
  /** Diameter in px (the whole avatar, ring included) */
  size?: number;
  photoUrl?: string | null;
  locked?: boolean;
  matched?: boolean;
  pro?: boolean;
  dimmed?: boolean;
  /** Sits on a navy card (the home greeting, the account identity card): a light veil so it doesn't vanish */
  onNavy?: boolean;
  className?: string;
}) {
  const initial = name.trim().charAt(0) || "؟";
  const inner = matched ? size - 6 : size;
  const showLock = locked && !photoUrl && size >= 36;
  return (
    <span
      data-slot="member-avatar"
      data-state={photoUrl ? "photo" : locked ? "locked" : "initial"}
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
          className="h-full w-full rounded-full object-cover"
        />
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
      {showLock && <span className="sr-only">الصور تظهر بعد الاهتمام المتبادل</span>}
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
