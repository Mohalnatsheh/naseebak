"use client";

import { useState, useEffect, useCallback } from "react";
import { LifeBuoy, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pager, PersonLink, STATE_STYLE, fmtDateTime } from "@/components/admin/admin-list-bits";
import { FocusBanner, LoadError, useFocusId } from "@/components/admin/inbox-focus";
import { enumLabel } from "@/lib/admin/enum-labels";

interface Ticket {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: string;
  adminNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; phone: string | null };
}

/** WAITING = open + in progress, what the Inbox counts */
const STATUS_FILTERS: [string, string][] = [
  ["WAITING", "Open & in progress"],
  ["OPEN", enumLabel("ticketStatus", "OPEN")],
  ["IN_PROGRESS", enumLabel("ticketStatus", "IN_PROGRESS")],
  ["RESOLVED", enumLabel("ticketStatus", "RESOLVED")],
  ["CLOSED", enumLabel("ticketStatus", "CLOSED")],
  ["", "All"],
];

/** The shared admin status palette (design P3) */
const statusStyles: Record<string, string> = STATE_STYLE;

const typeStyles: Record<string, string> = {
  ISSUE: "bg-destructive/10 text-destructive",
  SUGGESTION: "bg-accent/15 text-accent-foreground",
  CHANGE_REQUEST: "bg-secondary text-secondary-foreground",
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("WAITING");
  const [typeFilter, setTypeFilter] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const { ready, focusId, clearFocus } = useFocusId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (focusId) params.set("id", focusId);
      else {
        if (statusFilter) params.set("status", statusFilter);
        if (typeFilter) params.set("type", typeFilter);
      }
      const res = await fetch(`/api/admin/support?${params}`);
      if (!res.ok) throw new Error(`support ${res.status}`);
      const data = await res.json();
      // The last ticket of a page was handled: step back instead of showing an empty page
      if ((data.tickets || []).length === 0 && page > 1) {
        setPage(page - 1);
        return;
      }
      setTickets(data.tickets || []);
      setPages(data.pages || 1);
      setTotal(data.total ?? 0);
      setLoadError("");
    } catch (err) {
      console.error(err);
      setLoadError("Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, focusId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);


  async function handleUpdate(ticketId: string, status: string) {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status, adminNote }),
      });
      if (res.ok) {
        setReviewingId(null);
        setAdminNote("");
        toast.success("Ticket updated. The member was notified.");
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Update failed (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error, please try again");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-primary" />
          Support Tickets
        </h1>
        <p className="text-muted-foreground mt-1">Review and respond to user support tickets</p>
      </div>

      {focusId && <FocusBanner onClear={clearFocus} />}
      {loadError && <LoadError message={loadError} onRetry={load} />}

      {/* Status Filters */}
      {!focusId && <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium text-muted-foreground self-center me-1">Status:</span>
          {STATUS_FILTERS.map(([s, label]) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium text-muted-foreground self-center me-1">Type:</span>
          {["", "ISSUE", "SUGGESTION", "CHANGE_REQUEST"].map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => { setTypeFilter(t); setPage(1); }}
            >
              {t ? enumLabel("ticketType", t) : "All"}
            </Button>
          ))}
        </div>
      </div>}

      <Card>
        <CardHeader>
          <CardTitle>Tickets ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : loadError ? null : tickets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tickets found</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[ticket.status] || ""}`}>
                        {enumLabel("ticketStatus", ticket.status)}
                      </span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${typeStyles[ticket.type] || ""}`}>
                        {enumLabel("ticketType", ticket.type)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(ticket.createdAt)}
                    </span>
                  </div>

                  <h3 className="font-semibold text-foreground">{ticket.subject}</h3>

                  <div className="text-sm text-muted-foreground">
                    From: <PersonLink p={ticket.user} />
                    {ticket.user.phone && <span className="ms-2 text-xs">({ticket.user.phone})</span>}
                  </div>

                  <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{ticket.description}</p>

                  {ticket.adminNote && (
                    <p className="text-sm text-primary bg-primary/5 rounded p-2">Reply to the member: {ticket.adminNote}</p>
                  )}

                  {ticket.resolvedAt && (ticket.status === "RESOLVED" || ticket.status === "CLOSED") && (
                    <p className="text-xs text-muted-foreground">
                      {enumLabel("ticketStatus", ticket.status)} {fmtDateTime(ticket.resolvedAt)}
                    </p>
                  )}

                  {ticket.status !== "CLOSED" && (
                    <>
                      {reviewingId === ticket.id ? (
                        <div className="space-y-2 pt-2 border-t">
                          <Label htmlFor={`reply-${ticket.id}`}>Reply to the member (they will see this)</Label>
                          <textarea
                            id={`reply-${ticket.id}`}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Optional"
                            value={adminNote}
                            onChange={(e) => setAdminNote(e.target.value)}
                            rows={2}
                          />
                          <div className="flex flex-wrap gap-2">
                            {ticket.status === "OPEN" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdate(ticket.id, "IN_PROGRESS")}
                                disabled={updating}
                              >
                                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : "In Progress"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleUpdate(ticket.id, "RESOLVED")}
                              disabled={updating}
                            >
                              {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Resolve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdate(ticket.id, "CLOSED")}
                              disabled={updating}
                            >
                              Close
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setReviewingId(null); setAdminNote(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReviewingId(ticket.id);
                            setAdminNote(ticket.adminNote || "");
                          }}
                        >
                          <Eye className="h-3 w-3 me-1" />
                          Review
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <Pager page={page} pages={pages} onPage={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
