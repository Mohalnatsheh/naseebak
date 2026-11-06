"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { LandingContent } from "./content";
import { PhoneFrame } from "./phone-frame";

/**
 * «تعرّف على نصيبك من الداخل»: the real screens, one at a time. Tabs (keyboard: arrows/Home/End) pick the
 * stop; the phone shows the matching capture. No autoplay — the visitor reads at their own pace.
 */
export function LandingProductTour({ content }: { content: LandingContent }) {
  const steps = content.tour;
  const [active, setActive] = useState(0);
  const uid = useId();
  const step = steps[active];

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    // RTL: the next tab is to the left
    const next = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 }[e.key as string];
    let i = active;
    if (next) i = (active + next + steps.length) % steps.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = steps.length - 1;
    else return;
    e.preventDefault();
    setActive(i);
    document.getElementById(`${uid}-tab-${i}`)?.focus();
  }

  return (
    <section id="product" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold text-primary sm:text-4xl">تعرّف على نصيبك من الداخل</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">لقطات حقيقية من المنصة، بحسابات تجريبية.</p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div>
            <div
              role="tablist"
              aria-label="مراحل نصيبك"
              onKeyDown={onKey}
              className="flex flex-wrap justify-center gap-2 lg:flex-col lg:items-stretch lg:gap-3"
            >
              {steps.map((s, i) => {
                const on = i === active;
                return (
                  <button
                    key={s.key}
                    id={`${uid}-tab-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`${uid}-panel`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setActive(i)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:rounded-2xl lg:px-5 lg:py-4 lg:text-start",
                      on
                        ? "border-primary bg-primary text-primary-foreground lg:shadow-[0_18px_40px_-24px_oklch(0.39_0.07_249/0.7)]"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    )}
                  >
                    <span className="lg:hidden">{s.label}</span>
                    <span className="hidden lg:block">
                      <span className={cn("block text-xs font-semibold", on ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {i + 1} · {s.label}
                      </span>
                      <span className="mt-1 block text-lg">{s.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${active}`} className="mt-6 text-center lg:hidden">
              <h3 className="text-xl font-extrabold text-foreground">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-md leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
            <p className="mt-6 hidden max-w-md leading-loose text-muted-foreground lg:block" aria-live="polite">
              {step.text}
            </p>
          </div>

          <div className="mx-auto w-[16rem] sm:w-[18rem]">
            {/* All captures stay mounted (no layout shift); only the active one is shown */}
            <div className="relative">
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  className={cn("transition-opacity duration-300 motion-reduce:transition-none", i === active ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0")}
                  aria-hidden={i !== active}
                >
                  <PhoneFrame src={s.image} alt={s.alt} sizes="288px" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
