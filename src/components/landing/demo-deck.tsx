"use client";

import { useState } from "react";
import Image from "next/image";
import { Lock, MapPin, GraduationCap, Moon, Heart, RotateCcw, EyeOff } from "lucide-react";
import type { StartGender } from "@/lib/landing-start";
import { cn } from "@/lib/utils";

interface DemoCard {
  name: string;
  job: string;
  city: string;
  edu: string;
  faith: string;
  score: number;
  quote: string;
}

/** Example people (not real members). Women for someone looking for a wife, men otherwise. */
const WOMEN: DemoCard[] = [
  { name: "سارة، 27", job: "صيدلانية", city: "عمّان", edu: "بكالوريوس", faith: "ملتزمة", score: 87, quote: "أحب العائلة والهدوء، وأبحث عن شريك يقدّر الاحترام والصدق." },
  { name: "ليان، 25", job: "معلّمة لغة عربية", city: "إربد", edu: "ماجستير", faith: "ملتزمة جداً", score: 91, quote: "بيتي أولويتي، وأحب القراءة والسفر مع العائلة." },
];
const MEN: DemoCard[] = [
  { name: "أحمد، 30", job: "مهندس مدني", city: "عمّان", edu: "بكالوريوس", faith: "ملتزم", score: 88, quote: "أبحث عن شريكة تشاركني بناء بيت هادئ قائم على المودة." },
  { name: "عمر، 29", job: "طبيب أسنان", city: "الزرقاء", edu: "دكتوراه", faith: "ملتزم جداً", score: 92, quote: "العائلة عندي أهم شيء، وأحب الرياضة والجلسات العائلية." },
];

type Phase = "deciding" | "declined" | "waiting" | "matched";

/**
 * Try the core idea in the hero: details without photos, «مهتم» or «لا», and the moment both say
 * «مهتم». The one orchestrated animation on the page; everything else stays still.
 */
export function DemoDeck({ lookingFor, onTry }: { lookingFor: StartGender | null; onTry: () => void }) {
  const cards = lookingFor === "FEMALE" ? MEN : WOMEN;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("deciding");
  // A new choice of who you're looking for starts the demo over (derived during render)
  const [deckFor, setDeckFor] = useState(lookingFor);
  if (deckFor !== lookingFor) {
    setDeckFor(lookingFor);
    setIndex(0);
    setPhase("deciding");
  }
  const card = cards[index % cards.length];
  const female = cards === WOMEN;

  function interested() {
    setPhase("waiting");
    window.setTimeout(() => setPhase("matched"), 1100);
  }
  function decline() {
    setPhase("declined");
    window.setTimeout(() => {
      setIndex((i) => i + 1);
      setPhase("deciding");
    }, 1300);
  }
  function restart() {
    setIndex(0);
    setPhase("deciding");
  }

  return (
    <div className="relative mx-auto w-full max-w-[25rem]">
      <p className="mb-3 text-center text-sm font-semibold text-white/70">جرّب بنفسك: هكذا يصلك الاقتراح</p>

      <div className="relative">
        {/* The next card peeking behind */}
        <div className="absolute inset-x-6 -bottom-3 top-6 rounded-[2rem] bg-white/10" aria-hidden />

        <div
          key={`${index}-${deckFor}`}
          aria-live="polite"
          className={cn(
            "demo-card relative overflow-hidden rounded-[2rem] bg-card p-5 text-card-foreground shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] sm:p-6",
            phase === "declined" && "demo-card-out"
          )}
        >
          {phase !== "matched" ? (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Lock className="h-5 w-5" aria-hidden />
                  <span className="mt-1 text-[10px] font-semibold">الصورة مخفية</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-foreground">{card.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{card.job}</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-extrabold text-primary">{card.score}%</p>
                  <p className="text-[11px] text-muted-foreground">توافق</p>
                </div>
              </div>

              <ul className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-foreground/80">
                <li className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
                  <MapPin className="h-3.5 w-3.5 text-primary/70" aria-hidden /> {card.city}
                </li>
                <li className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
                  <GraduationCap className="h-3.5 w-3.5 text-primary/70" aria-hidden /> {card.edu}
                </li>
                <li className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
                  <Moon className="h-3.5 w-3.5 text-primary/70" aria-hidden /> {card.faith}
                </li>
              </ul>

              <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm leading-relaxed text-foreground/75">«{card.quote}»</p>

              {phase === "deciding" && (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onTry();
                      interested();
                    }}
                    className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-primary text-base font-bold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    <Heart className="h-4 w-4" aria-hidden /> مهتم
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTry();
                      decline();
                    }}
                    className="h-12 rounded-xl border border-border text-base font-semibold text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    لا
                  </button>
                </div>
              )}
              {phase === "waiting" && (
                <p className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary/5 text-sm font-semibold text-primary">
                  <span className="demo-dots" aria-hidden />
                  {female ? "بانتظار قرارها…" : "بانتظار قراره…"}
                </p>
              )}
              {phase === "declined" && (
                <p className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-muted text-sm font-semibold text-muted-foreground">
                  <EyeOff className="h-4 w-4" aria-hidden /> لن يعرف أحد بقرار «لا»
                </p>
              )}
            </>
          ) : (
            <div className="demo-match text-center">
              <div className="relative -mx-5 -mt-5 mb-5 aspect-[16/9] overflow-hidden sm:-mx-6 sm:-mt-6">
                <Image src="/images/landing/match.webp" alt="" fill sizes="400px" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" aria-hidden />
              </div>
              <p className="text-2xl font-extrabold text-primary">توافق متبادل!</p>
              <p className="mx-auto mt-2 max-w-xs leading-relaxed text-muted-foreground">
                قال الطرفان «مهتم»، فتظهر الصور والتفاصيل الكاملة، ويبدأ التعارف الذي اخترتماه.
              </p>
              <div className="mt-5 grid gap-2">
                <a
                  href="#start"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-accent text-base font-extrabold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  سجّل لترى اقتراحاتك الحقيقية
                </a>
                <button
                  type="button"
                  onClick={restart}
                  className="inline-flex h-11 items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden /> أعد التجربة
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-white/60">مثال توضيحي. الأسماء ليست لأعضاء حقيقيين.</p>
    </div>
  );
}
