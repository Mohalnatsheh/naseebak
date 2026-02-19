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
  Ruler,
  Weight,
  Cigarette,
  BookOpen,
  Wallet,
  Palette,
  Activity,
  Moon,
  Flag,
  ChevronDown,
  ChevronUp,
  Home,
  Users,
  Baby,
  MapPinned,
  UtensilsCrossed,
  Car,
  Gem,
  Quote,
  Sparkle,
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
    firstName: string;
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
    age: number | null;
    city: string | null;
    education: string | null;
    job: string | null;
  };
}

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

function getScoreLabel(score: number) {
  if (score >= 85) return "توافق ممتاز";
  if (score >= 70) return "توافق جيد جداً";
  if (score >= 55) return "توافق جيد";
  if (score >= 40) return "توافق مقبول";
  return "توافق منخفض";
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

/* ── Section row helper ── */
function InfoRow({
  icon: Icon,
  label,
  value,
  wide,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | null | undefined;
  wide?: boolean;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 ${wide ? "col-span-2" : ""}`}>
      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary/60" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-muted-foreground/70 block leading-tight">{label}</span>
        <span className="text-sm font-semibold text-foreground truncate block">{value}</span>
      </div>
    </div>
  );
}

/* ── Collapsible section ── */
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/40 rounded-xl overflow-hidden bg-card/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary/70" />
          </div>
          <span className="text-sm font-bold text-foreground">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-3 grid grid-cols-2 gap-2">{children}</div>}
    </div>
  );
}

/* ── Candidate expanded details shared component ── */
function CandidateDetails({ c }: { c: Suggestion["candidate"] | Interest["candidate"] }) {
  return (
    <div className="px-5 md:px-6 pb-4 space-y-3" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
      <Section title="المعلومات الشخصية" icon={User} defaultOpen={true}>
        <InfoRow icon={Calendar} label="العمر" value={c.age ? `${c.age} سنة` : null} />
        <InfoRow icon={MapPin} label="المدينة" value={c.city} />
        <InfoRow icon={MapPinned} label="المنطقة" value={c.area} />
        <InfoRow icon={Flag} label="الجنسية" value={c.nationality} />
        <InfoRow icon={User} label="الحالة الاجتماعية" value={c.maritalStatus} />
        <InfoRow icon={Baby} label="عدد الأبناء" value={c.childrenCount > 0 ? `${c.childrenCount}` : "لا يوجد"} />
        <InfoRow icon={Ruler} label="الطول" value={c.height ? `${c.height} سم` : null} />
        <InfoRow icon={Weight} label="الوزن" value={c.weight ? `${c.weight} كغ` : null} />
        <InfoRow icon={Palette} label="لون البشرة" value={c.skinColor} />
        {c.hijab !== null && c.hijab !== undefined && (
          <InfoRow icon={User} label="الحجاب" value={c.hijab ? "نعم" : "لا"} />
        )}
        {c.beard !== null && c.beard !== undefined && (
          <InfoRow icon={User} label="اللحية" value={c.beard ? "نعم" : "لا"} />
        )}
      </Section>
      <Section title="التعليم والعمل" icon={GraduationCap} defaultOpen={true}>
        <InfoRow icon={GraduationCap} label="المستوى التعليمي" value={c.education} />
        <InfoRow icon={BookOpen} label="التخصص" value={c.fieldOfStudy} />
        <InfoRow icon={Briefcase} label="الوظيفة" value={c.job} />
        <InfoRow icon={Wallet} label="مستوى الدخل" value={c.incomeRange} />
      </Section>
      <Section title="الدين ونمط الحياة" icon={Moon} defaultOpen={true}>
        <InfoRow icon={Moon} label="مستوى التدين" value={c.religiosity} />
        <InfoRow icon={Cigarette} label="التدخين" value={c.smokingStatus} />
        <InfoRow icon={Activity} label="نمط الحياة" value={c.lifestyle} />
        <InfoRow icon={UtensilsCrossed} label="القدرة على الطبخ" value={c.cookingAbility} />
        <InfoRow icon={Car} label="رخصة قيادة" value={c.drivingLicense !== null && c.drivingLicense !== undefined ? (c.drivingLicense ? "نعم" : "لا") : null} />
      </Section>
      <Section title="العائلة" icon={Users} defaultOpen={true}>
        <InfoRow icon={Gem} label="العشيرة" value={c.tribe} />
        <InfoRow icon={MapPinned} label="منطقة أصل العائلة" value={c.familyOriginArea} />
        <InfoRow icon={Users} label="عدد الإخوة" value={c.numberOfSiblings !== null && c.numberOfSiblings !== undefined ? `${c.numberOfSiblings}` : null} />
        <InfoRow icon={Home} label="نوع السكن" value={c.housingType} />
        <InfoRow icon={MapPin} label="الاستعداد للانتقال" value={c.willingToRelocate} />
        <InfoRow icon={Heart} label="القيم العائلية" value={c.familyValues} wide />
      </Section>
      {(c.hobbies || c.interests) && (
        <Section title="الهوايات والاهتمامات" icon={Sparkles} defaultOpen={true}>
          {c.hobbies && (
            <div className="col-span-2 py-2">
              <span className="text-[11px] text-muted-foreground/70 block mb-2">الهوايات</span>
              <div className="flex flex-wrap gap-1.5">
                {c.hobbies.split("،").map((h, i) => (
                  <span key={`h-${i}`} className="inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground">{h.trim()}</span>
                ))}
              </div>
            </div>
          )}
          {c.interests && (
            <div className="col-span-2 py-2">
              <span className="text-[11px] text-muted-foreground/70 block mb-2">الاهتمامات</span>
              <div className="flex flex-wrap gap-1.5">
                {c.interests.split("،").map((interest2, i) => (
                  <span key={`i-${i}`} className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200/50 px-3 py-1 text-xs font-medium text-blue-700">{interest2.trim()}</span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentLoading, setSentLoading] = useState(false);
  const [interestsLoading, setInterestsLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [accountComplete, setAccountComplete] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "sent" | "interests">("new");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        const user = data.user;
        const isVerified = user?.identityDoc?.status === "APPROVED";
        const hasProfile = user?.profile?.isComplete;
        const hasQuiz = !!user?.personalityResult;
        setAccountComplete(isVerified && hasProfile && hasQuiz);

        await fetchSuggestions();
      } catch {
        setAccountComplete(false);
        setLoading(false);
      }
    }
    init();
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

  async function fetchInterests() {
    setInterestsLoading(true);
    try {
      const res = await fetch("/api/interests/received");
      const data = await res.json();
      setInterests(data.interests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setInterestsLoading(false);
    }
  }

  function handleTabChange(tab: "new" | "sent" | "interests") {
    setActiveTab(tab);
    if (tab === "sent" && sentRequests.length === 0) {
      fetchSentRequests();
    }
    if (tab === "interests" && interests.length === 0) {
      fetchInterests();
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

      if (res.ok) {
        setRemovingId(id);
        setTimeout(() => {
          setInterests((prev) => prev.filter((i) => i.id !== id));
          setRemovingId(null);
        }, 400);
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
                {activeTab === "interests" && interests.length > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-rose-500 text-white text-xs font-bold animate-pulse">
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
              activeTab === "interests" ? "bg-rose-500 text-white" : "bg-rose-500/20 text-rose-600"
            }`}>
              {interests.length}
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
                    سيتم إرسال اقتراحات جديدة إليك قريباً. تأكد من إكمال ملفك الشخصي واختبار الشخصية للحصول على أفضل النتائج.
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
                    <Card className="group overflow-hidden border-border/50 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
                      <div className={`h-1.5 bg-gradient-to-l ${getScoreColor(score)}`} />
                      <CardContent className="p-0">
                        {/* Card Header */}
                        <div className="p-5 md:p-6 pb-4">
                          <div className="flex items-start gap-4">
                            <div className="relative flex-shrink-0">
                              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center border border-primary/10 shadow-sm">
                                <span className="text-2xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                                  {c.firstName.charAt(0)}
                                </span>
                              </div>
                              {s.isManual && (
                                <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-br from-accent to-amber-500 flex items-center justify-center shadow-sm">
                                  <Star className="h-2.5 w-2.5 text-white fill-white" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-bold text-xl text-foreground truncate">{c.firstName}</h3>
                                {s.isManual && (
                                  <Badge className="bg-gradient-to-l from-accent/20 to-amber-100 text-amber-700 border border-amber-200/50 text-[10px] px-2 py-0">
                                    اقتراح الإدارة
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                {c.age && (
                                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />{c.age} سنة
                                  </span>
                                )}
                                {c.city && (
                                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" />{c.city}{c.area ? ` - ${c.area}` : ""}
                                  </span>
                                )}
                                {c.job && (
                                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                    <Briefcase className="h-3.5 w-3.5" />{c.job}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <div className={`relative h-[72px] w-[72px] rounded-full flex items-center justify-center ring-4 ${getScoreRingColor(score)} bg-gradient-to-br ${getScoreColor(score)} shadow-lg`}>
                                <div className="h-[56px] w-[56px] rounded-full bg-card flex flex-col items-center justify-center">
                                  <span className="text-xl font-black text-foreground leading-none">{score}</span>
                                  <span className="text-[8px] text-muted-foreground font-medium leading-none mt-0.5">% توافق</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <Sparkle className="h-3.5 w-3.5 text-primary/50" />
                            <span className="text-xs font-medium text-primary/70">{getScoreLabel(score)}</span>
                          </div>
                        </div>

                        {/* Quick chips */}
                        <div className="px-5 md:px-6 pb-4">
                          <div className="flex flex-wrap gap-2">
                            {c.maritalStatus && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <User className="h-3 w-3 text-primary/50" />{c.maritalStatus}
                              </div>
                            )}
                            {c.education && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <GraduationCap className="h-3 w-3 text-primary/50" />{c.education}
                              </div>
                            )}
                            {c.religiosity && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <Moon className="h-3 w-3 text-primary/50" />{c.religiosity}
                              </div>
                            )}
                            {c.smokingStatus && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <Cigarette className="h-3 w-3 text-primary/50" />{c.smokingStatus}
                              </div>
                            )}
                            {c.nationality && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <Flag className="h-3 w-3 text-primary/50" />{c.nationality}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* About Me */}
                        {c.aboutMe && (
                          <div className="mx-5 md:mx-6 mb-4 p-4 rounded-xl bg-gradient-to-l from-primary/5 to-primary/[0.02] border border-primary/10">
                            <div className="flex items-start gap-2.5">
                              <Quote className="h-4 w-4 text-primary/40 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground/80 leading-relaxed">{c.aboutMe}</p>
                            </div>
                          </div>
                        )}

                        {/* Expand toggle */}
                        <div className="px-5 md:px-6 mb-4">
                          <button
                            onClick={() => toggleExpand(s.id)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-semibold text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <><ChevronUp className="h-4 w-4" />إخفاء التفاصيل</>
                            ) : (
                              <><ChevronDown className="h-4 w-4" />عرض جميع التفاصيل</>
                            )}
                          </button>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && <CandidateDetails c={c} />}

                        {/* Action Buttons */}
                        <div className="p-5 md:p-6 pt-0">
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleAction(s.id, "like")}
                              disabled={acting === s.id}
                              className="flex-1 h-12 bg-gradient-to-l from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold text-base"
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
                              className="h-12 px-5 border-destructive/30 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold"
                            >
                              <X className="h-5 w-5" />
                            </Button>
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
                          <div className="flex-shrink-0">
                            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center border border-primary/10">
                              <span className="text-xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                                {req.candidate.firstName.charAt(0)}
                              </span>
                            </div>
                          </div>
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

      {/* Received Interests Tab */}
      {activeTab === "interests" && (
        <>
          {interestsLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-rose-200/40 to-primary/10 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-rose-500" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل طلبات الاهتمام...</p>
            </div>
          ) : interests.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-muted/30">
              <CardContent className="text-center py-16 md:py-20 space-y-5">
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-100/60 to-primary/10 rounded-full animate-pulse" />
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-rose-50 to-primary/5 flex items-center justify-center border-2 border-dashed border-rose-200/50">
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
                    <Card className="group overflow-hidden border-border/50 hover:border-rose-300/50 hover:shadow-xl hover:shadow-rose-500/5 transition-all duration-300">
                      <div className={`h-1.5 bg-gradient-to-l ${getScoreColor(score)}`} />
                      <CardContent className="p-0">
                        {/* Card Header */}
                        <div className="p-5 md:p-6 pb-4">
                          <div className="flex items-start gap-4">
                            <div className="relative flex-shrink-0">
                              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-200/40 via-rose-100/20 to-accent/10 flex items-center justify-center border border-rose-200/30 shadow-sm">
                                <span className="text-2xl font-bold bg-gradient-to-br from-rose-500 to-primary bg-clip-text text-transparent">
                                  {c.firstName.charAt(0)}
                                </span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-xl text-foreground truncate mb-1">{c.firstName}</h3>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                {c.age && (
                                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />{c.age} سنة
                                  </span>
                                )}
                                {c.city && (
                                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" />{c.city}{c.area ? ` - ${c.area}` : ""}
                                  </span>
                                )}
                                {c.job && (
                                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                    <Briefcase className="h-3.5 w-3.5" />{c.job}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <div className={`relative h-[72px] w-[72px] rounded-full flex items-center justify-center ring-4 ${getScoreRingColor(score)} bg-gradient-to-br ${getScoreColor(score)} shadow-lg`}>
                                <div className="h-[56px] w-[56px] rounded-full bg-card flex flex-col items-center justify-center">
                                  <span className="text-xl font-black text-foreground leading-none">{score}</span>
                                  <span className="text-[8px] text-muted-foreground font-medium leading-none mt-0.5">% توافق</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <Sparkle className="h-3.5 w-3.5 text-primary/50" />
                            <span className="text-xs font-medium text-primary/70">{getScoreLabel(score)}</span>
                          </div>
                        </div>

                        {/* Quick chips */}
                        <div className="px-5 md:px-6 pb-4">
                          <div className="flex flex-wrap gap-2">
                            {c.maritalStatus && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <User className="h-3 w-3 text-primary/50" />{c.maritalStatus}
                              </div>
                            )}
                            {c.education && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <GraduationCap className="h-3 w-3 text-primary/50" />{c.education}
                              </div>
                            )}
                            {c.religiosity && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <Moon className="h-3 w-3 text-primary/50" />{c.religiosity}
                              </div>
                            )}
                            {c.nationality && (
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                                <Flag className="h-3 w-3 text-primary/50" />{c.nationality}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* About Me */}
                        {c.aboutMe && (
                          <div className="mx-5 md:mx-6 mb-4 p-4 rounded-xl bg-gradient-to-l from-primary/5 to-primary/[0.02] border border-primary/10">
                            <div className="flex items-start gap-2.5">
                              <Quote className="h-4 w-4 text-primary/40 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground/80 leading-relaxed">{c.aboutMe}</p>
                            </div>
                          </div>
                        )}

                        {/* Expand toggle */}
                        <div className="px-5 md:px-6 mb-4">
                          <button
                            onClick={() => toggleExpand(interest.id)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-semibold text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <><ChevronUp className="h-4 w-4" />إخفاء التفاصيل</>
                            ) : (
                              <><ChevronDown className="h-4 w-4" />عرض جميع التفاصيل</>
                            )}
                          </button>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && <CandidateDetails c={c} />}

                        {/* Action Buttons */}
                        <div className="p-5 md:p-6 pt-0">
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleInterestAction(interest.id, "accept")}
                              disabled={acting === interest.id}
                              className="flex-1 h-12 bg-gradient-to-l from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-md shadow-rose-500/20 hover:shadow-lg hover:shadow-rose-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold text-base"
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
                              className="h-12 px-5 border-destructive/30 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl font-bold"
                            >
                              <X className="h-5 w-5" />
                            </Button>
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
