"use client";

import Link from "next/link";
import { Coins, Heart, Lock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreRing, scoreGradient, scoreLabel } from "@/components/shared/person-card";
import { cn } from "@/lib/utils";

/**
 * Credit on interest at 0 credits: a suggestion shown blurred until a recharge. The feed sends the
 * score only (no name or profile field), so the card is a placeholder silhouette with one CTA and
 * no "مهتم"/"لا". `likedYou`: the other side already said "مهتم" (owner exception).
 */
export function LockedSuggestionCard({
  score,
  likedYou,
  partnerGender,
}: {
  score: number;
  likedYou?: boolean;
  /** The other person's gender; the viewer is the opposite one (feminine imperatives for women) */
  partnerGender?: string;
}) {
  const partnerFemale = partnerGender !== "MALE";
  const s = Math.round(score);
  const message = likedYou
    ? partnerFemale
      ? "أبدت اهتمامها بك — اشحن رصيدك لترد"
      : "أبدى اهتمامه بك — اشحني رصيدك لتردّي"
    : partnerFemale
      ? "اشحن رصيدك لعرض الاقتراح والرد"
      : "اشحني رصيدك لعرض الاقتراح والرد";

  return (
    <Card
      className={cn(
        "gap-0 py-0 overflow-hidden border-border/50 border-s-4",
        likedYou ? "border-s-accent" : "border-s-primary/30"
      )}
    >
      {s > 0 && <div className={cn("h-1.5 bg-gradient-to-l", scoreGradient(s))} aria-hidden="true" />}
      <CardContent className="p-0">
        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-4">
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Placeholder silhouette: nothing about the person is on the page */}
            <div className="relative shrink-0" aria-hidden="true">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 border border-primary/15 flex items-center justify-center overflow-hidden">
                <UserRound className="h-10 w-10 text-primary/40 blur-[3px]" />
              </div>
              <span className="absolute -bottom-1 -start-1 h-6 w-6 rounded-full bg-card border border-border flex items-center justify-center shadow-sm">
                <Lock className="h-3 w-3 text-muted-foreground" />
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-2 pt-1">
              <p className="font-bold text-foreground text-lg">اقتراح جديد</p>
              <div className="space-y-1.5 blur-[3px] select-none" aria-hidden="true">
                <div className="h-3 w-32 max-w-full rounded-full bg-muted" />
                <div className="h-3 w-24 max-w-full rounded-full bg-muted/70" />
              </div>
            </div>
            {s > 0 && <ScoreRing score={s} />}
          </div>
          {s > 0 && <p className="mt-3 text-xs font-medium text-primary/80">{scoreLabel(s)}</p>}
        </div>

        <div className="px-5 md:px-6 pb-4 flex flex-wrap gap-2 blur-[3px] select-none" aria-hidden="true">
          {[20, 16, 24, 14].map((w) => (
            <span key={w} className="h-7 rounded-full bg-muted/60 border border-border/50" style={{ width: `${w * 4}px` }} />
          ))}
        </div>

        <div className="px-5 md:px-6 pb-5 md:pb-6 space-y-3">
          {likedYou && (
            <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm font-semibold text-foreground">
              <Heart className="h-4 w-4 mt-0.5 shrink-0 text-accent-foreground" aria-hidden="true" />
              <span>{message}</span>
            </p>
          )}
          <Button
            asChild
            className="w-full h-12 bg-gradient-to-l from-primary to-secondary text-primary-foreground shadow-md shadow-primary/20 rounded-xl font-bold text-base"
          >
            <Link href="/dashboard/payments">
              <Coins className="h-5 w-5 me-2" aria-hidden="true" />
              {likedYou ? (partnerFemale ? "اشحن رصيدك" : "اشحني رصيدك") : message}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
