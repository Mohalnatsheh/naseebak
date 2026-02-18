"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Shield,
  MessageCircleOff,
  ScanFace,
  Users,
  HeartHandshake,
  ChevronLeft,
  Sparkles,
  ArrowLeft,
  Quote,
  ShieldCheck,
  MapPin,
  Headphones,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";

/* ──────────────────── DATA ──────────────────── */

const features = [
  {
    icon: Brain,
    title: "ذكاء اصطناعي",
    description:
      "خوارزميات متقدمة تحلل التوافق بناءً على الشخصية والقيم والمعايير الأساسية لتقديم اقتراحات دقيقة.",
    accent: "from-primary to-blue-500",
  },
  {
    icon: Shield,
    title: "خصوصية تامة",
    description:
      "صورك مخفية حتى يتم التوافق المتبادل. بياناتك مشفرة ومحمية بأعلى معايير الأمان.",
    accent: "from-secondary to-blue-400",
  },
  {
    icon: MessageCircleOff,
    title: "بدون تواصل مباشر",
    description:
      "لا رسائل ولا محادثات. المنصة تعتمد على التوافق المدروس والزيارات العائلية المنظمة.",
    accent: "from-accent to-amber-500",
  },
  {
    icon: ScanFace,
    title: "تحقق من الهوية",
    description:
      "كل مستخدم يمر بعملية توثيق هوية حكومية لضمان جدية وصدق جميع المسجلين.",
    accent: "from-primary to-indigo-500",
  },
  {
    icon: Users,
    title: "زيارات عائلية",
    description:
      "بعد التوافق المتبادل، ينسق فريقنا زيارات عائلية تقليدية محترمة بين الأسرتين.",
    accent: "from-secondary to-blue-400",
  },
  {
    icon: HeartHandshake,
    title: "اختبار شخصية",
    description:
      "اختبار شخصية علمي يساعد في تحديد التوافق النفسي والاجتماعي بين المرشحين.",
    accent: "from-accent to-orange-500",
  },
];

const steps = [
  {
    number: "١",
    title: "إنشاء حساب وتوثيق الهوية",
    description:
      "سجّل حسابك وأرفق صورة هويتك الحكومية ليتم التحقق منها من قبل فريقنا.",
  },
  {
    number: "٢",
    title: "إكمال الملف الشخصي واختبار الشخصية",
    description:
      "أكمل بياناتك الشخصية وأجب على اختبار الشخصية لتحسين دقة التوافق.",
  },
  {
    number: "٣",
    title: "استلام اقتراحات التوافق",
    description:
      "تحصل الفتاة على اقتراحات مرشحين مع نسبة التوافق، وتقبل أو ترفض كل اقتراح.",
  },
  {
    number: "٤",
    title: "التوافق المتبادل وزيارة العائلات",
    description:
      "عند القبول المتبادل، تُكشف الصور ويُنسّق فريقنا زيارة عائلية رسمية.",
  },
];

const heroStats = [
  { target: 2500, label: "عائلة مسجلة", suffix: "+" },
  { target: 480, label: "زواج ناجح", suffix: "+" },
  { target: 93, label: "دقة التوافق", suffix: "٪" },
];

const testimonials = [
  { quote: "الحمد لله، وجدنا من خلال منصة نصيب شريكًا مناسبًا لابنتنا. العملية كانت محترمة وتحفظ كرامة الجميع.", name: "أم محمد", city: "عمّان" },
  { quote: "ما أعجبني في المنصة أنها تعتمد على التوافق الحقيقي وليس المظاهر. الزيارة العائلية كانت خطوة رائعة.", name: "أبو أحمد", city: "إربد" },
  { quote: "تجربة مختلفة تمامًا عن أي تطبيق آخر. الخصوصية والاحترام في كل خطوة. بارك الله في القائمين عليها.", name: "أم سارة", city: "الزرقاء" },
];

const faqs = [
  { q: "هل المنصة مجانية؟", a: "نعم، يمكنك التسجيل مجانًا والحصول على ٥ اقتراحات. للمزيد من الاقتراحات، يمكنك الاشتراك في إحدى الباقات المدفوعة." },
  { q: "كيف تحافظون على خصوصيتي؟", a: "صورك تبقى مخفية حتى يتم التوافق المتبادل. جميع البيانات مشفرة بمعيار AES-256 ولا نشارك معلوماتك مع أي طرف ثالث." },
  { q: "هل يوجد تواصل مباشر بين المستخدمين؟", a: "لا، لا يوجد أي شكل من أشكال التواصل المباشر. المنصة تعتمد على نظام الاقتراحات والزيارات العائلية المنظمة." },
  { q: "كيف تتم الزيارة العائلية؟", a: "بعد التوافق المتبادل، يتواصل فريقنا مع ولي أمر كل طرف لتنسيق زيارة عائلية تقليدية محترمة." },
  { q: "هل التحقق من الهوية إلزامي؟", a: "نعم، يجب على كل مستخدم رفع صورة هوية حكومية سارية والانتظار حتى يتم التحقق منها من قبل فريقنا قبل استخدام المنصة." },
];

/* ──────────────── COUNTER HOOK ──────────────── */

function useCountUp(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [start, target, duration]);

  return count;
}

/* ─────────── INTERSECTION OBSERVER HOOK ─────────── */

function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}

/* ────────── ANIMATED STAT COMPONENT ────────── */

function AnimatedStat({
  target,
  label,
  suffix,
  start,
}: {
  target: number;
  label: string;
  suffix: string;
  start: boolean;
}) {
  const count = useCountUp(target, 2200, start);
  return (
    <div className="text-center">
      <p className="text-5xl font-bold text-primary sm:text-6xl lg:text-7xl drop-shadow-sm">
        {count.toLocaleString("ar-EG")}
        <span className="text-accent">{suffix}</span>
      </p>
      <p className="mt-3 text-lg font-semibold">{label}</p>
    </div>
  );
}

/* ──────────────── ISLAMIC PATTERN SVG ──────────────── */

function IslamicPatternBg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Eight-pointed star pattern */}
      <defs>
        <pattern
          id="islamicPattern"
          x="0"
          y="0"
          width="50"
          height="50"
          patternUnits="userSpaceOnUse"
        >
          {/* Octagonal star */}
          <polygon
            points="25,2 31,10 40,10 35,18 38,27 30,25 25,32 20,25 12,27 15,18 10,10 19,10"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.15"
          />
          {/* Inner diamond */}
          <polygon
            points="25,12 30,20 25,28 20,20"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            opacity="0.1"
          />
          {/* Connecting lines */}
          <line x1="0" y1="25" x2="10" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
          <line x1="40" y1="25" x2="50" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
          <line x1="25" y1="0" x2="25" y2="2" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
          <line x1="25" y1="32" x2="25" y2="50" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill="url(#islamicPattern)" />
    </svg>
  );
}

/* ──────────────── FLOATING PARTICLES ──────────────── */

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Particle dots with CSS animation */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-primary/[0.07]"
          style={{
            width: `${3 + (i % 4) * 2}px`,
            height: `${3 + (i % 4) * 2}px`,
            left: `${(i * 17 + 5) % 100}%`,
            top: `${(i * 23 + 10) % 100}%`,
            animation: `float-particle ${6 + (i % 5) * 2}s ease-in-out ${i * 0.4}s infinite alternate`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes float-particle {
          0% {
            transform: translateY(0px) translateX(0px) scale(1);
            opacity: 0.3;
          }
          50% {
            opacity: 0.7;
          }
          100% {
            transform: translateY(-30px) translateX(15px) scale(1.3);
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*                     MAIN PAGE                         */
/* ══════════════════════════════════════════════════════ */

export default function HomePage() {
  const heroStatsView = useInView(0.3);
  const featuresView = useInView(0.15);
  const stepsView = useInView(0.15);
  const statsView = useInView(0.3);
  const testimonialsView = useInView(0.15);
  const trustView = useInView(0.15);
  const faqView = useInView(0.15);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative min-h-[100dvh] flex items-center justify-center pt-20">
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/[0.08] via-background to-secondary/[0.06]" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 0%, oklch(0.35 0.08 250 / 0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.45 0.06 250 / 0.06), transparent)",
            }}
          />

          {/* Floating particles */}
          <FloatingParticles />

          {/* Decorative blurred orbs */}
          <div className="absolute top-32 start-10 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
          <div className="absolute bottom-20 end-10 h-96 w-96 rounded-full bg-secondary/[0.08] blur-3xl animate-pulse" style={{ animationDuration: "10s" }} />
          <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/[0.04] blur-3xl animate-pulse" style={{ animationDuration: "12s" }} />

          {/* Islamic geometric pattern overlays */}
          <div className="absolute top-20 end-0 w-80 h-80 text-primary opacity-[0.03] rotate-12">
            <IslamicPatternBg className="w-full h-full" />
          </div>
          <div className="absolute bottom-10 start-0 w-64 h-64 text-secondary opacity-[0.03] -rotate-6">
            <IslamicPatternBg className="w-full h-full" />
          </div>
          <div className="absolute top-1/3 start-10 w-48 h-48 text-accent opacity-[0.02] rotate-45">
            <IslamicPatternBg className="w-full h-full" />
          </div>

          {/* Dot grid patterns */}
          <div className="absolute top-40 end-20 opacity-[0.04]">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <pattern id="dotgrid1" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1.5" fill="currentColor" />
              </pattern>
              <rect width="160" height="160" fill="url(#dotgrid1)" />
            </svg>
          </div>
          <div className="absolute bottom-40 start-20 opacity-[0.04]">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <pattern id="dotgrid2" width="16" height="16" patternUnits="userSpaceOnUse">
                <circle cx="8" cy="8" r="1" fill="currentColor" />
              </pattern>
              <rect width="120" height="120" fill="url(#dotgrid2)" />
            </svg>
          </div>

          <div className="container relative mx-auto px-4 py-20 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-5 py-2 text-sm font-medium text-primary mb-8 shadow-sm"
              style={{ animation: "fadeSlideDown 0.8s ease-out both" }}
            >
              <Sparkles className="size-4 animate-pulse" />
              منصة زواج تقليدية بتقنيات حديثة
            </div>

            {/* Headline */}
            <h1
              className="mx-auto max-w-5xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              <span className="bg-gradient-to-l from-primary via-primary/90 to-primary bg-clip-text text-transparent drop-shadow-sm">
                نصيب
              </span>
              <span className="mx-3 text-muted-foreground/40">—</span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                طريقك نحو زواج مبارك
              </span>
            </h1>

            {/* Description */}
            <p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              منصة أردنية متخصصة في تيسير الزواج التقليدي بكرامة واحترام.
              نجمع بين الذكاء الاصطناعي والقيم الأصيلة لمساعدة العائلات
              في إيجاد الشريك المناسب.
            </p>

            {/* CTAs with glassmorphism */}
            <div
              className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.6s both" }}
            >
              <Button
                size="lg"
                asChild
                className="group relative h-14 px-10 text-base font-semibold shadow-xl shadow-primary/25 bg-gradient-to-l from-primary to-primary/90 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-500 hover:scale-[1.02] overflow-hidden"
              >
                <Link href="/register">
                  <span className="relative z-10 flex items-center gap-2">
                    إنشاء حساب
                    <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                  </span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="group h-14 px-10 text-base font-medium border-primary/20 bg-white/50 backdrop-blur-md hover:bg-white/80 hover:border-primary/40 transition-all duration-500 hover:scale-[1.02] hover:shadow-lg"
              >
                <a href="#features">
                  <span className="flex items-center gap-2">
                    تعرّف على المنصة
                    <ChevronLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                  </span>
                </a>
              </Button>
            </div>

            {/* Hero Stats */}
            <div
              ref={heroStatsView.ref}
              className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-12"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.8s both" }}
            >
              {heroStats.map((stat) => (
                <AnimatedStat
                  key={stat.label}
                  target={stat.target}
                  label={stat.label}
                  suffix={stat.suffix}
                  start={heroStatsView.inView}
                />
              ))}
            </div>

            {/* Trust indicators */}
            <div
              className="mt-16 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
              style={{ animation: "fadeSlideUp 0.8s ease-out 1s both" }}
            >
              <span className="flex items-center gap-2 rounded-full bg-secondary/[0.06] backdrop-blur-sm px-4 py-2 border border-secondary/10">
                <Shield className="size-4 text-secondary" />
                تشفير كامل للبيانات
              </span>
              <span className="flex items-center gap-2 rounded-full bg-primary/[0.06] backdrop-blur-sm px-4 py-2 border border-primary/10">
                <ScanFace className="size-4 text-primary" />
                توثيق هوية إلزامي
              </span>
              <span className="flex items-center gap-2 rounded-full bg-accent/[0.06] backdrop-blur-sm px-4 py-2 border border-accent/10">
                <MessageCircleOff className="size-4 text-accent-foreground" />
                بدون رسائل أو محادثات
              </span>
            </div>
          </div>
        </section>

        {/* ═══════════════ FEATURES SECTION ═══════════════ */}
        <section id="features" className="relative py-28 sm:py-36">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-muted/20 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container relative mx-auto px-4" ref={featuresView.ref}>
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-primary/20 bg-primary/[0.04]"
              >
                <Sparkles className="size-3 ml-1 text-primary" />
                المميزات
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                لماذا{" "}
                <span className="bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
                  نصيب
                </span>
                ؟
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                نقدم تجربة فريدة تجمع بين التقنية الحديثة والقيم التقليدية
                الأردنية الأصيلة.
              </p>
              {/* Accent line */}
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-primary via-secondary to-accent" />
            </div>

            <div className="mx-auto mt-20 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <Card
                  key={feature.title}
                  className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-500 hover:border-transparent hover:shadow-2xl hover:shadow-primary/[0.08] hover:-translate-y-2 ${
                    featuresView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: featuresView.inView ? `${i * 100}ms` : "0ms",
                    transitionProperty: "all",
                  }}
                >
                  {/* Gradient border effect on hover */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-bl from-primary/20 via-secondary/10 to-accent/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="absolute inset-[1px] rounded-[11px] bg-card transition-colors duration-500" />

                  {/* Accent line at top */}
                  <div className={`absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l ${feature.accent} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

                  <CardHeader className="relative">
                    <div className={`mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-bl ${feature.accent} bg-opacity-10 text-primary transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg`}
                      style={{ background: `linear-gradient(to bottom left, oklch(0.35 0.08 250 / 0.08), oklch(0.45 0.06 250 / 0.08))` }}
                    >
                      <feature.icon className="size-7 transition-transform duration-500 group-hover:scale-110" />
                    </div>
                    <CardTitle className="relative text-lg font-bold">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="relative -mt-2">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ HOW IT WORKS SECTION ═══════════════ */}
        <section id="how-it-works" className="relative py-28 sm:py-36 overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.015]">
            <IslamicPatternBg className="w-full h-full" />
          </div>

          <div className="container mx-auto px-4" ref={stepsView.ref}>
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-secondary/20 bg-secondary/[0.04]"
              >
                كيف تعمل المنصة
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                أربع خطوات نحو{" "}
                <span className="bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">
                  النصيب
                </span>
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                عملية بسيطة ومنظمة تحافظ على الخصوصية والاحترام في كل مرحلة.
              </p>
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-accent via-primary to-secondary" />
            </div>

            {/* Timeline steps */}
            <div className="relative mx-auto mt-20 max-w-3xl">
              {/* Vertical connecting line */}
              <div className="absolute start-8 top-0 bottom-0 w-[2px] bg-gradient-to-b from-primary/30 via-secondary/30 to-accent/30 hidden md:block" />

              <div className="space-y-8 md:space-y-12">
                {steps.map((step, index) => (
                  <div
                    key={step.number}
                    className={`group relative flex flex-col md:flex-row gap-6 items-start transition-all duration-700 ${
                      stepsView.inView
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 translate-x-8"
                    }`}
                    style={{
                      transitionDelay: stepsView.inView ? `${index * 150}ms` : "0ms",
                    }}
                  >
                    {/* Step number circle */}
                    <div className="relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-bl from-primary to-primary/80 text-2xl font-bold text-primary-foreground shadow-xl shadow-primary/20 ring-4 ring-background transition-all duration-500 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-primary/30">
                      {step.number}
                      {/* Pulse ring */}
                      <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-0 group-hover:opacity-30" style={{ animationDuration: "2s" }} />
                    </div>

                    {/* Step content card */}
                    <Card className="flex-1 border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-500 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/[0.04] overflow-hidden">
                      {/* Subtle pattern background */}
                      <div
                        className="absolute inset-0 opacity-[0.02]"
                        style={{
                          backgroundImage: `radial-gradient(circle at 20% 50%, oklch(0.35 0.08 250 / 0.3), transparent 50%)`,
                        }}
                      />
                      <CardContent className="relative pt-6 pb-6">
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold leading-snug">
                            {step.title}
                          </h3>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ STATS SECTION ═══════════════ */}
        <section className="relative py-28 sm:py-36 overflow-hidden">
          {/* Full-width gradient background */}
          <div className="absolute inset-0 bg-gradient-to-l from-primary/[0.06] via-primary/[0.03] to-secondary/[0.06]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />

          {/* Decorative elements */}
          <div className="absolute top-1/2 start-0 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute top-1/2 end-0 -translate-y-1/2 w-80 h-80 rounded-full bg-secondary/[0.04] blur-3xl" />

          <div className="container relative mx-auto px-4" ref={statsView.ref}>
            <div className="mx-auto max-w-2xl text-center mb-16">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-accent/20 bg-accent/[0.04]"
              >
                إنجازاتنا
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                أرقام تتحدث عن{" "}
                <span className="bg-gradient-to-l from-accent via-primary to-secondary bg-clip-text text-transparent">
                  نجاحنا
                </span>
              </h2>
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-secondary via-accent to-primary" />
            </div>

            <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
              {[
                { value: "٩٣٪", label: "دقة التوافق", description: "بفضل الذكاء الاصطناعي", icon: Brain },
                { value: "٢,٥٠٠+", label: "عائلة مسجلة", description: "في مختلف أنحاء الأردن", icon: Users },
                { value: "٤٨٠+", label: "زواج ناجح", description: "تم بتوفيق الله", icon: HeartHandshake },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`group text-center transition-all duration-700 ${
                    statsView.inView
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: statsView.inView ? `${i * 150}ms` : "0ms",
                  }}
                >
                  <Card className="relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-md py-12 transition-all duration-500 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/[0.06] hover:-translate-y-1 group">
                    {/* Decorative gradient */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-primary via-secondary to-accent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    <CardContent className="space-y-3">
                      <stat.icon className="mx-auto size-8 text-primary/40 mb-2 transition-all duration-500 group-hover:text-primary/70 group-hover:scale-110" />
                      <p className="text-5xl font-bold text-primary sm:text-6xl">
                        {stat.value}
                      </p>
                      <p className="text-lg font-semibold">{stat.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {stat.description}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ TESTIMONIALS SECTION ═══════════════ */}
        <section id="testimonials" className="relative py-28 sm:py-36 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />

          <div className="container relative mx-auto px-4" ref={testimonialsView.ref}>
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-secondary/20 bg-secondary/[0.04]"
              >
                <Sparkles className="size-3 ml-1 text-secondary" />
                قصص نجاح
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                عائلات وجدت{" "}
                <span className="bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
                  نصيبها
                </span>
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                تجارب حقيقية من عائلات أردنية وثقت بمنصتنا.
              </p>
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-secondary via-primary to-accent" />
            </div>

            <div className="mx-auto mt-20 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial, i) => (
                <Card
                  key={testimonial.name}
                  className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-500 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/[0.08] hover:-translate-y-2 ${
                    testimonialsView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: testimonialsView.inView ? `${i * 100}ms` : "0ms",
                    transitionProperty: "all",
                  }}
                >
                  <CardContent className="relative pt-8 pb-6">
                    <Quote className="size-8 text-primary/20 mb-4" />
                    <p className="text-sm leading-relaxed text-muted-foreground mb-6">
                      {testimonial.quote}
                    </p>
                    <div className="border-t border-border/40 pt-4">
                      <p className="font-bold text-sm">{testimonial.name}</p>
                      <p className="text-xs text-muted-foreground">{testimonial.city}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ TRUST STRIP SECTION ═══════════════ */}
        <div
          ref={trustView.ref}
          className={`relative bg-gradient-to-l from-primary/[0.04] via-background to-secondary/[0.04] transition-all duration-700 ${
            trustView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {[
                { icon: Shield, text: "تشفير AES-256" },
                { icon: ShieldCheck, text: "OWASP متوافق" },
                { icon: MapPin, text: "مسجلة في الأردن" },
                { icon: Headphones, text: "خدمة عملاء ٢٤/٧" },
              ].map((badge, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 rounded-full bg-muted/60 backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-muted-foreground border border-border/30"
                >
                  <badge.icon className="size-4 text-primary" />
                  {badge.text}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════ FAQ PREVIEW SECTION ═══════════════ */}
        <section id="faq-preview" className="relative py-28 sm:py-36">
          <div className="container relative mx-auto px-4" ref={faqView.ref}>
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-primary/20 bg-primary/[0.04]"
              >
                <Sparkles className="size-3 ml-1 text-primary" />
                أسئلة شائعة
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                إجابات لأهم{" "}
                <span className="bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">
                  أسئلتك
                </span>
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                كل ما تحتاج معرفته عن منصة نصيب.
              </p>
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-primary via-accent to-secondary" />
            </div>

            <div
              className={`mx-auto mt-16 max-w-2xl space-y-3 transition-all duration-700 ${
                faqView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              {faqs.map((faq, i) => {
                const isOpen = openFaq === i;
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-primary/20"
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start"
                    >
                      <span className="font-bold text-sm">{faq.q}</span>
                      <ChevronDown
                        className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                    >
                      <div className="overflow-hidden">
                        <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
                          {faq.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/faq"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline transition-colors duration-200"
              >
                عرض جميع الأسئلة
                <ArrowLeft className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════════════ FINAL CTA SECTION ═══════════════ */}
        <section className="py-28 sm:py-36">
          <div className="container mx-auto px-4">
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-bl from-primary via-primary/95 to-primary/85 px-8 py-20 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-16 sm:py-24">
              {/* Decorative elements */}
              <div className="absolute top-0 end-0 h-48 w-48 rounded-full bg-white/[0.04] blur-2xl" />
              <div className="absolute bottom-0 start-0 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
              <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full bg-accent/[0.06] blur-2xl" />

              {/* Islamic pattern overlay */}
              <div className="absolute inset-0 opacity-[0.03] text-white">
                <IslamicPatternBg className="w-full h-full" />
              </div>

              {/* Subtle dot grid */}
              <div className="absolute top-10 end-10 opacity-[0.08]">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <pattern id="ctadots" width="16" height="16" patternUnits="userSpaceOnUse">
                    <circle cx="8" cy="8" r="1" fill="white" />
                  </pattern>
                  <rect width="100" height="100" fill="url(#ctadots)" />
                </svg>
              </div>

              <div className="relative">
                <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
                  <HeartHandshake className="size-10 opacity-90" />
                </div>
                <h2 className="text-4xl font-bold sm:text-5xl">
                  ابدأ رحلتك نحو زواج مبارك
                </h2>
                <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed opacity-85">
                  انضم إلى آلاف العائلات الأردنية التي وثقت بمنصة نصيب.
                  سجّل الآن وابدأ خطوتك الأولى.
                </p>
                <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Button
                    size="lg"
                    variant="secondary"
                    asChild
                    className="group h-14 px-10 text-base font-semibold shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]"
                  >
                    <Link href="/register">
                      <span className="flex items-center gap-2">
                        سجّل الآن مجاناً
                        <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                      </span>
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    asChild
                    className="group h-14 px-10 text-base font-medium text-primary-foreground hover:bg-white/10 hover:text-primary-foreground border border-white/20 backdrop-blur-sm transition-all duration-500 hover:scale-[1.02]"
                  >
                    <a href="#how-it-works">
                      <span className="flex items-center gap-2">
                        تعرّف على الخطوات
                        <ChevronLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                      </span>
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Global keyframe animations */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideDown {
          from {
            opacity: 0;
            transform: translateY(-16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideRight {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
