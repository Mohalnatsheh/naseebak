"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  RefreshCw,
  Calendar,
  User,
  Moon,
  Flag,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
  MoreVertical,
  ShieldAlert,
  Star,
  Ban,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { MatchClosedNote, MatchIntroPanel } from "@/components/intro/match-intro-panel";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { PersonCard, type PersonCardTone } from "@/components/shared/person-card";
import { describeOption, nationalityLabel } from "@/lib/profile-options";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboardData } from "@/contexts/dashboard-context";

interface Match {
  id: string;
  /** blocked: I blocked them · inactive: their account is off · finished: nothing left to do */
  closed: "blocked" | "inactive" | "finished" | "ended" | "engaged" | null;
  /** My block, when closed === "blocked" (for unblocking) */
  blockId: string | null;
  photosRevealed: boolean;
  revealed: boolean;
  createdAt: string;
  visitRequestId: string | null;
  visitStatus: string | null;
  scheduledDate: string | null;
  compatibilityScore: number;
  partner: {
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

/** Side stripe of the shared card per visit status */
const visitStatusTone: Record<string, PersonCardTone> = {
  REQUESTED: "pending",
  FAMILIES_CONTACTED: "info",
  SCHEDULED: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
};

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showPhotos, setShowPhotos] = useState<Record<string, boolean>>({});
  const [matchPhotos, setMatchPhotos] = useState<Record<string, { id: string; url: string }[]>>({});
  const [loadingPhotos, setLoadingPhotos] = useState<Record<string, boolean>>({});
  /** The match list failed to load: show a retry instead of an empty list */
  const [loadError, setLoadError] = useState(false);
  // Matches are never gated (no profile/quiz check): the viewer's gender only picks the wording
  const { counts, profile } = useDashboardData();
  const isFemale = profile?.gender === "FEMALE";
  const introMode = counts.flags.introRequests;
  // Opened from a notification link (?match=<id>): scroll to and highlight that card
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);
  const focusLoaded = useRef(false);
  const skipNextFetch = useRef(false);
  const focusShown = useRef(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  // Report always comes with a block here ("إبلاغ وحظر")
  const [reportDialog, setReportDialog] = useState<{ userId: string; name: string } | null>(null);
  const [blockDialog, setBlockDialog] = useState<{ userId: string; name: string } | null>(null);
  const [unblockDialog, setUnblockDialog] = useState<{ blockId: string; name: string } | null>(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reportReason, setReportReason] = useState("FAKE_PROFILE");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<{ visitId: string; matchId: string } | null>(null);
  const [feedbackOutcome, setFeedbackOutcome] = useState<"PROCEEDED" | "DECLINED">("PROCEEDED");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  async function handleFeedbackSubmit() {
    if (!feedbackDialog) return;
    setFeedbackSubmitting(true);
    try {
      const res = await fetch(`/api/visits/${feedbackDialog.visitId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: feedbackOutcome,
          rating: feedbackRating,
          reason: feedbackReason || undefined,
        }),
      });
      if (res.ok) {
        setFeedbackSubmitted((prev) => new Set(prev).add(feedbackDialog.matchId));
        setFeedbackDialog(null);
        setFeedbackOutcome("PROCEEDED");
        setFeedbackRating(5);
        setFeedbackReason("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  // Check existing feedback for completed visits
  useEffect(() => {
    async function checkFeedback() {
      const completedMatches = matches.filter((m) => m.visitStatus === "COMPLETED" && m.visitRequestId);
      for (const m of completedMatches) {
        try {
          const res = await fetch(`/api/visits/${m.visitRequestId}/feedback`);
          const data = await res.json();
          if (data.feedback) {
            setFeedbackSubmitted((prev) => new Set(prev).add(m.id));
          }
        } catch {
          // Silently fail
        }
      }
    }
    if (matches.length > 0) checkFeedback();
  }, [matches]);

  /** POST/DELETE helper: `{ ok, error }` with the server's Arabic message, never throws. */
  async function callApi(url: string, method: "POST" | "DELETE", body?: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, error: data.error };
    } catch {
      return { ok: false, status: 0, error: "تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى." };
    }
  }

  /** Block (409 = already blocked counts as done). */
  async function blockUser(userId: string): Promise<boolean> {
    const res = await callApi("/api/blocks", "POST", { blockedId: userId });
    if (!res.ok && res.status !== 409) {
      toast.error(res.error ?? "تعذّر الحظر، حاول مرة أخرى");
      return false;
    }
    return true;
  }

  async function handleReportSubmit() {
    if (!reportDialog) return;
    setReportSubmitting(true);
    try {
      const report = await callApi("/api/reports", "POST", {
        reportedId: reportDialog.userId,
        reason: reportReason,
        details: reportDetails || undefined,
      });
      // 409 = already reported earlier: still go on and block
      if (!report.ok && report.status !== 409) {
        toast.error(report.error ?? "تعذّر إرسال البلاغ، حاول مرة أخرى");
        return;
      }
      if (!(await blockUser(reportDialog.userId))) return;
      toast.success("تم إرسال البلاغ وحظر المستخدم", { description: "سيراجع فريق نصيبك البلاغ." });
      setReportDialog(null);
      setReportReason("FAKE_PROFILE");
      setReportDetails("");
      setReloadKey((k) => k + 1);
    } finally {
      setReportSubmitting(false);
    }
  }

  async function handleBlock() {
    if (!blockDialog || safetyBusy) return;
    setSafetyBusy(true);
    const ok = await blockUser(blockDialog.userId);
    setSafetyBusy(false);
    if (!ok) return;
    toast.success("تم الحظر");
    setBlockDialog(null);
    setReloadKey((k) => k + 1);
  }

  async function handleUnblock() {
    if (!unblockDialog || safetyBusy) return;
    setSafetyBusy(true);
    const res = await callApi(`/api/blocks/${unblockDialog.blockId}`, "DELETE");
    setSafetyBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر إلغاء الحظر، حاول مرة أخرى");
      return;
    }
    toast.success("تم إلغاء الحظر");
    setUnblockDialog(null);
    setReloadKey((k) => k + 1);
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
    let cancelled = false;
    async function fetchMatches() {
      try {
        // First load from a link (?match=<id>): ask for the page that holds that match
        const focus = !focusLoaded.current ? new URLSearchParams(window.location.search).get("match") : null;
        const res = await fetch(`/api/matches?page=${page}${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        setLoadError(false);
        focusLoaded.current = true;
        if (focus && data.page && data.page !== page) {
          skipNextFetch.current = true;
          setPage(data.page);
        }
        setMatches(data.matches || []);
        setTotalPages(data.totalPages || 1);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    if (skipNextFetch.current) {
      // The page changed only to show the focused match, which is already loaded
      skipNextFetch.current = false;
      return;
    }
    fetchMatches();
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("match");
    if (!id || loading || focusShown.current) return;
    const el = document.getElementById(`match-${id}`);
    if (!el) return;
    focusShown.current = true;
    setFocusMatchId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => setFocusMatchId(null), 4000);
    return () => clearTimeout(t);
  }, [loading, matches]);

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

  if (loadError && matches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto pb-8">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="pt-8 pb-8 text-center space-y-4" role="alert">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">تعذّر تحميل التوافقات</h3>
              <p className="text-sm text-muted-foreground">تحقق من اتصالك ثم حاول مرة أخرى.</p>
            </div>
            <Button
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              className="rounded-xl font-semibold"
            >
              <RefreshCw className="h-4 w-4 me-2" aria-hidden="true" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/5 via-secondary/5 to-transparent border border-primary/10 p-4 sm:p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-primary/10 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <Heart className="h-5 w-5 text-white fill-white" />
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
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
            {introMode
              ? counts.flags.creditOnInterest
                ? "الأشخاص الذين كان الاهتمام بينك وبينهم متبادلاً. يبدأ التعارف بالطريقة التي اخترتماها عند «مهتم»، وتتابعه من هنا."
                : isFemale
                  ? "الأشخاص الذين كان الاهتمام بينكِ وبينهم متبادلاً. اختاري طريقة التعارف: تعارف عائلي أو محادثة قبل الزيارة."
                  : "الأشخاص الذين كان الاهتمام بينك وبينهم متبادلاً. اختر طريقة التعارف: تعارف عائلي أو محادثة قبل الزيارة."
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
                {introMode
                  ? "عندما يكون الاهتمام متبادلاً بينك وبين أحد اقتراحاتك، يظهر التوافق هنا."
                  : "عندما يتبادل شخصان الإعجاب، ستظهر هنا تفاصيل التوافق."}
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
            // Blocked by me / inactive partner: closed card — no photos, details or actions
            const locked = m.closed === "blocked" || m.closed === "inactive";

            // New cycle: a visit the admin never picked up is replaced by the intro panel
            // New cycle: an untouched or closed (superseded by a family intro) admin visit isn't shown
            const showVisitBanner =
              !locked &&
              !!m.visitStatus && !(introMode && (m.visitStatus === "REQUESTED" || m.visitStatus === "CANCELLED"));

            return (
              <div
                key={m.id}
                id={`match-${m.id}`}
                className={`scroll-mt-24 rounded-xl transition-shadow duration-700 ${focusMatchId === m.id ? "ring-2 ring-accent ring-offset-4 ring-offset-background" : ""}`}
                style={{
                  animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
                }}
              >
                <PersonCard
                  name={c.firstName}
                  verified={c.isVerified}
                  age={c.age}
                  city={c.city}
                  area={c.area}
                  job={c.job && describeOption("job", c.job, isFemale ? "MALE" : "FEMALE")}
                  score={score}
                  photoUrl={!locked && m.photosRevealed ? matchPhotos[m.id]?.[0]?.url : undefined}
                  photoLocked={!locked && !m.photosRevealed}
                  tone={showVisitBanner && m.visitStatus ? visitStatusTone[m.visitStatus] ?? "default" : "default"}
                  meta={<>توافق بتاريخ {new Date(m.createdAt).toLocaleDateString("ar-JO-u-nu-latn")}</>}
                  status={
                    showVisitBanner && m.visitStatus && statusConfig ? (
                      <Badge className={`gap-1.5 px-3 py-1 border text-xs font-semibold ${statusConfig.color}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {visitStatusLabels[m.visitStatus] || m.visitStatus}
                      </Badge>
                    ) : undefined
                  }
                  tags={[
                    { icon: User, label: c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, isFemale ? "MALE" : "FEMALE") },
                    { icon: GraduationCap, label: c.education },
                    { icon: Moon, label: c.religiosity && describeOption("religiosity", c.religiosity, isFemale ? "MALE" : "FEMALE") },
                    { icon: Flag, label: nationalityLabel(c.nationality, isFemale ? "MALE" : "FEMALE") },
                  ]}
                  aboutMe={c.aboutMe}
                  expanded={!locked && isExpanded}
                  onToggleExpand={locked ? undefined : () => toggleExpand(m.id)}
                  details={locked ? undefined :
                      <div className="px-5 md:px-6 pb-4 space-y-3" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
                        <Section title="المعلومات الشخصية" icon={User} defaultOpen={true}>
                          <InfoRow icon={Calendar} label="العمر" value={c.age ? `${c.age} سنة` : null} />
                          <InfoRow icon={MapPin} label="المدينة" value={c.city} />
                          <InfoRow icon={MapPinned} label="المنطقة" value={c.area} />
                          <InfoRow icon={Flag} label="الجنسية" value={nationalityLabel(c.nationality, isFemale ? "MALE" : "FEMALE")} />
                          <InfoRow icon={User} label="الحالة الاجتماعية" value={c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, isFemale ? "MALE" : "FEMALE")} />
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
                          <InfoRow icon={Briefcase} label="الوظيفة" value={c.job && describeOption("job", c.job, isFemale ? "MALE" : "FEMALE")} />
                          <InfoRow icon={Wallet} label="مستوى الدخل" value={c.incomeRange} />
                        </Section>

                        <Section title="الدين ونمط الحياة" icon={Moon} defaultOpen={true}>
                          <InfoRow icon={Moon} label="مستوى التدين" value={c.religiosity && describeOption("religiosity", c.religiosity, isFemale ? "MALE" : "FEMALE")} />
                          <InfoRow icon={Cigarette} label="التدخين" value={c.smokingStatus && describeOption("smokingStatus", c.smokingStatus, isFemale ? "MALE" : "FEMALE")} />
                          <InfoRow icon={Activity} label="نمط الحياة" value={c.lifestyle && describeOption("lifestyle", c.lifestyle, isFemale ? "MALE" : "FEMALE")} />
                          <InfoRow icon={UtensilsCrossed} label="القدرة على الطبخ" value={c.cookingAbility && describeOption("cookingAbility", c.cookingAbility, isFemale ? "MALE" : "FEMALE")} />
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
                  }
                  afterDetails={locked ? undefined :
                    <>
                    {/* Scheduled visit date */}
                    {m.scheduledDate && (
                      <div className="mx-5 md:mx-6 mb-4 p-3.5 bg-gradient-to-l from-green-50 to-emerald-50/50 rounded-xl flex items-center gap-3 text-sm text-green-800 border border-green-200/40">
                        <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <CalendarHeart className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xs text-green-600 font-medium mb-0.5">موعد الزيارة</p>
                          <p className="font-bold text-green-800">
                            {new Date(m.scheduledDate).toLocaleDateString("ar-JO-u-nu-latn", {
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
                            {matchPhotos[m.id].map((photo, photoIdx) => (
                              <div
                                key={photo.id}
                                className="rounded-lg overflow-hidden relative cursor-pointer"
                                onContextMenu={(e) => e.preventDefault()}
                                onClick={() => {
                                  setLightboxImages(matchPhotos[m.id].map((p) => p.url));
                                  setLightboxIndex(photoIdx);
                                  setLightboxOpen(true);
                                }}
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

                    {/* Feedback for completed visits */}
                    {m.visitStatus === "COMPLETED" && m.visitRequestId && (
                      <div className="mx-5 md:mx-6 mb-4">
                        {feedbackSubmitted.has(m.id) ? (
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/40 text-emerald-700 text-sm font-medium">
                            <CheckCircle2 className="h-4 w-4" />
                            تم التقييم
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full h-11 rounded-xl font-semibold border-primary/30 text-primary hover:bg-primary/5"
                            onClick={() => setFeedbackDialog({ visitId: m.visitRequestId!, matchId: m.id })}
                          >
                            <Star className="h-4 w-4 me-2" />
                            قيّم الزيارة
                          </Button>
                        )}
                      </div>
                    )}
                    </>
                  }
                  actions={locked ? undefined :
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
                            <div className="absolute bottom-full mb-1 end-0 bg-card border rounded-xl shadow-lg py-1 z-50 w-44">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-foreground"
                                onClick={() => { setBlockDialog({ userId: m.partner.id, name: m.partner.firstName }); setMenuOpen(null); }}
                              >
                                <Ban className="h-4 w-4" />
                                حظر
                              </button>
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-destructive"
                                onClick={() => { setReportDialog({ userId: m.partner.id, name: m.partner.firstName }); setMenuOpen(null); }}
                              >
                                <ShieldAlert className="h-4 w-4" />
                                إبلاغ وحظر
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                  }
                >
                      {showVisitBanner && m.visitStatus && visitStatusDescriptions[m.visitStatus] && (
                        <div className={`p-3 rounded-xl border text-sm leading-relaxed ${
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
                  {m.closed === "blocked" ? (
                    <MatchClosedNote reason="blocked">
                      {m.blockId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setUnblockDialog({ blockId: m.blockId!, name: c.firstName })}
                        >
                          <ShieldOff className="h-4 w-4" />
                          إلغاء الحظر
                        </Button>
                      )}
                    </MatchClosedNote>
                  ) : m.closed === "inactive" ? (
                    <MatchClosedNote reason="inactive" />
                  ) : (
                    <MatchIntroPanel matchId={m.id} partnerName={c.firstName} />
                  )}
                </PersonCard>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronRight className="h-4 w-4 me-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                التالي
                <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Report Dialog */}
      <Dialog open={!!reportDialog} onOpenChange={(o) => !o && !reportSubmitting && setReportDialog(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm text-start space-y-2">
          <DialogHeader className="text-start sm:text-start">
            <DialogTitle>إبلاغ وحظر {reportDialog?.name}</DialogTitle>
            <DialogDescription className="text-start leading-relaxed">
              سيصل البلاغ لفريق نصيبك، ويُحظر {reportDialog?.name} فينتهي هذا التوافق ولا {isFemale ? "يرى" : "ترى"} ملفك بعد الآن. تُلغى الطلبات المعلقة بينكما دون استرجاع الرصيد.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="match-report-reason" className="text-sm font-medium text-foreground">سبب الإبلاغ</label>
            <select
              id="match-report-reason"
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
            <label htmlFor="match-report-details" className="text-sm font-medium text-foreground">تفاصيل إضافية (اختياري)</label>
            <textarea
              id="match-report-details"
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
              className="flex-1 bg-destructive hover:bg-destructive/90 text-white rounded-xl"
            >
              {reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "إبلاغ وحظر"}
            </Button>
            <Button variant="outline" onClick={() => setReportDialog(null)} disabled={reportSubmitting} className="rounded-xl">
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!blockDialog}
        onOpenChange={(o) => !o && setBlockDialog(null)}
        title={`حظر ${blockDialog?.name ?? ""}`}
        description={`سينتهي هذا التوافق: لن ${isFemale ? "يرى" : "ترى"} ${blockDialog?.name ?? ""} ملفك ولا ${isFemale ? "يتمكن" : "تتمكن"} من مراسلتك، ولن تتوفر أي خطوات تعارف بينكما. تُلغى الطلبات المعلقة بينكما دون استرجاع الرصيد. يمكنك إلغاء الحظر لاحقاً من صفحة «المحظورون».`}
        confirmLabel="حظر"
        destructive
        busy={safetyBusy}
        onConfirm={handleBlock}
      />

      <ConfirmActionDialog
        open={!!unblockDialog}
        onOpenChange={(o) => !o && setUnblockDialog(null)}
        title={`إلغاء حظر ${unblockDialog?.name ?? ""}`}
        description="يعود التوافق ظاهراً لكما. الطلبات التي أُلغيت بسبب الحظر لا تعود."
        confirmLabel="إلغاء الحظر"
        busy={safetyBusy}
        onConfirm={handleUnblock}
      />

      {/* Feedback Dialog */}
      <Dialog open={!!feedbackDialog} onOpenChange={(o) => !o && !feedbackSubmitting && setFeedbackDialog(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm text-start space-y-2">
          <DialogHeader className="text-start sm:text-start">
            <DialogTitle>تقييم الزيارة</DialogTitle>
            <DialogDescription className="sr-only">نتيجة الزيارة العائلية وتقييمك للتجربة</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p id="feedback-outcome-label" className="text-sm font-medium text-foreground">النتيجة</p>
            <div className="flex gap-3" role="radiogroup" aria-labelledby="feedback-outcome-label">
              <button
                type="button"
                role="radio"
                aria-checked={feedbackOutcome === "PROCEEDED"}
                onClick={() => setFeedbackOutcome("PROCEEDED")}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-colors ${feedbackOutcome === "PROCEEDED" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-border hover:bg-muted/30"}`}
              >
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1" />
                نرغب بالإكمال
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={feedbackOutcome === "DECLINED"}
                onClick={() => setFeedbackOutcome("DECLINED")}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-colors ${feedbackOutcome === "DECLINED" ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border hover:bg-muted/30"}`}
              >
                <XCircle className="h-5 w-5 mx-auto mb-1" />
                لا نرغب بالإكمال
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p id="feedback-rating-label" className="text-sm font-medium text-foreground">تقييم التجربة</p>
            <div className="flex justify-center gap-1" role="radiogroup" aria-labelledby="feedback-rating-label">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={feedbackRating === star}
                  aria-label={`تقييم ${star} من 5`}
                  onClick={() => setFeedbackRating(star)}
                  className="p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star aria-hidden="true" className={`h-8 w-8 transition-colors ${star <= feedbackRating ? "text-accent fill-accent" : "text-muted-foreground/30"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="feedback-notes" className="text-sm font-medium text-foreground">ملاحظات (اختياري)</label>
            <textarea
              id="feedback-notes"
              value={feedbackReason}
              onChange={(e) => setFeedbackReason(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] resize-none"
              placeholder="أضف ملاحظاتك حول الزيارة..."
              maxLength={500}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleFeedbackSubmit}
              disabled={feedbackSubmitting}
              className="flex-1 bg-gradient-to-l from-primary to-secondary text-white rounded-xl"
            >
              {feedbackSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال التقييم"}
            </Button>
            <Button variant="outline" onClick={() => setFeedbackDialog(null)} disabled={feedbackSubmitting} className="rounded-xl">
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

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
