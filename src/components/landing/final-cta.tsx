"use client";

import Image from "next/image";
import type { StartGender } from "@/lib/landing-start";
import type { LandingContent } from "./content";
import { StartForm } from "./start-form";

/** The last call: Amman at sunset behind the same quick start as the hero. */
export function LandingFinalCta({
  content,
  displayClass,
  lookingFor,
  onLookingFor,
}: {
  content: LandingContent;
  displayClass: string;
  lookingFor: StartGender | null;
  onLookingFor: (g: StartGender) => void;
}) {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] px-6 py-16 text-white sm:px-14 sm:py-20">
          <Image src="/images/landing/cta.webp" alt="" fill sizes="(min-width: 1024px) 1024px, 100vw" className="object-cover" />
          <div className="landing-night absolute inset-0 opacity-90" aria-hidden />
          <div className="landing-khatam absolute inset-0" aria-hidden />
          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div className="text-center lg:text-start">
              <h2 className={`text-4xl leading-tight sm:text-5xl ${displayClass}`}>{content.cta.title}</h2>
              <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-white/80 lg:mx-0">{content.cta.text}</p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <StartForm id="start-final" place="final" gender={lookingFor} onGender={onLookingFor} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
