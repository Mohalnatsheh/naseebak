"use client";

import { useEffect, useState } from "react";
import { HeartHandshake, Lock, Sparkles, Users } from "lucide-react";
import type { LandingContent } from "./content";

interface Stats {
  users: number;
  matches: number;
}

/** Live numbers stay hidden until they are worth showing (a small count reads as an empty site). */
const MIN_PUBLIC_USERS = 100;
const MIN_PUBLIC_MATCHES = 20;

const ICONS = [HeartHandshake, Sparkles, Lock, Users];

/** Why Naseebak: four claims the product backs, plus the live numbers once there are enough of them. */
export function LandingReasons({ content }: { content: LandingContent }) {
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
    <section id="features" className="landing-night relative scroll-mt-20 overflow-hidden py-20 text-white sm:py-28">
      <div className="landing-khatam absolute inset-0" aria-hidden />
      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">لماذا نصيبك؟</h2>
          <p className="mt-3 text-lg leading-relaxed text-white/75">طريق جادّ للزواج، مبني على الستر واحترام العائلة.</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.reasons.map((r, i) => {
            const Icon = ICONS[i] ?? Sparkles;
            return (
              <div key={r.title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 text-xl font-extrabold">{r.title}</h3>
                <p className="mt-2 leading-relaxed text-white/75">{r.text}</p>
              </div>
            );
          })}
        </div>

        {numbers.length > 0 && (
          <div className="mx-auto mt-14 flex max-w-xl flex-wrap justify-center gap-x-16 gap-y-6 text-center">
            {numbers.map((n) => (
              <div key={n.label}>
                <p className="text-5xl font-extrabold text-accent">{n.value.toLocaleString("ar-JO-u-nu-latn")}+</p>
                <p className="mt-2 text-sm font-semibold text-white/75">{n.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
