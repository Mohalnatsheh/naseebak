"use client";

import { useEffect, useState } from "react";
import { EyeOff, ShieldCheck, MessageCircle, Users, BadgeCheck } from "lucide-react";
import type { LandingContent } from "./content";

const ICONS = [EyeOff, ShieldCheck, MessageCircle, Users, BadgeCheck];

interface Stats {
  users: number;
  matches: number;
  visits: number;
}

/** What we promise families, on the one dark band of the page; live numbers when there are any. */
export function LandingPrinciples({ content, chat }: { content: LandingContent; chat: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && typeof d.users === "number" && setStats(d))
      .catch(() => {});
  }, []);

  const icons = [ICONS[0], ICONS[1], chat ? ICONS[2] : ICONS[4]];
  const numbers = stats
    ? [
        { value: stats.users, label: "مستخدم مسجّل" },
        { value: stats.matches, label: "توافق متبادل" },
      ].filter((n) => n.value > 0)
    : [];

  return (
    <section id="features" className="scroll-mt-20 bg-primary py-24 text-primary-foreground sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">مبنية على الستر والاحترام</h2>
          <p className="mt-4 text-lg leading-relaxed text-primary-foreground/75">
            تقنية حديثة بخدمة قيمنا، لأن الزواج بالحلال يستحق طريقاً يليق به.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-10 sm:grid-cols-3 sm:gap-0">
          {content.principles.map((p, i) => {
            const Icon = icons[i];
            return (
              <div key={p.title} className={`text-center sm:px-8 ${i > 0 ? "sm:border-s sm:border-primary-foreground/15" : ""}`}>
                <Icon className="mx-auto h-8 w-8 text-accent" aria-hidden />
                <h3 className="mt-4 text-xl font-bold">{p.title}</h3>
                <p className="mt-3 leading-relaxed text-primary-foreground/75">{p.text}</p>
              </div>
            );
          })}
        </div>

        {numbers.length > 0 && (
          <div className="mx-auto mt-16 flex max-w-xl flex-wrap justify-center gap-x-14 gap-y-6 border-t border-primary-foreground/15 pt-10 text-center">
            {numbers.map((n) => (
              <div key={n.label}>
                <p className="text-4xl font-extrabold text-accent">{n.value.toLocaleString("ar-EG")}</p>
                <p className="mt-1 text-sm text-primary-foreground/75">{n.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
