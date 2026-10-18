"use client";

import { useState, useEffect, useEffectEvent, useMemo } from "react";
import Link from "next/link";
import {
  Loader2,
  Brain,
  CheckCircle2,
  Clock,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Zap,
  Heart,
  Eye,
  Palette,
  RefreshCw,
  CalendarClock,
  Send,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FirstVisitTip } from "@/components/shared/first-visit-tip";
import { trackEvent } from "@/lib/analytics";
import { arabicCount } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";

interface Question {
  id: string;
  text: string;
  dimension: string;
}

interface QuizResult {
  personalityType: string;
  vector: number[];
  completedAt: string;
  canRetake: boolean;
  daysRemaining: number;
  retakeDate: string;
}

const scaleLabels = ["لا أوافق إطلاقاً", "لا أوافق", "محايد", "أوافق", "أوافق بشدة"];

const dimensionLabels: Record<string, string> = {
  extraversion: "الاجتماعية",
  conscientiousness: "الالتزام والتنظيم",
  agreeableness: "التفاهم والانسجام",
  neuroticism: "الاستقرار العاطفي",
  openness: "الانفتاح والتطوير",
};

const dimensionConfig: Record<string, { gradient: string; bg: string; icon: typeof Zap; color: string }> = {
  extraversion: {
    gradient: "from-secondary to-secondary/80",
    bg: "bg-secondary/10",
    icon: Zap,
    color: "text-secondary",
  },
  conscientiousness: {
    gradient: "from-primary to-primary/80",
    bg: "bg-primary/10",
    icon: CheckCircle2,
    color: "text-primary",
  },
  agreeableness: {
    gradient: "from-primary/80 to-primary/60",
    bg: "bg-primary/10",
    icon: Heart,
    color: "text-primary",
  },
  neuroticism: {
    gradient: "from-secondary/80 to-secondary/60",
    bg: "bg-secondary/10",
    icon: Eye,
    color: "text-secondary",
  },
  openness: {
    gradient: "from-accent to-accent/80",
    bg: "bg-accent/10",
    icon: Palette,
    color: "text-accent-foreground",
  },
};

const dimensionKeys = ["extraversion", "conscientiousness", "agreeableness", "neuroticism", "openness"];

const QUESTIONS_PER_PAGE = 4;

export default function PersonalityQuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [existingResult, setExistingResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);

  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const currentQuestions = useMemo(
    () => questions.slice(currentPage * QUESTIONS_PER_PAGE, (currentPage + 1) * QUESTIONS_PER_PAGE),
    [questions, currentPage]
  );

  const answeredCount = Object.keys(answers).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Check if all questions on the current page are answered
  const currentPageComplete = currentQuestions.every((q) => answers[q.id] !== undefined);

  // Scroll to top when page changes (after React re-renders)
  // Runs on page changes only; reads the latest showQuiz without re-running when it toggles
  const onPageChange = useEffectEvent((page: number) => {
    if (page > 0 || showQuiz) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  useEffect(() => {
    onPageChange(currentPage);
  }, [currentPage]);

  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const female = useDashboardData().profile?.gender === "FEMALE";

  useEffect(() => {
    async function load() {
      setLoadFailed(false);
      try {
        const res = await fetch("/api/profile/personality-quiz");
        if (!res.ok) throw new Error(`quiz ${res.status}`);
        const data = await res.json();
        setQuestions(data.questions || []);
        if (data.result) {
          setExistingResult(data.result);
        }
      } catch (err) {
        console.error(err);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reloadKey]);

  function handleRetake() {
    setExistingResult(null);
    setAnswers({});
    setCurrentPage(0);
    setShowQuiz(true);
    setError("");
  }

  async function handleSubmit() {
    if (answeredCount < questions.length) {
      setError("يرجى الإجابة عن جميع الأسئلة");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/profile/personality-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }
      trackEvent("personality_quiz_completed");

      // Reload from server to get full result with retake info
      const refreshRes = await fetch("/api/profile/personality-quiz");
      const refreshData = await refreshRes.json();
      if (refreshData.result) {
        setExistingResult(refreshData.result);
      }
      setShowQuiz(false);
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-secondary/20 to-primary/10 flex items-center justify-center">
            <Brain className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جارٍ تحميل اختبار الشخصية...</p>
      </div>
    );
  }

  // --- Result Screen ---
  // The questions didn't load: an empty quiz would show "0 of 0" and let an empty submit through
  if (!existingResult && (loadFailed || questions.length === 0)) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <LoadError
          message="تعذّر تحميل أسئلة الاختبار. تحقّق من الاتصال وحاول مرة أخرى."
          onRetry={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  if (existingResult && !showQuiz) {
    const completedDate = new Date(existingResult.completedAt);
    const formattedDate = completedDate.toLocaleDateString("ar-JO-u-nu-latn", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="max-w-2xl mx-auto space-y-8 pb-8">
        <PageHeader
          icon={Brain}
          title="نتيجة اختبار الشخصية"
          description={
            <span className="inline-flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-primary/60" aria-hidden="true" />
              <span>تاريخ الاختبار: {formattedDate}</span>
            </span>
          }
        >
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2 text-accent-foreground">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-lg font-bold">{existingResult.personalityType}</span>
          </span>
        </PageHeader>

        {/* Dimension Scores */}
        {existingResult.vector && existingResult.vector.length === 5 && (
          <div
            className="space-y-4"
            style={{ animation: "fadeSlideIn 0.5s ease-out 0.15s both" }}
          >
            <div className="flex items-center gap-2 justify-center mb-2">
              <BarChart3 className="h-5 w-5 text-primary/70" />
              <h3 className="text-sm font-semibold text-muted-foreground">
                تفاصيل الأبعاد الخمسة
              </h3>
            </div>

            <div className="space-y-3">
              {dimensionKeys.map((key, idx) => {
                const config = dimensionConfig[key];
                const DimIcon = config.icon;
                const score = existingResult.vector[idx];
                const percent = (score / 5) * 100;

                return (
                  <Card
                    key={key}
                    className="group overflow-hidden border-border/50 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5"
                    style={{
                      animation: `fadeSlideIn 0.5s ease-out ${0.2 + idx * 0.1}s both`,
                    }}
                  >
                    <div className={`h-1 bg-gradient-to-l ${config.gradient}`} />
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`h-9 w-9 rounded-lg ${config.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                          <DimIcon className={`h-4.5 w-4.5 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-foreground">
                              {dimensionLabels[key]}
                            </span>
                            <span className={`text-sm font-bold ${config.color}`}>
                              {score}/5
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-l ${config.gradient} rounded-full transition-all duration-1000 ease-out`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Info text */}
        <div
          className="text-center"
          style={{ animation: "fadeSlideIn 0.5s ease-out 0.7s both" }}
        >
          <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary/50" />
            نستخدم هذه النتيجة لحساب نسبة التوافق مع المرشحين
          </p>
        </div>

        {/* Profile link card */}
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.75s both" }}>
          <Card className="overflow-hidden border-border/50 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="h-1 bg-gradient-to-l from-primary to-secondary" />
            <CardContent className="p-5 md:p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">اطّلع على ملفك الشخصي</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">راجع ملفك الشخصي وأكمل ما ينقصه</p>
                </div>
                <Button asChild size="sm" className="bg-gradient-to-l from-primary to-secondary text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                  <Link href="/dashboard/profile">
                    عرض الملف
                    <ArrowLeft className="h-3.5 w-3.5 ms-1.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Retake Section */}
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.85s both" }}>
          {existingResult.canRetake ? (
            <div className="flex justify-center">
              <button
                onClick={handleRetake}
                className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-l from-secondary to-primary text-white font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                <RefreshCw className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
                إعادة الاختبار
              </button>
            </div>
          ) : (
            <Card className="overflow-hidden border-border/50 bg-gradient-to-l from-accent/10 via-card to-card">
              <div className="h-1 bg-gradient-to-l from-accent to-accent/80" />
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center flex-shrink-0">
                    <CalendarClock className="h-7 w-7 text-accent-foreground" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      يمكنك إعادة الاختبار بعد
                    </p>
                    <p className="font-display text-3xl text-accent-foreground">
                      {arabicCount(existingResult.daysRemaining, { one: "يوم واحد", two: "يومين", few: "أيام", many: "يوماً" })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      التاريخ المتاح:{" "}
                      <span className="font-medium text-foreground">
                        {new Date(existingResult.retakeDate).toLocaleDateString("ar-JO-u-nu-latn", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Inline keyframes style */}
        <style jsx global>{`
          @keyframes fadeSlideIn {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  // --- Quiz Screen ---
  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      <FirstVisitTip
        storageKey="naseeb_tip_quiz"
        icon={<Brain className="h-5 w-5 text-primary" />}
        title="اختبار الشخصية يحسّن التوافق"
        body={`اختبار قصير من ${arabicCount(questions.length, { one: "سؤال واحد", two: "سؤالين", few: "أسئلة", many: "سؤالاً" })} يساعدنا في فهم شخصيتك وتقديم اقتراحات توافق أدق. نتائجك تُستخدم لحساب نسبة التوافق مع المرشحين.`}
      />
      <PageHeader
        icon={Brain}
        title="اختبار الشخصية"
        description={female ? "أجيبي عن الأسئلة لنساعدكِ في إيجاد أفضل توافق لكِ." : "أجب عن الأسئلة لنساعدك في إيجاد أفضل توافق لك."}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 text-primary/60" aria-hidden="true" />
          <span>يستغرق نحو 5 دقائق</span>
        </span>
      </PageHeader>

      {/* Progress Bar Section */}
      <div
        className="space-y-3"
        style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            السؤال {Math.min(currentPage * QUESTIONS_PER_PAGE + 1, questions.length)} - {Math.min((currentPage + 1) * QUESTIONS_PER_PAGE, questions.length)} من {questions.length}
          </span>
          <span className="font-bold text-primary">
            {progressPercent}%
          </span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-l from-secondary to-primary rounded-full transition-all duration-500 ease-out relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-l from-white/20 to-transparent rounded-full" />
          </div>
        </div>
        {/* Page dots */}
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`صفحة الأسئلة ${i + 1} من ${totalPages}`}
              aria-current={i === currentPage ? "step" : undefined}
              disabled={i > currentPage}
              onClick={() => {
                // Only allow going to pages that are <= current page or completed
                if (i <= currentPage) {
                  setCurrentPage(i);
                }
              }}
              className={`rounded-full transition-all duration-300 ${
                i === currentPage
                  ? "w-8 h-2.5 bg-gradient-to-l from-secondary to-primary shadow-sm shadow-primary/30"
                  : i < currentPage
                  ? "w-2.5 h-2.5 bg-primary/40 hover:bg-primary/60 cursor-pointer"
                  : "w-2.5 h-2.5 bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive flex items-center gap-2"
          style={{ animation: "fadeSlideIn 0.3s ease-out both" }}
        >
          <div className="h-5 w-5 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold">!</span>
          </div>
          {error}
        </div>
      )}

      {/* Questions for current page */}
      <div className="space-y-5">
        {currentQuestions.map((q, idx) => {
          const globalIdx = currentPage * QUESTIONS_PER_PAGE + idx;
          return (
            <Card
              key={q.id}
              className="group overflow-hidden border-border/50 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              style={{
                animation: `fadeSlideIn 0.5s ease-out ${0.15 + idx * 0.1}s both`,
              }}
            >
              <div className="h-1 bg-gradient-to-l from-secondary/60 to-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-base flex items-start gap-3">
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-lg bg-gradient-to-br from-secondary to-primary text-white text-xs font-bold shadow-sm flex-shrink-0 mt-0.5">
                    {globalIdx + 1}
                  </span>
                  <span className="leading-relaxed">{q.text}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-5">
                {/* Stacked on phones: five long labels never fit one 360px row */}
                <div role="radiogroup" aria-label={q.text} className="flex flex-col gap-2 sm:flex-row">
                  {scaleLabels.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={answers[q.id] === i + 1}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i + 1 }))}
                      className={`min-h-11 flex-1 rounded-xl border-2 px-3 py-2.5 text-sm sm:px-2 sm:text-xs transition-all duration-200 ${
                        answers[q.id] === i + 1
                          ? "border-transparent bg-gradient-to-br from-secondary to-primary text-white font-semibold shadow-md shadow-primary/20 scale-[1.03]"
                          : "border-border/60 hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.01]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Navigation */}
      <div
        className="flex items-center justify-between"
        style={{ animation: "fadeSlideIn 0.5s ease-out 0.5s both" }}
      >
        <div className="flex gap-2">
          {currentPage > 0 && (
            <button
              onClick={() => setCurrentPage((p) => p - 1)}
              className="inline-flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-border/60 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <ArrowRight className="h-4 w-4" />
              السابق
            </button>
          )}
        </div>

        {/* Answer counter badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/50 text-sm">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{answeredCount}</span>/{questions.length} إجابة
          </span>
        </div>

        <div className="flex gap-2">
          {currentPage < totalPages - 1 ? (
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!currentPageComplete}
              className={`inline-flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                currentPageComplete
                  ? "bg-gradient-to-l from-secondary to-primary text-white shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              التالي
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2">
            {/* The answers lock the result for months: say so before sending */}
            <p className="text-xs text-muted-foreground max-w-xs text-start">
              {female ? "راجعي" : "راجع"} إجاباتك قبل الإرسال: يمكن إعادة الاختبار بعد نحو 3 أشهر فقط.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount < questions.length}
              className={`inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                !submitting && answeredCount >= questions.length
                  ? "bg-gradient-to-l from-primary to-secondary text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  إرسال الإجابات
                </>
              )}
            </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes style */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
