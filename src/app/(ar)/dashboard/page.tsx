"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  User,
  Sparkles,
  Heart,
  Bell,
  Shield,
  Brain,
  CreditCard,
  ChevronLeft,
  TrendingUp,
  Clock,
  Star,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/contexts/dashboard-context";
import { GuardianConsentCard } from "@/components/intro/guardian-consent-card";
import { PendingIntrosCard } from "@/components/intro/pending-intros-card";
import { SUGGESTIONS_MIN_COMPLETENESS } from "@/lib/profile-completeness";

/* ------------------------------------------------------------------ */
/*  Arabic date formatter                                              */
/* ------------------------------------------------------------------ */
function getArabicDate() {
  const now = new Date();
  const days = [
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  const months = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  return `${days[now.getDay()]}، ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/*  Profile completion ring (SVG circle)                               */
/* ------------------------------------------------------------------ */
function CompletionRing({
  percentage,
  size = 80,
}: {
  percentage: number;
  size?: number;
}) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/50"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.39 0.07 249)" />
            <stop offset="100%" stopColor="oklch(0.69 0.10 74)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-extrabold text-foreground">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Greeting by time of day                                            */
/* ------------------------------------------------------------------ */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 17) return "مساء الخير";
  return "مساء النور";
}

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */
export default function DashboardPage() {
  const { profile, completeness, unreadCount, counts, loading } = useDashboardData();
  // New cycle: suggestions are free, so "out of credits" no longer blocks suggestions
  const creditsBlockSuggestions = !counts.flags.introRequests;
  const [mounted, setMounted] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<number | null>(null);
  const [suggestionCredits, setSuggestionCredits] = useState<number | null>(null);
  const qualifiesForSuggestions = (completeness?.total ?? 0) >= SUGGESTIONS_MIN_COMPLETENESS;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Once the profile qualifies, page 1 of /api/suggestions also tops up suggestions automatically
  useEffect(() => {
    if (loading || !qualifiesForSuggestions) return;
    let cancelled = false;
    fetch("/api/suggestions?page=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setPendingSuggestions(d?.total ?? 0);
        if (typeof d?.credits === "number") setSuggestionCredits(d.credits);
      })
      .catch(() => { if (!cancelled) setPendingSuggestions(0); });
    return () => { cancelled = true; };
  }, [loading, qualifiesForSuggestions]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-muted animate-pulse" />
          <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-primary" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          جارٍ تحميل لوحة التحكم...
        </p>
      </div>
    );
  }

  const isVerified = profile?.identityDoc?.status === "APPROVED";
  const hasProfile = profile?.profile?.isComplete;
  const hasQuiz = !!profile?.personalityResult;

  /* Use server-computed completeness or fall back to old logic */
  const completionPercent = completeness?.total ?? Math.round(
    ([hasProfile, hasQuiz].filter(Boolean).length / 2) * 100
  );

  const matchCreditsCount = profile?.matchCredits || 0;
  const receivedSuggestions = profile?._count?.receivedSuggestions || 0;
  const matchesCount =
    (profile?._count?.matchesAsFemale || 0) +
    (profile?._count?.matchesAsMale || 0);

  const motivationalMessages = [
    "كل خطوة تقربك من النصيب المكتوب لك",
    "التوكل على الله أول خطوات التوفيق",
    "يسّر الله لك ما فيه الخير",
    "الخيرة فيما اختاره الله",
  ];
  const motivational =
    motivationalMessages[
      Math.floor(new Date().getDate() / 7) % motivationalMessages.length
    ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <PendingIntrosCard />
      <GuardianConsentCard />

      {/* Unread notifications banner */}
      {unreadCount > 0 && (
        <div className="mb-2">
        <Link href="/dashboard/notifications">
          <Card className="group relative overflow-hidden border-primary/30 bg-gradient-to-l from-primary/8 via-primary/5 to-transparent hover:shadow-md transition-all duration-300 cursor-pointer">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-primary/5 blur-2xl translate-x-4 -translate-y-4" />
            <CardContent className="pt-2.5 pb-2 flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <Bell className="h-5 w-5 text-primary" />
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground shadow-sm">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">
                    {unreadCount === 1 ? "لديك إشعار جديد" : `لديك ${unreadCount} إشعارات جديدة`}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    اضغط هنا لعرض الإشعارات
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-x-1 transition-all duration-300" />
            </CardContent>
          </Card>
        </Link>
        </div>
      )}

      {/* ============================================ */}
      {/*  Welcome banner                              */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-primary via-primary/90 to-secondary p-5 sm:p-10 text-primary-foreground shadow-xl shadow-primary/15">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 h-40 w-40 rounded-full bg-white/5 blur-2xl -translate-x-12 -translate-y-12" />
        <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-white/5 blur-2xl translate-x-8 translate-y-8" />
        <div className="absolute top-1/2 left-1/3 h-24 w-24 rounded-full bg-accent/10 blur-xl" />
        {/* Gold accent circle */}
        <div className="absolute top-4 end-4 h-20 w-20 rounded-full bg-accent/15 blur-2xl" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="space-y-3">
            <p className="text-primary-foreground/70 text-sm font-medium">
              {getArabicDate()}
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
              {getGreeting()}، {profile?.firstName || ""}
            </h1>
            <p className="text-primary-foreground/80 text-sm leading-relaxed max-w-md">
              {motivational}
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
              {profile?.firstName?.charAt(0) || "?"}
            </div>
            <div className="text-sm">
              <p className="font-bold">
                {profile?.firstName} {profile?.lastName}
              </p>
              <p className="text-primary-foreground/60 text-xs">
                {isVerified ? "حساب موثّق" : "حسابك في نصيبك"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/*  "Account must be completed" banner           */}
      {/* ============================================ */}
      {completionPercent < SUGGESTIONS_MIN_COMPLETENESS && (
        <Card className="relative overflow-hidden border-accent/40 bg-gradient-to-l from-accent/10 via-accent/5 to-transparent shadow-md">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-accent/10 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 border border-accent/20">
                <AlertCircle className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">
                  أكمل حسابك بنسبة {SUGGESTIONS_MIN_COMPLETENESS}% لتلقي اقتراحات التوافق
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  لن تتمكن من تلقي أو عرض الاقتراحات قبل الوصول إلى {SUGGESTIONS_MIN_COMPLETENESS}% ({completionPercent}% مكتمل حالياً)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/*  Suggestions status (profile qualifies)       */}
      {/* ============================================ */}
      {creditsBlockSuggestions && qualifiesForSuggestions && pendingSuggestions === 0 && suggestionCredits === 0 && (
        <Link href="/dashboard/payments" className="block">
          <Card className="group relative overflow-hidden border-amber-300/70 bg-gradient-to-l from-amber-50 via-amber-50/60 to-transparent shadow-md hover:shadow-lg transition-all duration-300">
            <CardContent className="pt-5 pb-4 flex items-center gap-3 sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 border border-amber-200 text-amber-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-amber-900 text-sm sm:text-base">انتهى رصيد اقتراحاتك</h3>
                <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                  اشحن رصيدك لتستمر باستلام اقتراحات جديدة تناسبك.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
                اشحن رصيدك
                <ChevronLeft className="h-4 w-4" />
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      {qualifiesForSuggestions && !(creditsBlockSuggestions && pendingSuggestions === 0 && suggestionCredits === 0) && (
        <Link href="/dashboard/suggestions" className="block">
          <Card className="group relative overflow-hidden border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent shadow-md hover:shadow-lg transition-all duration-300">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl translate-x-6 -translate-y-6" />
            <CardContent className="pt-5 pb-4 flex items-center gap-3 sm:gap-4 relative">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-md">
                {pendingSuggestions === null ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-sm sm:text-base">
                  {pendingSuggestions === null
                    ? "جارٍ تجهيز اقتراحاتك..."
                    : pendingSuggestions === 1
                      ? "لديك اقتراح توافق جديد"
                      : pendingSuggestions > 1
                        ? `لديك ${pendingSuggestions} اقتراحات توافق جديدة`
                        : "ملفك جاهز، ونبحث لك عن اقتراحات مناسبة"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {pendingSuggestions && pendingSuggestions > 0
                    ? "اطّلع عليها الآن وقرّر بالقبول أو الرفض"
                    : completionPercent < 100
                      ? "سنرسل لك إشعاراً فور وصول اقتراح جديد. إكمال ملفك يجعل الاقتراحات أدق"
                      : "سنرسل لك إشعاراً فور وصول اقتراح جديد"}
                </p>
              </div>
              <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
                عرض الاقتراحات
                <ChevronLeft className="h-4 w-4" />
              </span>
              <ChevronLeft className="sm:hidden h-5 w-5 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* ============================================ */}
      {/*  Profile Strength Indicator (gamified)          */}
      {/* ============================================ */}
      <Card className="relative overflow-hidden border-border/40 shadow-md">
        <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/5 blur-2xl translate-x-8 -translate-y-8" />
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-4 mb-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-md ${
              completeness?.level === "excellent" ? "bg-gradient-to-br from-emerald-500 to-emerald-600" :
              completeness?.level === "strong" ? "bg-gradient-to-br from-primary to-secondary" :
              completeness?.level === "good" ? "bg-gradient-to-br from-amber-500 to-amber-600" :
              "bg-gradient-to-br from-destructive to-destructive/70"
            } text-white`}>
              <Zap className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-foreground text-base">قوة الملف الشخصي</h3>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  completeness?.level === "excellent" ? "bg-emerald-100 text-emerald-700" :
                  completeness?.level === "strong" ? "bg-primary/10 text-primary" :
                  completeness?.level === "good" ? "bg-amber-100 text-amber-700" :
                  "bg-destructive/10 text-destructive"
                }`}>
                  {completeness?.level === "excellent" ? "ممتاز" :
                   completeness?.level === "strong" ? "قوي" :
                   completeness?.level === "good" ? "جيد" : "ضعيف"}
                </span>
              </div>
              {/* Strength bar */}
              <div className="h-3 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    completeness?.level === "excellent" ? "bg-gradient-to-l from-emerald-500 to-emerald-400" :
                    completeness?.level === "strong" ? "bg-gradient-to-l from-primary to-secondary" :
                    completeness?.level === "good" ? "bg-gradient-to-l from-amber-500 to-amber-400" :
                    "bg-gradient-to-l from-destructive to-destructive/70"
                  }`}
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{completionPercent}% مكتمل</p>
            </div>
          </div>

          {/* Tips for improvement */}
          {completeness?.tips && completeness.tips.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">نصائح لتحسين ملفك:</p>
              {completeness.tips.map((tip: any) => (
                <Link key={tip.sectionKey} href={tip.link} className="block">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border border-primary/10 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{tip.message}</p>
                    </div>
                    <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
                      +{tip.impact}%
                    </span>
                    <ArrowLeft className="h-4 w-4 text-primary/40 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Section progress bars — only when not 100% */}
          {completionPercent < 100 && (
            <div className="space-y-2 mt-4">
              {(completeness?.sections ?? []).map((section: any) => (
                <Link key={section.key} href={section.link} className="block">
                  <div className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                    section.percentage === 100
                      ? "bg-emerald-50/60 border-emerald-200/50"
                      : "bg-primary/[0.03] border-primary/10 hover:bg-primary/[0.06]"
                  }`}>
                    {section.percentage === 100 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-primary/60 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${section.percentage === 100 ? "text-emerald-800" : "text-foreground"}`}>
                          {section.label}
                        </span>
                        <span className={`text-xs font-bold ${section.percentage === 100 ? "text-emerald-600" : "text-primary"}`}>
                          {section.percentage}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            section.percentage === 100 ? "bg-emerald-500" : "bg-primary/70"
                          }`}
                          style={{ width: `${section.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/*  Stats grid                                  */}
      {/* ============================================ */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          {
            value: matchCreditsCount,
            label: creditsBlockSuggestions ? "رصيد الاقتراحات" : "رصيد التعارف",
            icon: Sparkles,
            gradient: "from-primary to-secondary",
            bgLight: "from-primary/10 to-secondary/5",
            textColor: "text-primary",
            shadowColor: "shadow-primary/10",
          },
          {
            value: receivedSuggestions,
            label: "اقتراحات مستلمة",
            icon: Star,
            gradient: "from-accent to-accent/70",
            bgLight: "from-accent/10 to-accent/5",
            textColor: "text-accent-foreground",
            shadowColor: "shadow-accent/10",
          },
          {
            value: matchesCount,
            label: "توافقات",
            icon: Heart,
            gradient: "from-secondary to-primary",
            bgLight: "from-secondary/10 to-primary/5",
            textColor: "text-primary",
            shadowColor: "shadow-primary/10",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className={`group relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgLight} hover:shadow-lg ${stat.shadowColor} transition-all duration-300 hover:-translate-y-1`}
          >
            <CardContent className="pt-4 pb-3 px-2 sm:pt-5 sm:pb-4 sm:px-4 text-center relative">
              {/* Decorative circle */}
              <div className="absolute -top-6 -left-6 h-16 w-16 rounded-full bg-gradient-to-br opacity-5 group-hover:opacity-10 transition-opacity" />

              <div
                className={`mx-auto mb-2 sm:mb-3 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
              >
                <stat.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <p className={`text-2xl sm:text-3xl font-extrabold ${stat.textColor} mb-0.5`}>
                {stat.value}
              </p>
              <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground">
                {stat.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ============================================ */}
      {/*  Quick actions                               */}
      {/* ============================================ */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          الإجراءات السريعة
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              href: "/dashboard/suggestions",
              icon: Sparkles,
              label: "عرض الاقتراحات",
              desc: "اكتشف اقتراحات التوافق المخصصة لك",
              gradient: "from-primary to-secondary",
              hoverBorder: "hover:border-primary/30",
            },
            {
              href: "/dashboard/profile",
              icon: User,
              label: "الملف الشخصي",
              desc: "عرض ملفك الشخصي",
              gradient: "from-secondary to-primary",
              hoverBorder: "hover:border-secondary/30",
            },
            {
              href: "/dashboard/personality-quiz",
              icon: Brain,
              label: "اختبار الشخصية",
              desc: "أكمل الاختبار لتحسين جودة التوافق",
              gradient: "from-primary to-primary/70",
              hoverBorder: "hover:border-primary/30",
            },
            {
              href: "/dashboard/payments",
              icon: CreditCard,
              label: creditsBlockSuggestions ? "رصيد الاقتراحات" : "رصيد التعارف",
              desc: creditsBlockSuggestions
                ? "اشتري رصيد لرؤية تفاصيل التوافقات"
                : "كل طلب تعارف عائلي أو محادثة يستخدم رصيداً واحداً",
              gradient: "from-accent to-accent/70",
              hoverBorder: "hover:border-accent/30",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card
                className={`group relative overflow-hidden border-border/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer ${item.hoverBorder}`}
              >
                {/* Subtle gradient overlay on hover */}
                <div
                  className={`absolute inset-0 bg-gradient-to-l ${item.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300`}
                />
                <CardContent className="pt-5 pb-4 flex items-center justify-between relative">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white shadow-md transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}
                    >
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground group-hover:text-foreground/90">
                        {item.label}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:-translate-x-1 transition-all duration-300" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/*  Activity feed / Timeline                    */}
      {/* ============================================ */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          آخر النشاطات
        </h2>
        <Card className="border-border/40 shadow-sm overflow-hidden">
          <CardContent className="pt-5 pb-3">
            {/* Timeline items */}
            <div className="space-y-0">
              {[
                ...(profile?.createdAt
                  ? [
                      {
                        icon: CheckCircle2,
                        iconColor: "text-emerald-500",
                        iconBg: "bg-emerald-50",
                        title: "تم إنشاء الحساب",
                        desc: "مرحباً بك في منصة نصيبك",
                        time: new Date(profile.createdAt).toLocaleDateString(
                          "ar-JO"
                        ),
                      },
                    ]
                  : []),
                ...(!isVerified
                  ? []
                  : [
                      {
                        icon: Shield,
                        iconColor: "text-emerald-500",
                        iconBg: "bg-emerald-50",
                        title: "تم التحقق من الهوية",
                        desc: "حسابك موثّق ومفعّل بالكامل",
                        time: "مكتمل",
                      },
                    ]),
                ...(matchesCount > 0
                  ? [
                      {
                        icon: Heart,
                        iconColor: "text-primary",
                        iconBg: "bg-primary/10",
                        title: `لديك ${matchesCount} توافق متبادل`,
                        desc: creditsBlockSuggestions ? "يمكنك الآن عرض الصور وطلب زيارة" : "اختر طريقة التعارف: تعارف عائلي أو محادثة",
                        time: "جديد",
                      },
                    ]
                  : []),
                ...(receivedSuggestions > 0
                  ? [
                      {
                        icon: Sparkles,
                        iconColor: "text-accent-foreground",
                        iconBg: "bg-accent/10",
                        title: `تلقيت ${receivedSuggestions} اقتراح`,
                        desc: "راجع الاقتراحات واتخذ قرارك",
                        time: "متاح",
                      },
                    ]
                  : []),
              ].map((item, i, arr) => (
                <div key={i} className="flex gap-4">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}
                    >
                      <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                    </div>
                    {i < arr.length - 1 && (
                      <div className="w-px flex-1 bg-border/60 my-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className={`pb-5 ${i === arr.length - 1 ? "pb-1" : ""}`}>
                    <p className="text-sm font-bold text-foreground">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.desc}
                    </p>
                    <span className="inline-block mt-1.5 text-[10px] font-medium text-muted-foreground/70 bg-muted/50 rounded-full px-2 py-0.5">
                      {item.time}
                    </span>
                  </div>
                </div>
              ))}

              {/* If no activity at all */}
              {!profile?.createdAt &&
                matchesCount === 0 &&
                receivedSuggestions === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">لا توجد نشاطات بعد</p>
                    <p className="text-xs mt-1">
                      أكمل ملفك الشخصي للبدء في تلقي الاقتراحات
                    </p>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================ */}
      {/*  Extra actions footer                        */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/dashboard/matches">
          <Card className="group border-border/40 hover:border-primary/20 hover:shadow-md transition-all duration-300 cursor-pointer">
            <CardContent className="pt-5 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                  <Heart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">التوافقات المتبادلة</h3>
                  <p className="text-[11px] text-muted-foreground">
                    عرض جميع التوافقات
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-x-1 transition-all" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/notifications">
          <Card className="group border-border/40 hover:border-primary/20 hover:shadow-md transition-all duration-300 cursor-pointer">
            <CardContent className="pt-5 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground shadow-sm">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold">الإشعارات</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {unreadCount > 0
                      ? `${unreadCount} إشعار${unreadCount > 1 ? "ات" : ""} غير مقروء${unreadCount > 1 ? "ة" : ""}`
                      : "عرض جميع الإشعارات"}
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-x-1 transition-all" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
