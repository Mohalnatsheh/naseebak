import Link from "next/link";
import { ArrowLeft, Lock, MapPin, GraduationCap, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingContent } from "./content";

/** A quiet preview of what a suggestion looks like: details first, photos only after a mutual match. */
function SuggestionPreview() {
  return (
    <div
      role="img"
      aria-label="مثال على بطاقة اقتراح: التفاصيل ظاهرة ونسبة التوافق، والصور مخفية حتى التوافق المتبادل"
      className="landing-rise relative mx-auto w-full max-w-sm"
      style={{ animationDelay: "250ms" }}
    >
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/[0.06]" aria-hidden />
      <div className="rounded-[1.75rem] border border-border/70 bg-card p-5 shadow-[0_24px_60px_-28px_oklch(0.39_0.07_249/0.45)]">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
            <span className="mt-1 text-[10px] font-semibold">الصورة مخفية</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-foreground">سارة، ٢٧</p>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">صيدلانية</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-extrabold text-primary">٨٧٪</p>
            <p className="text-[11px] text-muted-foreground">توافق</p>
          </div>
        </div>

        <ul className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-foreground/80">
          <li className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
            <MapPin className="h-3.5 w-3.5 text-primary/70" /> عمّان
          </li>
          <li className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
            <GraduationCap className="h-3.5 w-3.5 text-primary/70" /> بكالوريوس
          </li>
          <li className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
            <Moon className="h-3.5 w-3.5 text-primary/70" /> ملتزمة
          </li>
        </ul>

        <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm leading-relaxed text-foreground/75">
          «أحب العائلة والهدوء، وأبحث عن شريك يقدّر الاحترام والصدق.»
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <span className="rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground">مهتم</span>
          <span className="rounded-xl border border-border py-2.5 text-center text-sm font-semibold text-muted-foreground">ليس الآن</span>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">لا يعرف الطرف الآخر قرارك إلا عند التوافق المتبادل</p>
    </div>
  );
}

export function LandingHero({ content, verseClass }: { content: LandingContent; verseClass: string }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32 lg:pb-28">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          background:
            "radial-gradient(60rem 30rem at 85% -10%, oklch(0.39 0.07 249 / 0.10), transparent 70%), radial-gradient(40rem 24rem at 0% 110%, oklch(0.69 0.10 74 / 0.10), transparent 70%)",
        }}
      />
      <div className="container mx-auto grid items-center gap-14 px-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-start">
          <p className={`landing-rise text-xl text-accent-foreground/80 sm:text-2xl ${verseClass}`}>
            ﴿ وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً ﴾
          </p>
          <h1
            className="landing-rise mt-5 text-[2.5rem] font-extrabold leading-[1.2] tracking-tight text-primary sm:text-6xl lg:text-[3.4rem] xl:text-[4.1rem]"
            style={{ animationDelay: "80ms" }}
          >
            نوصّلك بشريك العمر <br className="hidden sm:block" />
            بالحلال، وبرضا العائلتين
          </h1>
          <p
            className="landing-rise mx-auto mt-6 max-w-xl text-lg leading-loose text-muted-foreground lg:mx-0"
            style={{ animationDelay: "160ms" }}
          >
            {content.hero.lead}
          </p>
          <div
            className="landing-rise mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            style={{ animationDelay: "220ms" }}
          >
            <Button asChild size="lg" className="h-13 w-full px-9 text-base font-bold shadow-lg shadow-primary/20 sm:w-auto">
              <Link href="/register">
                أنشئ حسابك مجاناً
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-13 w-full px-6 text-base font-semibold text-primary sm:w-auto">
              <a href="#how-it-works">كيف تعمل المنصة</a>
            </Button>
          </div>
          <p className="landing-rise mt-4 text-sm text-muted-foreground" style={{ animationDelay: "260ms" }}>
            {content.hero.note}
          </p>
        </div>

        <SuggestionPreview />
      </div>
    </section>
  );
}
