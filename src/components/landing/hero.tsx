"use client";

import { Check } from "lucide-react";
import type { StartGender } from "@/lib/landing-start";
import type { LandingContent } from "./content";
import { StartForm } from "./start-form";
import { PhoneFrame } from "./phone-frame";

/**
 * Navy hero: who we are, the promise and the real quick start on one side; the actual suggestion
 * screen (and, on wide screens, the «مهتم» choice behind it) on the other.
 */
export function LandingHero({
  content,
  lookingFor,
  onLookingFor,
}: {
  content: LandingContent;
  lookingFor: StartGender | null;
  onLookingFor: (g: StartGender) => void;
}) {
  const [front, back] = content.tour;

  return (
    <section className="landing-night relative overflow-hidden pt-24 pb-16 text-white sm:pt-32 lg:pb-24">
      <div className="landing-khatam absolute inset-0" aria-hidden />
      <div className="container relative mx-auto grid items-center gap-12 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
        <div className="text-center lg:text-start">
          {/* The eyebrow is part of the h1 (same look): the page's main heading then names what it is and where
              («منصة زواج بالحلال في الأردن»), which the slogan alone never told search engines */}
          <h1>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm font-bold text-accent">
              {content.hero.eyebrow}
            </span>
            <span className="sr-only"> — </span>
            <span className="mt-5 block text-[2.35rem] font-extrabold leading-[1.3] sm:text-6xl lg:text-[3.5rem] xl:text-[4rem]">
              {content.hero.title.split(" ").slice(0, 2).join(" ")}
              <br />
              <span className="text-accent">{content.hero.title.split(" ").slice(2).join(" ")}</span>
            </span>
          </h1>
          <p className="mx-auto mt-5 min-h-[6.75rem] max-w-xl text-lg leading-loose text-white/80 sm:min-h-0 lg:mx-0">
            {content.hero.lead}
          </p>

          <ul
            className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-x-5 gap-y-2 max-[374px]:min-h-[4.75rem] text-sm font-semibold text-white/90 lg:mx-0 lg:justify-start"
          >
            {content.hero.points.map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-accent" aria-hidden /> {p}
              </li>
            ))}
          </ul>

          <div className="mx-auto mt-8 flex justify-center lg:mx-0 lg:justify-start">
            <StartForm id="start" place="hero" country={content.country} gender={lookingFor} onGender={onLookingFor} />
          </div>
        </div>

        <div className="landing-rise relative mx-auto w-full max-w-[19rem] sm:max-w-[21rem] lg:max-w-none" style={{ animationDelay: "260ms" }}>
          <div className="relative mx-auto w-[16.5rem] sm:w-[18.5rem] lg:w-[20rem]">
            {back && (
              <PhoneFrame
                src={back.image}
                alt=""
                sizes="320px"
                className="absolute top-8 -end-32 hidden w-[88%] rotate-6 opacity-90 xl:block"
              />
            )}
            <PhoneFrame src={front.image} alt={front.alt} priority sizes="(min-width: 1024px) 320px, 300px" className="relative" />
          </div>
          <p className="mt-4 text-center text-xs text-white/55 xl:mt-8">لقطة حقيقية من نصيبك بحسابات تجريبية</p>
        </div>
      </div>
    </section>
  );
}
