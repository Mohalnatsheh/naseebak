"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Heart,
  MapPin,
  GraduationCap,
  Eye,
  EyeOff,
  CalendarHeart,
  ImageOff,
  Clock,
  Phone,
  CalendarCheck,
  CheckCircle2,
  XCircle,
  Briefcase,
  Users,
  Sparkles,
  AlertCircle,
  ArrowLeft,
  Lock,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Match {
  id: string;
  photosRevealed: boolean;
  revealed: boolean;
  createdAt: string;
  visitStatus: string | null;
  scheduledDate: string | null;
  partner: {
    firstName: string;
    city: string | null;
    education: string | null;
    job: string | null;
    photos?: { id: string; url: string }[];
  };
}

const visitStatusLabels: Record<string, string> = {
  REQUESTED: "طلب زيارة مرسل",
  FAMILIES_CONTACTED: "تم التواصل مع العائلات",
  SCHEDULED: "تم تحديد موعد",
  COMPLETED: "تمت الزيارة",
  CANCELLED: "ملغاة",
};

const visitStatusConfig: Record<string, { color: string; borderColor: string; bgColor: string; icon: typeof Clock }> = {
  REQUESTED: {
    color: "bg-gradient-to-l from-amber-100 to-amber-50 text-amber-700 border-amber-200/60",
    borderColor: "border-r-amber-400",
    bgColor: "from-amber-50/50 to-transparent",
    icon: Clock,
  },
  FAMILIES_CONTACTED: {
    color: "bg-gradient-to-l from-blue-100 to-blue-50 text-blue-700 border-blue-200/60",
    borderColor: "border-r-blue-400",
    bgColor: "from-blue-50/50 to-transparent",
    icon: Phone,
  },
  SCHEDULED: {
    color: "bg-gradient-to-l from-green-100 to-green-50 text-green-700 border-green-200/60",
    borderColor: "border-r-green-500",
    bgColor: "from-green-50/50 to-transparent",
    icon: CalendarCheck,
  },
  COMPLETED: {
    color: "bg-gradient-to-l from-emerald-100 to-emerald-50 text-emerald-700 border-emerald-200/60",
    borderColor: "border-r-emerald-500",
    bgColor: "from-emerald-50/50 to-transparent",
    icon: CheckCircle2,
  },
  CANCELLED: {
    color: "bg-gradient-to-l from-red-100 to-red-50 text-red-700 border-red-200/60",
    borderColor: "border-r-red-400",
    bgColor: "from-red-50/50 to-transparent",
    icon: XCircle,
  },
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPhotos, setShowPhotos] = useState<Record<string, boolean>>({});
  const [accountComplete, setAccountComplete] = useState<boolean | null>(null);
  const [isFemale, setIsFemale] = useState(false);
  const [matchCredits, setMatchCredits] = useState(0);
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const togglePhotos = useCallback((matchId: string) => {
    setShowPhotos((prev) => ({ ...prev, [matchId]: !prev[matchId] }));
  }, []);

  useEffect(() => {
    async function checkCompletion() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        const user = data.user;
        const isVerified = user?.identityDoc?.status === "APPROVED";
        const hasProfile = user?.profile?.isComplete;
        const hasQuiz = !!user?.personalityResult;
        setAccountComplete(isVerified && hasProfile && hasQuiz);
        setIsFemale(user?.gender === "FEMALE");
      } catch {
        setAccountComplete(false);
      }
    }
    async function fetchMatches() {
      try {
        const res = await fetch("/api/matches");
        const data = await res.json();
        setMatches(data.matches || []);
        if (data.matchCredits !== undefined) {
          setMatchCredits(data.matchCredits);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    checkCompletion();
    fetchMatches();
  }, []);

  async function handleReveal(matchId: string) {
    setRevealingId(matchId);
    try {
      const res = await fetch(`/api/matches/${matchId}/reveal`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.revealed) {
        setMatches((prev) =>
          prev.map((m) => (m.id === matchId ? { ...m, revealed: true } : m))
        );
        if (data.creditsRemaining !== undefined) {
          setMatchCredits(data.creditsRemaining);
        }
      } else if (data.code === "NO_CREDITS") {
        // Redirect to payments
        window.location.href = "/dashboard/payments";
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRevealingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-rose-200/30 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل التوافقات...</p>
      </div>
    );
  }

  if (accountComplete === false) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
        <Card className="relative overflow-hidden border-amber-300/50 bg-gradient-to-l from-amber-50/80 to-orange-50/50 shadow-md">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-amber-200/20 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-amber-100 border border-amber-200/60">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-amber-900">أكمل حسابك أولاً</h3>
              <p className="text-sm text-amber-700/80 max-w-sm mx-auto leading-relaxed">
                يجب إكمال جميع خطوات إعداد الحساب (التحقق من الهوية، الملف الشخصي، واختبار الشخصية) قبل الوصول إلى التوافقات.
              </p>
            </div>
            <Button asChild className="bg-gradient-to-l from-primary to-primary/80 rounded-xl font-semibold">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 me-2" />
                العودة للوحة التحكم
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const unrevealedCount = isFemale
    ? matches.filter((m) => !m.revealed).length
    : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-rose-50/80 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-rose-100/40 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-primary flex items-center justify-center shadow-lg shadow-rose-500/20">
                <Heart className="h-5 w-5 text-white fill-white" />
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-rose-600 bg-clip-text text-transparent">
                  التوافقات المتبادلة
                </h1>
                {matches.length > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-gradient-to-br from-rose-500 to-primary text-white text-xs font-bold shadow-sm">
                    {matches.length}
                  </span>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-sm md:text-base">
              {isFemale
                ? "استخدمي رصيد التوافق لرؤية تفاصيل التوافقات المتبادلة"
                : "الأشخاص الذين تبادلتم الإعجاب. يمكنك رؤية تفاصيلهم وطلب زيارة عائلية."}
            </p>
          </div>

          {/* Credits indicator for females */}
          {isFemale && (
            <div className="flex-shrink-0 bg-card/80 backdrop-blur-sm rounded-xl border border-amber-200/50 p-4 min-w-[140px]">
              <p className="text-xs text-muted-foreground mb-1">رصيدك</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black bg-gradient-to-l from-amber-500 to-primary bg-clip-text text-transparent">
                  {matchCredits}
                </span>
                <span className="text-xs text-muted-foreground font-medium">رصيد</span>
              </div>
              {unrevealedCount > 0 && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">
                  {unrevealedCount} توافق بانتظار الكشف
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Match Cards */}
      {matches.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-rose-50/20">
          <CardContent className="text-center py-16 md:py-20 space-y-5">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-100/60 to-primary/10 rounded-full animate-pulse" />
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-rose-50 to-primary/5 flex items-center justify-center border-2 border-dashed border-rose-200/50">
                <Users className="h-10 w-10 text-muted-foreground/40" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg text-foreground">لا توجد توافقات بعد</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                عندما يتبادل شخصان الإعجاب، ستظهر هنا تفاصيل التوافق.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 pt-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>راجعي اقتراحاتك لزيادة فرص التوافق</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {matches.map((m, index) => {
            const statusConfig = m.visitStatus ? visitStatusConfig[m.visitStatus] : null;
            const StatusIcon = statusConfig?.icon || Clock;
            const isUnrevealed = isFemale && !m.revealed;

            return (
              <div
                key={m.id}
                style={{
                  animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
                }}
              >
                <Card
                  className={`group overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                    isUnrevealed
                      ? "border-amber-200/60 hover:border-amber-300/80 hover:shadow-lg hover:shadow-amber-500/5"
                      : `border-border/50 hover:shadow-xl hover:shadow-primary/5 ${statusConfig ? `border-r-4 ${statusConfig.borderColor}` : "border-r-4 border-r-primary/30"}`
                  }`}
                >
                  {/* Status gradient background for revealed matches */}
                  {!isUnrevealed && statusConfig && (
                    <div className={`absolute inset-0 bg-gradient-to-l ${statusConfig.bgColor} pointer-events-none opacity-40`} />
                  )}

                  <CardContent className="relative p-5 md:p-6">
                    {isUnrevealed ? (
                      /* Unrevealed match card */
                      <div className="text-center space-y-4 py-4">
                        <div className="relative mx-auto w-20 h-20">
                          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-orange-50 flex items-center justify-center border border-amber-200/40">
                            <Lock className="h-8 w-8 text-amber-400" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="font-bold text-lg text-foreground">
                            {m.partner.firstName}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            لديك توافق متبادل جديد! استخدمي رصيد لرؤية التفاصيل
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            توافق بتاريخ {new Date(m.createdAt).toLocaleDateString("ar-JO")}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleReveal(m.id)}
                          disabled={revealingId === m.id}
                          className="bg-gradient-to-l from-amber-500 via-yellow-500 to-orange-500 hover:from-amber-600 hover:via-yellow-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/20 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {revealingId === m.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : matchCredits > 0 ? (
                            <>
                              <Coins className="h-4 w-4 me-2" />
                              كشف التوافق (1 رصيد)
                            </>
                          ) : (
                            <>
                              <Coins className="h-4 w-4 me-2" />
                              اشتري رصيد للكشف
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      /* Revealed match card */
                      <>
                        <div className="flex items-start gap-4 mb-4">
                          <div className="flex-shrink-0">
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 via-primary/10 to-rose-50 flex items-center justify-center border border-rose-200/30 group-hover:border-rose-300/40 transition-colors">
                              <Heart className="h-7 w-7 text-rose-400 fill-rose-400/20" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg text-foreground truncate mb-0.5">
                              {m.partner.firstName}
                            </h3>
                            <p className="text-xs text-muted-foreground mb-2.5">
                              توافق بتاريخ {new Date(m.createdAt).toLocaleDateString("ar-JO")}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {m.partner.city && (
                                <div className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border/50 px-2 py-0.5 text-xs text-foreground/80">
                                  <MapPin className="h-3 w-3 text-primary/60" />
                                  {m.partner.city}
                                </div>
                              )}
                              {m.partner.education && (
                                <div className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border/50 px-2 py-0.5 text-xs text-foreground/80">
                                  <GraduationCap className="h-3 w-3 text-primary/60" />
                                  {m.partner.education}
                                </div>
                              )}
                              {m.partner.job && (
                                <div className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border/50 px-2 py-0.5 text-xs text-foreground/80">
                                  <Briefcase className="h-3 w-3 text-primary/60" />
                                  {m.partner.job}
                                </div>
                              )}
                            </div>
                          </div>
                          {m.visitStatus && statusConfig && (
                            <Badge className={`flex-shrink-0 gap-1.5 px-3 py-1 border text-xs font-semibold ${statusConfig.color}`}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {visitStatusLabels[m.visitStatus] || m.visitStatus}
                            </Badge>
                          )}
                        </div>

                        {m.scheduledDate && (
                          <div className="mb-4 p-3.5 bg-gradient-to-l from-green-50 to-emerald-50/50 rounded-xl flex items-center gap-3 text-sm text-green-800 border border-green-200/40">
                            <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                              <CalendarHeart className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                              <p className="text-xs text-green-600 font-medium mb-0.5">موعد الزيارة</p>
                              <p className="font-bold text-green-800">
                                {new Date(m.scheduledDate).toLocaleDateString("ar-JO", {
                                  weekday: "long",
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          </div>
                        )}

                        {m.photosRevealed && showPhotos[m.id] && (
                          <div className="mb-4">
                            {m.partner.photos && m.partner.photos.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2.5 p-3 bg-muted/30 rounded-xl border border-border/40">
                                {m.partner.photos.map((photo) => (
                                  <div
                                    key={photo.id}
                                    className="rounded-lg overflow-hidden relative"
                                    onContextMenu={(e) => e.preventDefault()}
                                  >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent z-10 pointer-events-none rounded-lg" />
                                    <img
                                      src={photo.url}
                                      alt="صورة الشريك"
                                      className="w-full h-44 object-cover rounded-lg transition-transform duration-300"
                                      draggable={false}
                                      onContextMenu={(e) => e.preventDefault()}
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-2 p-6 bg-muted/30 rounded-xl border border-border/40 text-sm text-muted-foreground">
                                <ImageOff className="h-8 w-8 text-muted-foreground/30" />
                                <span>لا توجد صور مرفوعة</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex gap-3">
                          {m.photosRevealed ? (
                            <Button
                              variant="outline"
                              className={`flex-1 h-11 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                                showPhotos[m.id]
                                  ? "bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                                  : "border-rose-200/60 text-rose-600 hover:bg-rose-50 hover:border-rose-300/60"
                              }`}
                              onClick={() => togglePhotos(m.id)}
                            >
                              {showPhotos[m.id] ? (
                                <>
                                  <EyeOff className="h-4 w-4 me-2" />
                                  إخفاء الصور
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 me-2" />
                                  عرض الصور
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className="flex-1 h-11 rounded-xl font-semibold border-border/50 text-muted-foreground"
                              disabled
                            >
                              <Eye className="h-4 w-4 me-2" />
                              الصور غير متاحة بعد
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

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
