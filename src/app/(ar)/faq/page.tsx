"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronDown, MessageCircle, Shield, CreditCard, Users, HelpCircle } from "lucide-react";

/* ──────────────────── DATA ──────────────────── */

const faqCategories = [
  { id: "all", label: "الكل", icon: HelpCircle },
  { id: "general", label: "عام", icon: MessageCircle },
  { id: "privacy", label: "الخصوصية والأمان", icon: Shield },
  { id: "payments", label: "الباقات والدفع", icon: CreditCard },
  { id: "matching", label: "التوافق والاقتراحات", icon: Users },
];

const faqs = [
  // General
  {
    id: 1,
    category: "general",
    q: "ما هي منصة نصيب؟",
    a: "نصيب هي منصة أردنية متخصصة في تيسير الزواج التقليدي. تعتمد على الذكاء الاصطناعي لتقديم اقتراحات توافق دقيقة، مع الحفاظ على القيم والتقاليد الأردنية الأصيلة.",
  },
  {
    id: 2,
    category: "general",
    q: "كيف تعمل المنصة؟",
    a: "تبدأ بالتسجيل وتوثيق هويتك، ثم تكمل ملفك الشخصي واختبار الشخصية. تحصل الفتاة على اقتراحات مرشحين مع نسبة التوافق. عند القبول المتبادل، تُكشف الصور ويُنسق فريقنا زيارة عائلية.",
  },
  {
    id: 3,
    category: "general",
    q: "هل المنصة متاحة خارج الأردن؟",
    a: "حالياً المنصة متاحة للمستخدمين في الأردن فقط. نخطط للتوسع لخدمة دول عربية أخرى في المستقبل القريب.",
  },
  {
    id: 4,
    category: "general",
    q: "هل التسجيل مجاني؟",
    a: "نعم، التسجيل مجاني تماماً وتحصل على \u0665 اقتراحات مدى الحياة. للحصول على المزيد من الاقتراحات والمميزات، يمكنك الاشتراك في إحدى الباقات المدفوعة.",
  },
  // Privacy
  {
    id: 5,
    category: "privacy",
    q: "كيف تحافظون على خصوصيتي؟",
    a: "جميع البيانات مشفرة بمعيار AES-256. صورك تبقى مخفية حتى يتم التوافق المتبادل. بيانات ولي الأمر لا تظهر للطرف الآخر أبداً. نلتزم بأعلى معايير الأمان (OWASP).",
  },
  {
    id: 6,
    category: "privacy",
    q: "من يمكنه رؤية صوري؟",
    a: "صورك مخفية تماماً حتى يتم التوافق المتبادل بينك وبين الطرف الآخر. فقط عندها تُكشف الصور لكلا الطرفين.",
  },
  {
    id: 7,
    category: "privacy",
    q: "هل يوجد تواصل مباشر بين المستخدمين؟",
    a: "لا، لا يوجد أي شكل من أشكال التواصل المباشر (رسائل، محادثات، مكالمات). المنصة تعتمد كلياً على نظام الاقتراحات والزيارات العائلية المنظمة.",
  },
  {
    id: 8,
    category: "privacy",
    q: "هل التحقق من الهوية إلزامي؟",
    a: "نعم، يجب على كل مستخدم رفع صورة هوية حكومية سارية المفعول. يتم مراجعتها من قبل فريقنا لضمان جدية وصدق جميع المسجلين.",
  },
  // Payments
  {
    id: 9,
    category: "payments",
    q: "ما هي الباقات المتاحة؟",
    a: "نقدم ثلاث باقات: المجانية (\u0665 اقتراحات مدى الحياة)، الأساسية (\u0661\u0665 اقتراح شهرياً بـ \u0665 د.أ)، والمميزة (اقتراحات غير محدودة بـ \u0661\u0660 د.أ شهرياً).",
  },
  {
    id: 10,
    category: "payments",
    q: "ما هي طرق الدفع المتاحة؟",
    a: "نقبل الدفع عبر eFAWATEERcom، PayPal، وبطاقات Visa/Mastercard عبر Stripe. جميع المعاملات آمنة ومشفرة.",
  },
  {
    id: 11,
    category: "payments",
    q: "هل يمكنني إلغاء اشتراكي؟",
    a: "نعم، يمكنك إلغاء اشتراكك في أي وقت من صفحة إدارة الاشتراك. ستستمر في الاستفادة من الباقة حتى نهاية الفترة المدفوعة.",
  },
  // Matching
  {
    id: 12,
    category: "matching",
    q: "كيف يتم حساب نسبة التوافق؟",
    a: "نستخدم خوارزميات ذكاء اصطناعي تحلل عدة عوامل: المعايير الأساسية (\u0662\u0665\u066A)، القيم والدين (\u0662\u0665\u066A)، نتائج اختبار الشخصية (\u0663\u0660\u066A)، والتعلم السلوكي (\u0662\u0660\u066A).",
  },
  {
    id: 13,
    category: "matching",
    q: "من يحصل على الاقتراحات؟",
    a: "تحصل الفتاة فقط على اقتراحات المرشحين. عندما تقبل الفتاة اقتراحاً، يتم إخطار الشاب ليقبل أو يرفض. هذا النظام يحفظ الكرامة والاحترام لجميع الأطراف.",
  },
  {
    id: 14,
    category: "matching",
    q: "ماذا يحدث بعد التوافق المتبادل؟",
    a: "عند القبول المتبادل، تُكشف الصور لكلا الطرفين ويتم إنشاء طلب زيارة عائلية. يتواصل فريقنا مع ولي أمر كل طرف لتنسيق زيارة عائلية تقليدية محترمة.",
  },
  {
    id: 15,
    category: "matching",
    q: "هل يمكنني التراجع عن قبول اقتراح؟",
    a: "لا يمكن التراجع بعد القبول. لذلك ننصح بالتأني في مراجعة بيانات المرشح قبل اتخاذ القرار.",
  },
];

/* ══════════════════════════════════════════════════════ */
/*                      FAQ PAGE                         */
/* ══════════════════════════════════════════════════════ */

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const faqView = useInView(0.1);
  const ctaView = useInView(0.2);

  const filteredFaqs =
    activeCategory === "all"
      ? faqs
      : faqs.filter((f) => f.category === activeCategory);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO BANNER ═══════════════ */}
        <section className="relative min-h-[40vh] flex items-center justify-center pt-20">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/[0.08] via-background to-secondary/[0.06]" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 0%, oklch(0.35 0.08 250 / 0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.45 0.06 250 / 0.06), transparent)",
            }}
          />

          {/* Decorative blurred orbs */}
          <div
            className="absolute top-20 start-10 h-56 w-56 rounded-full bg-primary/[0.06] blur-3xl animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute bottom-10 end-10 h-72 w-72 rounded-full bg-secondary/[0.08] blur-3xl animate-pulse"
            style={{ animationDuration: "10s" }}
          />

          <div className="container relative mx-auto px-4 py-16 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-5 py-2 text-sm font-medium text-primary mb-6 shadow-sm"
              style={{ animation: "fadeSlideDown 0.8s ease-out both" }}
            >
              <HelpCircle className="size-4" />
              الأسئلة الشائعة
            </div>

            {/* Headline */}
            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              إجابات لكل{" "}
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                أسئلتك
              </span>
            </h1>

            {/* Description */}
            <p
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              كل ما تحتاج معرفته عن منصة نصيب وكيفية عملها. إذا لم تجد
              إجابتك، لا تتردد في التواصل معنا.
            </p>
          </div>
        </section>

        {/* ═══════════════ CATEGORY TABS ═══════════════ */}
        <section className="py-8">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {faqCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setOpenFaq(null);
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                    activeCategory === cat.id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "bg-muted/60 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <cat.icon className="size-4" />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ FAQ ACCORDION ═══════════════ */}
        <section className="py-16">
          <div className="container mx-auto px-4" ref={faqView.ref}>
            <div
              className={`mx-auto max-w-3xl transition-all duration-700 ${
                faqView.inView
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              {filteredFaqs.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-lg text-muted-foreground">
                    لا توجد أسئلة في هذا التصنيف حالياً.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {filteredFaqs.map((faq, i) => {
                    const isOpen = openFaq === faq.id;
                    const isLast = i === filteredFaqs.length - 1;

                    return (
                      <div
                        key={faq.id}
                        className={`${isLast ? "border-0" : ""}`}
                      >
                        <button
                          onClick={() =>
                            setOpenFaq(isOpen ? null : faq.id)
                          }
                          className={`flex w-full items-center justify-between gap-4 rounded-2xl py-5 px-6 text-start transition-all duration-300 ${
                            isOpen
                              ? "bg-primary/[0.04]"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          <span className="font-semibold text-sm leading-relaxed">
                            {faq.q}
                          </span>
                          <ChevronDown
                            className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {/* Expandable answer with grid-rows transition */}
                        <div
                          className="grid transition-all duration-300"
                          style={{
                            gridTemplateRows: isOpen ? "1fr" : "0fr",
                          }}
                        >
                          <div className="overflow-hidden">
                            <p className="px-6 pb-5 text-muted-foreground leading-relaxed">
                              {faq.a}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════ CTA ═══════════════ */}
        <section className="py-16">
          <div className="container mx-auto px-4" ref={ctaView.ref}>
            <div
              className={`relative mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-bl from-primary via-primary/95 to-primary/85 px-8 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-16 transition-all duration-700 ${
                ctaView.inView
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              {/* Decorative elements */}
              <div className="absolute top-0 end-0 h-40 w-40 rounded-full bg-white/[0.04] blur-2xl" />
              <div className="absolute bottom-0 start-0 h-56 w-56 rounded-full bg-white/[0.04] blur-3xl" />

              <div className="relative">
                <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
                  <MessageCircle className="size-8 opacity-90" />
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">
                  لم تجد إجابتك؟
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed opacity-85">
                  تواصل معنا وسنكون سعداء بمساعدتك. فريقنا جاهز للإجابة
                  على جميع استفساراتك.
                </p>
                <Button
                  size="lg"
                  variant="secondary"
                  asChild
                  className="mt-8 h-14 px-10 text-base font-semibold shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]"
                >
                  <Link href="/contact">تواصل معنا</Link>
                </Button>
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
      `}</style>
    </>
  );
}
