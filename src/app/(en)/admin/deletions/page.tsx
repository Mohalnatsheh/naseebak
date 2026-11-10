"use client";

import { useState, useEffect } from "react";
import { Trash2, Loader2, Undo2, Clock, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pager, PersonLink, fmtDate, plural } from "@/components/admin/admin-list-bits";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";
import { useConfirm } from "@/components/admin/confirm-dialog";

interface DeletionRequest {
  id: string;
  reason: string | null;
  scheduledAt: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    isDeactivated: boolean;
  };
}

export default function AdminDeletionsPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState("");
  const confirm = useConfirm();

  useEffect(() => {
    fetchRequests(page);
  }, [page]);

  async function fetchRequests(p: number) {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/admin/deletions?page=${p}`);
      if (!res.ok) {
        setLoadError(`Couldn't load the deletion requests (${res.status}).`);
        return;
      }
      const data = await res.json();
      const items: DeletionRequest[] = data.requests || [];
      // The last item of a page was removed elsewhere: step back instead of showing an empty page
      if (items.length === 0 && p > 1) {
        setPage(p - 1);
        return;
      }
      setRequests(items);
      setTotal(data.total ?? items.length);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
      setLoadError("Couldn't load the deletion requests. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(requestId: string) {
    const ok = await confirm({
      title: "Cancel this deletion?",
      description: "The member's account is reactivated and won't be deleted.",
      confirmLabel: "Cancel deletion",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    setCancelling(requestId);
    setError("");
    try {
      const res = await fetch(`/api/admin/deletions/${requestId}`, { method: "DELETE" });
      if (res.ok) {
        // Refetch so the next request moves up onto this page
        await fetchRequests(page);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Cancel failed (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      setError("Network error, please try again");
    } finally {
      setCancelling(null);
    }
  }

  function daysRemaining(scheduledAt: string): number {
    const diff = new Date(scheduledAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display flex items-center gap-3">
          <Trash2 className="h-7 w-7 text-primary" />
          Account Deletion Requests
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage pending account deletions (30-day grace period)
          {total > 0 && <Badge className="ms-2">{total} active</Badge>}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => fetchRequests(page)} />
      ) : requests.length === 0 ? (
        <AdminEmptyState icon={Trash2} title="No pending deletions" hint="There are no active account deletion requests." />
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const days = daysRemaining(req.scheduledAt);
            return (
              <Card key={req.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <h3 className="font-semibold"><PersonLink p={req.user} /></h3>
                        <p className="text-sm text-muted-foreground">{req.user.phone || "—"}</p>
                        <div className="flex gap-2 mt-1">
                          {req.user.isDeactivated && (
                            <Badge variant="outline" className="text-xs text-destructive border-destructive/40">Deactivated</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge
                      className={"shrink-0 " + (days <= 3 ? "bg-destructive/10 text-destructive" : days <= 10 ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary")}
                    >
                      <Clock className="h-3 w-3 me-1" />
                      {plural(days, "day")} remaining
                    </Badge>
                  </div>

                  {req.reason && (
                    <div className="mt-3 bg-muted/50 rounded-lg p-3 text-sm">
                      <span className="font-medium">Reason:</span> <bdi>{req.reason}</bdi>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>Requested: {fmtDate(req.createdAt)}</span>
                      <span>Scheduled: {fmtDate(req.scheduledAt)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancel(req.id)}
                      disabled={cancelling === req.id}
                    >
                      {cancelling === req.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><Undo2 className="h-3 w-3 me-1" />Cancel Deletion</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Pager page={page} pages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
