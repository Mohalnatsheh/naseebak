"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { LandingContent } from "./content";

interface Stats {
  users: number;
  matches: number;
  visits: number;
}

/** Live numbers stay hidden until they are worth showing (a small count reads as an empty site). */
const MIN_PUBLIC_USERS = 100;
const MIN_PUBLIC_MATCHES = 20;

/**
 * «نصيبك ليس تطبيق تعارف»: the usual dating-app experience against ours, row by row, with the
 * live numbers once there are enough of them.
 */
export function LandingPrinciples({ content, displayClass }: { content: LandingContent; displayClass: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && typeof d.users === "number" && setStats(d))
      .catch(() => {});
  }, []);

  const numbers = stats
    ? [
        { value: stats.users, label: "عضو مسجّل", min: MIN_PUBLIC_USERS },
        { value: stats.matches, label: "توافق متبادل", min: MIN_PUBLIC_MATCHES },
      ].filter((n) => n.value >= n.min)
    : [];

  return (
    <section id="features" className="scroll-mt-20 bg-muted/40 py-24 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className={`text-4xl text-primary sm:text-5xl ${displayClass}`}>نصيبك ليس تطبيق تعارف</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">طريق جادّ للزواج، مبني على الستر واحترام العائلة.</p>
        </div>

        <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_30px_60px_-40px_oklch(0.39_0.07_249/0.5)]">
          <div className="grid grid-cols-[5.5rem_1fr_1fr] border-b border-border/70 text-sm font-bold sm:grid-cols-[8rem_1fr_1.2fr]">
            <span className="p-4" />
            <span className="p-4 text-muted-foreground">تطبيقات التعارف المعتادة</span>
            <span className="bg-primary p-4 text-primary-foreground">نصيبك</span>
          </div>
          <dl>
            {content.compare.map((row, i) => (
              <div
                key={row.topic}
                className={`grid grid-cols-[5.5rem_1fr_1fr] text-sm sm:grid-cols-[8rem_1fr_1.2fr] sm:text-base ${i > 0 ? "border-t border-border/60" : ""}`}
              >
                <dt className="p-4 font-bold text-foreground">{row.topic}</dt>
                <dd className="flex gap-2 p-4 text-muted-foreground">
                  <X className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  <span>{row.elsewhere}</span>
                </dd>
                <dd className="flex gap-2 bg-primary/[0.04] p-4 font-semibold text-foreground">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <span>{row.here}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {numbers.length > 0 && (
          <div className="mx-auto mt-14 flex max-w-xl flex-wrap justify-center gap-x-16 gap-y-6 text-center">
            {numbers.map((n) => (
              <div key={n.label}>
                <p className={`text-5xl text-primary ${displayClass}`}>{n.value.toLocaleString("ar-JO-u-nu-latn")}+</p>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">{n.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
