"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const scaleLabels = ["ما بوافق أبداً", "ما بوافق", "محايد", "بوافق", "بوافق بشدة"];

const dimensionLabels: Record<string, string> = {
  extraversion: "الاجتماعية",
  conscientiousness: "الالتزام والتنظيم",
  agreeableness: "التفاهم والانسجام",
  neuroticism: "الاستقرار العاطفي",
  openness: "الانفتاح والتطوير",
};

const dimensionConfig: Record<string, { gradient: string; bg: string; icon: typeof Zap; color: string }> = {
  extraversion: {
    gradient: "from-amber-400 to-orange-500",
    bg: "bg-amber-50",
    icon: Zap,
    color: "text-amber-600",
  },
  conscientiousness: {
    gradient: "from-blue-400 to-blue-600",
    bg: "bg-blue-50",
    icon: CheckCircle2,
    color: "text-blue-600",
  },
  agreeableness: {
    gradient: "from-blue-400 to-blue-600",
    bg: "bg-blue-50",
    icon: Heart,
    color: "text-blue-600",
  },
  neuroticism: {
    gradient: "from-rose-400 to-rose-600",
    bg: "bg-rose-50",
    icon: Eye,
    color: "text-rose-600",
  },
  openness: {
    gradient: "from-violet-400 to-violet-600",
    bg: "bg-violet-50",
    icon: Palette,
    color: "text-violet-600",
  },
};

const dimensionKeys = ["extraversion", "conscientiousness", "agreeableness", "neuroticism", "openness"];

const QUESTIONS_PER_PAGE = 4;

export default function PersonalityQuizPage() {
  const router = useRouter();
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/profile/personality-quiz");
        const data = await res.json();
        setQuestions(data.questions || []);
        if (data.result) {
          setExistingResult(data.result);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleRetake() {
    setExistingResult(null);
    setAnswers({});
    setCurrentPage(0);
    setShowQuiz(true);
    setError("");
  }

  async function handleSubmit() {
    if (answeredCount < questions.length) {
      setError("لازم تجاوب على كل الأسئلة");
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

      // Reload from server to get full result with retake info
      const refreshRes = await fetch("/api/profile/personality-quiz");
      const refreshData = await refreshRes.json();
      if (refreshData.result) {
        setExistingResult(refreshData.result);
      }
      setShowQuiz(false);
    } catch {
      setError("صار خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-200/40 to-primary/10 flex items-center justify-center">
            <Brain className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">عم نحمّل اختبار الشخصية...</p>
      </div>
    );
  }

  // --- Result Screen ---
  if (existingResult && !showQuiz) {
    const completedDate = new Date(existingResult.completedAt);
    const formattedDate = completedDate.toLocaleDateString("ar-JO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="max-w-2xl mx-auto space-y-8 pb-8">
        {/* Page Header - Gradient Card */}
        <div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-violet-50/80 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8"
          style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
        >
          <div className="absolute top-0 left-0 w-40 h-40 bg-violet-100/40 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

          <div className="relative flex flex-col items-center text-center space-y-4">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Brain className="h-7 w-7 text-white" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-violet-600 bg-clip-text text-transparent">
                نتيجة اختبار الشخصية
              </h1>
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-l from-violet-100/80 to-primary/10 border border-violet-200/40">
                <Sparkles className="h-5 w-5 text-violet-500" />
                <span className="text-xl font-bold bg-gradient-to-l from-violet-600 to-primary bg-clip-text text-transparent">
                  {existingResult.personalityType}
                </span>
              </div>
            </div>

            {/* Completion date chip */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary/60" />
              <span>تاريخ الاختبار: {formattedDate}</span>
            </div>
          </div>
        </div>

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
            هاي النتيجة بنستخدمها عشان نحسب نسبة التوافق مع المرشحين
          </p>
        </div>

        {/* Retake Section */}
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.8s both" }}>
          {existingResult.canRetake ? (
            <div className="flex justify-center">
              <button
                onClick={handleRetake}
                className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-l from-violet-500 to-primary text-white font-semibold shadow-lg shadow-violet-500/20 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                <RefreshCw className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
                إعادة الاختبار
              </button>
            </div>
          ) : (
            <Card className="overflow-hidden border-border/50 bg-gradient-to-l from-amber-50/30 via-card to-card">
              <div className="h-1 bg-gradient-to-l from-amber-400 to-orange-500" />
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                    <CalendarClock className="h-7 w-7 text-amber-600" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      بتقدر تعيد الاختبار بعد
                    </p>
                    <p className="text-2xl font-bold bg-gradient-to-l from-amber-500 to-orange-600 bg-clip-text text-transparent">
                      {existingResult.daysRemaining} يوم
                    </p>
                    <p className="text-xs text-muted-foreground">
                      التاريخ المتاح:{" "}
                      <span className="font-medium text-foreground">
                        {new Date(existingResult.retakeDate).toLocaleDateString("ar-JO", {
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
      {/* Gradient Header */}
      <div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-violet-50/80 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8"
        style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
      >
        <div className="absolute top-0 left-0 w-32 h-32 bg-violet-100/40 rounded-full -translate-x-10 -translate-y-10 blur-2xl" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-primary/5 rounded-full translate-x-6 translate-y-6 blur-2xl" />

        <div className="relative space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-violet-600 bg-clip-text text-transparent">
              اختبار الشخصية
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            جاوب على الأسئلة العشرين عشان نساعدك نلاقي أفضل توافق إلك.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 text-primary/60" />
            <span>بياخذ تقريباً 5 دقائق</span>
          </div>
        </div>
      </div>

      {/* Progress Bar Section */}
      <div
        className="space-y-3"
        style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            السؤال {Math.min(currentPage * QUESTIONS_PER_PAGE + 1, questions.length)} - {Math.min((currentPage + 1) * QUESTIONS_PER_PAGE, questions.length)} من {questions.length}
          </span>
          <span className="font-bold bg-gradient-to-l from-primary to-violet-600 bg-clip-text text-transparent">
            {progressPercent}%
          </span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-l from-violet-500 to-primary rounded-full transition-all duration-500 ease-out relative"
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
              onClick={() => {
                // Only allow going to pages that are <= current page or completed
                if (i <= currentPage) {
                  setCurrentPage(i);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className={`rounded-full transition-all duration-300 ${
                i === currentPage
                  ? "w-8 h-2.5 bg-gradient-to-l from-violet-500 to-primary shadow-sm shadow-primary/30"
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
              <div className="h-1 bg-gradient-to-l from-violet-400/60 to-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-base flex items-start gap-3">
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-primary text-white text-xs font-bold shadow-sm flex-shrink-0 mt-0.5">
                    {globalIdx + 1}
                  </span>
                  <span className="leading-relaxed">{q.text}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-5">
                <div className="flex gap-2">
                  {scaleLabels.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i + 1 }))}
                      className={`flex-1 rounded-xl border-2 px-2 py-2.5 text-xs transition-all duration-200 ${
                        answers[q.id] === i + 1
                          ? "border-transparent bg-gradient-to-br from-violet-500 to-primary text-white font-semibold shadow-md shadow-primary/20 scale-[1.03]"
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
              onClick={() => {
                setCurrentPage((p) => p - 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-border/60 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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
              onClick={() => {
                setCurrentPage((p) => p + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={!currentPageComplete}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                currentPageComplete
                  ? "bg-gradient-to-l from-violet-500 to-primary text-white shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              التالي
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount < questions.length}
              className={`inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                !submitting && answeredCount >= questions.length
                  ? "bg-gradient-to-l from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98]"
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
