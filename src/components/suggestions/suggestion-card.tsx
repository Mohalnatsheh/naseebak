"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { ProBadge } from "@/components/shared/pro-badge";
import type { CountryCode } from "@/lib/countries";
import { cardFacts } from "@/lib/suggestions/card-facts";
import type { FeedItem } from "@/lib/suggestions/feed-types";

/**
 * The short suggestion card (home/suggestions redesign): locked avatar, name and age, city and activity, the score,
 * eight facts and two lines about the person. The body opens the full profile (`onOpen`); `actions` (the answers)
 * sit outside that clickable region, so a tap there never opens it. No photo: the avatar stays locked until a match.
 */
export function SuggestionCard({
  item,
  partnerGender,
  country,
  status,
  onOpen,
  actions,
}: {
  item: FeedItem;
  partnerGender: "MALE" | "FEMALE";
  country: CountryCode;
  status?: ReactNode;
  onOpen: () => void;
  actions: ReactNode;
}) {
  const c = item.candidate;
  const facts = cardFacts(c, partnerGender, country);
  const title = c.age ? `${c.firstName}، ${c.age}` : c.firstName;
  const place = c.city;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div
        role="button"
        tabIndex={0}
        aria-label={`الملف كاملاً: ${c.firstName}`}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className="cursor-pointer space-y-3 p-4 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3">
          <MemberAvatar name={c.firstName} size={56} locked />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-title text-foreground">{title}</h3>
              {item.isPro && <ProBadge />}
            </div>
            <p className="flex flex-wrap items-center gap-x-2 text-label text-muted-foreground">
              {place && <span>{place}</span>}
              {item.activity && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
                  {item.activity}
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-caption font-bold text-accent-ink">
            توافق {Math.round(item.compatibilityScore)}%
          </span>
        </div>

        {status}

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {facts.map((f) => (
              <div key={f.key} className="rounded-xl bg-muted px-3 py-2">
                <dt className="text-caption text-muted-foreground">{f.label}</dt>
                <dd className="text-label font-medium text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {c.aboutMe && (
          <div>
            <h4 className="text-label font-bold text-foreground">{partnerGender === "FEMALE" ? "عنها" : "عنه"}</h4>
            <p className="line-clamp-2 text-body text-ink">{c.aboutMe}</p>
          </div>
        )}

        <div className="flex items-center justify-between text-label font-bold text-primary">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="inline-flex min-h-11 items-center gap-1"
          >
            الملف كاملاً
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="border-t border-border/60 p-4">{actions}</div>
    </article>
  );
}
