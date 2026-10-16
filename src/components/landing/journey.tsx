"use client";

import { Users, MessageCircle, Home } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import type { LandingContent } from "./content";

const NUMERALS = ["1", "2", "3", "4", "5", "6"];

/**
 * The cycle as one gold thread: steps in sequence, a fork into the two ways to get
 * to know each other, and a join at the family visit. The thread draws once on scroll.
 */
export function LandingJourney({ content }: { content: LandingContent }) {
  const { ref, inView } = useInView(0.15);
  const { steps, paths, finish } = content;
  const twoPaths = !!paths?.chat;

  return (
    <section id="how-it-works" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-extrabold text-primary sm:text-4xl">كيف تعمل المنصة</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            من التسجيل إلى زيارة العائلة، وكل خطوة بموافقتك.
          </p>
        </div>

        <div ref={ref} className={cn("journey relative mx-auto mt-16 max-w-3xl", inView && "is-drawn")}>
          {/* Steps on one thread */}
          <ol className="relative">
            <span className="journey-thread absolute inset-y-0 start-[1.3125rem] w-0.5 sm:inset-x-0 sm:mx-auto" aria-hidden />
            {steps.map((s, i) => (
              <li key={s.title} className="relative flex gap-5 pb-12 sm:flex-col sm:items-center sm:gap-4 sm:text-center">
                <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-background text-lg font-extrabold text-primary">
                  {NUMERALS[i]}
                </span>
                <div className="relative z-10 pt-1.5 sm:max-w-md sm:bg-background sm:px-4 sm:pt-0">
                  <h3 className="text-xl font-bold text-foreground">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* The two ways to get to know each other */}
          {paths && (
            <div className="relative">
              <p className="relative z-10 mx-auto mb-6 w-fit rounded-full bg-accent/15 px-4 py-1.5 text-sm font-bold text-accent-foreground">
                {paths.title}
              </p>
              {twoPaths && (
                <svg className="journey-fork hidden h-14 w-full sm:block" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden>
                  <path pathLength={1} d="M200 0 C200 30, 100 26, 100 56" />
                  <path pathLength={1} d="M200 0 C200 30, 300 26, 300 56" />
                </svg>
              )}
              <div className={cn("grid gap-4", twoPaths ? "sm:grid-cols-2" : "mx-auto max-w-md")}>
                <PathCard icon={Users} title={paths.family.title} text={paths.family.text} />
                {paths.chat && <PathCard icon={MessageCircle} title={paths.chat.title} text={paths.chat.text} />}
              </div>
              {twoPaths && (
                <svg className="journey-fork hidden h-14 w-full sm:block" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden>
                  <path pathLength={1} d="M100 0 C100 30, 200 26, 200 56" />
                  <path pathLength={1} d="M300 0 C300 30, 200 26, 200 56" />
                </svg>
              )}
              <p className="mt-5 text-center text-sm text-muted-foreground sm:mt-2">{paths.cost}</p>
            </div>
          )}

          {/* Where it leads */}
          <div className={cn("flex gap-5 sm:flex-col sm:items-center sm:text-center", twoPaths ? "mt-6 sm:mt-0" : "mt-8")}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md shadow-accent/30">
              <Home className="h-5 w-5" />
            </span>
            <div className="pt-1.5 sm:max-w-md sm:pt-0">
              <h3 className="text-xl font-bold text-foreground">{finish.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{finish.text}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PathCard({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <div className="relative z-10 rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </span>
        <h4 className="text-lg font-bold text-foreground">{title}</h4>
      </div>
      <p className="mt-3 leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
