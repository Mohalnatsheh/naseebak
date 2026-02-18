"use client";

import Link from "next/link";
import {
  FileText,
  UserCheck,
  Ban,
  CreditCard,
  ShieldAlert,
  Scale,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { IslamicPatternBg } from "@/components/shared/islamic-pattern";

/* ──────────────────── DATA ──────────────────── */

const sections = [
  {
    icon: UserCheck,
    title: "شروط التسجيل والأهلية",
    items: [
      "يجب أن يكون عمر المستخدم 18 سنة على الأقل",
      "يجب تقديم معلومات صحيحة ودقيقة عند التسجيل",
      "يجب التحقق من الهوية عبر رفع وثيقة هوية رسمية سارية المفعول",
      "كل مستخدم يحق له حساب واحد فقط على المنصة",
      "رقم الهاتف المُسجل يجب أن يكون رقماً أردنياً فعالاً",
      "يجب إكمال الملف الشخصي بصدق ودون معلومات مضللة",
    ],
  },
  {
    icon: Scale,
    title: "قواعد الاستخدام",
    items: [
      "المنصة مخصصة لتيسير الزواج التقليدي فقط — وليست تطبيق مواعدة",
      "لا يوجد تواصل مباشر بين المستخدمين عبر المنصة",
      "الصور الشخصية مخفية حتى التوافق المتبادل بين الطرفين",
      "الاقتراحات تُرسل للإناث فقط؛ الذكور يستقبلون إشعارات الاهتمام",
      "معلومات ولي الأمر مطلوبة وتظهر لفريق الإدارة فقط",
      "يجب احترام جميع المستخدمين والتعامل بلياقة في جميع الأوقات",
    ],
  },
  {
    icon: Ban,
    title: "السلوكيات المحظورة",
    items: [
      "تقديم معلومات شخصية كاذبة أو مضللة",
      "استخدام صور غير حقيقية أو صور لأشخاص آخرين",
      "إنشاء أكثر من حساب واحد",
      "محاولة التواصل مع المستخدمين خارج نطاق المنصة بطريقة غير مشروعة",
      "استخدام المنصة لأي غرض غير الزواج التقليدي",
      "التحرش أو الإساءة أو التهديد لأي مستخدم آخر",
      "محاولة اختراق المنصة أو الوصول غير المصرح به للبيانات",
    ],
  },
  {
    icon: CreditCard,
    title: "الاشتراكات والمدفوعات",
    items: [
      "الباقة المجانية تشمل 5 اقتراحات مدى الحياة",
      "الباقات المدفوعة توفر اقتراحات إضافية ومميزات متقدمة",
      "جميع الأسعار معروضة بالدينار الأردني وتشمل الضريبة",
      "لا يتم عرض الأسعار في الصفحة الرئيسية — تظهر فقط في لوحة التحكم",
      "المبالغ المدفوعة غير قابلة للاسترداد إلا في حالات استثنائية",
      "نحتفظ بحق تعديل الأسعار مع إشعار مسبق للمشتركين الحاليين",
    ],
  },
  {
    icon: ShieldAlert,
    title: "الإيقاف وإنهاء الحساب",
    items: [
      "يحق لنا إيقاف أي حساب يخالف شروط الاستخدام دون إنذار مسبق",
      "يمكن للمستخدم إلغاء تفعيل حسابه مؤقتاً في أي وقت",
      "يمكن طلب حذف الحساب نهائياً من خلال الإعدادات",
      "عند الإيقاف بسبب مخالفة، لا يحق المطالبة باسترداد المبالغ المدفوعة",
      "نحتفظ بحق رفض إعادة تسجيل الحسابات المُوقفة بسبب مخالفات",
    ],
  },
  {
    icon: AlertTriangle,
    title: "إخلاء المسؤولية",
    items: [
      "نصيب منصة تيسير فقط — لا نضمن إتمام أي زواج",
      "لا نتحمل مسؤولية صحة المعلومات المقدمة من المستخدمين رغم جهود التحقق",
      "الزيارات العائلية تتم بتنسيق الإدارة لكن المسؤولية النهائية على الأطراف",
      "نسب التوافق المعروضة هي تقديرات مبنية على الذكاء الاصطناعي وليست ضماناً",
      "لا نتحمل مسؤولية أي أضرار ناتجة عن استخدام المنصة أو الاعتماد على معلوماتها",
    ],
  },
  {
    icon: RefreshCw,
    title: "التعديلات على الشروط",
    items: [
      "نحتفظ بحق تعديل هذه الشروط في أي وقت",
      "سيتم إخطار المستخدمين بأي تغييرات جوهرية عبر الإشعارات",
      "استمرار استخدام المنصة بعد التعديل يُعتبر موافقة على الشروط الجديدة",
      "النسخة العربية من هذه الشروط هي المرجع الأساسي عند أي اختلاف",
      "تخضع هذه الشروط للقوانين المعمول بها في المملكة الأردنية الهاشمية",
    ],
  },
];

/* ══════════════════════════════════════════════════════ */
/*            TERMS & CONDITIONS PAGE                    */
/* ══════════════════════════════════════════════════════ */

export default function TermsPage() {
  const introView = useInView(0.15);
  const sectionsView = useInView(0.1);
  const contactView = useInView(0.15);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative min-h-[50vh] flex items-center justify-center pt-24">
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
              <FileText className="size-4 animate-pulse" />
              شروط الاستخدام
            </div>

            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              <span className="bg-gradient-to-l from-primary via-primary/90 to-primary bg-clip-text text-transparent drop-shadow-sm">
                شروط
              </span>
              <span className="mx-3 text-muted-foreground/40">—</span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                استخدام المنصة
              </span>
            </h1>

            <p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              باستخدامك لمنصة نصيب فإنك توافق على الالتزام بهذه الشروط
              والأحكام. يرجى قراءتها بعناية قبل التسجيل أو استخدام أي من
              خدماتنا.
            </p>

            <p
              className="mx-auto mt-4 text-sm text-muted-foreground/70"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.6s both" }}
            >
              آخر تحديث: ١ فبراير ٢٠٢٦
            </p>
          </div>
        </section>

        {/* ═══════════════ INTRO SECTION ═══════════════ */}
        <section className="relative py-16">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4" ref={introView.ref}>
            <Card
              className={`mx-auto max-w-4xl border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden transition-all duration-700 ${
                introView.inView
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-primary to-secondary opacity-60" />
              <CardContent className="pt-8 pb-8">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary">
                    <FileText className="size-6" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">مقدمة</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      مرحباً بك في منصة نصيب لتيسير الزواج التقليدي. هذه الشروط
                      والأحكام تحكم استخدامك للمنصة وجميع خدماتها. بتسجيلك في
                      المنصة أو استخدامها بأي شكل، فإنك توافق على الالتزام بجميع
                      هذه الشروط. إذا لم توافق على أي من هذه الشروط، يرجى عدم
                      استخدام المنصة. نصيب منصة أردنية متخصصة حصراً في تيسير
                      الزواج التقليدي وليست تطبيق مواعدة أو تعارف بأي شكل من
                      الأشكال.
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
            ref={sectionsView.ref}
          >
            <div className="mx-auto max-w-4xl space-y-6">
              {sections.map((section, i) => (
                <Card
                  key={section.title}
                  className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-700 hover:border-primary/20 hover:shadow-xl ${
                    sectionsView.inView
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: sectionsView.inView
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

        {/* ═══════════════ CTA SECTION ═══════════════ */}
        <section className="relative py-20">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4" ref={contactView.ref}>
            <div
              className={`relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-bl from-primary via-primary/95 to-primary/85 px-8 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-16 sm:py-20 transition-all duration-700 ${
                contactView.inView
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
                  <Scale className="size-8 opacity-90" />
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">
                  لديك استفسار حول الشروط؟
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed opacity-85">
                  إذا كان لديك أي سؤال حول شروط الاستخدام أو كنت بحاجة إلى
                  توضيح أي بند، يسعدنا مساعدتك.
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
                  <Button
                    size="lg"
                    variant="ghost"
                    asChild
                    className="group h-12 px-8 text-base font-semibold text-primary-foreground/90 hover:text-primary-foreground hover:bg-white/10"
                  >
                    <Link href="/privacy">
                      <span className="flex items-center gap-2">
                        سياسة الخصوصية
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
