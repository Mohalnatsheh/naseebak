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
import { arabicCount } from "@/lib/utils";
import { GuardianConsentCard } from "@/components/intro/guardian-consent-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { InstallAppCard } from "@/components/shared/install-app-card";
import { SUGGESTIONS_MIN_COMPLETENESS, qualifiesForSuggestions as qualifiesForSuggestionsGate } from "@/lib/profile-completeness";

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
  return "مساء الخير";
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
  // New cycle: finishing the short setup is enough; legacy: 50% completeness
  const qualifiesForSuggestions = qualifiesForSuggestionsGate({
    completenessTotal: completeness?.total ?? 0,
    isComplete: !!profile?.profile?.isComplete,
    newCycle: counts.flags.introRequests,
  });

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

      {/* The one thing to do next */}
      <NextStepCard
        qualifies={qualifiesForSuggestions}
        pendingSuggestions={qualifiesForSuggestions ? pendingSuggestions : 0}
        matchesCount={matchesCount}
        credits={matchCreditsCount}
      />

      {/* One helper card at a time: guardian consent first, then installing the app */}
      {counts.flags.introRequests && counts.guardian?.exists && !counts.guardian.consented ? (
        <GuardianConsentCard />
      ) : (
        <InstallAppCard />
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
              "bg-gradient-to-br from-accent to-accent/70"
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
                  "bg-accent/15 text-accent-foreground"
                }`}>
                  {completeness?.level === "excellent" ? "ممتاز" :
                   completeness?.level === "strong" ? "قوي" :
                   completeness?.level === "good" ? "جيد" : "في البداية"}
                </span>
              </div>
              {/* Strength bar */}
              <div className="h-3 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    completeness?.level === "excellent" ? "bg-gradient-to-l from-emerald-500 to-emerald-400" :
                    completeness?.level === "strong" ? "bg-gradient-to-l from-primary to-secondary" :
                    completeness?.level === "good" ? "bg-gradient-to-l from-amber-500 to-amber-400" :
                    "bg-gradient-to-l from-accent to-accent/70"
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
            // Shared suggestions belong to both people, so "received" undercounts — show what's waiting instead
            value: creditsBlockSuggestions ? receivedSuggestions : pendingSuggestions ?? 0,
            label: creditsBlockSuggestions ? "اقتراحات مستلمة" : "اقتراحات جديدة",
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
                        title: `لديك ${arabicCount(matchesCount, { one: "توافق متبادل", two: "توافقان متبادلان", few: "توافقات متبادلة", many: "توافقاً متبادلاً" })}`,
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
                        title: `تلقيت ${arabicCount(receivedSuggestions, { one: "اقتراحاً", two: "اقتراحين", few: "اقتراحات", many: "اقتراحاً" })}`,
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

    </div>
  );
}
