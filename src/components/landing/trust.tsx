import Link from "@/components/shared/site-link";
import { EyeOff, Flag, MessageSquareLock, ShieldCheck } from "lucide-react";
import type { LandingContent } from "./content";

const SAFETY_ICONS = [ShieldCheck, Flag, MessageSquareLock];

/** Who sees what and when, plus the protections that exist — straight from the product rules. */
export function LandingTrust({ content }: { content: LandingContent }) {
  return (
    <section id="privacy" className="scroll-mt-20 py-20 sm:py-28">
      <div className="container mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-bold text-accent-foreground">
            <EyeOff className="h-4 w-4 text-accent" aria-hidden /> الخصوصية
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary sm:text-4xl">من يرى ماذا… ومتى؟</h2>
          <p className="mt-3 max-w-lg leading-relaxed text-muted-foreground">
            للتسجيل نطلب اسمك وجنسك ورقم {content.country === "SA" ? "جوالك السعودي" : "هاتفك الأردني"} فقط، ولا يظهر للآخرين منها إلا اسمك الأول.
          </p>

          <ol className="relative mt-8 space-y-5 border-s-2 border-accent/40 ps-6">
            {content.visibility.map((v) => (
              <li key={v.when} className="relative">
                <span className="absolute -start-[1.95rem] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-accent" aria-hidden />
                <p className="text-sm font-bold text-accent-foreground">{v.when}</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{v.what}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4 self-center">
          {content.safety.map((s, i) => {
            const Icon = SAFETY_ICONS[i] ?? ShieldCheck;
            return (
              <div key={s.title} className="flex gap-4 rounded-3xl border border-border/70 bg-card p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-foreground">{s.title}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-sm text-muted-foreground">
            التفاصيل في{" "}
            <Link href="/privacy" className="font-semibold text-primary underline-offset-4 hover:underline">
              سياسة الخصوصية
            </Link>{" "}
            و
            <Link href="/terms" className="font-semibold text-primary underline-offset-4 hover:underline">
              الشروط والأحكام
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
