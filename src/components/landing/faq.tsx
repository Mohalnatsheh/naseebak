"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingContent } from "./content";

export function LandingFaq({ content }: { content: LandingContent }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq-preview" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container mx-auto grid max-w-5xl gap-10 px-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="text-center lg:text-start">
          <h2 className="text-3xl font-extrabold text-primary sm:text-4xl">أسئلة تهمّك</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">إجابات مختصرة عن أكثر ما يسأل عنه الأهل والمستخدمون.</p>
          <Link href="/faq" className="mt-5 inline-block font-semibold text-primary underline-offset-4 hover:underline">
            كل الأسئلة الشائعة
          </Link>
        </div>

        <div className="divide-y divide-border border-y border-border">
          {content.faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md"
                >
                  <span className="text-lg font-bold text-foreground">{f.q}</span>
                  <Plus className={cn("h-5 w-5 shrink-0 text-accent transition-transform duration-300", isOpen && "rotate-45")} />
                </button>
                <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden">
                    <p className="pb-5 leading-loose text-muted-foreground">{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
