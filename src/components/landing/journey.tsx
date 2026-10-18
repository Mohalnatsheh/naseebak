"use client";

import { Users, MessageCircle, Home } from "lucide-react";
import Image from "next/image";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import type { LandingContent } from "./content";

/** A photo for each step (by position): sign-up, profile, a sealed letter for the hidden photos, the rings */
const STEP_IMAGES = [
  "/images/landing/signup.webp",
  "/images/landing/profile.webp",
  "/images/landing/privacy.webp",
  "/images/landing/match.webp",
];

/**
 * The cycle as one gold thread: four steps side by side on wide screens (one under the other on
 * phones), then the two ways to get to know each other, ending at the family visit.
 */
export function LandingJourney({ content, displayClass }: { content: LandingContent; displayClass: string }) {
  const { ref, inView } = useInView(0.15);
  const { steps, paths, finish } = content;

  return (
    <section id="how-it-works" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className={`text-4xl text-primary sm:text-5xl ${displayClass}`}>كيف تعمل المنصة</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">من التسجيل إلى زيارة العائلة، وكل خطوة بموافقتك.</p>
        </div>

        <div ref={ref} className={cn("journey relative mx-auto mt-16 max-w-6xl", inView && "is-drawn")}>
          <ol className="relative grid gap-10 lg:grid-cols-4 lg:gap-6">
            {/* The thread: down the side on phones, across the numbers on wide screens */}
            <span className="journey-thread absolute inset-y-0 start-[1.3125rem] w-0.5 lg:hidden" aria-hidden />
            <span className="journey-thread-x absolute inset-x-[12.5%] top-[1.3125rem] hidden h-0.5 lg:block" aria-hidden />
            {steps.map((s, i) => (
              <li key={s.title} className="relative flex gap-5 lg:flex-col lg:items-center lg:gap-5 lg:text-center">
                <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-background text-lg font-extrabold text-primary">
                  {i + 1}
                </span>
                <div className="relative z-10 min-w-0 flex-1 pt-1.5 lg:flex lg:w-full lg:flex-col lg:pt-0">
                  <h3 className="text-xl font-bold text-foreground">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground lg:mb-4">{s.text}</p>
                  {STEP_IMAGES[i] && (
                    <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border/60 shadow-sm lg:mt-auto">
                      <Image src={STEP_IMAGES[i]} alt="" fill sizes="(min-width: 1024px) 270px, 85vw" className="object-cover" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* The two ways to get to know each other, then the family visit */}
          {paths && (
            <p className="mx-auto mt-16 w-fit rounded-full bg-accent/15 px-4 py-1.5 text-sm font-bold text-accent-foreground">
              {paths.title.replace(/^و/, "")}
            </p>
          )}
          <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
            {paths && (
              <>
                <PathCard icon={Users} title={paths.family.title} text={paths.family.text} />
                {paths.chat ? (
                  <PathCard icon={MessageCircle} title={paths.chat.title} text={paths.chat.text} />
                ) : (
                  <div className="hidden lg:block" />
                )}
              </>
            )}
            <div className={cn("relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground", !paths && "lg:col-start-2")}>
              <Image src="/images/landing/family.webp" alt="" fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover opacity-35" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" aria-hidden />
              <div className="relative flex h-full flex-col justify-end">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Home className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-xl font-bold">{finish.title}</h3>
                <p className="mt-2 leading-relaxed text-primary-foreground/80">{finish.text}</p>
              </div>
            </div>
          </div>
          {paths && (
            <p className="mt-5 text-center text-sm text-muted-foreground">{paths.cost}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function PathCard({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <h3 className="mt-4 text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
