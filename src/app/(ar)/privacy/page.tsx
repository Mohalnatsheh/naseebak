"use client";

import Link from "next/link";
import {
  Shield,
  Lock,
  Eye,
  Database,
  UserCheck,
  Share2,
  Trash2,
  Bell,
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
    icon: Database,
    title: "البيانات التي نجمعها",
    items: [
      "الاسم الكامل ورقم الهاتف والجنس عند التسجيل",
      "معلومات الملف الشخصي: العمر، المدينة، التعليم، العمل، الحالة الاجتماعية",
      "صور شخصية (تبقى مخفية حتى التوافق المتبادل)",
      "وثائق الهوية للتحقق من الحساب",
      "معلومات ولي الأمر (تظهر للإدارة فقط)",
      "نتائج اختبار الشخصية لتحسين التوافق",
    ],
  },
  {
    icon: Eye,
    title: "كيف نستخدم بياناتك",
    items: [
      "تقديم اقتراحات توافق دقيقة باستخدام الذكاء الاصطناعي",
      "التحقق من هوية المستخدمين لضمان بيئة آمنة",
      "تنسيق الزيارات العائلية التقليدية عبر الإدارة",
      "إرسال إشعارات حول الاقتراحات والتوافقات الجديدة",
      "تحسين خدماتنا وتجربة المستخدم",
      "لا نستخدم بياناتك لأي غرض إعلاني أو تجاري آخر",
    ],
  },
  {
    icon: Lock,
    title: "حماية البيانات",
    items: [
      "تشفير جميع البيانات أثناء النقل والتخزين",
      "الصور الشخصية مخفية بالكامل حتى التوافق المتبادل بين الطرفين",
      "معلومات ولي الأمر لا تظهر للطرف الآخر أبداً",
      "نظام مصادقة آمن عبر رمز التحقق (OTP)",
      "مراجعة دورية لأنظمة الأمان والحماية",
      "لا يوجد تواصل مباشر بين المستخدمين عبر المنصة",
    ],
  },
  {
    icon: Share2,
    title: "مشاركة البيانات",
    items: [
      "لا نبيع أو نؤجر بياناتك الشخصية لأي طرف ثالث",
      "يتم مشاركة معلومات محدودة فقط في بطاقات الاقتراح (الاسم الأول، العمر، المدينة، التعليم، العمل، نسبة التوافق)",
      "تُكشف الصور فقط بعد التوافق المتبادل",
      "قد نشارك البيانات مع الجهات القانونية عند الضرورة بموجب القانون",
      "فريق الإدارة المعتمد فقط يمكنه الوصول إلى البيانات الكاملة",
    ],
  },
  {
    icon: UserCheck,
    title: "حقوقك",
    items: [
      "الوصول إلى جميع بياناتك الشخصية المخزنة لدينا",
      "تعديل أو تحديث معلومات ملفك الشخصي في أي وقت",
      "طلب حذف حسابك وجميع بياناتك بشكل نهائي",
      "إلغاء تفعيل حسابك مؤقتاً دون فقدان البيانات",
      "الاعتراض على أي استخدام لبياناتك",
      "الحصول على نسخة من بياناتك بصيغة قابلة للقراءة",
    ],
  },
  {
    icon: Trash2,
    title: "حذف البيانات والاحتفاظ بها",
    items: [
      "يمكنك طلب حذف حسابك من خلال إعدادات الملف الشخصي",
      "عند الحذف، تُزال جميع بياناتك خلال 30 يوماً",
      "نحتفظ ببيانات المعاملات المالية وفقاً للمتطلبات القانونية",
      "يتم حذف رموز التحقق (OTP) تلقائياً بعد انتهاء صلاحيتها",
      "الحسابات غير النشطة لمدة سنة قد يتم حذفها بعد الإشعار",
    ],
  },
  {
    icon: Bell,
    title: "التحديثات والإشعارات",
    items: [
      "سنخطرك بأي تغييرات جوهرية على سياسة الخصوصية",
      "يمكنك التحكم في إعدادات الإشعارات من لوحة التحكم",
      "استمرارك في استخدام المنصة يعني موافقتك على السياسة المحدثة",
      "نحتفظ بحق تحديث هذه السياسة لتتوافق مع القوانين المعمول بها",
    ],
  },
];

/* ══════════════════════════════════════════════════════ */
/*               PRIVACY POLICY PAGE                     */
/* ══════════════════════════════════════════════════════ */

export default function PrivacyPage() {
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
              <Shield className="size-4 animate-pulse" />
              سياسة الخصوصية
            </div>

            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              <span className="bg-gradient-to-l from-primary via-primary/90 to-primary bg-clip-text text-transparent drop-shadow-sm">
                خصوصيتك
              </span>
              <span className="mx-3 text-muted-foreground/40 hidden sm:inline">—</span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                أولويتنا القصوى
              </span>
            </h1>

            <p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              نلتزم في منصة نصيبك بحماية بياناتك الشخصية وخصوصيتك. تشرح هذه
              السياسة كيف نجمع بياناتك ونستخدمها ونحميها.
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
                    <Shield className="size-6" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">مقدمة</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      منصة نصيبك (&ldquo;نحن&rdquo; أو &ldquo;المنصة&rdquo;) هي
                      منصة أردنية متخصصة في تيسير الزواج التقليدي. نحن نحترم
                      خصوصية مستخدمينا ونلتزم بحماية بياناتهم الشخصية وفقاً
                      لأعلى المعايير الأمنية والقوانين المعمول بها في المملكة
                      الأردنية الهاشمية. تنطبق هذه السياسة على جميع خدمات المنصة
                      بما في ذلك التسجيل، إنشاء الملفات الشخصية، التوافق، وتنسيق
                      الزيارات العائلية.
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

        {/* ═══════════════ CONTACT SECTION ═══════════════ */}
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
                  <Lock className="size-8 opacity-90" />
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">
                  لديك أسئلة حول الخصوصية؟
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed opacity-85">
                  إذا كان لديك أي استفسار حول سياسة الخصوصية أو كيفية تعاملنا مع
                  بياناتك، لا تتردد في التواصل معنا.
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
                    البريد: privacy@naseeb.jo
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
