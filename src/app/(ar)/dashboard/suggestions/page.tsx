"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  HeartHandshake,
  X,
  GraduationCap,
  Search,
  Star,
  AlertCircle,
  User,
  ArrowLeft,
  Send,
  Clock,
  Eye,
  Heart,
  Cigarette,
  Moon,
  Flag,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  ShieldAlert,
  Ban,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SUGGESTIONS_MIN_COMPLETENESS, qualifiesForSuggestions as qualifiesForSuggestionsGate } from "@/lib/profile-completeness";
import { PersonCard } from "@/components/shared/person-card";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { describeOption, oppositeGender } from "@/lib/profile-options";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";
import { rechargeToContinue } from "@/components/suggestions/interest-dialog";
import type { SuggestEmptyReason } from "@/lib/matching/auto-suggest";

interface Suggestion {
  id: string;
  compatibilityScore: number;
  isManual: boolean;
  candidate: {
    id: string;
    firstName: string;
    isVerified?: boolean;
    age: number | null;
    city: string | null;
    area: string | null;
    nationality: string | null;
    education: string | null;
    fieldOfStudy: string | null;
    job: string | null;
    incomeRange: string | null;
    height: number | null;
    weight: number | null;
    skinColor: string | null;
    maritalStatus: string | null;
    childrenCount: number;
    religiosity: string | null;
    smokingStatus: string | null;
    aboutMe: string | null;
    hobbies: string | null;
    interests: string | null;
    lifestyle: string | null;
    beard: boolean | null;
    hijab: boolean | null;
    tribe: string | null;
    familyOriginArea: string | null;
    numberOfSiblings: number | null;
    housingType: string | null;
    cookingAbility: string | null;
    drivingLicense: boolean | null;
    willingToRelocate: string | null;
    familyValues: string | null;
  };
}

interface Interest {
  id: string;
  suggestionId: string | null;
  compatibilityScore: number;
  receivedAt: string;
  candidate: {
    id: string;
    firstName: string;
    isVerified?: boolean;
    age: number | null;
    city: string | null;
    area: string | null;
    nationality: string | null;
    education: string | null;
    fieldOfStudy: string | null;
    job: string | null;
    incomeRange: string | null;
    height: number | null;
    weight: number | null;
    skinColor: string | null;
    maritalStatus: string | null;
    childrenCount: number;
    religiosity: string | null;
    smokingStatus: string | null;
    aboutMe: string | null;
    hobbies: string | null;
    interests: string | null;
    lifestyle: string | null;
    hijab: boolean | null;
    beard: boolean | null;
    tribe: string | null;
    familyOriginArea: string | null;
    numberOfSiblings: number | null;
    housingType: string | null;
    cookingAbility: string | null;
    drivingLicense: boolean | null;
    willingToRelocate: string | null;
    familyValues: string | null;
  };
}

interface SentRequest {
  id: string;
  status: "waiting" | "seen" | "matched";
  sentAt: string;
  candidate: {
    firstName: string;
    isVerified?: boolean;
    age: number | null;
    city: string | null;
    education: string | null;
    job: string | null;
  };
}

const STATUS_CONFIG = {
  waiting: {
    label: "بانتظار الاطلاع",
    className: "bg-amber-100 text-amber-700 border-amber-200/60",
    icon: Clock,
  },
  seen: {
    label: "تم الاطلاع",
    className: "bg-primary/10 text-primary border-primary/20",
    icon: Eye,
  },
  matched: {
    label: "توافق متبادل",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200/60",
    icon: Heart,
  },
} as const;

export default function SuggestionsPage() {
  // New cycle: suggestions are free, so no "out of credits" banner here
  const { counts: cycleCounts, profile: me } = useDashboardData();
  const perRequestCredits = cycleCounts.flags.introRequests;
  // Candidates are the other gender: describe their options in third person
  const partnerGender = oppositeGender(me?.gender);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  // Simultaneous suggestions flow: the API says so, and the page shows the two-tab view instead
  const [mutualView, setMutualView] = useState(false);
  // Credit on interest (from /api/suggestions): "مهتم" costs 1 credit; chat switch for the dialog
  const [cycleInfo, setCycleInfo] = useState({ creditOnInterest: false, chatEnabled: true });
  // Legacy like / accept are the "مهتم" here: 1 credit each with credit on interest on
  const creditGate = !!cycleCounts.flags.creditOnInterest;
  const interestLocked = creditGate && credits === 0;
  // Why the "new" tab may be empty (weekly cap / nobody fits / pending), from page 1 of /api/suggestions
  const [emptyInfo, setEmptyInfo] = useState<{ reason: SuggestEmptyReason | null; nextAt: string | null }>({ reason: null, nextAt: null });
  const [interests, setInterests] = useState<Interest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentLoading, setSentLoading] = useState(false);
  const [interestsLoading, setInterestsLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [accountComplete, setAccountComplete] = useState<boolean | null>(null);
  const [completionPercent, setCompletionPercent] = useState<number>(0);
  const [incompleteSections, setIncompleteSections] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "sent" | "interests">("new");
  const [sugPage, setSugPage] = useState(1);
  const [sugTotalPages, setSugTotalPages] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const [sentTotalPages, setSentTotalPages] = useState(1);
  const [intPage, setIntPage] = useState(1);
  const [intTotalPages, setIntTotalPages] = useState(1);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [reportDialog, setReportDialog] = useState<{ userId: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState("FAKE_PROFILE");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  async function handleBlock(userId: string, name: string, cardId: string, tab: "suggestion" | "interest") {
    setMenuOpen(null);
    if (!window.confirm(`حظر ${name}؟ لن يظهر لك ولن تظهر له مرة أخرى.`)) return;
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedId: userId }),
      });
      if (res.ok) {
        if (tab === "suggestion") {
          setSuggestions((prev) => prev.filter((s) => s.id !== cardId));
        } else {
          setInterests((prev) => prev.filter((i) => i.id !== cardId));
        }
        toast.success("تم الحظر");
      } else {
        toast.error("تعذّر الحظر، حاول مرة أخرى");
      }
    } catch (err) {
      console.error(err);
      toast.error("تعذّر الحظر، حاول مرة أخرى");
    }
  }

  async function handleReportSubmit() {
    if (!reportDialog) return;
    setReportSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedId: reportDialog.userId,
          reason: reportReason,
          details: reportDetails || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "تعذّر إرسال البلاغ");
        return;
      }
      toast.success("تم إرسال البلاغ. سيراجعه فريق نصيبك.");
      setReportDialog(null);
      setReportReason("FAKE_PROFILE");
      setReportDetails("");
    } catch (err) {
      console.error(err);
      toast.error("تعذّر إرسال البلاغ");
    } finally {
      setReportSubmitting(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        const total = data.completeness?.total ?? 0;
        setCompletionPercent(total);

        // Collect incomplete section labels
        const missing: string[] = [];
        if (data.completeness?.sections) {
          for (const s of data.completeness.sections) {
            if (s.percentage < 100) missing.push(s.label);
          }
        }
        setIncompleteSections(missing);

        setAccountComplete(
          qualifiesForSuggestionsGate({
            completenessTotal: total,
            isComplete: !!data.user?.profile?.isComplete,
            newCycle: perRequestCredits,
          })
        );

        await fetchSuggestions();
      } catch {
        setAccountComplete(false);
        setLoading(false);
      }
    }
    init();
    // Re-check once the new-cycle switches arrive (the gate differs per mode)
  }, [perRequestCredits]);

  async function fetchSuggestions(p = sugPage) {
    try {
      const res = await fetch(`/api/suggestions?page=${p}`);
      const data = await res.json();
      if (data.mutualView) {
        setCycleInfo({ creditOnInterest: !!data.creditOnInterest, chatEnabled: data.chatEnabled !== false });
        setMutualView(true);
      }
      if (p === 1) setEmptyInfo({ reason: data.emptyReason ?? null, nextAt: data.nextSuggestionsAt ?? null });
      setSuggestions(data.suggestions || []);
      setSugTotalPages(data.totalPages || 1);
      if (typeof data.credits === "number") setCredits(data.credits);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSentRequests(p = sentPage) {
    setSentLoading(true);
    try {
      const res = await fetch(`/api/suggestions/sent?page=${p}`);
      const data = await res.json();
      setSentRequests(data.sentRequests || []);
      setSentTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setSentLoading(false);
    }
  }

  async function fetchInterests(p = intPage) {
    setInterestsLoading(true);
    try {
      const res = await fetch(`/api/interests/received?page=${p}`);
      const data = await res.json();
      setInterests(data.interests || []);
      setIntTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setInterestsLoading(false);
    }
  }

  function handleTabChange(tab: "new" | "sent" | "interests") {
    setActiveTab(tab);
    if (tab === "sent") {
      fetchSentRequests(sentPage);
    }
    if (tab === "interests") {
      fetchInterests(intPage);
    }
  }

  function toggleExpand(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleInterestAction(id: string, action: "accept" | "reject") {
    setActing(id);
    try {
      const res = await fetch(`/api/interests/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.code === "NO_CREDITS") setCredits(0);
      else if (!res.ok) toast.error(data.error || "تعذّر حفظ قرارك");

      if (res.ok) {
        if (creditGate && action === "accept") setCredits((c) => Math.max(0, (c ?? 1) - 1));
        trackEvent("interest_response", { response: action, mutual_match: !!data.match });
        setRemovingId(id);
        setTimeout(() => {
          setInterests((prev) => prev.filter((i) => i.id !== id));
          setRemovingId(null);
        }, 400);
        if (data.match) {
toast.success("تهانينا! لديك توافق متبادل!", {
            action: { label: "عرض التوافق", onClick: () => window.location.assign("/dashboard/matches") },
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  async function handleAction(id: string, action: "like" | "reject") {
    setActing(id);
    try {
      const res = await fetch(`/api/suggestions/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.code === "NO_CREDITS") setCredits(0);
      else if (!res.ok) toast.error(data.error || "تعذّر حفظ قرارك");

      if (res.ok) {
        if (creditGate && action === "like") setCredits((c) => Math.max(0, (c ?? 1) - 1));
        trackEvent("suggestion_response", { response: action === "like" ? "accept" : "reject", mutual_match: !!data.match });
        setRemovingId(id);
        setTimeout(() => {
          setSuggestions((prev) => prev.filter((s) => s.id !== id));
          setRemovingId(null);
        }, 400);
        if (action === "like") {
          fetchSentRequests();
        }
        if (data.match) {
toast.success("تهانينا! لديك توافق متبادل!", {
            action: { label: "عرض التوافق", onClick: () => window.location.assign("/dashboard/matches") },
          });
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

  if (accountComplete === false) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
        <Card className="relative overflow-hidden border-accent/40 bg-gradient-to-l from-accent/10 via-accent/5 to-transparent shadow-md">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-accent/10 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-accent/15 border border-accent/20">
              <AlertCircle className="h-8 w-8 text-accent-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">أكمل حسابك لتلقي الاقتراحات</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {perRequestCredits ? (
                  "أكمل خطوات إعداد ملفك القصيرة لتبدأ اقتراحاتك الأسبوعية المجانية."
                ) : (
                  <>
                    يجب إكمال ملفك الشخصي بنسبة {SUGGESTIONS_MIN_COMPLETENESS}% على الأقل قبل البدء في تلقي اقتراحات التوافق. نسبة الاكتمال الحالية: <span className="font-bold text-accent-foreground">{completionPercent}%</span>
                  </>
                )}
              </p>
            </div>
            {incompleteSections.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm mx-auto">
                {incompleteSections.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
            <Button asChild className="rounded-xl font-semibold">
              <Link href="/dashboard/profile/setup">
                متابعة إعداد الملف
                <ArrowLeft className="h-4 w-4 ms-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mutualView) {
    return (
      <MutualSuggestionsView
        emptyReason={emptyInfo.reason}
        nextSuggestionsAt={emptyInfo.nextAt}
        creditOnInterest={cycleInfo.creditOnInterest}
        chatEnabled={cycleInfo.chatEnabled}
        credits={credits ?? 0}
      />
    );
  }

  /** Credit on interest: cost hint, or a recharge link at 0 (the "مهتم" button is disabled then) */
  const creditHint = creditGate ? (
    interestLocked ? (
      <p className="mb-3 text-xs">
        <Link href="/dashboard/payments" className="font-semibold text-amber-800 underline underline-offset-4">
          {rechargeToContinue(me?.gender === "FEMALE")}
        </Link>
      </p>
    ) : (
      <p className="mb-3 text-xs text-muted-foreground">مهتم يستخدم رصيداً واحداً — رصيدك {credits ?? 0}</p>
    )
  ) : null;

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
                {activeTab === "interests" && interests.length > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold animate-pulse">
                    {interests.length}
                  </span>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-sm md:text-base">
              {activeTab === "new"
                ? "اقتراحات التوافق بناءً على ملفك الشخصي واختبار الشخصية"
                : activeTab === "sent"
                  ? "تتبع حالة طلبات الاهتمام التي أرسلتها"
                  : "أشخاص أبدوا اهتماماً بملفك الشخصي"}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Toggle — 3 tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/50">
        <button
          onClick={() => handleTabChange("new")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "new"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">اقتراحات جديدة</span>
          <span className="sm:hidden">اقتراحات</span>
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
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "sent"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">الطلبات المرسلة</span>
          <span className="sm:hidden">المرسلة</span>
          {sentRequests.length > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold ${
              activeTab === "sent" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            }`}>
              {sentRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("interests")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "interests"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">طلبات الاهتمام</span>
          <span className="sm:hidden">الاهتمام</span>
          {interests.length > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold ${
              activeTab === "interests" ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
            }`}>
              {interests.length}
            </span>
          )}
        </button>
      </div>

      {/* New Suggestions Tab */}
      {activeTab === "new" && (
        <>
          {credits === 0 && !perRequestCredits && (
            <Card className="border-amber-300/70 bg-gradient-to-l from-amber-50 via-amber-50/60 to-transparent">
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 border border-amber-200 text-amber-700">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-amber-900 text-sm sm:text-base">انتهى رصيد اقتراحاتك</h3>
                    <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                      لن تصلك اقتراحات جديدة حتى تشحن رصيدك. كل اقتراح يستخدم رصيداً واحداً.
                    </p>
                  </div>
                </div>
                <Button asChild className="shrink-0 rounded-xl font-bold">
                  <Link href="/dashboard/payments">
                    اشحن رصيدك
                    <ChevronLeft className="h-4 w-4 ms-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
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
                  <h3 className="font-semibold text-lg text-foreground">نبحث لك عن اقتراحات مناسبة</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    لا توجد اقتراحات جديدة الآن. سنرسل لك إشعاراً فور وصول اقتراح يناسبك، وإكمال ملفك واختبار الشخصية يجعل الاقتراحات أدق.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 pt-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>يتم تحديث الاقتراحات بشكل دوري</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {suggestions.map((s, index) => {
                const score = Math.round(s.compatibilityScore);
                const isRemoving = removingId === s.id;
                const isExpanded = expandedCards.has(s.id);
                const c = s.candidate;

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
                    <PersonCard
                      name={c.firstName}
                      verified={c.isVerified}
                      age={c.age}
                      city={c.city}
                      area={c.area}
                      job={c.job && describeOption("job", c.job, partnerGender)}
                      score={score}
                      photoLocked
                      avatarMark={
                        s.isManual ? (
                          <span className="h-5 w-5 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center shadow-sm">
                            <Star className="h-2.5 w-2.5 text-white fill-white" aria-hidden="true" />
                          </span>
                        ) : undefined
                      }
                      badges={
                        s.isManual ? (
                          <Badge className="bg-gradient-to-l from-accent/20 to-accent/10 text-accent-foreground border border-accent/20 text-[10px] px-2 py-0">
                            اقتراح الإدارة
                          </Badge>
                        ) : undefined
                      }
                      tags={[
                        { icon: User, label: c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, partnerGender) },
                        { icon: GraduationCap, label: c.education },
                        { icon: Moon, label: c.religiosity && describeOption("religiosity", c.religiosity, partnerGender) },
                        { icon: Cigarette, label: c.smokingStatus && describeOption("smokingStatus", c.smokingStatus, partnerGender) },
                        { icon: Flag, label: c.nationality },
                      ]}
                      aboutMe={c.aboutMe}
                      expanded={isExpanded}
                      onToggleExpand={() => toggleExpand(s.id)}
                      details={<CandidateDetails c={c} />}
                      actions={
                          <>
                          {creditHint}
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleAction(s.id, "like")}
                              disabled={acting === s.id || interestLocked}
                              className="flex-1 h-12 bg-gradient-to-l from-primary to-secondary hover:from-secondary hover:to-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold text-base"
                            >
                              {acting === s.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <><HeartHandshake className="h-5 w-5 me-2" />أبدِ اهتماماً</>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleAction(s.id, "reject")}
                              disabled={acting === s.id}
                              aria-label="لا"
                              className="h-12 px-5 border-destructive/30 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold"
                            >
                              <X className="h-5 w-5" />
                            </Button>
                            {/* Report/Block menu */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="خيارات إضافية"
                                className="h-12 w-12 rounded-xl"
                                onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)}
                              >
                                <MoreVertical className="h-5 w-5" />
                              </Button>
                              {menuOpen === s.id && (
                                <div className="absolute bottom-full mb-1 end-0 bg-card border rounded-xl shadow-lg py-1 z-50 w-40">
                                  <button
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-amber-600"
                                    onClick={() => { setReportDialog({ userId: c.id, name: c.firstName }); setMenuOpen(null); }}
                                  >
                                    <ShieldAlert className="h-4 w-4" />
                                    إبلاغ
                                  </button>
                                  <button
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-destructive"
                                    onClick={() => handleBlock(c.id, c.firstName, s.id, "suggestion")}
                                  >
                                    <Ban className="h-4 w-4" />
                                    حظر
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          </>
                      }
                    />
                  </div>
                );
              })}
              {sugTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <Button variant="outline" size="sm" disabled={sugPage <= 1} onClick={() => { const p = sugPage - 1; setSugPage(p); fetchSuggestions(p); }}>
                    <ChevronRight className="h-4 w-4 me-1" />
                    السابق
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    صفحة {sugPage} من {sugTotalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={sugPage >= sugTotalPages} onClick={() => { const p = sugPage + 1; setSugPage(p); fetchSuggestions(p); }}>
                    التالي
                    <ChevronLeft className="h-4 w-4 ms-1" />
                  </Button>
                </div>
              )}
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
                  <h3 className="font-semibold text-lg text-foreground">لم ترسل أي طلبات بعد</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    عند قبول اقتراح، سيظهر هنا حتى تتمكن من متابعة حالته.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sentRequests.map((req, index) => {
                const config = STATUS_CONFIG[req.status];
                const StatusIcon = config.icon;
                const sentDate = new Date(req.sentAt).toLocaleDateString("ar-JO-u-nu-latn", {
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
                    <PersonCard
                      compact
                      name={req.candidate.firstName}
                      verified={req.candidate.isVerified}
                      age={req.candidate.age}
                      city={req.candidate.city}
                      job={req.candidate.job && describeOption("job", req.candidate.job, partnerGender)}
                      photoLocked={req.status !== "matched"}
                      tone={req.status === "matched" ? "success" : req.status === "seen" ? "info" : "pending"}
                      badges={
                        <Badge className={`${config.className} border text-[11px] px-2.5 py-0.5 flex items-center gap-1 flex-shrink-0`}>
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      }
                      tags={[{ icon: GraduationCap, label: req.candidate.education }]}
                      actions={
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground/70">أُرسل في {sentDate}</span>
                          {req.status === "matched" && (
                            <Link
                              href="/dashboard/matches"
                              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                            >
                              عرض التوافق ←
                            </Link>
                          )}
                        </div>
                      }
                    />
                  </div>
                );
              })}
              {sentTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <Button variant="outline" size="sm" disabled={sentPage <= 1} onClick={() => { const p = sentPage - 1; setSentPage(p); fetchSentRequests(p); }}>
                    <ChevronRight className="h-4 w-4 me-1" />
                    السابق
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    صفحة {sentPage} من {sentTotalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={sentPage >= sentTotalPages} onClick={() => { const p = sentPage + 1; setSentPage(p); fetchSentRequests(p); }}>
                    التالي
                    <ChevronLeft className="h-4 w-4 ms-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Received Interests Tab */}
      {activeTab === "interests" && (
        <>
          {interestsLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل طلبات الاهتمام...</p>
            </div>
          ) : interests.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-muted/30">
              <CardContent className="text-center py-16 md:py-20 space-y-5">
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full animate-pulse" />
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
                    <Heart className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">لا توجد طلبات اهتمام حالياً</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    سيتم إعلامك عندما يبدي شخص ما اهتماماً بملفك الشخصي. تأكد من إكمال ملفك للحصول على أفضل النتائج.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {interests.map((interest, index) => {
                const score = Math.round(interest.compatibilityScore);
                const isRemoving = removingId === interest.id;
                const isExpanded = expandedCards.has(interest.id);
                const c = interest.candidate;

                return (
                  <div
                    key={interest.id}
                    className="transition-all duration-400"
                    style={{
                      opacity: isRemoving ? 0 : 1,
                      transform: isRemoving ? "scale(0.95) translateY(-10px)" : "none",
                      animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
                    }}
                  >
                    <PersonCard
                      name={c.firstName}
                      verified={c.isVerified}
                      age={c.age}
                      city={c.city}
                      area={c.area}
                      job={c.job && describeOption("job", c.job, partnerGender)}
                      score={score}
                      photoLocked
                      tags={[
                        { icon: User, label: c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, partnerGender) },
                        { icon: GraduationCap, label: c.education },
                        { icon: Moon, label: c.religiosity && describeOption("religiosity", c.religiosity, partnerGender) },
                        { icon: Flag, label: c.nationality },
                      ]}
                      aboutMe={c.aboutMe}
                      expanded={isExpanded}
                      onToggleExpand={() => toggleExpand(interest.id)}
                      details={<CandidateDetails c={c} />}
                      actions={
                          <>
                          {creditHint}
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleInterestAction(interest.id, "accept")}
                              disabled={acting === interest.id || interestLocked}
                              className="flex-1 h-12 bg-gradient-to-l from-primary to-secondary hover:from-secondary hover:to-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold text-base"
                            >
                              {acting === interest.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <><HeartHandshake className="h-5 w-5 me-2" />قبول</>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleInterestAction(interest.id, "reject")}
                              disabled={acting === interest.id}
                              aria-label="رفض"
                              className="h-12 px-5 border-destructive/30 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold"
                            >
                              <X className="h-5 w-5" />
                            </Button>
                            {/* Report/Block menu */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="خيارات إضافية"
                                className="h-12 w-12 rounded-xl"
                                onClick={() => setMenuOpen(menuOpen === interest.id ? null : interest.id)}
                              >
                                <MoreVertical className="h-5 w-5" />
                              </Button>
                              {menuOpen === interest.id && (
                                <div className="absolute bottom-full mb-1 end-0 bg-card border rounded-xl shadow-lg py-1 z-50 w-40">
                                  <button
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-amber-600"
                                    onClick={() => { setReportDialog({ userId: c.id, name: c.firstName }); setMenuOpen(null); }}
                                  >
                                    <ShieldAlert className="h-4 w-4" />
                                    إبلاغ
                                  </button>
                                  <button
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-destructive"
                                    onClick={() => handleBlock(c.id, c.firstName, interest.id, "interest")}
                                  >
                                    <Ban className="h-4 w-4" />
                                    حظر
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          </>
                      }
                    />
                  </div>
                );
              })}
              {intTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <Button variant="outline" size="sm" disabled={intPage <= 1} onClick={() => { const p = intPage - 1; setIntPage(p); fetchInterests(p); }}>
                    <ChevronRight className="h-4 w-4 me-1" />
                    السابق
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    صفحة {intPage} من {intTotalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={intPage >= intTotalPages} onClick={() => { const p = intPage + 1; setIntPage(p); fetchInterests(p); }}>
                    التالي
                    <ChevronLeft className="h-4 w-4 ms-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Report Dialog */}
      {reportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setReportDialog(null)}>
          <div className="bg-card rounded-2xl border shadow-2xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">إبلاغ عن {reportDialog.name}</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">سبب الإبلاغ</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              >
                <option value="FAKE_PROFILE">ملف شخصي مزيف</option>
                <option value="INAPPROPRIATE_CONTENT">محتوى غير لائق</option>
                <option value="HARASSMENT">تحرّش</option>
                <option value="SPAM">رسائل مزعجة</option>
                <option value="OTHER">أخرى</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">تفاصيل إضافية (اختياري)</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] resize-none"
                placeholder="أضف تفاصيل إن وجدت..."
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleReportSubmit}
                disabled={reportSubmitting}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl"
              >
                {reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال البلاغ"}
              </Button>
              <Button variant="outline" onClick={() => setReportDialog(null)} className="rounded-xl">
                إلغاء
              </Button>
            </div>
          </div>
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
