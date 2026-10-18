"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { StartGender } from "@/lib/landing-start";
import type { LandingContent } from "./content";
import { StartForm } from "./start-form";
import { DemoDeck } from "./demo-deck";

/**
 * Navy night with a faint gold khatam pattern: the promise and the quick start on one side, a card
 * the visitor can try on the other. Picking «زوجة / زوج» also switches the example cards.
 */
export function LandingHero({
  content,
  verseClass,
  displayClass,
  lookingFor,
  onLookingFor,
}: {
  content: LandingContent;
  verseClass: string;
  displayClass: string;
  lookingFor: StartGender | null;
  onLookingFor: (g: StartGender) => void;
}) {
  const [tried, setTried] = useState(false);

  return (
    <section className="landing-night relative overflow-hidden pt-28 pb-20 text-white sm:pt-32 lg:pb-28">
      <div className="landing-khatam absolute inset-0" aria-hidden />
      <div className="container relative mx-auto grid items-center gap-14 px-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        <div className="text-center lg:text-start">
          <p className={`landing-rise text-xl text-accent sm:text-2xl ${verseClass}`}>﴿ وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً ﴾</p>
          <h1
            className={`landing-rise mt-5 text-[2.6rem] leading-[1.25] sm:text-6xl lg:text-[3.6rem] xl:text-[4.2rem] ${displayClass}`}
            style={{ animationDelay: "80ms" }}
          >
            نوصّلك بشريك العمر
            <br />
            بالحلال، وبرضا العائلتين
          </h1>
          <p className="landing-rise mx-auto mt-6 max-w-xl text-lg leading-loose text-white/75 lg:mx-0" style={{ animationDelay: "160ms" }}>
            {content.hero.lead}
          </p>

          <ul
            className="landing-rise mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold text-white/85 lg:mx-0 lg:justify-start"
            style={{ animationDelay: "200ms" }}
          >
            {content.hero.points.map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-accent" aria-hidden /> {p}
              </li>
            ))}
          </ul>

          <div className="landing-rise mx-auto mt-9 flex justify-center lg:mx-0 lg:justify-start" style={{ animationDelay: "240ms" }}>
            <StartForm id="start" place="hero" gender={lookingFor} onGender={onLookingFor} />
          </div>
          <p className="text-sm text-white/60">
            {tried ? "هكذا تماماً تصلك اقتراحاتك بعد التسجيل." : content.hero.note}
          </p>
        </div>

        <div className="landing-rise" style={{ animationDelay: "320ms" }}>
          <DemoDeck lookingFor={lookingFor} onTry={() => setTried(true)} />
        </div>
      </div>
    </section>
  );
}
