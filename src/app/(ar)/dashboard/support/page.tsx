"use client";

import { useState, useEffect, useEffectEvent } from "react";
import {
  LifeBuoy,
  Loader2,
  Send,
  AlertCircle,
  Lightbulb,
  RefreshCw,
  Clock,
  CheckCircle2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { PageHeader } from "@/components/shared/page-header";

interface Ticket {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const typeOptions = [
  {
    value: "ISSUE",
    label: "مشكلة",
    description: "الإبلاغ عن خلل أو مشكلة تقنية",
    icon: AlertCircle,
  },
  {
    value: "SUGGESTION",
    label: "اقتراح",
    description: "اقتراح لتحسين المنصة",
    icon: Lightbulb,
  },
  {
    value: "CHANGE_REQUEST",
    label: "طلب تغيير",
    description: "طلب تعديل على حسابك أو بياناتك",
    icon: RefreshCw,
  },
];

const statusConfig: Record<string, { label: string; class: string; icon: typeof Clock }> = {
  OPEN: { label: "مفتوحة", class: "bg-amber-100 text-amber-800", icon: Clock },
  IN_PROGRESS: { label: "قيد المعالجة", class: "bg-primary/10 text-primary", icon: Loader2 },
  RESOLVED: { label: "تم الحل", class: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  CLOSED: { label: "مغلقة", class: "bg-muted text-muted-foreground", icon: CheckCircle2 },
};

const typeLabels: Record<string, string> = {
  ISSUE: "مشكلة",
  SUGGESTION: "اقتراح",
  CHANGE_REQUEST: "طلب تغيير",
};

export default function SupportPage() {
  const [tab, setTab] = useState<"new" | "list">("new");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTotalPages, setTicketTotalPages] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  // Inline, per field (the banner keeps server / network errors)
  const [fieldErrors, setFieldErrors] = useState<{ type?: string; subject?: string; description?: string }>({});
  const female = useDashboardData().profile?.gender === "FEMALE";
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());

  // Form state
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  // Reload the list when it's shown or the page changes (loadTickets reads the current page)
  const onListShown = useEffectEvent(() => loadTickets());
  useEffect(() => {
    if (tab === "list") onListShown();
  }, [tab, ticketPage]);

  async function loadTickets() {
    setLoading(true);
    try {
      const res = await fetch(`/api/support?page=${ticketPage}`);
      const data = await res.json();
      setTickets(data.tickets || []);
      setTicketTotalPages(data.totalPages || 1);
    } catch {
      console.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const errs: { type?: string; subject?: string; description?: string } = {};
    if (!type) errs.type = "يرجى اختيار نوع التذكرة";
    if (subject.trim().length < 5) errs.subject = "الموضوع يجب أن يكون 5 أحرف على الأقل";
    if (description.trim().length < 20) errs.description = "الوصف يجب أن يكون 20 حرفاً على الأقل";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = errs.type ? "ticket-type-label" : errs.subject ? "ticket-subject" : "ticket-description";
      document.getElementById(first)?.focus?.();
      document.getElementById(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject, description }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }

      setSuccess(true);
      setType("");
      setSubject("");
      setDescription("");
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      <PageHeader
        icon={LifeBuoy}
        title="الدعم والملاحظات"
        description="أرسل تذكرة دعم أو اقتراح وسنتواصل معك في أقرب وقت"
      />

      {/* Tabs */}
      <div className="flex gap-2 bg-muted/50 p-1 rounded-xl border border-border/50">
        <button
          onClick={() => setTab("new")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200",
            tab === "new"
              ? "bg-card text-primary shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          إرسال تذكرة جديدة
        </button>
        <button
          onClick={() => setTab("list")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200",
            tab === "list"
              ? "bg-card text-primary shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          تذاكري
        </button>
      </div>

      {tab === "new" ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type selector */}
          <div className="space-y-3">
            <p id="ticket-type-label" tabIndex={-1} className="text-sm font-semibold text-foreground outline-none">نوع التذكرة</p>
            {/* Compact on phones: three short choices in one row, the descriptions from sm up */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-labelledby="ticket-type-label" aria-describedby={fieldErrors.type ? "ticket-type-error" : undefined}>
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={type === opt.value}
                  onClick={() => { setType(opt.value); setFieldErrors((f) => ({ ...f, type: undefined })); }}
                  className={cn(
                    "relative flex min-h-11 flex-col items-center gap-1.5 p-2.5 sm:gap-2 sm:p-4 rounded-xl border-2 transition-all duration-200 text-center",
                    type === opt.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/50 hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    type === opt.value
                      ? "bg-primary/10"
                      : "bg-muted/60"
                  )}>
                    <opt.icon className={cn(
                      "h-5 w-5",
                      type === opt.value ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <span className={cn(
                    "text-sm font-semibold",
                    type === opt.value ? "text-primary" : "text-foreground"
                  )}>
                    {opt.label}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{opt.description}</span>
                </button>
              ))}
            </div>
            {fieldErrors.type && <p id="ticket-type-error" className="text-xs font-medium text-destructive">{fieldErrors.type}</p>}
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <label htmlFor="ticket-subject" className="text-sm font-semibold text-foreground">الموضوع</label>
            <input
              id="ticket-subject"
              type="text"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setFieldErrors((f) => ({ ...f, subject: undefined })); }}
              placeholder={female ? "أدخلي موضوع التذكرة..." : "أدخل موضوع التذكرة..."}
              aria-invalid={!!fieldErrors.subject}
              aria-describedby="ticket-subject-hint"
              className="w-full rounded-xl border border-input aria-[invalid=true]:border-destructive bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              maxLength={200}
            />
            <div id="ticket-subject-hint" className="flex items-center justify-between gap-2 text-xs">
              <span className={fieldErrors.subject ? "font-medium text-destructive" : "text-muted-foreground"}>
                {fieldErrors.subject ?? "5 أحرف على الأقل"}
              </span>
              <span className="text-muted-foreground">{subject.length}/200</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="ticket-description" className="text-sm font-semibold text-foreground">الوصف</label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setFieldErrors((f) => ({ ...f, description: undefined })); }}
              placeholder={female ? "اشرحي بالتفصيل..." : "اشرح بالتفصيل..."}
              aria-invalid={!!fieldErrors.description}
              aria-describedby="ticket-description-hint"
              className="w-full rounded-xl border border-input aria-[invalid=true]:border-destructive bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[120px] resize-y"
              maxLength={2000}
              rows={5}
            />
            <div id="ticket-description-hint" className="flex items-center justify-between gap-2 text-xs">
              <span className={fieldErrors.description ? "font-medium text-destructive" : "text-muted-foreground"}>
                {fieldErrors.description ?? "20 حرفاً على الأقل"}
              </span>
              <span className="text-muted-foreground">{description.length}/2000</span>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              تم إرسال التذكرة بنجاح! سنقوم بمراجعتها في أقرب وقت.
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl py-3 bg-gradient-to-l from-primary to-secondary hover:opacity-90 transition-opacity"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 me-2" />
                إرسال التذكرة
              </>
            )}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل التذاكر...</p>
            </div>
          ) : tickets.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-primary/5">
              <CardContent className="text-center py-16 space-y-5">
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full animate-pulse" />
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
                    <LifeBuoy className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">لا توجد تذاكر</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    لم ترسل أي تذاكر دعم بعد. يمكنك إرسال تذكرة جديدة من التبويب الأول.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            tickets.map((ticket, index) => {
              const config = statusConfig[ticket.status] || statusConfig.OPEN;
              const StatusIcon = config.icon;
              return (
                <div
                  key={ticket.id}
                  style={{ animation: `fadeSlideIn 0.5s ease-out ${index * 0.08}s both` }}
                >
                  <Card className="overflow-hidden border-border/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                    <CardContent className="p-4 md:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{ticket.subject}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {typeLabels[ticket.type] || ticket.type}
                            </span>
                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1", config.class)}>
                              <StatusIcon className="h-3 w-3" />
                              {config.label}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(ticket.createdAt).toLocaleDateString("ar-JO-u-nu-latn")}
                        </span>
                      </div>

                      <p className={cn("text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap", !expandedTickets.has(ticket.id) && "line-clamp-3")}>
                        {ticket.description}
                      </p>
                      {ticket.description.length > 160 && (
                        <button
                          type="button"
                          aria-expanded={expandedTickets.has(ticket.id)}
                          onClick={() =>
                            setExpandedTickets((prev) => {
                              const next = new Set(prev);
                              if (next.has(ticket.id)) next.delete(ticket.id);
                              else next.add(ticket.id);
                              return next;
                            })
                          }
                          className="-my-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline"
                        >
                          {expandedTickets.has(ticket.id) ? "عرض أقل" : "عرض الوصف كاملاً"}
                        </button>
                      )}

                      {ticket.adminNote && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                          <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-primary mb-1">رد الإدارة</p>
                            <p className="text-sm text-foreground">{ticket.adminNote}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })
          )}
          {ticketTotalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={ticketPage <= 1} onClick={() => setTicketPage(ticketPage - 1)}>
                <ChevronRight className="h-4 w-4 me-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {ticketPage} من {ticketTotalPages}
              </span>
              <Button variant="outline" size="sm" disabled={ticketPage >= ticketTotalPages} onClick={() => setTicketPage(ticketPage + 1)}>
                التالي
                <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
