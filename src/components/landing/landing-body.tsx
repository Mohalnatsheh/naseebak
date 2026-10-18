"use client";

import { useState } from "react";
import type { StartGender } from "@/lib/landing-start";
import type { LandingContent } from "./content";
import { LandingHero } from "./hero";
import { LandingJourney } from "./journey";
import { LandingPrinciples } from "./principles";
import { LandingFaq } from "./faq";
import { LandingFinalCta } from "./final-cta";
import { StickyStart } from "./sticky-start";

/** The page body; «أبحث عن زوجة / زوج» is shared by both quick-start forms and the example cards. */
export function LandingBody({ content, verseClass, displayClass }: { content: LandingContent; verseClass: string; displayClass: string }) {
  const [lookingFor, setLookingFor] = useState<StartGender | null>(null);
  return (
    <main className="overflow-x-clip">
      <LandingHero content={content} verseClass={verseClass} displayClass={displayClass} lookingFor={lookingFor} onLookingFor={setLookingFor} />
      <LandingJourney content={content} displayClass={displayClass} />
      <LandingPrinciples content={content} displayClass={displayClass} />
      <LandingFaq content={content} />
      <LandingFinalCta content={content} displayClass={displayClass} lookingFor={lookingFor} onLookingFor={setLookingFor} />
      <StickyStart />
    </main>
  );
}
