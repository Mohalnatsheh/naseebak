"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Flag, Loader2, ChevronLeft, ChevronRight, Eye, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reporter: { id: string; firstName: string; lastName: string };
  reported: { id: string; firstName: string; lastName: string };
  chat: {
    id: string;
    fromChat: boolean;
    status: string;
    createdAt: string;
    endedAt: string | null;
    endedByReporter: boolean;
    messages: number;
  } | null;
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const reasonLabels: Record<string, string> = {
  FAKE_PROFILE: "Fake Profile",
  INAPPROPRIATE_CONTENT: "Inappropriate Content",
  HARASSMENT: "Harassment",
  SPAM: "Spam",
  OTHER: "Other",
};

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  REVIEWED: "bg-green-100 text-green-800",
  DISMISSED: "bg-muted text-muted-foreground",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updating, setUpdating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/admin/reports?${params}`);
      const data = await res.json();
      setReports(data.reports || []);
      setPages(data.pages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, filter]);

  async function handleReview(reportId: string, status: "REVIEWED" | "DISMISSED") {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status, adminNote }),
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
          <Flag className="h-7 w-7 text-primary" />
          Reports
        </h1>
        <p className="text-muted-foreground mt-1">Review user reports and take action</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["", "PENDING", "REVIEWED", "DISMISSED"].map((s) => (
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

      <Card>
        <CardHeader>
          <CardTitle>Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : reports.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No reports found</p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[report.status] || ""}`}>
                        {report.status}
                      </span>
                      <span className="text-sm font-medium">
                        {reasonLabels[report.reason] || report.reason}
                      </span>
                      {report.chat?.fromChat && (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1">
                          <MessagesSquare className="h-3 w-3" /> From chat
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString("en-US")}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <Link href={`/admin/users/${report.reporter.id}`} className="font-medium text-foreground hover:underline">{report.reporter.firstName} {report.reporter.lastName}</Link>
                    {" reported "}
                    <Link href={`/admin/users/${report.reported.id}`} className="font-medium text-foreground hover:underline">{report.reported.firstName} {report.reported.lastName}</Link>
                  </div>
                  {report.chat && (
                    <div className="text-xs text-muted-foreground border rounded-md px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-foreground">{report.chat.fromChat ? "Reported while ending their chat" : "They had a chat"}</span>
                      <span>Started {shortDate(report.chat.createdAt)}</span>
                      <span>Status {report.chat.status}</span>
                      {report.chat.endedAt && (
                        <span>Ended {shortDate(report.chat.endedAt)} by {report.chat.endedByReporter ? "the reporter" : "the reported user"}</span>
                      )}
                      <span>{report.chat.messages} messages</span>
                      <Link
                        href={`/admin/users/${report.reporter.id}#chat-${report.chat.id}`}
                        className="text-primary hover:underline"
                      >
                        Chat details
                      </Link>
                    </div>
                  )}
                  {report.details && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2 break-words">{report.details}</p>
                  )}
                  {report.adminNote && (
                    <p className="text-sm text-primary bg-primary/5 rounded p-2 break-words">Admin: {report.adminNote}</p>
                  )}

                  {report.status === "PENDING" && (
                    <>
                      {reviewingId === report.id ? (
                        <div className="space-y-2 pt-2 border-t">
                          <textarea
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Admin note (optional)"
                            value={adminNote}
                            onChange={(e) => setAdminNote(e.target.value)}
                            rows={2}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleReview(report.id, "REVIEWED")}
                              disabled={updating}
                            >
                              {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Reviewed"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReview(report.id, "DISMISSED")}
                              disabled={updating}
                            >
                              Dismiss
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
                          onClick={() => setReviewingId(report.id)}
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
