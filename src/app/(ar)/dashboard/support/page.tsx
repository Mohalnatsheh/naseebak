"use client";

import { useState, useEffect } from "react";
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

  // Form state
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (tab === "list") loadTickets();
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

    if (!type) {
      setError("يرجى اختيار نوع التذكرة");
      return;
    }
    if (subject.length < 5) {
      setError("الموضوع يجب أن يكون 5 أحرف على الأقل");
      return;
    }
    if (description.length < 20) {
      setError("الوصف يجب أن يكون 20 حرف على الأقل");
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
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/5 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-primary/10 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />
        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <LifeBuoy className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
              الدعم والملاحظات
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            أرسل تذكرة دعم أو اقتراح وسنتواصل معك في أقرب وقت
          </p>
        </div>
      </div>

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
            <p id="ticket-type-label" className="text-sm font-semibold text-foreground">نوع التذكرة</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-labelledby="ticket-type-label">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={type === opt.value}
                  onClick={() => setType(opt.value)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center",
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
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <label htmlFor="ticket-subject" className="text-sm font-semibold text-foreground">الموضوع</label>
            <input
              id="ticket-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="أدخل موضوع التذكرة..."
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">{subject.length}/200</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="ticket-description" className="text-sm font-semibold text-foreground">الوصف</label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اشرح بالتفصيل..."
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[120px] resize-y"
              maxLength={2000}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">{description.length}/2000</p>
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

                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {ticket.description}
                      </p>

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
