"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2, Sparkles, HeartHandshake, X, Search, Clock, User, GraduationCap,
  Moon, Cigarette, Flag, ChevronLeft, ChevronRight, MoreVertical,
  ShieldAlert, Ban, Lightbulb, Heart, Hourglass, Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonCard } from "@/components/shared/person-card";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import { DealbreakersCard } from "@/components/suggestions/dealbreakers-card";
import { InterestDialog, rechargeToContinue, type IntroPreferenceChoice } from "@/components/suggestions/interest-dialog";
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { describeOption, nationalityLabel, oppositeGender } from "@/lib/profile-options";
import type { FeedItem, FeedTab, OpenFeedItem } from "@/lib/suggestions/feed-types";
import type { SuggestEmptyReason } from "@/lib/matching/auto-suggest";

type Notice =
  | { kind: "match"; matchId?: string }
  | { kind: "interested" }
  | { kind: "declined" }
  | { kind: "no_credits" }
  | { kind: "error"; message: string };

type IntroChoice = { introPreference: IntroPreferenceChoice; guardianConsent?: boolean };

/** How long «لا» can be undone before it is sent */
const DECLINE_UNDO_MS = 5000;

/** Which endpoint answers a card: simultaneous rows, or legacy items still in flight. */
function decisionRequest(item: OpenFeedItem, interested: boolean, choice?: IntroChoice): { url: string; body?: string } {
  switch (item.kind) {
    case "mutual":
      return { url: `/api/suggestions/${item.id}/decide`, body: JSON.stringify({ interested, ...(interested && choice) }) };
    case "legacy_suggestion":
      return { url: `/api/suggestions/${item.id}/${interested ? "like" : "reject"}` };
    default:
      return { url: `/api/interests/${item.id}/${interested ? "accept" : "reject"}` };
  }
}

/**
 * Simultaneous suggestions (switch `new_suggestions_flow`): both people see the same suggestion and
 * decide on their own. Two tabs: to decide, and "بانتظار الطرف الآخر". A "لا" from the other side
 * is never shown — the card just waits until it closes.
 */
/** "الأحد 19 أكتوبر" (Western digits). */
function formatNextDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-JO-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });
}

export function MutualSuggestionsView({
  emptyReason = null,
  nextSuggestionsAt = null,
  creditOnInterest = false,
  chatEnabled = true,
  credits = 0,
}: {
  /** Why no new suggestion came on the last run (from page 1 of /api/suggestions) */
  emptyReason?: SuggestEmptyReason | null;
  /** At the weekly cap: when the oldest suggestion of the 7-day window ages out */
  nextSuggestionsAt?: string | null;
  /** Switch credit_on_interest (from /api/suggestions): "مهتم" costs 1 credit and opens the chat/family dialog */
  creditOnInterest?: boolean;
  /** Chat switch: the dialog hides the chat choice when off */
  chatEnabled?: boolean;
  /** Balance when the page loaded (from /api/suggestions) */
  credits?: number;
} = {}) {
  const { profile, counts, refreshProfile, refreshUnread } = useDashboardData();
  const viewerGender = profile?.gender;
  const partnerGender = oppositeGender(viewerGender);
  const viewerFemale = viewerGender === "FEMALE";
  const g = (masculine: string, feminine: string) => (viewerFemale ? feminine : masculine);
  // Credit on interest: my balance, kept in step with each "مهتم"
  const [balance, setBalance] = useState(credits);
  const [loadedCredits, setLoadedCredits] = useState(credits);
  if (credits !== loadedCredits) {
    // The page reloaded the balance: start from the new value
    setLoadedCredits(credits);
    setBalance(credits);
  }
  const outOfCredits = creditOnInterest && balance <= 0;
  const guardian = counts.guardian ?? { exists: !!profile?.parentInfo, consented: !!profile?.parentInfo?.shareConsentAt };
  const [interestFor, setInterestFor] = useState<OpenFeedItem | null>(null);
  const [tab, setTab] = useState<FeedTab>("new");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [totals, setTotals] = useState<Record<FeedTab, number>>({ new: 0, waiting: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [report, setReport] = useState<{ userId: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState("FAKE_PROFILE");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  /** «لا» waiting out its undo window: hidden from the list, sent when the timer ends (or the page closes) */
  const pendingDeclines = useRef(new Map<string, { item: OpenFeedItem; timer: ReturnType<typeof setTimeout> }>());

  const load = useCallback(async (t: FeedTab, p: number) => {
    setLoading(true);
    try {
      const [cur, other] = await Promise.all([
        fetch(`/api/suggestions/feed?tab=${t}&page=${p}`).then((r) => r.json()),
        fetch(`/api/suggestions/feed?tab=${t === "new" ? "waiting" : "new"}&page=1`).then((r) => r.json()),
      ]);
      setItems(((cur.items ?? []) as FeedItem[]).filter((i) => !pendingDeclines.current.has(i.id)));
      setTotalPages(Math.max(1, cur.totalPages ?? 1));
      setTotals(t === "new" ? { new: cur.total ?? 0, waiting: other.total ?? 0 } : { new: other.total ?? 0, waiting: cur.total ?? 0 });
    } catch {
      setNotice({ kind: "error", message: "تعذّر تحميل الاقتراحات. حاول مرة أخرى." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab, page);
  }, [load, tab, page]);

  // Leaving the page inside the undo window still sends the «لا» (keepalive survives the navigation)
  useEffect(() => {
    const pending = pendingDeclines.current;
    const flush = () => {
      for (const [id, { item, timer }] of pending) {
        clearTimeout(timer);
        pending.delete(id);
        void sendDecline(item);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /** Send a «لا» (free, never charged). Errors only matter when the card is still on screen elsewhere. */
  async function sendDecline(item: OpenFeedItem): Promise<boolean> {
    const { url } = decisionRequest(item, false);
    const body = item.kind === "mutual" ? JSON.stringify({ interested: false }) : undefined;
    const res = await fetch(url, {
      method: "POST",
      keepalive: true,
      ...(body && { headers: { "Content-Type": "application/json" }, body }),
    }).catch(() => null);
    return !!res?.ok;
  }

  /** «لا»: hide the card now, offer «تراجع» for a few seconds, then send it */
  function declineWithUndo(item: OpenFeedItem) {
    setNotice(null);
    removeAndRefill(item.id);
    setTotals((t) => ({ ...t, new: Math.max(0, t.new - 1) }));
    const timer = setTimeout(async () => {
      pendingDeclines.current.delete(item.id);
      const ok = await sendDecline(item);
      if (ok) {
        trackEvent("suggestion_response", { response: "reject", mutual_match: false });
      } else {
        toast.error("تعذّر حفظ قرارك، حاول مرة أخرى");
        load(tab, page);
      }
    }, DECLINE_UNDO_MS);
    pendingDeclines.current.set(item.id, { item, timer });
    toast("تم. لن يظهر لك هذا الاقتراح مجدداً، ولن يعرف الطرف الآخر بقرارك.", {
      duration: DECLINE_UNDO_MS,
      action: {
        label: "تراجع",
        onClick: () => {
          const pending = pendingDeclines.current.get(item.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingDeclines.current.delete(item.id);
          load(tab, page);
        },
      },
    });
  }

  function switchTab(t: FeedTab) {
    if (t === tab) return;
    setTab(t);
    setPage(1);
    setNotice(null);
  }

  /**
   * "مهتم" costs a credit with credit on interest, so it always confirms first: a shared suggestion
   * also asks chat or family, older items (no choice to make) confirm the credit only.
   */
  function onInterested(item: OpenFeedItem) {
    if (creditOnInterest) setInterestFor(item);
    else void decide(item, true);
  }

  async function decide(item: OpenFeedItem, interested: boolean, choice?: IntroChoice) {
    setActing(item.id);
    setNotice(null);
    try {
      const { url, body } = decisionRequest(item, interested, choice);
      const res = await fetch(url, {
        method: "POST",
        ...(body && { headers: { "Content-Type": "application/json" }, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "NO_CREDITS") {
          // Same message as the disabled "مهتم"; reloading shows the 0-credit banner and "liked you" tags
          setBalance(0);
          setNotice({ kind: "no_credits" });
        } else {
          setNotice({ kind: "error", message: data.error || "تعذّر حفظ قرارك" });
        }
        // The card may be gone (expired / blocked): refresh the list
        load(tab, page);
        return;
      }
      if (creditOnInterest && interested) {
        const left = typeof data.creditsLeft === "number" ? data.creditsLeft : Math.max(0, balance - 1);
        setBalance(left);
        refreshUnread();
        if (choice?.guardianConsent) refreshProfile();
        // Nothing left: reload so the 0-credit banner and "liked you" tags show (the feed says so)
        if (left <= 0) load(tab, page);
      }
      trackEvent("suggestion_response", { response: interested ? "accept" : "reject", mutual_match: !!data.match });
      removeAndRefill(item.id);
      // A legacy interest answered "yes" is always a match; a legacy suggestion "yes" waits like a mutual one
      const waitsNow = interested && !data.match;
      setTotals((t) => ({ new: Math.max(0, t.new - 1), waiting: t.waiting + (waitsNow ? 1 : 0) }));
      setNotice(data.match ? { kind: "match", matchId: data.matchId } : interested ? { kind: "interested" } : { kind: "declined" });
    } catch {
      setNotice({ kind: "error", message: "تعذّر حفظ قرارك" });
    } finally {
      setActing(null);
    }
  }

  /** Drop a decided card; when the page empties, load the next items so the empty state isn't shown by mistake */
  function removeAndRefill(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (items.length <= 1) {
      const p = page > 1 ? page - 1 : 1;
      if (p !== page) setPage(p);
      else load(tab, p);
    }
  }

  async function block(item: OpenFeedItem) {
    setMenuOpen(null);
    if (!window.confirm(`حظر ${item.candidate.firstName}؟ لن يظهر لك ولن تظهر له مرة أخرى.`)) return;
    const res = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: item.candidate.id }),
    }).catch(() => null);
    if (res?.ok) {
      removeAndRefill(item.id);
      setTotals((t) => ({ ...t, [tab]: Math.max(0, t[tab] - 1) }));
      toast.success("تم الحظر");
    } else {
      toast.error("تعذّر الحظر، حاول مرة أخرى");
    }
  }

  /** Report always comes with a block, as on the matches page: the card leaves the list */
  async function submitReport() {
    if (!report) return;
    setReportSubmitting(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedId: report.userId, reason: reportReason, details: reportDetails || undefined }),
    }).catch(() => null);
    if (!res?.ok) {
      setReportSubmitting(false);
      const data = await res?.json().catch(() => ({}));
      toast.error(data?.error || "تعذّر إرسال البلاغ");
      return;
    }
    const blocked = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: report.userId }),
    }).catch(() => null);
    setReportSubmitting(false);
    const item = items.find((i) => i.candidate.id === report.userId);
    if (item && blocked?.ok) {
      removeAndRefill(item.id);
      setTotals((t) => ({ ...t, [tab]: Math.max(0, t[tab] - 1) }));
    }
    toast.success(
      blocked?.ok ? "تم الإبلاغ والحظر. سيراجع فريق نصيبك البلاغ." : "تم إرسال البلاغ. سيراجعه فريق نصيبك.",
    );
    setReport(null);
    setReportReason("FAKE_PROFILE");
    setReportDetails("");
  }

  const tabs: { key: FeedTab; label: string; short: string; icon: typeof Sparkles }[] = [
    { key: "new", label: "اقتراحات جديدة", short: "جديدة", icon: Sparkles },
    { key: "waiting", label: "بانتظار الطرف الآخر", short: "بالانتظار", icon: Hourglass },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/10 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 rounded-full -translate-x-10 -translate-y-10 blur-2xl" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-accent/10 rounded-full translate-x-6 translate-y-6 blur-2xl" />
        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
              الاقتراحات
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
            {creditOnInterest
              ? "يرى الطرفان الاقتراح نفسه ويقرّر كلٌّ منكما وحده. إذا كان الاهتمام متبادلاً يصبح توافقاً، ولا نُطلع أحداً على قرار «لا». عندما يكون الرصيد صفراً قد يظهر أن الطرف الآخر أبدى اهتمامه."
              : "يرى الطرفان الاقتراح نفسه ويقرّر كلٌّ منكما وحده. إذا كان الاهتمام متبادلاً يصبح توافقاً، ولا يعرف أحد بقرار الآخر غير ذلك."}
          </p>
          {creditOnInterest && (
            <p className="flex items-center gap-1.5 text-xs md:text-sm font-medium text-foreground/80">
              <Coins className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                {CREDIT_ON_INTEREST_LINE} رصيدك: <span className="font-bold text-foreground">{balance}</span>
              </span>
            </p>
          )}
        </div>
      </div>

      <div id="dealbreakers" className="scroll-mt-24">
        <DealbreakersCard />
      </div>

      {/* Two tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/50" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tab === t.key ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short}</span>
            {totals[t.key] > 0 && (
              <span
                className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold ${
                  tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                }`}
              >
                {totals[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Result of the last decision */}
      {notice && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm leading-relaxed ${
            notice.kind === "match"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : notice.kind === "error"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : notice.kind === "no_credits"
                  ? "border-amber-200/60 bg-amber-50/70 text-amber-900"
                : "border-primary/15 bg-primary/5 text-foreground"
          }`}
        >
          {notice.kind === "match" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <Heart className="h-4 w-4" /> تهانينا! الاهتمام متبادل وأصبح لديك توافق جديد.
              </span>
              <Button asChild size="sm" className="rounded-lg">
                <Link href={notice.matchId ? `/dashboard/matches?match=${notice.matchId}` : "/dashboard/matches"}>
                  عرض التوافق <ChevronLeft className="h-4 w-4 ms-1" />
                </Link>
              </Button>
            </div>
          )}
          {notice.kind === "interested" && "تم تسجيل اهتمامك. إذا أبدى الطرف الآخر اهتمامه أيضاً يصبح توافقاً متبادلاً ونخبرك فوراً."}
          {notice.kind === "declined" && "تم. لن يظهر لك هذا الاقتراح مجدداً، ولن يعرف الطرف الآخر بقرارك."}
          {notice.kind === "no_credits" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{rechargeToContinue(viewerFemale)}</span>
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/dashboard/payments">
                  {g("اشحن رصيدك", "اشحني رصيدك")} <ChevronLeft className="h-4 w-4 ms-1" />
                </Link>
              </Button>
            </div>
          )}
          {notice.kind === "error" && notice.message}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-muted/30">
          <CardContent className="text-center py-14 space-y-4">
            <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
              {tab === "new" ? <Search className="h-9 w-9 text-muted-foreground/40" /> : <Clock className="h-9 w-9 text-muted-foreground/40" />}
            </div>
            <h3 className="font-semibold text-lg text-foreground">
              {tab !== "new"
                ? "لا يوجد ما ينتظر الرد"
                : emptyReason === "no_candidates"
                  ? "لا يوجد حالياً من يطابق شروطك"
                  : emptyReason === "weekly_cap" && nextSuggestionsAt
                    ? `اقتراحاتك القادمة يوم ${formatNextDate(nextSuggestionsAt)}`
                    : emptyReason === "pending"
                      ? "لديك اقتراحات بانتظار قرارك"
                      : "نبحث لك عن اقتراحات مناسبة"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
              {tab !== "new"
                ? g(
                    "عندما تختار «مهتم» على اقتراح، يظهر هنا حتى يقرّر الطرف الآخر أو تنتهي مدته.",
                    "عندما تختارين «مهتم» على اقتراح، يظهر هنا حتى يقرّر الطرف الآخر أو تنتهي مدته."
                  )
                : emptyReason === "no_candidates"
                  ? "لم نجد حالياً أحداً تنطبق عليه شروطك الأساسية وتفضيلاتك. مراجعتها قد توسّع فرصك، ونبحث لك من جديد تلقائياً كلما انضم أشخاص جدد."
                  : emptyReason === "weekly_cap"
                    ? "تصلك حتى 3 اقتراحات مجانية كل 7 أيام، وسنرسل لك إشعاراً فور وصولها."
                    : emptyReason === "pending"
                      ? g(
                          "عندما تقرّر في اقتراحاتك الحالية أو تنتهي مدتها، تصلك اقتراحات جديدة وسنرسل لك إشعاراً فور وصولها.",
                          "عندما تقرّرين في اقتراحاتك الحالية أو تنتهي مدتها، تصلك اقتراحات جديدة وسنرسل لك إشعاراً فور وصولها."
                        )
                      : creditOnInterest
                        ? "تصلك اقتراحات مجانية باستمرار، حتى 5 في الوقت نفسه، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار الشخصية يجعلها أدق."
                        : "تصلك حتى 3 اقتراحات مجانية كل أسبوع، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار الشخصية يجعلها أدق."}
            </p>
            {tab === "new" && emptyReason === "no_candidates" && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button asChild size="sm" className="rounded-lg">
                  <a href="#dealbreakers">شروطي الأساسية</a>
                </Button>
                <Button asChild size="sm" variant="outline" className="rounded-lg">
                  <Link href="/dashboard/profile/edit?step=3">تفضيلاتي في الملف الشخصي</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* 0 credits: everything stays visible and «لا» is free; only «مهتم» waits for a recharge */}
          {tab === "new" && outOfCredits && (
            <div role="note" className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-900">
              <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">رصيدك صفر.</span>{" "}
                {g(
                  "يمكنك تصفّح اقتراحاتك والرد بـ«لا» مجاناً، واشحن رصيدك لتختار «مهتم».",
                  "يمكنكِ تصفّح اقتراحاتكِ والرد بـ«لا» مجاناً، واشحني رصيدكِ لتختاري «مهتم»."
                )}
              </p>
              <Link href="/dashboard/payments" className="font-semibold underline underline-offset-4">
                {g("اشحن رصيدك", "اشحني رصيدك")}
              </Link>
            </div>
          )}
          {items.map((item, index) => {
            const c = item.candidate;
            const score = Math.round(item.compatibilityScore);
            const isOpen = expanded.has(item.id);
            const waiting = tab === "waiting";
            return (
              <div key={item.id} style={{ animation: `fadeSlideIn 0.4s ease-out ${index * 0.08}s both` }}>
                <PersonCard
                  name={c.firstName}
                  verified={c.isVerified}
                  age={c.age}
                  city={c.city}
                  area={c.area}
                  job={c.job && describeOption("job", c.job, partnerGender)}
                  score={score}
                  photoLocked
                  badges={
                    <>
                      {waiting && (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-200/60 text-[11px] gap-1">
                          <Hourglass className="h-3 w-3" /> بانتظار الطرف الآخر
                        </Badge>
                      )}
                      {(item.kind === "legacy_interest" || item.likedYou) && (
                        <Badge className="bg-accent/15 text-accent-foreground border border-accent/25 text-[11px]">{partnerGender === "FEMALE" ? "أبدت اهتمامها بك" : "أبدى اهتمامه بك"}</Badge>
                      )}
                    </>
                  }
                  tone={waiting ? "pending" : "default"}
                  /* Third-person, gender-correct labels about the other person */
                  tags={[
                    { icon: User, label: c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, partnerGender) },
                    { icon: GraduationCap, label: c.education },
                    { icon: Moon, label: c.religiosity && describeOption("religiosity", c.religiosity, partnerGender) },
                    { icon: Cigarette, label: c.smokingStatus && describeOption("smokingStatus", c.smokingStatus, partnerGender) },
                    { icon: Flag, label: nationalityLabel(c.nationality, partnerGender) },
                  ]}
                  aboutMe={c.aboutMe}
                  expanded={isOpen}
                  onToggleExpand={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  details={<CandidateDetails c={c} />}
                  actions={
                    <>
                      {waiting && (
                        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                          {partnerGender === "FEMALE" ? "إذا أبدت اهتمامها أيضاً" : "إذا أبدى اهتمامه أيضاً"} يصبح توافقاً متبادلاً ونخبرك فوراً.
                          {item.expiresAt && ` يُغلق الاقتراح تلقائياً يوم ${formatNextDate(item.expiresAt)} إن لم يكتمل.`}
                        </p>
                      )}
                      {!waiting && creditOnInterest && (
                        outOfCredits ? (
                          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800">
                            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                            <Link href="/dashboard/payments" className="font-semibold underline underline-offset-4">
                              {rechargeToContinue(viewerFemale)}
                            </Link>
                          </p>
                        ) : (
                          <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Coins className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            مهتم يستخدم رصيداً واحداً — رصيدك {balance}
                          </p>
                        )
                      )}
                      <div className="flex gap-3">
                        {!waiting && (
                          <>
                            <Button
                              onClick={() => onInterested(item)}
                              disabled={acting === item.id || outOfCredits}
                              className="flex-1 h-12 bg-gradient-to-l from-primary to-secondary text-primary-foreground shadow-md shadow-primary/20 rounded-xl font-bold text-base"
                            >
                              {acting === item.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <><HeartHandshake className="h-5 w-5 me-2" />مهتم</>}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => declineWithUndo(item)}
                              // «لا» is always free, also at 0 credits
                              disabled={acting === item.id}
                              className="h-12 px-6 border-destructive/30 text-destructive/80 hover:bg-destructive/5 hover:text-destructive rounded-xl font-bold"
                            >
                              <X className="h-5 w-5 me-1" />لا
                            </Button>
                          </>
                        )}
                        <div className={`relative ${waiting ? "ms-auto" : ""}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="خيارات إضافية"
                            className="h-12 w-12 rounded-xl"
                            onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
                          >
                            <MoreVertical className="h-5 w-5" />
                          </Button>
                          {menuOpen === item.id && (
                            <div className="absolute bottom-full mb-1 end-0 bg-card border rounded-xl shadow-lg py-1 z-50 w-40">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-amber-700"
                                onClick={() => { setReport({ userId: c.id, name: c.firstName }); setMenuOpen(null); }}
                              >
                                <ShieldAlert className="h-4 w-4" /> إبلاغ وحظر
                              </button>
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-destructive"
                                onClick={() => block(item)}
                              >
                                <Ban className="h-4 w-4" /> حظر
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  }
                >
                  {/* Why this suggestion */}
                  <div className="rounded-xl border border-accent/25 bg-accent/10 p-3.5 flex items-start gap-2.5">
                    <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-accent-foreground" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-foreground/90">
                      <span className="font-bold">لماذا هذا الاقتراح؟ </span>
                      {item.reason}
                    </p>
                  </div>
                </PersonCard>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronRight className="h-4 w-4 me-1" /> السابق
              </Button>
              <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                التالي <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {creditOnInterest && (
        <InterestDialog
          open={!!interestFor}
          onOpenChange={(o) => !o && setInterestFor(null)}
          partnerGender={partnerGender}
          credits={balance}
          chatEnabled={chatEnabled}
          guardian={guardian}
          costOnly={!!interestFor && interestFor.kind !== "mutual"}
          onConfirm={async (choice) => {
            const item = interestFor;
            if (!item) return;
            setInterestFor(null);
            await decide(item, true, choice);
          }}
        />
      )}

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إبلاغ وحظر {report?.name}</DialogTitle>
            <DialogDescription className="text-start">
              يراجع فريق نصيبك البلاغ، ويُحظر الطرف الآخر فلا يظهر لك ولا تظهر له مرة أخرى.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="suggestion-report-reason" className="text-sm font-medium text-foreground block">سبب الإبلاغ</label>
            <select
              id="suggestion-report-reason"
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
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] resize-none"
              placeholder="تفاصيل إضافية (اختياري)"
              aria-label="تفاصيل إضافية (اختياري)"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={submitReport} disabled={reportSubmitting} className="rounded-xl">
              {reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "إبلاغ وحظر"}
            </Button>
            <Button variant="outline" onClick={() => setReport(null)} className="rounded-xl">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
