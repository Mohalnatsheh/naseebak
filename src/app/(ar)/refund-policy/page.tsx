"use client";

import Link from "next/link";
import {
  Building2,
  Receipt,
  RotateCcw,
  Ban,
  Mail,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { PageHeroPhoto } from "@/components/shared/page-hero-photo";
import { IslamicPatternBg } from "@/components/shared/islamic-pattern";

/* ──────────────────── DATA ──────────────────── */

const sections = [
  {
    icon: Building2,
    title: "الجهة البائعة",
    items: [
      "تُشغّل منصة نصيبك (naseebak.com) شركة LOGIC CENTER FOR WEBSITE DESIGN، وتتم جميع عمليات الدفع على المنصة باسمها.",
      "للتواصل بخصوص أي عملية دفع: info@naseebak.com أو صفحة «تواصل معنا».",
    ],
  },
  {
    icon: Receipt,
    title: "ما الذي تشتريه",
    items: [
      "الأرصدة خدمة رقمية تُستخدم داخل المنصة فقط، وتُضاف إلى حسابك فور إتمام الدفع.",
      "لا قيمة نقدية للأرصدة، ولا يمكن تحويلها إلى مستخدم آخر أو صرفها نقداً.",
      "لا يوجد اشتراك ولا تجديد تلقائي؛ كل عملية شراء دفعة واحدة، ويبقى الرصيد في حسابك حتى استخدامه.",
      "تُعرض الأسعار بالدينار الأردني، ويتم الخصم من البطاقة بما يعادلها بالدولار الأمريكي، وقد يضيف البنك رسوم تحويل عملة. تظهر العملية في كشف حسابك باسم LOGICCR.",
    ],
  },
  {
    icon: RotateCcw,
    title: "متى يحق لك الاسترداد",
    items: [
      "خلال 14 يوماً من تاريخ الشراء، إذا لم يُستخدم أي رصيد من الباقة المشتراة.",
      "إذا خُصم المبلغ أكثر من مرة لعملية الشراء نفسها، يُسترد المبلغ المكرر كاملاً.",
      "إذا تم الدفع ولم تُضف الأرصدة إلى حسابك، نضيفها فوراً أو نسترد المبلغ كاملاً حسب رغبتك.",
    ],
  },
  {
    icon: Ban,
    title: "حالات لا يشملها الاسترداد",
    items: [
      "الأرصدة التي استُخدمت داخل المنصة وفق قواعد خصم الرصيد المبيّنة في شروط الاستخدام.",
      "طلبات الاسترداد بعد مرور 14 يوماً على الشراء، باستثناء الخصم المكرر أو عدم إضافة الأرصدة.",
      "الحسابات التي تم إيقافها أو حذفها بسبب مخالفة شروط الاستخدام.",
    ],
  },
  {
    icon: Mail,
    title: "كيف تطلب الاسترداد",
    items: [
      "راسلنا على info@naseebak.com أو عبر صفحة «تواصل معنا»، مع ذكر الاسم المسجّل ورقم الهاتف المرتبط بالحساب وتاريخ الشراء والمبلغ.",
      "نرد على طلبك خلال 3 أيام عمل.",
      "عند الموافقة، يُعاد المبلغ إلى البطاقة نفسها التي تم الدفع بها، ويظهر عادةً خلال 5 إلى 10 أيام عمل حسب البنك.",
      "عند استرداد مبلغ باقة، تُخصم أرصدة تلك الباقة من حسابك.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "عملية لا تعرفها؟",
    items: [
      "إذا لاحظت في كشف حسابك عملية لا تعرفها باسم LOGICCR، يُرجى التواصل معنا أولاً وسنحلّها بسرعة قبل فتح اعتراض لدى البنك.",
    ],
  },
];

/* ══════════════════════════════════════════════════════ */
/*               REFUND POLICY PAGE                      */
/* ══════════════════════════════════════════════════════ */

export default function RefundPolicyPage() {
  const { ref: introRef, inView: introInView } = useInView(0.15);
  const { ref: sectionsRef, inView: sectionsInView } = useInView(0.1);
  const { ref: contactRef, inView: contactInView } = useInView(0.15);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative min-h-[50vh] flex items-center justify-center pt-24">
          <PageHeroPhoto src="/images/pages/privacy.webp" />
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/[0.06] via-background to-secondary/[0.04]" />

          <div
            className="absolute top-20 start-10 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute bottom-10 end-10 h-80 w-80 rounded-full bg-secondary/[0.08] blur-3xl animate-pulse"
            style={{ animationDuration: "10s" }}
          />

          <div className="absolute top-10 end-0 w-72 h-72 text-primary opacity-[0.03] rotate-12">
            <IslamicPatternBg className="w-full h-full" />
          </div>
          <div className="absolute bottom-0 start-0 w-56 h-56 text-secondary opacity-[0.03] -rotate-6">
            <IslamicPatternBg className="w-full h-full" />
          </div>

          <div className="container relative mx-auto px-4 py-16 text-center">
            <div
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-5 py-2 text-sm font-medium text-primary mb-8 shadow-sm"
              style={{ animation: "fadeSlideDown 0.8s ease-out both" }}
            >
              <Receipt className="size-4 animate-pulse" />
              سياسة الاسترداد
            </div>

            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              <span className="bg-gradient-to-l from-primary via-primary/90 to-primary bg-clip-text text-transparent drop-shadow-sm">
                الاسترداد
              </span>
              <span className="mx-3 text-muted-foreground/40 hidden sm:inline">—</span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                بوضوح وشفافية
              </span>
            </h1>

            <p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              توضح هذه السياسة متى وكيف يمكنك استرداد المبالغ المدفوعة مقابل
              الأرصدة في منصة نصيبك.
            </p>

            <p
              className="mx-auto mt-4 text-sm text-muted-foreground/70"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.6s both" }}
            >
              آخر تحديث: 22 أكتوبر 2026
            </p>
          </div>
        </section>

        {/* ═══════════════ INTRO SECTION ═══════════════ */}
        <section className="relative py-16">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4" ref={introRef}>
            <Card
              className={`mx-auto max-w-4xl border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden transition-all duration-700 ${
                introInView
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-primary to-secondary opacity-60" />
              <CardContent className="pt-8 pb-8">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary">
                    <Receipt className="size-6" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">مقدمة</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      سياسة الاسترداد هذه جزء من شروط استخدام منصة نصيبك، وتنطبق على جميع
                      عمليات شراء الأرصدة عبر المنصة. الأرصدة خدمة رقمية تُضاف إلى
                      حسابك فور الدفع، لذلك نوضح هنا بدقة الحالات التي يحق لك فيها
                      استرداد المبلغ وكيفية طلبه.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ═══════════════ MAIN SECTIONS ═══════════════ */}
        <section className="relative py-16">
          <div className="absolute inset-0 bg-muted/20" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div
            className="container relative mx-auto px-4"
            ref={sectionsRef}
          >
            <div className="mx-auto max-w-4xl space-y-6">
              {sections.map((section, i) => (
                <Card
                  key={section.title}
                  className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-700 hover:border-primary/20 hover:shadow-xl ${
                    sectionsInView
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: sectionsInView
                      ? `${i * 80}ms`
                      : "0ms",
                  }}
                >
                  <CardContent className="pt-8 pb-8">
                    <div className="flex items-start gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary transition-all duration-500 group-hover:scale-110">
                        <section.icon className="size-6" />
                      </div>
                      <div className="space-y-4 flex-1">
                        <h2 className="text-xl font-bold">{section.title}</h2>
                        <ul className="space-y-2.5">
                          {section.items.map((item, j) => (
                            <li
                              key={j}
                              className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
                            >
                              <div className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/40" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ CONTACT SECTION ═══════════════ */}
        <section className="relative py-20">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4" ref={contactRef}>
            <div
              className={`relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-bl from-primary via-primary/95 to-primary/85 px-8 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-16 sm:py-20 transition-all duration-700 ${
                contactInView
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <div className="absolute top-0 end-0 h-48 w-48 rounded-full bg-white/[0.04] blur-2xl" />
              <div className="absolute bottom-0 start-0 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />

              <div className="absolute inset-0 opacity-[0.03] text-white">
                <IslamicPatternBg className="w-full h-full" />
              </div>

              <div className="relative">
                <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
                  <Mail className="size-8 opacity-90" />
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">
                  لديك سؤال حول عملية دفع؟
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed opacity-85">
                  إذا كان لديك أي استفسار حول عملية شراء أو طلب استرداد، تواصل معنا
                  وسنساعدك في أقرب وقت.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    size="lg"
                    variant="secondary"
                    asChild
                    className="group h-12 px-8 text-base font-semibold shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]"
                  >
                    <Link href="/contact">
                      <span className="flex items-center gap-2">
                        تواصل معنا
                        <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                      </span>
                    </Link>
                  </Button>
                  <p className="text-sm opacity-70">
                    البريد: info@naseebak.com
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

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
      `}</style>
    </>
  );
}
