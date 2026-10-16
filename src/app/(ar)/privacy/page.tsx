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
  Users,
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
      "بيانات التسجيل: الاسم الأول واسم العائلة والجنس ورقم الهاتف، إضافة إلى رموز التحقق المؤقتة المرسلة إليه.",
      "بيانات الملف الشخصي التي تُدخلها: تاريخ الميلاد والجنسية والمدينة والتعليم والعمل والحالة الاجتماعية والتديّن وغيرها، وتفضيلاتك في الشريك و«شروطك الأساسية».",
      "نتائج اختبار الشخصية إن أجريته، والصور التي ترفعها بنفسك.",
      "بيانات ولي الأمر: الاسم وصلة القرابة ورقم الهاتف، والعنوان والملاحظات إن أدخلتها، وتاريخ موافقتك على مشاركة بيانات التواصل.",
      "قراراتك على الاقتراحات، وطلبات التعارف العائلي والمحادثة التي ترسلها أو تستقبلها وحالتها.",
      "رسائل المحادثة النصية وتاريخ إرسالها وحالة قراءتها.",
      "سجل الرصيد والمدفوعات (الباقة والمبلغ والحالة)، أما بيانات البطاقة فتُدخل مباشرة لدى Stripe ولا نخزّنها على خوادمنا.",
      "البلاغات وقوائم الحظر، وطلبات الدعم، ومعرّف جهازك لدى خدمة الإشعارات، وبيانات استخدام إحصائية عامة للموقع.",
    ],
  },
  {
    icon: Eye,
    title: "كيف نستخدم بياناتك",
    items: [
      "إنشاء حسابك وتسجيل دخولك عبر رمز تحقق يُرسل إلى هاتفك.",
      "حساب نسب التوافق وإرسال الاقتراحات الأسبوعية إليك وإلى الطرف الآخر في الوقت نفسه.",
      "تنفيذ طلبات التعارف العائلي ومشاركة بيانات ولي الأمر عند القبول وبموافقتك.",
      "تشغيل المحادثة داخل المنصة، وفحص الرسائل تلقائياً لحجب بيانات التواصل والروابط، وإيصالها لحظياً.",
      "إرسال الإشعارات داخل المنصة والإشعارات الفورية عن الاقتراحات والتوافقات والطلبات والمحادثات والرصيد.",
      "معالجة المدفوعات وإدارة الرصيد وسجله.",
      "مراجعة البلاغات وتعديلات الملف الشخصي، ومنع إساءة استخدام المنصة.",
      "تحسين خدماتنا وقياس استخدام الموقع بصورة إجمالية.",
    ],
  },
  {
    icon: Users,
    title: "ما يظهر للمستخدمين الآخرين",
    items: [
      "يظهر في بطاقة الاقتراح اسمك الأول وتفاصيل ملفك (كالعمر والمدينة والتعليم والعمل) ونسبة التوافق، ولا يظهر اسم عائلتك ولا رقم هاتفك لأي مستخدم.",
      "قرارك على الاقتراح سرّي، ولا يُبلَّغ الطرف الآخر به ما لم يتحقق التوافق المتبادل.",
      "لا تظهر صورك إلا للطرف الذي تم التوافق المتبادل بينك وبينه.",
      "لا تظهر بيانات ولي الأمر (الاسم وصلة القرابة ورقم الهاتف) للطرف الآخر إلا بعد قبول طلب تعارف عائلي بينكما، وبشرط موافقتك المسجّلة على المشاركة، ولا يظهر العنوان ولا الملاحظات.",
      "يمكنك سحب موافقتك على المشاركة من صفحة تعديل الملف الشخصي، فلا تُعرض بياناته بعد ذلك، مع العلم بأن ما اطّلع عليه الطرف الآخر سابقاً قد يكون محفوظاً لديه.",
      "لا يرى رسائل المحادثة إلا طرفاها.",
    ],
  },
  {
    icon: Lock,
    title: "حماية البيانات",
    items: [
      "تُنقل البيانات عبر اتصال مشفّر (HTTPS)، ويتم الدخول برمز تحقق لمرة واحدة (OTP) دون كلمات مرور.",
      "لا يرسل المتصفح رسائل المحادثة إلى خدمة التوصيل اللحظي مباشرة، بل تُحفظ على خوادمنا أولاً، ويحصل كل مستخدم على صلاحية استقبال لمحادثاته فقط.",
      "تُفحص رسائل المحادثة قبل حفظها، فلا تُحفظ الرسالة التي تحتوي على أرقام هواتف أو روابط أو بريد إلكتروني أو حسابات تواصل.",
      "تقتصر صلاحية الوصول إلى البيانات الكاملة على فريق الإدارة المعتمد، ولا تعرض لوحة الإدارة محتوى رسائل المحادثة، بل بياناتها الوصفية فقط (الطرفان والتواريخ والحالة وعدد الرسائل).",
      "نراجع أنظمة الأمان والحماية بصورة دورية.",
    ],
  },
  {
    icon: Share2,
    title: "مشاركة البيانات ومزوّدو الخدمة",
    items: [
      "لا نبيع بياناتك الشخصية ولا نؤجّرها لأي طرف ثالث.",
      "تُشارَك بياناتك مع المستخدم الذي تم التوافق معه، ومع عائلته عبر بيانات ولي الأمر، على النحو الموضح أعلاه فقط.",
      "نستعين بمزوّدي خدمة يعالجون البيانات بالقدر اللازم لتقديم الخدمة: Stripe لمعالجة المدفوعات، وBroadnet لإرسال رسائل التحقق النصية، وOneSignal للإشعارات الفورية، وAbly لتوصيل رسائل المحادثة لحظياً، وBunny.net لتخزين الصور، إضافة إلى مزوّد استضافة الخوادم وقاعدة البيانات.",
      "نستخدم أدوات قياس مثل Google Analytics، وقد نفعّل Google Tag Manager وMeta Pixel، لقياس زيارات الموقع، ولا نرسل إليها بيانات ملفك أو رسائلك.",
      "قد نُفصح عن البيانات للجهات المختصة إذا اقتضى القانون ذلك.",
    ],
  },
  {
    icon: Trash2,
    title: "الاحتفاظ بالبيانات وحذفها",
    items: [
      "نحتفظ ببياناتك ما دام حسابك قائماً.",
      "تبقى المحادثة بعد انتهائها أو إنهائها متاحة للطرفين للقراءة فقط، ما لم يُحذف حساب أحدهما.",
      "يمكنك تعطيل حسابك مؤقتاً من صفحة ملفك الشخصي وإعادة تفعيله لاحقاً دون فقدان بياناتك.",
      "يمكنك طلب حذف حسابك من صفحة ملفك الشخصي، فيُعطَّل فوراً، ويمكنك إلغاء الطلب خلال 30 يوماً، وبعدها يُحذف الحساب نهائياً مع ملفك وصورك وبيانات ولي الأمر والاقتراحات والتوافقات والطلبات والمحادثات ورسائلها والإشعارات وسجل الرصيد والمدفوعات لدينا.",
      "تحتفظ Stripe بسجلات عمليات الدفع وفقاً لسياساتها والمتطلبات القانونية المعمول بها.",
      "رموز التحقق مؤقتة وتنتهي صلاحيتها خلال مدة قصيرة.",
    ],
  },
  {
    icon: UserCheck,
    title: "حقوقك",
    items: [
      "الاطلاع على بيانات ملفك الشخصي وتعديلها من لوحة التحكم في أي وقت.",
      "سحب موافقتك على مشاركة بيانات ولي الأمر أو تعديل تلك البيانات.",
      "التحكم في أنواع الإشعارات التي تصلك من صفحة الإشعارات، أو إيقاف الإشعارات الفورية من إعدادات جهازك.",
      "حظر أي مستخدم أو الإبلاغ عنه، وإنهاء أي محادثة في أي وقت.",
      "تعطيل حسابك مؤقتاً أو طلب حذفه نهائياً.",
      "طلب نسخة من بياناتك أو الاستفسار عن طريقة معالجتها أو الاعتراض عليها بمراسلتنا على info@naseebak.com.",
    ],
  },
  {
    icon: Bell,
    title: "الإشعارات والتحديثات",
    items: [
      "تصلك الإشعارات داخل المنصة، والإشعارات الفورية عبر OneSignal إذا سمحت بها في متصفحك أو جهازك.",
      "تصل إشعارات رسائل المحادثة إشعاراتٍ فوريةً فقط، بحد أقصى إشعار واحد لكل محادثة كل 3 دقائق.",
      "سنُخطرك بأي تغييرات جوهرية على سياسة الخصوصية، ويُعد استمرارك في استخدام المنصة موافقةً على السياسة المحدّثة.",
      "نحتفظ بحق تحديث هذه السياسة لتتوافق مع القوانين المعمول بها في المملكة الأردنية الهاشمية.",
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
              آخر تحديث: 16 أكتوبر 2026
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
                      منصة نصيبك (&ldquo;نحن&rdquo; أو &ldquo;المنصة&rdquo;) منصة
                      أردنية متخصصة في تيسير الزواج. نحترم خصوصية مستخدمينا
                      ونلتزم بحماية بياناتهم الشخصية وفقاً للقوانين المعمول بها
                      في المملكة الأردنية الهاشمية. تنطبق هذه السياسة على جميع
                      خدمات المنصة، بما في ذلك التسجيل وإنشاء الملف الشخصي
                      والاقتراحات والتوافق المتبادل وطلبات التعارف العائلي
                      والمحادثة داخل المنصة والمدفوعات والإشعارات.
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
