"use client";

import { useState } from "react";
import type { StartGender } from "@/lib/landing-start";
import type { LandingContent } from "./content";
import { LandingHero } from "./hero";
import { LandingSteps } from "./steps";
import { LandingProductTour } from "./product-tour";
import { LandingTrust } from "./trust";
import { LandingReasons } from "./reasons";
import { LandingFaq } from "./faq";
import { LandingFinalCta } from "./final-cta";
import { LandingArticles, type LandingArticle } from "./articles";
import { StickyStart } from "./sticky-start";

/** The page body; «أبحث عن زوجة / زوج» is shared by both quick-start forms. */
export function LandingBody({ content, articles = [] }: { content: LandingContent; articles?: LandingArticle[] }) {
  const [lookingFor, setLookingFor] = useState<StartGender | null>(null);
  return (
    <main id="main" tabIndex={-1} className="overflow-x-clip">
      <LandingHero content={content} lookingFor={lookingFor} onLookingFor={setLookingFor} />
      <LandingSteps content={content} />
      <LandingProductTour content={content} />
      <LandingTrust content={content} />
      <LandingReasons content={content} />
      <LandingFaq content={content} />
      <LandingArticles articles={articles} />
      <LandingFinalCta content={content} lookingFor={lookingFor} onLookingFor={setLookingFor} />
      <StickyStart />
    </main>
  );
}
