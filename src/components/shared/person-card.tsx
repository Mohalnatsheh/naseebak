"use client";

import type { ComponentType, ReactNode } from "react";
import { Briefcase, ChevronDown, ChevronUp, Lightbulb, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { cn } from "@/lib/utils";

/**
 * One card design for people on the dashboard: suggestions (legacy + simultaneous), received
 * interests, sent requests and mutual matches. Purely presentational — each page keeps its own
 * data, state, actions and dialogs and passes them in through the slots.
 *
 * The shared suggestion card (design review P1-4, same as the app): avatar, name, «28 سنة · عمّان» with the activity
 * dot and a 56 px score ring on one row; at most 3 chips; the "why" line in soft gold (`WhyLine`); everything else
 * (job, about me, the other chips, the full profile) under the collapsed details; 48 px buttons in `actions`.
 */

export type PersonCardTone = "default" | "pending" | "info" | "success" | "danger" | "muted";

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
  /** «نشطة اليوم» / «نشط هذا الأسبوع»: a green dot on the meta line */
  activity?: string | null;
  /** A live Pro member: the small gold dot on the avatar (the «Pro» pill goes in `badges`) */
  pro?: boolean;
  /** A mutual match: the gold ring on the avatar */
  matched?: boolean;
  /** Chips shown on the card; the rest go under the details (default 3) */
  maxTags?: number;
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

const toneStripe: Record<PersonCardTone, string> = {
  default: "",
  pending: "border-s-4 border-s-amber-400",
  info: "border-s-4 border-s-primary",
  success: "border-s-4 border-s-emerald-500",
  danger: "border-s-4 border-s-destructive",
  muted: "opacity-80",
};

export function ScoreRing({ score, compact }: { score: number; compact?: boolean }) {
  // A real progress ring: gold for a good match, muted gold below 60, red under 40
  const color = score >= 60 ? "var(--accent)" : score >= 40 ? "color-mix(in oklch, var(--accent) 60%, transparent)" : "var(--destructive)";
  return (
    <div
      className={cn("shrink-0 rounded-full p-[5px]", compact ? "h-12 w-12" : "h-14 w-14")}
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--muted) 0deg)` }}
      role="img"
      aria-label={`نسبة التوافق ${score}%`}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full bg-card" aria-hidden="true">
        <span dir="ltr" className={cn("font-display leading-none tabular-nums text-primary", compact ? "text-label" : "text-headline")}>
          {score}%
        </span>
      </div>
    </div>
  );
}

/** The one "why this suggestion" line: soft gold with dark-gold text (P1-4) */
export function WhyLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-label font-medium text-accent-ink">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function TagChip({ tag }: { tag: PersonCardTag & { label: string } }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-label text-ink">
      <tag.icon className="h-3.5 w-3.5 text-primary/60" aria-hidden="true" />
      {tag.label}
    </li>
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
  activity,
  pro,
  matched,
  maxTags = 3,
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
  const allTags = (tags ?? []).filter((t): t is PersonCardTag & { label: string } => !!t.label);
  const collapsible = !!(details && onToggleExpand);
  // With a details toggle, only the first few chips show; the rest (and job, about me) wait under the details
  const shownTags = collapsible ? allTags.slice(0, maxTags) : allTags;
  const moreTags = collapsible ? allTags.slice(maxTags) : [];
  const pad = compact ? "px-4" : "px-4 sm:px-5";
  const place = city ? `${city}${area ? ` - ${area}` : ""}` : null;

  const jobLine = job ? (
    <p className="flex items-center gap-1.5 text-label font-normal text-muted-ink">
      <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {job}
    </p>
  ) : null;
  const about = aboutMe ? (
    <div className="flex items-start gap-2.5 rounded-xl bg-primary/5 p-3">
      <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary/40" aria-hidden="true" />
      <p className="text-label font-normal text-ink">{aboutMe}</p>
    </div>
  ) : null;

  return (
    <Card
      data-slot="person-card"
      className={cn(
        "group gap-0 overflow-hidden rounded-2xl border-border py-0 shadow-none transition-colors hover:border-primary/25",
        toneStripe[tone],
        className
      )}
    >
      <CardContent className="p-0">
        {/* Top row: avatar, name and «العمر · المدينة», the ring */}
        <div className={cn(pad, compact ? "pt-4 pb-3" : "pt-4 pb-3 sm:pt-5")}>
          <div className="flex items-center gap-3">
            <span className="relative shrink-0">
              <MemberAvatar name={name} size={compact ? 44 : 48} photoUrl={photoUrl} locked={photoLocked} matched={matched} pro={pro} />
              {avatarMark && <span className="absolute -top-1.5 -end-1.5">{avatarMark}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className={cn("max-w-full truncate text-ink", compact ? "text-headline" : "text-title")}>{name}</h2>
                <VerifiedBadge verified={verified} />
                {badges}
              </div>
              {(age || place || activity) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption text-muted-ink">
                  {age ? <span className="tabular-nums">{age} سنة</span> : null}
                  {age && place ? <span aria-hidden>·</span> : null}
                  {place && <span>{place}</span>}
                  {activity && (
                    <span className="inline-flex items-center gap-1">
                      {(age || place) && <span aria-hidden>·</span>}
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
                      {activity}
                    </span>
                  )}
                </p>
              )}
              {meta && <div className="mt-1 text-caption text-muted-ink">{meta}</div>}
            </div>
            {s > 0 && (
              <div className="flex shrink-0 flex-col items-center gap-0.5">
                <ScoreRing score={s} compact={compact} />
                <span className="text-caption text-accent-ink">{scoreLabel(s)}</span>
              </div>
            )}
          </div>
          {status && <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{status}</div>}
        </div>

        {/* At most three chips */}
        {shownTags.length > 0 && (
          <ul className={cn(pad, "flex flex-wrap gap-2 pb-3")} aria-label="معلومات أساسية">
            {shownTags.map((t, i) => (
              <TagChip key={`${t.label}-${i}`} tag={t} />
            ))}
          </ul>
        )}

        {!collapsible && (jobLine || about) && <div className={cn(pad, "flex flex-col gap-2 pb-3")}>{jobLine}{about}</div>}

        {children && <div className={cn(pad, "flex flex-col gap-3 pb-3 *:mt-0 empty:hidden")}>{children}</div>}

        {collapsible && expanded && (
          <div className={cn(pad, "flex flex-col gap-3 pb-3")}>
            {jobLine}
            {moreTags.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="معلومات أخرى">
                {moreTags.map((t, i) => (
                  <TagChip key={`${t.label}-more-${i}`} tag={t} />
                ))}
              </ul>
            )}
            {about}
          </div>
        )}
        {collapsible && expanded && details}

        {collapsible && (
          <div className={cn(pad, "pb-3")}>
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={!!expanded}
              // The person's name in it: one such button per card on the page (QA PA-L2)
              aria-label={`${expanded ? "إخفاء التفاصيل" : "عرض جميع التفاصيل"}: ${name}`}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-label text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        {afterDetails}

        {actions && <div className={cn(pad, "pb-4 sm:pb-5")}>{actions}</div>}
      </CardContent>
    </Card>
  );
}
