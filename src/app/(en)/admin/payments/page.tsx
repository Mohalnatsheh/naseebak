"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Loader2, ChevronLeft, ChevronRight, DollarSign, ExternalLink, TrendingUp, CheckCircle2, RotateCcw, X, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonLink, STATE_STYLE, SearchBox, fmtDateTime } from "@/components/admin/admin-list-bits";
import { paymentPlanLabel as planLabel } from "@/lib/admin/pro-labels";
import { enumLabel } from "@/lib/admin/enum-labels";
import { FAILURE_LABELS } from "@/lib/payments/failure-labels";
import { refundQuestion } from "@/lib/admin/refund-preview";

interface PaymentRow {
  id: string;
  planName: string | null;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
  /** null when the account was deleted (payment records are kept) */
  user: { id: string; firstName: string; lastName: string; phone: string | null; matchCredits: number } | null;
  disputedAt?: string | null;
  failureReason?: string | null;
  /** Credits a refund takes back (a Pro payment: the credits granted from it) */
  credits: number;
  /** A refund of this Pro payment ends the membership now */
  endsPro?: boolean;
  /** A Pro renewal (not the membership's first payment) */
  renewal?: boolean;
  /** A paid Pro invoice that never made Pro live: "duplicate" | "ended" (refund decision needed) */
  proNotLive?: string | null;
  /** pi_…, for the Stripe link; null when not known */
  stripePaymentIntent: string | null;
}

/** "Card declined · insufficient_funds", "Cancelled by the member", … */
function failureText(reason: string | null | undefined): string {
  if (!reason || reason === "UNKNOWN") return "Reason not recorded";
  const [kind, code] = reason.split(":");
  const label = FAILURE_LABELS[kind as keyof typeof FAILURE_LABELS] ?? kind;
  return code ? `${label} · ${code.replace(/_/g, " ")}` : label;
}

interface Summary {
  /** Completed payments per currency: never added across currencies */
  revenue: { currency: string; total: number; monthly: number; count: number }[];
  completedCount: number;
  failed30d?: { reason: string; count: number }[];
}

/** "12.00 JOD · 30.00 SAR" (one amount per currency), or "0.00" when nothing was paid */
function amounts(rows: Summary["revenue"], key: "total" | "monthly"): string {
  if (rows.length === 0) return "0.00";
  return rows.map((r) => `${r[key].toFixed(2)} ${r.currency}`).join(" · ");
}

/** The shared admin status palette (design P3) */
const statusStyles: Record<string, string> = STATE_STYLE;


export default function AdminPaymentsPage() {
  // useSearchParams needs a Suspense boundary for the build
  return (
    <Suspense>
      <PaymentsView />
    </Suspense>
  );
}

function PaymentsView() {
  // The member page links here with ?search=<phone>
  const initialSearch = useSearchParams().get("search") ?? "";
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [query, setQuery] = useState(initialSearch);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  // The refund confirmation (a Dialog, never window.confirm: QA WEB-PAY-03)
  const [confirmRefund, setConfirmRefund] = useState<PaymentRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filter) params.set("status", filter);
      if (reason) params.set("reason", reason);
      if (query) params.set("search", query);
      const res = await fetch(`/api/admin/payments?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || `Could not load the payments (${res.status})`);
        return;
      }
      setPayments(data.payments || []);
      setTotalPages(data.totalPages || 1);
      setSummary(data.summary || null);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load the payments. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, reason, query]);

  useEffect(() => {
    load();
  }, [load]);

  /** Click on a «why failed» line: shows just those payments (a second click clears it) */
  function filterByReason(value: string | null | undefined) {
    const next = value ?? "UNKNOWN";
    setReason(reason === next ? "" : next);
    setFilter("");
    setPage(1);
  }

  async function handleRefund(payment: PaymentRow) {
    setConfirmRefund(null);
    setRefundingId(payment.id);
    try {
      const res = await fetch(`/api/admin/payments/${payment.id}/refund`, { method: "POST" });
      if (res.ok) {
        toast.success("Refund processed");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Refund failed (${res.status})`);
      }
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Network error, the refund may not have gone through: check before trying again");
    } finally {
      setRefundingId(null);
    }
  }


  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-display flex items-center gap-3">
            <CreditCard className="h-7 w-7 text-primary" />
            Payment Management
          </h1>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/payments/export?${new URLSearchParams({ ...(filter && { status: filter }), ...(reason && { reason }), ...(query && { search: query }) })}`}>
              <Download className="me-2 h-4 w-4" /> Download CSV
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1">Track revenue and payment transactions</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold">{amounts(summary.revenue, "total")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">This Month</p>
                  <p className="text-2xl font-bold">{amounts(summary.revenue, "monthly")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completed Payments</p>
                  <p className="text-2xl font-bold">{summary.completedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Why checkouts failed (last 30 days) */}
      {summary?.failed30d && summary.failed30d.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium">Why payments failed · last 30 days</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Recorded since 4 Nov 2026; older ones were filled in from Stripe («Closed without paying» = cancelled or left open).
            </p>
            <ul className="space-y-1.5">
              {summary.failed30d.map((f) => (
                <li key={f.reason}>
                  <button
                    type="button"
                    onClick={() => filterByReason(f.reason)}
                    title="Show these payments"
                    className={`flex w-full items-center justify-between gap-3 rounded text-left text-sm hover:underline ${reason === f.reason ? "font-semibold text-primary" : ""}`}
                  >
                    <span>{failureText(f.reason)}</span>
                    <span className="font-semibold tabular-nums">{f.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Member search + status filter */}
      <SearchBox value={search} onChange={setSearch} onSubmit={() => { setQuery(search.trim()); setPage(1); }} />
      <div className="flex flex-wrap items-center gap-2">
        {["", "PENDING", "COMPLETED", "FAILED", "REFUNDED", "DISPUTED"].map((s) => (
          <Button
            key={s}
            variant={!reason && filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilter(s); setReason(""); setPage(1); }}
          >
            {s === "DISPUTED" ? "Disputed" : s ? enumLabel("paymentStatus", s) : "All"}
          </Button>
        ))}
        {reason && (
          <Button variant="secondary" size="sm" onClick={() => filterByReason(reason)}>
            {failureText(reason)} <X className="ms-1 h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-destructive">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={load}>Try again</Button>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">User</th>
                  <th className="text-left p-3 text-sm font-medium">Plan</th>
                  <th className="text-left p-3 text-sm font-medium">Amount</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={6} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-muted-foreground">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-sm">
                        {payment.user ? (
                          <>
                            <PersonLink p={payment.user} />
                            <p className="text-xs text-muted-foreground">{payment.user.phone || "—"}</p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Deleted account</p>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        {planLabel(payment.planName, { renewal: payment.renewal })}
                        {payment.proNotLive && payment.status === "COMPLETED" && (
                          <Badge variant="outline" className="ms-1 border-amber-300 bg-amber-50 text-amber-800" title={payment.proNotLive === "duplicate" ? "A second subscription paid while one was live: never made Pro live" : "A renewal paid after Pro ended: Pro did not come back"}>
                            Refund decision
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm font-medium whitespace-nowrap">{Number(payment.amount).toFixed(2)} {payment.currency}</td>
                      <td className="p-3">
                        <Badge className={statusStyles[payment.status] || ""}>
                          {enumLabel("paymentStatus", payment.status)}
                        </Badge>
                        {payment.disputedAt && (
                          <Badge variant="destructive" className="ms-1">Disputed</Badge>
                        )}
                        {payment.status === "FAILED" && (
                          <button
                            type="button"
                            onClick={() => filterByReason(payment.failureReason)}
                            title="Show payments that failed like this"
                            className="mt-1 block text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {failureText(payment.failureReason)}
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(payment.createdAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {payment.status === "COMPLETED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => setConfirmRefund(payment)}
                              disabled={refundingId === payment.id}
                            >
                              {refundingId === payment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <><RotateCcw className="h-3 w-3 me-1" />Refund</>
                              )}
                            </Button>
                          )}
                          {payment.stripePaymentIntent && (
                            <a
                              href={`https://dashboard.stripe.com/payments/${payment.stripePaymentIntent}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              View in Stripe <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}

          {!loadError && totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmRefund !== null} onOpenChange={(open) => !open && setConfirmRefund(null)}>
        <DialogContent closeLabel="Close" dir="ltr" className="text-left">
          {confirmRefund && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle>{refundQuestion(confirmRefund).title}</DialogTitle>
                <DialogDescription className="sr-only">What the refund takes back</DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {refundQuestion(confirmRefund).lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmRefund(null)}>Keep the payment</Button>
                <Button variant="destructive" onClick={() => handleRefund(confirmRefund)}>Refund</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
