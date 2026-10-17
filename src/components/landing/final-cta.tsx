import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingContent } from "./content";

export function LandingFinalCta({ content }: { content: LandingContent }) {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-accent/30 px-6 py-16 text-center sm:px-12 sm:py-20">
          {/* Amman at sunset behind the last call to action */}
          <Image src="/images/landing/cta.webp" alt="" fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/55 to-primary/15" aria-hidden />
          <h2 className="relative text-3xl font-extrabold text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.35)] sm:text-4xl">{content.cta.title}</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-lg leading-relaxed text-white/90 [text-shadow:0_1px_8px_rgb(0_0_0/0.4)]">{content.cta.text}</p>
          <Button asChild size="lg" className="relative mt-8 h-13 bg-accent px-10 text-base font-bold text-accent-foreground shadow-lg shadow-black/20 hover:bg-accent/90">
            <Link href="/register">
              أنشئ حسابك مجاناً
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
