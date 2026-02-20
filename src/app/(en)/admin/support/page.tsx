"use client";

import { useState, useEffect } from "react";
import { LifeBuoy, Loader2, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

const typeLabels: Record<string, string> = {
  ISSUE: "Issue",
  SUGGESTION: "Suggestion",
  CHANGE_REQUEST: "Change Request",
};

const statusStyles: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

const typeStyles: Record<string, string> = {
  ISSUE: "bg-red-100 text-red-800",
  SUGGESTION: "bg-purple-100 text-purple-800",
  CHANGE_REQUEST: "bg-blue-100 text-blue-800",
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updating, setUpdating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/admin/support?${params}`);
      const data = await res.json();
      setTickets(data.tickets || []);
      setPages(data.pages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, statusFilter, typeFilter]);

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
        load();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-primary" />
          Support Tickets
        </h1>
        <p className="text-muted-foreground mt-1">Review and respond to user support tickets</p>
      </div>

      {/* Status Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium text-muted-foreground self-center me-1">Status:</span>
          {["", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {s || "All"}
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
              {t ? typeLabels[t] : "All"}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : tickets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tickets found</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[ticket.status] || ""}`}>
                        {ticket.status}
                      </span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${typeStyles[ticket.type] || ""}`}>
                        {typeLabels[ticket.type] || ticket.type}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ticket.createdAt).toLocaleDateString("en-US")}
                    </span>
                  </div>

                  <h3 className="font-semibold text-foreground">{ticket.subject}</h3>

                  <div className="text-sm text-muted-foreground">
                    From: <span className="font-medium text-foreground">{ticket.user.firstName} {ticket.user.lastName}</span>
                    {ticket.user.phone && <span className="ms-2 text-xs">({ticket.user.phone})</span>}
                  </div>

                  <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{ticket.description}</p>

                  {ticket.adminNote && (
                    <p className="text-sm text-blue-700 bg-blue-50 rounded p-2">Admin: {ticket.adminNote}</p>
                  )}

                  {ticket.status !== "CLOSED" && (
                    <>
                      {reviewingId === ticket.id ? (
                        <div className="space-y-2 pt-2 border-t">
                          <textarea
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Admin note / response (optional)"
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
                          onClick={() => setReviewingId(ticket.id)}
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

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
