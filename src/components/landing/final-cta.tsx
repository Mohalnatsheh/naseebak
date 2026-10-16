import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingContent } from "./content";

export function LandingFinalCta({ content }: { content: LandingContent }) {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-accent/30 bg-accent/[0.08] px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-extrabold text-primary sm:text-4xl">{content.cta.title}</h2>
          <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">{content.cta.text}</p>
          <Button asChild size="lg" className="mt-8 h-13 px-10 text-base font-bold shadow-lg shadow-primary/20">
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
