"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  Heart,
  Shield,
  Clock,
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
import { LoadError } from "@/components/shared/load-error";
import { qualifiesForSuggestions as qualifiesForSuggestionsGate } from "@/lib/profile-completeness";

/* ------------------------------------------------------------------ */
/*  Arabic date formatter                                              */
/* ------------------------------------------------------------------ */
function getArabicDate() {
  return new Date().toLocaleDateString("ar-JO-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const { profile, completeness, counts, loading, profileFailed, refreshProfile } = useDashboardData();
  const [retrying, setRetrying] = useState(false);
  // New cycle: suggestions are free, so "out of credits" no longer blocks suggestions
  const creditsBlockSuggestions = !counts.flags.introRequests;
  const [pendingSuggestions, setPendingSuggestions] = useState<number | null>(null);
  // Why nothing new came ("weekly_cap" | "no_candidates" | "pending" | null), from page 1 of /api/suggestions
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const female = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);
  // New cycle: finishing the short setup is enough; legacy: 50% completeness
  const qualifiesForSuggestions = qualifiesForSuggestionsGate({
    completenessTotal: completeness?.total ?? 0,
    isComplete: !!profile?.profile?.isComplete,
    newCycle: counts.flags.introRequests,
  });

  // Once the profile qualifies, page 1 of /api/suggestions also tops up suggestions automatically
  useEffect(() => {
    if (loading || !qualifiesForSuggestions) return;
    let cancelled = false;
    fetch("/api/suggestions?page=1")
      .then((r) => {
        if (!r.ok) throw new Error(`suggestions ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setSuggestionsFailed(false);
        setPendingSuggestions(d?.total ?? 0);
        setEmptyReason(typeof d?.emptyReason === "string" ? d.emptyReason : null);
      })
      // A failure is not "no suggestions": the next-step card says it couldn't load
      .catch(() => { if (!cancelled) setSuggestionsFailed(true); });
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

  // The profile didn't load: say so with a retry, never "finish your setup" with a 0% ring
  if (!profile) {
    return (
      <div className="py-12">
        <LoadError
          message={
            profileFailed
              ? "تعذّر تحميل بياناتك. تحقّق من الاتصال وحاول مرة أخرى."
              : "تعذّر تحميل البيانات. حاول مرة أخرى."
          }
          onRetry={
            retrying
              ? undefined
              : () => {
                  setRetrying(true);
                  refreshProfile().finally(() => setRetrying(false));
                }
          }
        />
      </div>
    );
  }

  // The verified badge is hidden everywhere user-facing in the new cycle (identity checks were removed)
  const isVerified = !counts.flags.introRequests && profile?.identityDoc?.status === "APPROVED";
  const actionableMatches = counts.actionableMatches ?? 0;
  const hasProfile = profile?.profile?.isComplete;
  const hasQuiz = !!profile?.personalityResult;

  /* Use server-computed completeness or fall back to old logic */
  const completionPercent = completeness?.total ?? Math.round(
    ([hasProfile, hasQuiz].filter(Boolean).length / 2) * 100
  );

  // Same number as the top bar and the next-step card
  const matchCreditsCount = counts.credits ?? profile?.matchCredits ?? 0;
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

  const levelLabel =
    completeness?.level === "excellent" ? "ممتاز" :
    completeness?.level === "strong" ? "قوي" :
    completeness?.level === "good" ? "جيد" :
    // New cycle: a finished short setup already gets suggestions, so don't call it a beginning
    counts.flags.introRequests && hasProfile ? "جاهز للاقتراحات" : "في البداية";
  const topTip = completeness?.tips?.[0];
  const stats = [
    // Credit on interest: credit is spent on «مهتم»; per-request: on family/chat requests
    { href: "/dashboard/payments", value: matchCreditsCount, label: creditsBlockSuggestions ? "رصيد الاقتراحات" : "رصيدك" },
    // Shared suggestions belong to both people, so "received" undercounts — show what's waiting instead
    {
      href: "/dashboard/suggestions",
      value: creditsBlockSuggestions ? receivedSuggestions : pendingSuggestions ?? 0,
      label: creditsBlockSuggestions ? "اقتراحات مستلمة" : "اقتراحات جديدة",
    },
    { href: "/dashboard/matches", value: matchesCount, label: "توافقات" },
  ];
  // Profile ring (r = 26 → circumference ≈ 163.4)
  const RING = 2 * Math.PI * 26;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* ============================================ */}
      {/*  Home header: greeting, the next step, counts */}
      {/* ============================================ */}
      <section className="landing-night relative overflow-hidden rounded-[2rem] p-5 text-white shadow-xl shadow-primary/20 sm:p-8">
        <div className="landing-khatam absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="text-sm font-medium text-white/60">{getArabicDate()}</p>
          <h1 className="font-display mt-2 text-[2rem] leading-tight sm:text-5xl">
            {getGreeting()}، {profile?.firstName || ""}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {motivational}
            {isVerified && <span className="ms-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">حساب موثّق</span>}
          </p>

          {/* The one thing to do next */}
          <div className="mt-6">
            <NextStepCard
              variant="hero"
              qualifies={qualifiesForSuggestions}
              pendingSuggestions={qualifiesForSuggestions ? pendingSuggestions : 0}
              matchesCount={matchesCount}
              credits={matchCreditsCount}
              emptyReason={emptyReason}
              suggestionsFailed={suggestionsFailed}
            />
          </div>

          <div className="mt-6 grid grid-cols-3">
            {stats.map((stat, i) => (
              <Link
                key={stat.href}
                href={stat.href}
                aria-label={`${stat.label}: ${stat.value}`}
                className={`flex min-h-14 flex-col items-center justify-center px-1 text-center transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${i > 0 ? "border-s border-white/15" : ""}`}
              >
                <span className="font-display text-3xl text-accent sm:text-4xl">{stat.value}</span>
                <span className="mt-0.5 text-xs font-medium text-white/70">{stat.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* One helper card at a time: guardian consent first, then installing the app */}
      {counts.flags.introRequests && counts.guardian?.exists && !counts.guardian.consented ? (
        <GuardianConsentCard />
      ) : (
        <InstallAppCard />
      )}

      {/* ============================================ */}
      {/*  Profile strength: ring, the best next tip, details folded */}
      {/* ============================================ */}
      <Card className="overflow-hidden border-border/50 shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90" aria-hidden>
                <circle cx="30" cy="30" r="26" fill="none" strokeWidth="6" className="stroke-muted" />
                <circle
                  cx="30"
                  cy="30"
                  r="26"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className={completionPercent === 100 ? "stroke-emerald-500" : "stroke-accent"}
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - completionPercent / 100)}
                />
              </svg>
              <span className="font-display absolute inset-0 flex items-center justify-center text-lg text-primary">{completionPercent}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-foreground">قوة ملفك الشخصي</h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{levelLabel}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {completionPercent === 100
                  ? g("ملفك مكتمل، وهذا يجعل اقتراحاتك أدق.", "ملفكِ مكتمل، وهذا يجعل اقتراحاتكِ أدق.")
                  : g("كلما اكتمل ملفك كانت اقتراحاتك أدق.", "كلما اكتمل ملفكِ كانت اقتراحاتكِ أدق.")}
              </p>
            </div>
          </div>

          {topTip && (
            <Link
              href={topTip.link}
              className="mt-4 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 transition-colors hover:bg-accent/15"
            >
              <Zap className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{topTip.message}</span>
              <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-bold text-primary">+{topTip.impact}%</span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-primary/50" aria-hidden />
            </Link>
          )}

          {completionPercent < 100 && (completeness?.sections?.length ?? 0) > 0 && (
            <details className="group mt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-1 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                تفاصيل الأقسام
                <ArrowLeft className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <div className="mt-1 space-y-2">
                {(completeness?.tips ?? []).slice(1).map((tip) => (
                  <Link key={tip.sectionKey} href={tip.link} className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5 hover:bg-muted/50">
                    <Zap className="h-4 w-4 shrink-0 text-primary/70" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm text-foreground">{tip.message}</span>
                    <span className="shrink-0 text-xs font-bold text-primary">+{tip.impact}%</span>
                  </Link>
                ))}
                {(completeness?.sections ?? []).map((section) => (
                  <Link key={section.key} href={section.link} className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5 hover:bg-muted/50">
                    {section.percentage === 100 ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <AlertCircle className="h-5 w-5 shrink-0 text-primary/60" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{section.label}</span>
                        <span className="text-xs font-bold text-primary">{section.percentage}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${section.percentage === 100 ? "bg-emerald-500" : "bg-primary/70"}`}
                          style={{ width: `${section.percentage}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/*  Activity feed / Timeline                    */}
      {/* ============================================ */}
      <div>
        <h2 className="font-display text-2xl text-primary mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-accent" aria-hidden />
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
                          "ar-JO-u-nu-latn"
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
                        // New cycle: only nudge while a match still waits for its introduction choice
                        desc: creditsBlockSuggestions
                          ? g("يمكنك الآن عرض الصور وطلب زيارة", "يمكنكِ الآن عرض الصور وطلب زيارة")
                          : actionableMatches > 0
                            ? g("اختر طريقة التعارف: تعارف عائلي أو محادثة", "اختاري طريقة التعارف: تعارف عائلي أو محادثة")
                            : "تابع التعارف من صفحة التوافقات",
                        time: !creditsBlockSuggestions && actionableMatches === 0 ? "قيد التعارف" : "جديد",
                      },
                    ]
                  : []),
                // Legacy: everything received. New cycle: the shared suggestions waiting for my decision
                // (`_count.receivedSuggestions` misses the ones where I'm the other side)
                ...(creditsBlockSuggestions && receivedSuggestions > 0
                  ? [
                      {
                        icon: Sparkles,
                        iconColor: "text-accent-foreground",
                        iconBg: "bg-accent/10",
                        title: `تلقيت ${arabicCount(receivedSuggestions, { one: "اقتراحاً", two: "اقتراحين", few: "اقتراحات", many: "اقتراحاً" })}`,
                        desc: g("راجع الاقتراحات واتخذ قرارك", "راجعي الاقتراحات واتخذي قرارك"),
                        time: "متاح",
                      },
                    ]
                  : !creditsBlockSuggestions && (pendingSuggestions ?? 0) > 0
                    ? [
                        {
                          icon: Sparkles,
                          iconColor: "text-accent-foreground",
                          iconBg: "bg-accent/10",
                          title: `${arabicCount(pendingSuggestions ?? 0, { one: "اقتراح واحد", two: "اقتراحان", few: "اقتراحات", many: "اقتراحاً" })} بانتظار قرارك`,
                          desc: g("راجع الاقتراحات واختر «مهتم» أو «لا»", "راجعي الاقتراحات واختاري «مهتم» أو «لا»"),
                          time: "بانتظارك",
                        },
                      ]
                    : []),
              ]
                // Newest and actionable first; account creation last
                .reverse()
                .map((item, i, arr) => (
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
                      {g("أكمل ملفك الشخصي للبدء في تلقي الاقتراحات", "أكملي ملفكِ الشخصي للبدء في تلقي الاقتراحات")}
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
