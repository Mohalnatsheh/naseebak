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
  HeartHandshake,
  MessageCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { PageHeroPhoto } from "@/components/shared/page-hero-photo";
import { IslamicPatternBg } from "@/components/shared/islamic-pattern";

/* ──────────────────── DATA ──────────────────── */

/**
 * Terms follow the live switches: with credit on interest («مهتم» costs the credit, requests are
 * free, up to 5 open suggestions, refund on no answer) the suggestion, request, chat and credit
 * items read differently from the per-request mode.
 */
function buildSections(coi: boolean) {
  return [
  {
    icon: UserCheck,
    title: "التسجيل والأهلية",
    items: [
      "يجب ألا يقل عمر المستخدم عن 18 سنة، وأن يكون جادّاً في الزواج.",
      "يتم التسجيل برقم هاتف أردني فعّال، ويُؤكَّد الرقم برمز تحقق يُرسل في رسالة نصية قصيرة (SMS).",
      "لا يحق للمستخدم امتلاك أكثر من حساب واحد على المنصة.",
      "يلتزم المستخدم بتقديم معلومات صحيحة ودقيقة في ملفه الشخصي، وبأن تكون الصور التي يرفعها صوراً حقيقية له.",
      "قد تخضع بعض تعديلات الملف الشخصي لمراجعة فريق نصيبك قبل ظهورها.",
      "لا تتحقق المنصة من هوية المستخدمين بوثائق رسمية، ويقتصر التحقق على تأكيد رقم الهاتف.",
    ],
  },
  {
    icon: Sparkles,
    title: "الاقتراحات والتوافق المتبادل",
    items: [
      coi
        ? "تصل كل مستخدم اقتراحات مجانية باستمرار، بحد أقصى 5 اقتراحات مفتوحة في الوقت نفسه، وتُعرض على الطرفين في الوقت نفسه."
        : "تصل كل مستخدم اقتراحات مجانية بحد أقصى 3 اقتراحات أسبوعياً، وتُعرض على الطرفين في الوقت نفسه.",
      coi
        ? "يقرر كل طرف بشكل مستقل («مهتم» أو «لا»). يُبلَّغ المستخدم عندما يبدي الطرف الآخر اهتمامه به، ولا يُبلَّغ بقرار «لا» إلا إذا كان قد أبدى اهتمامه بالطرف الآخر قبل ذلك."
        : "يقرر كل طرف بشكل مستقل وسري («مهتم» أو «لا»)، ولا يُبلَّغ الطرف الآخر بقرارك في أي حال.",
      "لا يتحقق التوافق المتبادل إلا إذا أبدى الطرفان اهتمامهما، وعندها تظهر الصور والتفاصيل لكليهما.",
      "يُسجَّل القرار مرة واحدة ولا يمكن التراجع عنه، وتنتهي صلاحية الاقتراح بعد 7 أيام إذا لم يكتمل قرار الطرفين.",
      "يمكن للمستخدم تحديد بعض تفضيلاته «شروطاً أساسية» تُستبعد بموجبها الاقتراحات التي لا تحققها.",
      "نسب التوافق المعروضة تقديرات حسابية مبنية على التفضيلات ونتائج اختبار الشخصية واكتمال الملف، وليست ضماناً.",
    ],
  },
  {
    icon: HeartHandshake,
    title: "طلبات التعارف العائلي والمحادثة",
    items: [
      coi
        ? "بعد التوافق المتبادل يبدأ التعارف بالطريقة التي اختارها الطرفان مع «مهتم» (محادثة أو تعارف عائلي)، ويحق لأي منهما بعدها إرسال طلب تعارف عائلي أو طلب محادثة مجاناً، ويكون قبول الطلب أو رفضه بيد الطرف الآخر."
        : "بعد التوافق المتبادل يحق لأي من الطرفين إرسال طلب تعارف عائلي أو طلب محادثة قبل الزيارة، ويكون قبول الطلب أو رفضه بيد الطرف الآخر.",
      "يشترط لإرسال طلب التعارف العائلي أو قبوله إدخال بيانات ولي الأمر والموافقة على مشاركتها، وعند القبول يرى كل طرف اسم ولي أمر الطرف الآخر وصلة قرابته ورقم هاتفه.",
      "يقرّ المستخدم بأنه حصل على موافقة ولي أمره قبل إدخال بياناته والموافقة على مشاركتها، ويمكنه سحب هذه الموافقة من صفحة تعديل الملف الشخصي.",
      coi
        ? "تنتهي صلاحية الطلب الذي لا يُرد عليه خلال 7 أيام ويجوز إرساله مجدداً، أما الطلب المرفوض فيُعد نهائياً لهذا النوع من الطلبات على التوافق نفسه."
        : "تنتهي صلاحية الطلب الذي لا يُرد عليه خلال 7 أيام، ويجوز إرساله مجدداً برصيد جديد، أما الطلب المرفوض فيُعد نهائياً لهذا النوع من الطلبات على التوافق نفسه.",
      "تتولى العائلتان ترتيب الزيارة العائلية بنفسيهما، ولا تنظّم المنصة الزيارات ولا تحضرها.",
      "يحق لأي من الطرفين إنهاء التوافق في أي وقت، فيُغلق للطرفين وتنتهي المحادثة المفتوحة بينهما إن وجدت، ويُبلَّغ الطرف الآخر دون ذكر أي تفاصيل.",
      "بعد التعارف العائلي قد نسأل الطرفين عن نتيجته، وعند اختيار «تمت الخطبة» نتوقف عن إرسال اقتراحات جديدة لصاحب هذا الاختيار حتى يتراجع عنه.",
    ],
  },
  {
    icon: MessageCircle,
    title: "المحادثة داخل المنصة",
    items: [
      coi
        ? "تُفتح المحادثة عندما يختار الطرفان المحادثة مع «مهتم» أو بعد قبول طلب محادثة، وتكون نصية فقط بحد أقصى 1000 حرف للرسالة و50 رسالة يومياً."
        : "تُفتح المحادثة بعد قبول طلب المحادثة، وتكون نصية فقط بحد أقصى 1000 حرف للرسالة و50 رسالة يومياً.",
      "مدة المحادثة 14 يوماً، ويجوز لأي من الطرفين تمديدها مرة واحدة لمدة 7 أيام خلال الأيام الثلاثة الأخيرة، وبعد انتهاء المدة تصبح المحادثة للقراءة فقط.",
      "يُحظر تبادل أرقام الهواتف أو الروابط أو البريد الإلكتروني أو حسابات التواصل الاجتماعي، وتُفحص كل رسالة تلقائياً قبل إرسالها، فلا تُرسل ولا تُحفظ الرسالة المخالفة.",
      "يحق لأي من الطرفين إنهاء المحادثة في أي وقت، والإنهاء نهائي لا يمكن التراجع عنه.",
      "يمكن عند إنهاء المحادثة الإبلاغ عن الطرف الآخر، فيُحظر تلقائياً ويُحال البلاغ إلى فريق الإدارة.",
      "قد يطّلع فريق نصيبك المعتمد على رسائل المحادثة لأغراض الأمان والإشراف، كمراجعة البلاغات ومنع الإساءة والاحتيال والتحقق من الالتزام بهذه الشروط، وفق سياسة الخصوصية.",
      "يمكن الانتقال من المحادثة إلى طلب تعارف عائلي دون خصم رصيد، مرة واحدة لكل توافق.",
    ],
  },
  {
    icon: Ban,
    title: "السلوكيات المحظورة",
    items: [
      "تقديم معلومات شخصية كاذبة أو مضللة، أو استخدام صور لأشخاص آخرين.",
      "إنشاء أكثر من حساب واحد.",
      "محاولة التحايل على فحص الرسائل لتبادل بيانات التواصل داخل المحادثة.",
      "إدخال بيانات ولي أمر دون علمه وموافقته، أو إدخال بيانات غير صحيحة له.",
      "استخدام المنصة لأي غرض غير الزواج.",
      "التحرش أو الإساءة أو التهديد، أو استخدام ألفاظ غير لائقة مع أي مستخدم.",
      "محاولة اختراق المنصة أو الوصول غير المصرح به إلى البيانات.",
    ],
  },
  {
    icon: CreditCard,
    title: "الرصيد والمدفوعات",
    items: [
      ...(coi
        ? [
            "يحصل كل مستخدم جديد على 3 أرصدة مجانية عند التسجيل، والاقتراحات مجانية.",
            "يُخصم رصيد واحد عند اختيار «مهتم» على اقتراح، أما «لا» والتوافق والطلبات والمحادثة بعده فمجانية.",
            "يعود الرصيد إذا انتهت مدة الاقتراح (7 أيام) دون ردّ من الطرف الآخر، ولا يعود إذا كان ردّه بالرفض.",
          ]
        : [
            "يحصل كل مستخدم جديد على 3 أرصدة مجانية عند التسجيل، والاقتراحات الأسبوعية مجانية.",
            "يُخصم رصيد واحد من المُرسِل عند إرسال طلب تعارف عائلي أو طلب محادثة، أما قبول الطلب فمجاني.",
            "لا يُسترد الرصيد في حال رفض الطلب أو انتهاء مهلته دون رد.",
          ]),
      "يمكن شراء أرصدة إضافية من لوحة التحكم. الأسعار معروضة بالدينار الأردني، ويُحصَّل ما يعادلها بالدولار الأمريكي (المبلغ ظاهر تحت كل باقة) ببطاقات Visa وMastercard عبر Stripe.",
      "لا يوجد اشتراك شهري، ويبقى الرصيد المشترى في الحساب حتى استخدامه.",
      "المبالغ المدفوعة غير قابلة للاسترداد إلا في حالات استثنائية، ونحتفظ بحق تعديل الأسعار، ويُعرض السعر المعتمد قبل إتمام أي عملية شراء.",
    ],
  },
  {
    icon: ShieldAlert,
    title: "الإشراف والإيقاف وإنهاء الحساب",
    items: [
      "يتولى فريق الإدارة مراجعة البلاغات، وله إيقاف أي حساب يخالف هذه الشروط أو إنهاء أي محادثة دون إنذار مسبق.",
      "يمكن للمستخدم حظر أي مستخدم آخر في أي وقت، فتنتهي المحادثة بينهما إن وجدت، والإبلاغ عن أي مستخدم ظهر له في اقتراح أو توافق.",
      "يمكن للمستخدم تعطيل حسابه مؤقتاً وإعادة تفعيله لاحقاً، ويُنهي التعطيل أو طلب الحذف محادثاته المفتوحة ويُلغي طلباته المعلّقة، ويُبلَّغ الأطراف الأخرى بذلك.",
      "يمكن طلب حذف الحساب نهائياً، فيُعطَّل الحساب فوراً ويُحذف نهائياً بعد 30 يوماً، ويجوز إلغاء الطلب خلال هذه المدة.",
      "لا يحق المطالبة باسترداد المبالغ أو الأرصدة عند الإيقاف بسبب مخالفة، ونحتفظ بحق رفض إعادة تسجيل الحسابات الموقوفة.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "إخلاء المسؤولية",
    items: [
      "نصيبك منصة تيسير فقط، ولا تضمن إتمام أي زواج.",
      "لا تتحمل المنصة مسؤولية صحة المعلومات التي يقدمها المستخدمون، وننصح العائلات بالتحقق والتأني قبل أي خطوة.",
      "الزيارات العائلية وما يترتب عليها مسؤولية الأطراف وعائلاتهم وحدهم.",
      "لا تتحمل المنصة مسؤولية أي أضرار ناتجة عن استخدامها أو الاعتماد على المعلومات المعروضة فيها.",
    ],
  },
  {
    icon: RefreshCw,
    title: "التعديلات على الشروط",
    items: [
      "نحتفظ بحق تعديل هذه الشروط في أي وقت.",
      "سيُخطَر المستخدمون بأي تغييرات جوهرية عبر الإشعارات.",
      "يُعد استمرار استخدام المنصة بعد التعديل موافقةً على الشروط الجديدة.",
      "النسخة العربية من هذه الشروط هي المرجع المعتمد عند أي اختلاف.",
      "تخضع هذه الشروط للقوانين المعمول بها في المملكة الأردنية الهاشمية.",
    ],
  },
  ];
}

/* ══════════════════════════════════════════════════════ */
/*            TERMS & CONDITIONS PAGE                    */
/* ══════════════════════════════════════════════════════ */

export function TermsView({ creditOnInterest }: { creditOnInterest: boolean }) {
  const sections = buildSections(creditOnInterest);
  const { ref: introRef, inView: introInView } = useInView(0.15);
  const { ref: sectionsRef, inView: sectionsInView } = useInView(0.1);
  const { ref: contactRef, inView: contactInView } = useInView(0.15);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative min-h-[50vh] flex items-center justify-center pt-24">
          <PageHeroPhoto src="/images/pages/terms.webp" />
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
              <span className="mx-3 text-muted-foreground/40 hidden sm:inline">—</span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                استخدام المنصة
              </span>
            </h1>

            <p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              باستخدامك لمنصة نصيبك فإنك توافق على الالتزام بهذه الشروط
              والأحكام. يرجى قراءتها بعناية قبل التسجيل أو استخدام أي من
              خدماتنا.
            </p>

            <p
              className="mx-auto mt-4 text-sm text-muted-foreground/70"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.6s both" }}
            >
              آخر تحديث: 17 أكتوبر 2026
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
                    <FileText className="size-6" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">مقدمة</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      مرحباً بك في منصة نصيبك لتيسير الزواج. تحكم هذه الشروط
                      والأحكام استخدامك للمنصة وجميع خدماتها، وبتسجيلك في المنصة
                      أو استخدامها بأي شكل فإنك توافق على الالتزام بها كاملة؛ فإن
                      لم توافق على أي منها فيُرجى عدم استخدام المنصة. نصيبك منصة
                      أردنية تقترح على مستخدميها شركاء مناسبين، ولا يتم التوافق
                      إلا بموافقة الطرفين، ثم يكون التعارف بين العائلتين أو عبر
                      محادثة نصية قصيرة داخل المنصة قبل الزيارة العائلية. وهي ليست
                      تطبيق مواعدة، ولا تتولى ترتيب الزيارات بين العائلات.
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

        {/* ═══════════════ CTA SECTION ═══════════════ */}
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
