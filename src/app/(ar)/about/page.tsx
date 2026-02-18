"use client";

import Link from "next/link";
import {
  Shield,
  Heart,
  Users,
  Cpu,
  Target,
  Eye,
  HeartHandshake,
  ArrowLeft,
  Sparkles,
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
import { useInView } from "@/hooks/use-in-view";
import { IslamicPatternBg } from "@/components/shared/islamic-pattern";

/* ──────────────────── DATA ──────────────────── */

const values = [
  {
    icon: Shield,
    title: "الخصوصية",
    description:
      "حماية بيانات المستخدمين وصورهم بأعلى معايير التشفير والأمان.",
  },
  {
    icon: Heart,
    title: "الاحترام",
    description:
      "تعامل يحفظ كرامة الجميع في كل خطوة من خطوات التوافق.",
  },
  {
    icon: Users,
    title: "التقاليد",
    description:
      "نحافظ على الأصالة الأردنية والزيارات العائلية التقليدية المحترمة.",
  },
  {
    icon: Cpu,
    title: "التقنية",
    description:
      "نوظف الذكاء الاصطناعي لتقديم اقتراحات توافق دقيقة وعلمية.",
  },
];

const milestones = [
  {
    year: "٢٠٢٣",
    title: "بداية الفكرة",
    description:
      "انطلقت فكرة نصيبك من حاجة حقيقية لمنصة زواج تقليدية تحترم القيم الأردنية.",
  },
  {
    year: "٢٠٢٤",
    title: "تطوير المنصة",
    description:
      "بدأنا ببناء المنصة مع فريق متخصص في الذكاء الاصطناعي وتجربة المستخدم.",
  },
  {
    year: "٢٠٢٥",
    title: "الإطلاق التجريبي",
    description:
      "أطلقنا النسخة التجريبية واستقبلنا أول ٥٠٠ عائلة مسجلة.",
  },
  {
    year: "٢٠٢٦",
    title: "التوسع والنمو",
    description:
      "نعمل على التوسع لخدمة المزيد من العائلات في مختلف أنحاء الأردن.",
  },
];

/* ══════════════════════════════════════════════════════ */
/*                   ABOUT PAGE                          */
/* ══════════════════════════════════════════════════════ */

export default function AboutPage() {
  const missionView = useInView(0.15);
  const valuesView = useInView(0.15);
  const timelineView = useInView(0.15);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative min-h-[50vh] flex items-center justify-center pt-24">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/[0.06] via-background to-secondary/[0.04]" />

          {/* Decorative blurred orbs */}
          <div
            className="absolute top-20 start-10 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute bottom-10 end-10 h-80 w-80 rounded-full bg-secondary/[0.08] blur-3xl animate-pulse"
            style={{ animationDuration: "10s" }}
          />

          {/* Islamic pattern overlay */}
          <div className="absolute top-10 end-0 w-72 h-72 text-primary opacity-[0.03] rotate-12">
            <IslamicPatternBg className="w-full h-full" />
          </div>
          <div className="absolute bottom-0 start-0 w-56 h-56 text-secondary opacity-[0.03] -rotate-6">
            <IslamicPatternBg className="w-full h-full" />
          </div>

          <div className="container relative mx-auto px-4 py-16 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-5 py-2 text-sm font-medium text-primary mb-8 shadow-sm"
              style={{ animation: "fadeSlideDown 0.8s ease-out both" }}
            >
              <Sparkles className="size-4 animate-pulse" />
              من نحن
            </div>

            {/* Heading */}
            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              <span className="bg-gradient-to-l from-primary via-primary/90 to-primary bg-clip-text text-transparent drop-shadow-sm">
                نصيبك
              </span>
              <span className="mx-3 text-muted-foreground/40">—</span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                قصتنا ورسالتنا
              </span>
            </h1>

            {/* Description */}
            <p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              نصيبك منصة أردنية رائدة في تيسير الزواج التقليدي، تجمع بين أحدث
              تقنيات الذكاء الاصطناعي والقيم العربية الأصيلة لمساعدة العائلات
              في إيجاد الشريك المناسب بكرامة واحترام.
            </p>
          </div>
        </section>

        {/* ═══════════════ MISSION & VISION SECTION ═══════════════ */}
        <section className="relative py-20">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div
            className="container mx-auto px-4"
            ref={missionView.ref}
          >
            <div className="mx-auto max-w-5xl grid gap-8 md:grid-cols-2">
              {/* Mission Card */}
              <Card
                className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-700 hover:border-primary/20 hover:shadow-xl ${
                  missionView.inView
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: missionView.inView ? "0ms" : "0ms",
                }}
              >
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-primary to-secondary opacity-60" />
                <CardHeader>
                  <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary">
                    <Target className="size-7" />
                  </div>
                  <CardTitle className="text-xl font-bold">رسالتنا</CardTitle>
                </CardHeader>
                <CardContent className="-mt-2">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    تيسير الزواج التقليدي في الأردن من خلال منصة رقمية آمنة
                    وموثوقة، توظّف الذكاء الاصطناعي لتقديم اقتراحات توافق دقيقة
                    مبنية على القيم والشخصية والمعايير الأساسية، مع الحفاظ على
                    الخصوصية الكاملة وتنسيق الزيارات العائلية التقليدية بكل احترام
                    وكرامة.
                  </p>
                </CardContent>
              </Card>

              {/* Vision Card */}
              <Card
                className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-700 hover:border-primary/20 hover:shadow-xl ${
                  missionView.inView
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: missionView.inView ? "150ms" : "0ms",
                }}
              >
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-secondary to-accent opacity-60" />
                <CardHeader>
                  <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-bl from-secondary/10 to-accent/10 text-secondary">
                    <Eye className="size-7" />
                  </div>
                  <CardTitle className="text-xl font-bold">رؤيتنا</CardTitle>
                </CardHeader>
                <CardContent className="-mt-2">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    أن نصبح المنصة الأولى والأكثر ثقة في العالم العربي لتيسير
                    الزواج التقليدي، بحيث تكون الخيار الأول للعائلات الباحثة عن
                    شريك حياة مناسب لأبنائها وبناتها، مع تقديم تجربة تجمع بين
                    التقنية المتطورة والأصالة العربية في كل تفاصيلها.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ═══════════════ VALUES SECTION ═══════════════ */}
        <section className="relative py-20">
          <div className="absolute inset-0 bg-muted/20" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div
            className="container relative mx-auto px-4"
            ref={valuesView.ref}
          >
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-primary/20 bg-primary/[0.04]"
              >
                <Sparkles className="size-3 ml-1 text-primary" />
                قيمنا
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                قيم تُوجّه{" "}
                <span className="bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
                  مسيرتنا
                </span>
              </h2>
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-primary via-secondary to-accent" />
            </div>

            <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {values.map((value, i) => (
                <Card
                  key={value.title}
                  className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm text-center transition-all duration-500 hover:border-transparent hover:shadow-2xl hover:shadow-primary/[0.08] hover:-translate-y-2 ${
                    valuesView.inView
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: valuesView.inView
                      ? `${i * 100}ms`
                      : "0ms",
                    transitionProperty: "all",
                  }}
                >
                  {/* Gradient border effect on hover */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-bl from-primary/20 via-secondary/10 to-accent/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="absolute inset-[1px] rounded-[11px] bg-card transition-colors duration-500" />

                  <CardContent className="relative pt-8 pb-8">
                    {/* Icon in gradient circle */}
                    <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg">
                      <value.icon className="size-8 transition-transform duration-500 group-hover:scale-110" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">{value.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ STORY TIMELINE SECTION ═══════════════ */}
        <section className="relative py-20 overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.015]">
            <IslamicPatternBg className="w-full h-full" />
          </div>

          <div
            className="container mx-auto px-4"
            ref={timelineView.ref}
          >
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="mb-4 px-4 py-1.5 text-sm border-secondary/20 bg-secondary/[0.04]"
              >
                مسيرتنا
              </Badge>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
                محطات في{" "}
                <span className="bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">
                  رحلتنا
                </span>
              </h2>
              <div className="mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l from-accent via-primary to-secondary" />
            </div>

            {/* Timeline */}
            <div className="relative mx-auto mt-20 max-w-3xl">
              {/* Vertical connecting line */}
              <div className="absolute start-8 top-0 bottom-0 w-[2px] bg-gradient-to-b from-primary/30 via-secondary/30 to-accent/30 hidden md:block" />

              <div className="space-y-8 md:space-y-12">
                {milestones.map((milestone, index) => (
                  <div
                    key={milestone.year}
                    className={`group relative flex flex-col md:flex-row gap-6 items-start transition-all duration-700 ${
                      timelineView.inView
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 translate-x-8"
                    }`}
                    style={{
                      transitionDelay: timelineView.inView
                        ? `${index * 150}ms`
                        : "0ms",
                    }}
                  >
                    {/* Year circle */}
                    <div className="relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-bl from-primary to-primary/80 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/20 ring-4 ring-background transition-all duration-500 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-primary/30">
                      {milestone.year}
                      {/* Pulse ring */}
                      <div
                        className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-0 group-hover:opacity-30"
                        style={{ animationDuration: "2s" }}
                      />
                    </div>

                    {/* Milestone content card */}
                    <Card className="flex-1 border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-500 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/[0.04] overflow-hidden">
                      <div
                        className="absolute inset-0 opacity-[0.02]"
                        style={{
                          backgroundImage:
                            "radial-gradient(circle at 20% 50%, oklch(0.35 0.08 250 / 0.3), transparent 50%)",
                        }}
                      />
                      <CardContent className="relative pt-6 pb-6">
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold leading-snug">
                            {milestone.title}
                          </h3>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {milestone.description}
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

        {/* ═══════════════ CTA SECTION ═══════════════ */}
        <section className="py-20">
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

              <div className="relative">
                <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
                  <HeartHandshake className="size-10 opacity-90" />
                </div>
                <h2 className="text-4xl font-bold sm:text-5xl">
                  انضم إلينا اليوم
                </h2>
                <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed opacity-85">
                  سجّل الآن وانضم إلى آلاف العائلات الأردنية التي وثقت بمنصة
                  نصيبك. ابدأ رحلتك نحو زواج مبارك بخطوة واحدة.
                </p>
                <div className="mt-12">
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
