"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  HeartHandshake,
  X,
  MapPin,
  GraduationCap,
  Briefcase,
  Calendar,
  Search,
  Star,
  AlertCircle,
  User,
  ArrowLeft,
  Send,
  Clock,
  Eye,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Suggestion {
  id: string;
  compatibilityScore: number;
  isManual: boolean;
  candidate: {
    firstName: string;
    age: number | null;
    city: string | null;
    education: string | null;
    job: string | null;
  };
}

interface SentRequest {
  id: string;
  status: "waiting" | "seen" | "matched";
  sentAt: string;
  candidate: {
    firstName: string;
    age: number | null;
    city: string | null;
    education: string | null;
    job: string | null;
  };
}

// Suggestions are now free to browse — no limit on accepting/rejecting

function getScoreColor(score: number) {
  if (score >= 80) return "from-blue-400 to-blue-600";
  if (score >= 60) return "from-primary to-blue-500";
  if (score >= 40) return "from-amber-400 to-orange-500";
  return "from-rose-400 to-red-500";
}

function getScoreRingColor(score: number) {
  if (score >= 80) return "ring-blue-400/30";
  if (score >= 60) return "ring-primary/30";
  if (score >= 40) return "ring-amber-400/30";
  return "ring-rose-400/30";
}

const STATUS_CONFIG = {
  waiting: {
    label: "بانتظار الاطلاع",
    className: "bg-amber-100 text-amber-700 border-amber-200/60",
    icon: Clock,
  },
  seen: {
    label: "تم الاطلاع",
    className: "bg-blue-100 text-blue-700 border-blue-200/60",
    icon: Eye,
  },
  matched: {
    label: "توافق متبادل",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200/60",
    icon: Heart,
  },
} as const;

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentLoading, setSentLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [accountComplete, setAccountComplete] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "sent">("new");

  const [isMale, setIsMale] = useState<boolean | null>(null);

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
        setIsMale(user?.gender === "MALE");
      } catch {
        setAccountComplete(false);
      }
    }
    checkCompletion();
    fetchSuggestions();
  }, []);

  async function fetchSuggestions() {
    try {
      const res = await fetch("/api/suggestions");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSentRequests() {
    setSentLoading(true);
    try {
      const res = await fetch("/api/suggestions/sent");
      const data = await res.json();
      setSentRequests(data.sentRequests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSentLoading(false);
    }
  }

  function handleTabChange(tab: "new" | "sent") {
    setActiveTab(tab);
    if (tab === "sent" && sentRequests.length === 0) {
      fetchSentRequests();
    }
  }

  async function handleAction(id: string, action: "like" | "reject") {
    setActing(id);
    try {
      const res = await fetch(`/api/suggestions/${id}/${action}`, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setRemovingId(id);
        setTimeout(() => {
          setSuggestions((prev) => prev.filter((s) => s.id !== id));
          setRemovingId(null);
        }, 400);
        if (action === "like") {
          // Refresh sent requests so the new one appears
          fetchSentRequests();
        }
        if (data.match) {
          alert("تهانينا! لديك توافق متبادل!");
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل الاقتراحات...</p>
      </div>
    );
  }

  if (isMale) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-l from-primary/5 via-primary/3 to-transparent shadow-md">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/10 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
              <HeartHandshake className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">الاقتراحات مخصصة للإناث</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                في منصة نصيب، يتم إرسال اقتراحات التوافق للإناث فقط. سيتم إعلامك عبر الإشعارات عندما تبدي إحداهن اهتماماً بملفك الشخصي.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="bg-gradient-to-l from-primary to-primary/80 rounded-xl font-semibold">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  العودة للوحة التحكم
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl font-semibold">
                <Link href="/dashboard/notifications">
                  الإشعارات
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
              <h3 className="text-lg font-bold text-amber-900">أكملي حسابك أولاً</h3>
              <p className="text-sm text-amber-700/80 max-w-sm mx-auto leading-relaxed">
                يجب إكمال جميع خطوات إعداد الحساب (التحقق من الهوية، الملف الشخصي، واختبار الشخصية) قبل الوصول إلى الاقتراحات.
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

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/10 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 rounded-full -translate-x-10 -translate-y-10 blur-2xl" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-accent/10 rounded-full translate-x-6 translate-y-6 blur-2xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
                  الاقتراحات
                </h1>
                {activeTab === "new" && suggestions.length > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {suggestions.length}
                  </span>
                )}
                {activeTab === "sent" && sentRequests.length > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {sentRequests.length}
                  </span>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-sm md:text-base">
              {activeTab === "new"
                ? "اقتراحات التوافق بناءً على ملفك الشخصي واختبار الشخصية"
                : "تتبعي حالة طلبات الاهتمام التي أرسلتيها"}
            </p>
          </div>

        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 p-1 rounded-xl bg-muted/50 border border-border/50">
        <button
          onClick={() => handleTabChange("new")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "new"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          اقتراحات جديدة
          {suggestions.length > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold ${
              activeTab === "new" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            }`}>
              {suggestions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("sent")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "sent"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="h-4 w-4" />
          الطلبات المرسلة
          {sentRequests.length > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold ${
              activeTab === "sent" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            }`}>
              {sentRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* New Suggestions Tab */}
      {activeTab === "new" && (
        <>
          {suggestions.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-muted/30">
              <CardContent className="text-center py-16 md:py-20 space-y-5">
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full animate-pulse" />
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                    <Search className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">لا توجد اقتراحات حالياً</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    سيتم إرسال اقتراحات جديدة إليك قريباً. تأكدي من إكمال ملفك الشخصي واختبار الشخصية للحصول على أفضل النتائج.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 pt-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>يتم تحديث الاقتراحات بشكل دوري</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {suggestions.map((s, index) => {
                const score = Math.round(s.compatibilityScore);
                const isRemoving = removingId === s.id;

                return (
                  <div
                    key={s.id}
                    className="transition-all duration-400"
                    style={{
                      opacity: isRemoving ? 0 : 1,
                      transform: isRemoving ? "scale(0.95) translateY(-10px)" : "none",
                      animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
                    }}
                  >
                    <Card className="group overflow-hidden border-border/50 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
                      {/* Gradient header strip */}
                      <div className={`h-1.5 bg-gradient-to-l ${getScoreColor(score)}`} />

                      <CardContent className="p-5 md:p-6">
                        <div className="flex items-start gap-4 mb-5">
                          {/* Avatar with initial */}
                          <div className="relative flex-shrink-0">
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center border border-primary/10 group-hover:border-primary/20 transition-colors">
                              <span className="text-2xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                                {s.candidate.firstName.charAt(0)}
                              </span>
                            </div>
                            {s.isManual && (
                              <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-br from-accent to-amber-500 flex items-center justify-center shadow-sm">
                                <Star className="h-2.5 w-2.5 text-white fill-white" />
                              </div>
                            )}
                          </div>

                          {/* Name and age */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-lg text-foreground truncate">
                                {s.candidate.firstName}
                              </h3>
                              {s.isManual && (
                                <Badge className="bg-gradient-to-l from-accent/20 to-amber-100 text-amber-700 border border-amber-200/50 text-[10px] px-2 py-0">
                                  اقتراح الإدارة
                                </Badge>
                              )}
                            </div>
                            {s.candidate.age && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                {s.candidate.age} سنة
                              </p>
                            )}
                          </div>

                          {/* Compatibility score circular badge */}
                          <div className="flex-shrink-0">
                            <div className={`relative h-[72px] w-[72px] rounded-full flex items-center justify-center ring-4 ${getScoreRingColor(score)} bg-gradient-to-br ${getScoreColor(score)} shadow-lg group-hover:scale-105 transition-transform duration-300`}>
                              <div className="h-[56px] w-[56px] rounded-full bg-card flex flex-col items-center justify-center">
                                <span className="text-xl font-black text-foreground leading-none">
                                  {score}
                                </span>
                                <span className="text-[9px] text-muted-foreground font-medium leading-none mt-0.5">
                                  % توافق
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Info row with icons */}
                        <div className="flex flex-wrap gap-2 mb-5">
                          {s.candidate.city && (
                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 border border-border/50 px-3 py-1.5 text-sm text-foreground/80">
                              <MapPin className="h-3.5 w-3.5 text-primary/60" />
                              {s.candidate.city}
                            </div>
                          )}
                          {s.candidate.education && (
                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 border border-border/50 px-3 py-1.5 text-sm text-foreground/80">
                              <GraduationCap className="h-3.5 w-3.5 text-primary/60" />
                              {s.candidate.education}
                            </div>
                          )}
                          {s.candidate.job && (
                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 border border-border/50 px-3 py-1.5 text-sm text-foreground/80">
                              <Briefcase className="h-3.5 w-3.5 text-primary/60" />
                              {s.candidate.job}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3">
                          <Button
                            onClick={() => handleAction(s.id, "like")}
                            disabled={acting === s.id}
                            className="flex-1 h-11 bg-gradient-to-l from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-semibold"
                          >
                            {acting === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <HeartHandshake className="h-5 w-5 me-1.5" />
                                قبول
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleAction(s.id, "reject")}
                            disabled={acting === s.id}
                            className="flex-1 h-11 border-destructive/30 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-semibold"
                          >
                            <X className="h-5 w-5 me-1.5" />
                            رفض
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Sent Requests Tab */}
      {activeTab === "sent" && (
        <>
          {sentLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل الطلبات...</p>
            </div>
          ) : sentRequests.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-muted/30">
              <CardContent className="text-center py-16 md:py-20 space-y-5">
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full animate-pulse" />
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                    <Send className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">لم ترسلي أي طلبات بعد</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    عند قبول اقتراح، سيظهر هنا حتى تتمكني من متابعة حالته.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sentRequests.map((req, index) => {
                const config = STATUS_CONFIG[req.status];
                const StatusIcon = config.icon;
                const sentDate = new Date(req.sentAt).toLocaleDateString("ar-JO", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });

                return (
                  <div
                    key={req.id}
                    style={{
                      animation: `fadeSlideIn 0.5s ease-out ${index * 0.08}s both`,
                    }}
                  >
                    <Card className="overflow-hidden border-border/50 transition-all duration-300 hover:shadow-md">
                      <CardContent className="p-5 md:p-6">
                        <div className="flex items-start gap-4">
                          {/* Avatar */}
                          <div className="flex-shrink-0">
                            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center border border-primary/10">
                              <span className="text-xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                                {req.candidate.firstName.charAt(0)}
                              </span>
                            </div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <h3 className="font-bold text-base text-foreground truncate">
                                {req.candidate.firstName}
                              </h3>
                              <Badge className={`${config.className} border text-[11px] px-2.5 py-0.5 flex items-center gap-1 flex-shrink-0`}>
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </Badge>
                            </div>

                            {/* Candidate details */}
                            <div className="flex flex-wrap gap-2 mb-3">
                              {req.candidate.age && (
                                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {req.candidate.age} سنة
                                </div>
                              )}
                              {req.candidate.city && (
                                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {req.candidate.city}
                                </div>
                              )}
                              {req.candidate.education && (
                                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <GraduationCap className="h-3 w-3" />
                                  {req.candidate.education}
                                </div>
                              )}
                              {req.candidate.job && (
                                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Briefcase className="h-3 w-3" />
                                  {req.candidate.job}
                                </div>
                              )}
                            </div>

                            {/* Footer: date + link */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground/60">
                                أُرسل في {sentDate}
                              </span>
                              {req.status === "matched" && (
                                <Link
                                  href="/dashboard/matches"
                                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                                >
                                  عرض التوافق ←
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </>
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
