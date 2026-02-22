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
  Calendar,
  User,
  Moon,
  Flag,
  ChevronDown,
  ChevronUp,
  Ruler,
  Weight,
  Cigarette,
  BookOpen,
  Wallet,
  Palette,
  Activity,
  MapPinned,
  Baby,
  Home,
  UtensilsCrossed,
  Car,
  Gem,
  Quote,
  Sparkle,
  MoreVertical,
  ShieldAlert,
  Ban,
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
  compatibilityScore: number;
  partner: {
    id: string;
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
    photos?: { id: string; url: string }[];
  };
}

const visitStatusLabels: Record<string, string> = {
  REQUESTED: "طلب زيارة مرسل",
  FAMILIES_CONTACTED: "تم التواصل مع العائلات",
  SCHEDULED: "تم تحديد موعد الزيارة",
  COMPLETED: "تمت الزيارة",
  CANCELLED: "ملغاة",
};

const visitStatusDescriptions: Record<string, string> = {
  REQUESTED: "سيقوم فريق نصيبك بالتواصل مع عائلتكم وعائلة الطرف الآخر لترتيب موعد مناسب للزيارة العائلية.",
  FAMILIES_CONTACTED: "تم التواصل مع العائلتين وجارٍ التنسيق لتحديد موعد مناسب للطرفين.",
  SCHEDULED: "تم الاتفاق على موعد الزيارة. نتمنى لكم التوفيق!",
  COMPLETED: "تمت الزيارة العائلية بنجاح. نسأل الله أن يكتب لكم الخير.",
  CANCELLED: "تم إلغاء طلب الزيارة. يمكنك التواصل مع الدعم لمزيد من المعلومات.",
};

const visitStatusConfig: Record<string, { color: string; borderColor: string; bgColor: string; icon: typeof Clock }> = {
  REQUESTED: {
    color: "bg-gradient-to-l from-amber-100 to-amber-50 text-amber-700 border-amber-200/60",
    borderColor: "border-r-amber-400",
    bgColor: "from-amber-50/50 to-transparent",
    icon: Clock,
  },
  FAMILIES_CONTACTED: {
    color: "bg-gradient-to-l from-primary/15 to-primary/5 text-primary border-primary/20",
    borderColor: "border-r-primary",
    bgColor: "from-primary/5 to-transparent",
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
    color: "bg-gradient-to-l from-destructive/15 to-destructive/5 text-destructive border-destructive/20",
    borderColor: "border-r-destructive",
    bgColor: "from-destructive/5 to-transparent",
    icon: XCircle,
  },
};

function getScoreColor(score: number) {
  if (score >= 80) return "from-primary to-secondary";
  if (score >= 60) return "from-primary to-primary/70";
  if (score >= 40) return "from-accent to-accent/70";
  return "from-destructive to-destructive/70";
}

function getScoreRingColor(score: number) {
  if (score >= 80) return "ring-primary/30";
  if (score >= 60) return "ring-primary/20";
  if (score >= 40) return "ring-accent/30";
  return "ring-destructive/30";
}

function getScoreLabel(score: number) {
  if (score >= 85) return "توافق ممتاز";
  if (score >= 70) return "توافق جيد جداً";
  if (score >= 55) return "توافق جيد";
  if (score >= 40) return "توافق مقبول";
  return "توافق منخفض";
}

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

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPhotos, setShowPhotos] = useState<Record<string, boolean>>({});
  const [matchPhotos, setMatchPhotos] = useState<Record<string, { id: string; url: string }[]>>({});
  const [loadingPhotos, setLoadingPhotos] = useState<Record<string, boolean>>({});
  const [accountComplete, setAccountComplete] = useState<boolean | null>(null);
  const [isFemale, setIsFemale] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [reportDialog, setReportDialog] = useState<{ userId: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState("FAKE_PROFILE");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  async function handleReportSubmit() {
    if (!reportDialog) return;
    setReportSubmitting(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedId: reportDialog.userId,
          reason: reportReason,
          details: reportDetails || undefined,
        }),
      });
      setReportDialog(null);
      setReportReason("FAKE_PROFILE");
      setReportDetails("");
    } catch (err) {
      console.error(err);
    } finally {
      setReportSubmitting(false);
    }
  }

  const togglePhotos = useCallback(async (matchId: string) => {
    const isCurrentlyShown = showPhotos[matchId];
    setShowPhotos((prev) => ({ ...prev, [matchId]: !prev[matchId] }));

    // Fetch photos on first open if not already loaded
    if (!isCurrentlyShown && !matchPhotos[matchId]) {
      setLoadingPhotos((prev) => ({ ...prev, [matchId]: true }));
      try {
        const res = await fetch(`/api/matches/${matchId}/photos`);
        if (res.ok) {
          const data = await res.json();
          setMatchPhotos((prev) => ({ ...prev, [matchId]: data.photos || [] }));
        }
      } catch (err) {
        console.error("Failed to fetch photos", err);
      } finally {
        setLoadingPhotos((prev) => ({ ...prev, [matchId]: false }));
      }
    }
  }, [showPhotos, matchPhotos]);

  function toggleExpand(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    checkCompletion();
    fetchMatches();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
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
        <Card className="relative overflow-hidden border-amber-300/50 bg-gradient-to-l from-amber-50/80 to-accent/5 shadow-md">
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

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/5 via-secondary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-primary/10 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <Heart className="h-5 w-5 text-white fill-white" />
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
                التوافقات المتبادلة
              </h1>
              {matches.length > 0 && (
                <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-gradient-to-br from-primary to-secondary text-white text-xs font-bold shadow-sm">
                  {matches.length}
                </span>
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            {isFemale
              ? "الأشخاص الذين تبادلتم الإعجاب. يمكنك رؤية تفاصيلهم وطلب زيارة عائلية."
              : "الأشخاص الذين تبادلتم الإعجاب. يمكنك رؤية تفاصيلهم وطلب زيارة عائلية."}
          </p>
        </div>
      </div>

      {/* Match Cards */}
      {matches.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-primary/5">
          <CardContent className="text-center py-16 md:py-20 space-y-5">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-secondary/10 rounded-full animate-pulse" />
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
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
              <span>راجع اقتراحاتك لزيادة فرص التوافق</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {matches.map((m, index) => {
            const statusConfig = m.visitStatus ? visitStatusConfig[m.visitStatus] : null;
            const StatusIcon = statusConfig?.icon || Clock;
            const score = Math.round(m.compatibilityScore);
            const isExpanded = expandedCards.has(m.id);
            const c = m.partner;

            return (
              <div
                key={m.id}
                style={{
                  animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
                }}
              >
                <Card
                  className={`group overflow-hidden transition-all duration-300 hover:-translate-y-1 border-border/50 hover:shadow-xl hover:shadow-primary/5 ${
                    statusConfig ? `border-r-4 ${statusConfig.borderColor}` : "border-r-4 border-r-primary/30"
                  }`}
                >
                  {/* Score gradient header strip */}
                  <div className={`h-1.5 bg-gradient-to-l ${getScoreColor(score)}`} />

                  {/* Status gradient background */}
                  {statusConfig && (
                    <div className={`absolute inset-0 bg-gradient-to-l ${statusConfig.bgColor} pointer-events-none opacity-40`} />
                  )}

                  <CardContent className="relative p-0">
                    {/* Card Header: Name + Score */}
                    <div className="p-5 md:p-6 pb-4">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-accent/10 flex items-center justify-center border border-primary/15 shadow-sm">
                            <span className="text-2xl font-bold bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">
                              {c.firstName.charAt(0)}
                            </span>
                          </div>
                        </div>

                        {/* Name + Tags */}
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
                          <p className="text-xs text-muted-foreground mt-1.5">
                            توافق بتاريخ {new Date(m.createdAt).toLocaleDateString("ar-JO")}
                          </p>
                        </div>

                        {/* Compatibility score ring */}
                        {score > 0 && (
                          <div className="flex-shrink-0">
                            <div className={`relative h-[72px] w-[72px] rounded-full flex items-center justify-center ring-4 ${getScoreRingColor(score)} bg-gradient-to-br ${getScoreColor(score)} shadow-lg`}>
                              <div className="h-[56px] w-[56px] rounded-full bg-card flex flex-col items-center justify-center">
                                <span className="text-xl font-black text-foreground leading-none">{score}</span>
                                <span className="text-[8px] text-muted-foreground font-medium leading-none mt-0.5">% توافق</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Score label + Visit status */}
                      <div className="mt-3 flex items-center justify-between">
                        {score > 0 && (
                          <div className="flex items-center gap-2">
                            <Sparkle className="h-3.5 w-3.5 text-primary/50" />
                            <span className="text-xs font-medium text-primary/70">{getScoreLabel(score)}</span>
                          </div>
                        )}
                        {m.visitStatus && statusConfig && (
                          <Badge className={`gap-1.5 px-3 py-1 border text-xs font-semibold ${statusConfig.color}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {visitStatusLabels[m.visitStatus] || m.visitStatus}
                          </Badge>
                        )}
                      </div>

                      {/* Visit status explanation */}
                      {m.visitStatus && visitStatusDescriptions[m.visitStatus] && (
                        <div className={`mt-3 p-3 rounded-xl border text-sm leading-relaxed ${
                          m.visitStatus === "REQUESTED" ? "bg-amber-50/60 border-amber-200/40 text-amber-800" :
                          m.visitStatus === "FAMILIES_CONTACTED" ? "bg-primary/5 border-primary/15 text-primary" :
                          m.visitStatus === "SCHEDULED" ? "bg-green-50/60 border-green-200/40 text-green-800" :
                          m.visitStatus === "COMPLETED" ? "bg-emerald-50/60 border-emerald-200/40 text-emerald-800" :
                          m.visitStatus === "CANCELLED" ? "bg-destructive/5 border-destructive/15 text-destructive" :
                          "bg-muted/30 border-border/40 text-muted-foreground"
                        }`}>
                          <div className="flex items-start gap-2.5">
                            <StatusIcon className="h-4 w-4 flex-shrink-0 mt-0.5 opacity-70" />
                            <p>{visitStatusDescriptions[m.visitStatus]}</p>
                          </div>
                        </div>
                      )}
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
                        onClick={() => toggleExpand(m.id)}
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
                    {isExpanded && (
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
                          {/* Show beard when viewing male partner (isFemale means partner is male) */}
                          {isFemale && c.beard !== null && c.beard !== undefined && (
                            <InfoRow icon={User} label="اللحية" value={c.beard ? "نعم" : "لا"} />
                          )}
                          {/* Show hijab when viewing female partner (!isFemale means partner is female) */}
                          {!isFemale && c.hijab !== null && c.hijab !== undefined && (
                            <InfoRow icon={User} label="الحجاب" value={c.hijab ? "نعم" : "لا"} />
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
                          <InfoRow icon={MapPin} label="الاستعداد للانتقال" value={c.willingToRelocate === "yes" ? "نعم" : c.willingToRelocate === "no" ? "لا" : c.willingToRelocate === "maybe" ? "ربما" : c.willingToRelocate} />
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
                                  {c.interests.split("،").map((interest, i) => (
                                    <span key={`i-${i}`} className="inline-flex items-center rounded-full bg-primary/5 border border-primary/15 px-3 py-1 text-xs font-medium text-primary">{interest.trim()}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </Section>
                        )}
                      </div>
                    )}

                    {/* Scheduled visit date */}
                    {m.scheduledDate && (
                      <div className="mx-5 md:mx-6 mb-4 p-3.5 bg-gradient-to-l from-green-50 to-emerald-50/50 rounded-xl flex items-center gap-3 text-sm text-green-800 border border-green-200/40">
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

                    {/* Photos toggle */}
                    {m.photosRevealed && showPhotos[m.id] && (
                      <div className="mx-5 md:mx-6 mb-4">
                        {loadingPhotos[m.id] ? (
                          <div className="flex flex-col items-center justify-center gap-2 p-6 bg-muted/30 rounded-xl border border-border/40">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">جاري تحميل الصور...</span>
                          </div>
                        ) : matchPhotos[m.id] && matchPhotos[m.id].length > 0 ? (
                          <div className="grid grid-cols-2 gap-2.5 p-3 bg-muted/30 rounded-xl border border-border/40">
                            {matchPhotos[m.id].map((photo) => (
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

                    {/* Action buttons */}
                    <div className="p-5 md:p-6 pt-0">
                      <div className="flex gap-3">
                        {m.photosRevealed ? (
                          <Button
                            variant="outline"
                            className={`flex-1 h-11 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                              showPhotos[m.id]
                                ? "bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                                : "border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/30"
                            }`}
                            onClick={() => togglePhotos(m.id)}
                          >
                            {showPhotos[m.id] ? (
                              <><EyeOff className="h-4 w-4 me-2" />إخفاء الصور</>
                            ) : (
                              <><Eye className="h-4 w-4 me-2" />عرض الصور</>
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
                        {/* Report menu */}
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="خيارات إضافية"
                            className="h-11 w-11 rounded-xl"
                            onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                          >
                            <MoreVertical className="h-5 w-5" />
                          </Button>
                          {menuOpen === m.id && (
                            <div className="absolute bottom-full mb-1 left-0 bg-card border rounded-xl shadow-lg py-1 z-50 w-40">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-accent-foreground"
                                onClick={() => { setReportDialog({ userId: m.partner.id, name: m.partner.firstName }); setMenuOpen(null); }}
                              >
                                <ShieldAlert className="h-4 w-4" />
                                إبلاغ
                              </button>
                            </div>
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
                className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl"
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
