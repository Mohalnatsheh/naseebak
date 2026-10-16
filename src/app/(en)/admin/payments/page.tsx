"use client";

import { useState, useEffect } from "react";
import { CreditCard, Loader2, ChevronLeft, ChevronRight, DollarSign, TrendingUp, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PaymentRow {
  id: string;
  planName: string | null;
  amount: string;
  currency: string;
  provider: string;
  status: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; phone: string | null };
}

interface Summary {
  totalRevenue: number;
  completedCount: number;
  monthlyRevenue: number;
}

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-primary/10 text-primary",
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/admin/payments?${params}`);
      const data = await res.json();
      setPayments(data.payments || []);
      setTotalPages(data.totalPages || 1);
      setSummary(data.summary || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund(paymentId: string) {
    if (!confirm("Are you sure you want to refund this payment? Credits will be deducted from the user.")) return;
    setRefundingId(paymentId);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/refund`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Refund failed (${res.status})`);
      }
      await load();
    } catch {
      alert("Network error");
    } finally {
      setRefundingId(null);
    }
  }

  useEffect(() => {
    load();
  }, [page, filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          Payment Management
        </h1>
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
                  <p className="text-2xl font-bold">{Number(summary.totalRevenue).toFixed(2)} JOD</p>
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
                  <p className="text-2xl font-bold">{Number(summary.monthlyRevenue).toFixed(2)} JOD</p>
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

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {["", "PENDING", "COMPLETED", "FAILED", "REFUNDED"].map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilter(s); setPage(1); }}
          >
            {s || "All"}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">User</th>
                  <th className="text-left p-3 text-sm font-medium">Plan</th>
                  <th className="text-left p-3 text-sm font-medium">Amount</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-left p-3 text-sm font-medium">Provider</th>
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={7} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-muted-foreground">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-sm">{payment.user.firstName} {payment.user.lastName}</p>
                        <p className="text-xs text-muted-foreground">{payment.user.phone || "—"}</p>
                      </td>
                      <td className="p-3 text-sm">{payment.planName || "—"}</td>
                      <td className="p-3 text-sm font-medium whitespace-nowrap">{Number(payment.amount).toFixed(2)} {payment.currency}</td>
                      <td className="p-3">
                        <Badge className={statusStyles[payment.status] || ""}>
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">{payment.provider}</td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        {payment.status === "COMPLETED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleRefund(payment.id)}
                            disabled={refundingId === payment.id}
                          >
                            {refundingId === payment.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <><RotateCcw className="h-3 w-3 me-1" />Refund</>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
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
    </div>
  );
}
