"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2, Sparkles, HeartHandshake, X, Search, Clock, User, GraduationCap,
  Moon, Cigarette, Flag, ChevronLeft, ChevronRight, MoreVertical,
  ShieldAlert, Ban, Lightbulb, Heart, Hourglass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonCard } from "@/components/shared/person-card";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import { DealbreakersCard } from "@/components/suggestions/dealbreakers-card";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { describeOption, oppositeGender } from "@/lib/profile-options";
import type { FeedItem, FeedTab } from "@/lib/suggestions/feed";

type Notice = { kind: "match"; matchId?: string } | { kind: "interested" } | { kind: "declined" } | { kind: "error"; message: string };

/** Which endpoint answers a card: simultaneous rows, or legacy items still in flight. */
function decisionRequest(item: FeedItem, interested: boolean): { url: string; body?: string } {
  switch (item.kind) {
    case "mutual":
      return { url: `/api/suggestions/${item.id}/decide`, body: JSON.stringify({ interested }) };
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
export function MutualSuggestionsView() {
  const partnerGender = oppositeGender(useDashboardData().profile?.gender);
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

  const load = useCallback(async (t: FeedTab, p: number) => {
    setLoading(true);
    try {
      const [cur, other] = await Promise.all([
        fetch(`/api/suggestions/feed?tab=${t}&page=${p}`).then((r) => r.json()),
        fetch(`/api/suggestions/feed?tab=${t === "new" ? "waiting" : "new"}&page=1`).then((r) => r.json()),
      ]);
      setItems(cur.items ?? []);
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

  function switchTab(t: FeedTab) {
    if (t === tab) return;
    setTab(t);
    setPage(1);
    setNotice(null);
  }

  async function decide(item: FeedItem, interested: boolean) {
    setActing(item.id);
    setNotice(null);
    try {
      const { url, body } = decisionRequest(item, interested);
      const res = await fetch(url, {
        method: "POST",
        ...(body && { headers: { "Content-Type": "application/json" }, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", message: data.error || "تعذّر حفظ قرارك" });
        // The card may be gone (expired / blocked): refresh the list
        load(tab, page);
        return;
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

  async function block(item: FeedItem) {
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

  async function submitReport() {
    if (!report) return;
    setReportSubmitting(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedId: report.userId, reason: reportReason, details: reportDetails || undefined }),
    }).catch(() => null);
    setReportSubmitting(false);
    if (res?.ok) {
      toast.success("تم إرسال البلاغ. سيراجعه فريق نصيبك.");
    } else {
      const data = await res?.json().catch(() => ({}));
      toast.error(data?.error || "تعذّر إرسال البلاغ");
      return;
    }
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
            يرى الطرفان الاقتراح نفسه ويقرّر كلٌّ منكما وحده. إذا كان الاهتمام متبادلاً يصبح توافقاً، ولا يعرف أحد بقرار الآخر غير ذلك.
          </p>
        </div>
      </div>

      <DealbreakersCard />

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
              {tab === "new" ? "نبحث لك عن اقتراحات مناسبة" : "لا يوجد ما ينتظر الرد"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
              {tab === "new"
                ? "تصلك حتى 3 اقتراحات مجانية كل أسبوع، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار الشخصية يجعلها أدق."
                : "عندما تختار «مهتم» على اقتراح، يظهر هنا حتى يقرّر الطرف الآخر أو تنتهي مدته."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
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
                      {item.kind === "legacy_interest" && (
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
                    { icon: Flag, label: c.nationality },
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
                          {partnerGender === "FEMALE" ? "إذا أبدت اهتمامها أيضاً" : "إذا أبدى اهتمامه أيضاً"} يصبح توافقاً متبادلاً ونخبرك فوراً. يُغلق الاقتراح تلقائياً بعد 14 يوماً من وصوله إن لم يكتمل.
                        </p>
                      )}
                      <div className="flex gap-3">
                        {!waiting && (
                          <>
                            <Button
                              onClick={() => decide(item, true)}
                              disabled={acting === item.id}
                              className="flex-1 h-12 bg-gradient-to-l from-primary to-secondary text-primary-foreground shadow-md shadow-primary/20 rounded-xl font-bold text-base"
                            >
                              {acting === item.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <><HeartHandshake className="h-5 w-5 me-2" />مهتم</>}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => decide(item, false)}
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
                            <div className="absolute bottom-full mb-1 left-0 bg-card border rounded-xl shadow-lg py-1 z-50 w-40">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-amber-700"
                                onClick={() => { setReport({ userId: c.id, name: c.firstName }); setMenuOpen(null); }}
                              >
                                <ShieldAlert className="h-4 w-4" /> إبلاغ
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
                <ChevronRight className="h-4 w-4 ml-1" /> السابق
              </Button>
              <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                التالي <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إبلاغ عن {report?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground block">سبب الإبلاغ</label>
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
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] resize-none"
              placeholder="تفاصيل إضافية (اختياري)"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={submitReport} disabled={reportSubmitting} className="rounded-xl">
              {reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال البلاغ"}
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
