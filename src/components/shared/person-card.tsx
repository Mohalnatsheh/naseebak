"use client";

import Image from "next/image";
import type { ComponentType, ReactNode } from "react";
import { Briefcase, Calendar, ChevronDown, ChevronUp, Lock, MapPin, Quote, Sparkle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { cn } from "@/lib/utils";

/**
 * One card design for people on the dashboard: suggestions (legacy + simultaneous), received
 * interests, sent requests and mutual matches. Purely presentational — each page keeps its own
 * data, state, actions and dialogs and passes them in through the slots.
 */

export type PersonCardTone = "default" | "pending" | "info" | "success" | "danger";

export interface PersonCardTag {
  icon: ComponentType<{ className?: string }>;
  label: string | null | undefined | false;
}

export interface PersonCardProps {
  name: string;
  verified?: boolean;
  age?: number | null;
  city?: string | null;
  area?: string | null;
  /** Already described for the viewer (third person, gender-aware) */
  job?: string | null;
  /** Compatibility 0–100; the ring is hidden when missing or 0 */
  score?: number | null;
  /** Main photo; only pass it once photos are revealed (mutual like) */
  photoUrl?: string | null;
  /** Photos exist but stay hidden until a mutual like: shows a small lock on the avatar */
  photoLocked?: boolean;
  /** Small mark on the avatar corner (e.g. admin pick) */
  avatarMark?: ReactNode;
  /** Status / context badges next to the name */
  badges?: ReactNode;
  /** Status badge on the score-label row (end side) */
  status?: ReactNode;
  /** Side stripe colour for the card's status */
  tone?: PersonCardTone;
  /** A short line under the name (e.g. date) */
  meta?: ReactNode;
  tags?: PersonCardTag[];
  aboutMe?: string | null;
  /** Page-specific content shown after the summary (status notes, reasons, intro panel…) */
  children?: ReactNode;
  /** Full profile details; when given, the card shows the expand toggle (controlled) */
  details?: ReactNode;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Shown after the details, before the actions (photos, scheduled visit, feedback…) */
  afterDetails?: ReactNode;
  /** Action row (buttons, menus) */
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function scoreLabel(score: number) {
  if (score >= 85) return "توافق ممتاز";
  if (score >= 70) return "توافق جيد جداً";
  if (score >= 55) return "توافق جيد";
  if (score >= 40) return "توافق مقبول";
  return "توافق منخفض";
}

export function scoreGradient(score: number) {
  if (score >= 60) return "from-primary to-secondary";
  if (score >= 40) return "from-accent to-accent/70";
  return "from-destructive to-destructive/70";
}

const toneStripe: Record<PersonCardTone, string> = {
  default: "border-s-primary/30",
  pending: "border-s-amber-400",
  info: "border-s-primary",
  success: "border-s-emerald-500",
  danger: "border-s-destructive",
};

export function ScoreRing({ score, compact }: { score: number; compact?: boolean }) {
  return (
    <div
      className={cn(
        "shrink-0 rounded-full bg-gradient-to-br p-[5px] ring-4 ring-primary/10 shadow-md",
        scoreGradient(score),
        compact ? "h-14 w-14" : "h-16 w-16 sm:h-[72px] sm:w-[72px]"
      )}
      role="img"
      aria-label={`نسبة التوافق ${score}%`}
    >
      <div className="h-full w-full rounded-full bg-card flex flex-col items-center justify-center" aria-hidden="true">
        <span className={cn("font-black text-foreground leading-none", compact ? "text-base" : "text-lg sm:text-xl")}>
          {score}
          <span className="text-[0.6em] font-bold">%</span>
        </span>
        {/* Readable caption (was 8px muted) */}
        <span className="text-[10px] text-foreground/70 font-semibold leading-none mt-0.5">توافق</span>
      </div>
    </div>
  );
}

function Avatar({
  name,
  photoUrl,
  photoLocked,
  mark,
  compact,
}: {
  name: string;
  photoUrl?: string | null;
  photoLocked?: boolean;
  mark?: ReactNode;
  compact?: boolean;
}) {
  const size = compact ? "h-14 w-14" : "h-16 w-16";
  return (
    <div className="relative shrink-0">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={`صورة ${name}`}
          width={compact ? 56 : 64}
          height={compact ? 56 : 64}
          unoptimized
          className={cn(size, "rounded-2xl object-cover border border-primary/15 shadow-sm")}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div
          className={cn(
            size,
            "rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center border border-primary/15 shadow-sm"
          )}
          aria-hidden="true"
        >
          <span className={cn("font-bold text-primary", compact ? "text-xl" : "text-2xl")}>{name.charAt(0)}</span>
        </div>
      )}
      {photoLocked && !photoUrl && (
        <span
          className="absolute -bottom-1 -start-1 h-5 w-5 rounded-full bg-card border border-border flex items-center justify-center shadow-sm"
          title="الصور تظهر بعد الاهتمام المتبادل"
        >
          <Lock className="h-2.5 w-2.5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">الصور تظهر بعد الاهتمام المتبادل</span>
        </span>
      )}
      {mark && <span className="absolute -top-1.5 -end-1.5">{mark}</span>}
    </div>
  );
}

export function PersonCard({
  name,
  verified,
  age,
  city,
  area,
  job,
  score,
  photoUrl,
  photoLocked,
  avatarMark,
  badges,
  status,
  tone = "default",
  meta,
  tags,
  aboutMe,
  children,
  details,
  expanded,
  onToggleExpand,
  afterDetails,
  actions,
  compact,
  className,
}: PersonCardProps) {
  const s = score ? Math.round(score) : 0;
  const visibleTags = (tags ?? []).filter((t): t is PersonCardTag & { label: string } => !!t.label);
  const pad = compact ? "px-4 sm:px-5" : "px-5 md:px-6";

  return (
    <Card
      className={cn(
        "group gap-0 py-0 overflow-hidden border-border/50 border-s-4 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5",
        toneStripe[tone],
        className
      )}
    >
      {s > 0 && <div className={cn("h-1.5 bg-gradient-to-l", scoreGradient(s))} aria-hidden="true" />}
      <CardContent className="p-0">
        {/* Header */}
        <div className={cn(pad, compact ? "pt-4 pb-3" : "pt-5 md:pt-6 pb-4")}>
          <div className="flex items-start gap-3 sm:gap-4">
            <Avatar name={name} photoUrl={photoUrl} photoLocked={photoLocked} mark={avatarMark} compact={compact} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className={cn("font-bold text-foreground truncate max-w-full", compact ? "text-base" : "text-lg sm:text-xl")}>{name}</h3>
                <VerifiedBadge verified={verified} />
                {badges}
              </div>
              {(age || city || job) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                  {age ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      {age} سنة
                    </span>
                  ) : null}
                  {city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {city}
                      {area ? ` - ${area}` : ""}
                    </span>
                  )}
                  {job && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                      {job}
                    </span>
                  )}
                </div>
              )}
              {meta && <div className="text-xs text-muted-foreground mt-1.5">{meta}</div>}
            </div>
            {s > 0 && <ScoreRing score={s} compact={compact} />}
          </div>

          {(s > 0 || status) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {s > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary/80">
                  <Sparkle className="h-3.5 w-3.5 text-primary/50" aria-hidden="true" />
                  {scoreLabel(s)}
                </span>
              ) : (
                <span />
              )}
              {status}
            </div>
          )}
        </div>

        {/* Key tags */}
        {visibleTags.length > 0 && (
          <ul className={cn(pad, "pb-4 flex flex-wrap gap-2")} aria-label="معلومات أساسية">
            {visibleTags.map((t, i) => (
              <li
                key={`${t.label}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80"
              >
                <t.icon className="h-3 w-3 text-primary/50" aria-hidden="true" />
                {t.label}
              </li>
            ))}
          </ul>
        )}

        {aboutMe && (
          <div className={cn(compact ? "mx-4 sm:mx-5" : "mx-5 md:mx-6", "mb-4 p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-2.5")}>
            <Quote className="h-4 w-4 text-primary/40 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-foreground/80 leading-relaxed">{aboutMe}</p>
          </div>
        )}

        {children && <div className={cn(pad, "pb-4 flex flex-col gap-3 *:mt-0 empty:hidden")}>{children}</div>}

        {details && onToggleExpand && (
          <div className={cn(pad, "mb-4")}>
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={!!expanded}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  إخفاء التفاصيل
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  عرض جميع التفاصيل
                </>
              )}
            </button>
          </div>
        )}
        {details && expanded && details}

        {afterDetails}

        {actions && <div className={cn(pad, compact ? "pb-4" : "pb-5 md:pb-6")}>{actions}</div>}
      </CardContent>
    </Card>
  );
}
