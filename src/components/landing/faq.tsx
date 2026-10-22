"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingContent } from "./content";

export function LandingFaq({ content }: { content: LandingContent }) {
  const [open, setOpen] = useState<number | null>(0);
  const uid = useId();
  return (
    <section id="faq-preview" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
      <div className="container mx-auto grid max-w-5xl gap-10 px-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="text-center lg:text-start">
          <h2 className="text-3xl font-extrabold text-primary sm:text-4xl">أسئلة تهمّك</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">إجابات مختصرة عن أكثر ما يسأل عنه الأهل والمستخدمون.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 lg:justify-start">
            <Link href="/faq" className="font-semibold text-primary underline-offset-4 hover:underline">
              كل الأسئلة الشائعة
            </Link>
            <Link href="/contact" className="font-semibold text-primary underline-offset-4 hover:underline">
              تواصل معنا
            </Link>
          </div>
        </div>

        <div className="divide-y divide-border border-y border-border">
          {content.faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <h3>
                  <button
                    type="button"
                    id={`${uid}-q-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`${uid}-a-${i}`}
                    className="flex w-full items-center justify-between gap-4 rounded-md py-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="text-lg font-bold text-foreground">{f.q}</span>
                    <Plus className={cn("h-5 w-5 shrink-0 text-accent transition-transform duration-300 motion-reduce:transition-none", isOpen && "rotate-45")} aria-hidden />
                  </button>
                </h3>
                <div
                  id={`${uid}-a-${i}`}
                  role="region"
                  aria-labelledby={`${uid}-q-${i}`}
                  className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
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
