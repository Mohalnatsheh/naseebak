"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Flag, Loader2, Eye, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pager, PersonLink, fmtDateTime } from "@/components/admin/admin-list-bits";
import { FocusBanner, LoadError, useFocusId } from "@/components/admin/inbox-focus";
import { enumLabel } from "@/lib/admin/enum-labels";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** Null once that account was deleted (see evidence) */
  reporter: { id: string; firstName: string; lastName: string } | null;
  reported: { id: string; firstName: string; lastName: string; status: string } | null;
  evidence: ReportEvidence | null;
  reviewedBy: string | null;
  chat: {
    id: string;
    fromChat: boolean;
    status: string;
    createdAt: string;
    endedAt: string | null;
    endedByReporter: boolean;
    endedByAdmin: boolean;
    messages: number;
  } | null;
}

/** Saved before an account in the report was deleted (src/lib/reports.ts snapshotReportEvidence) */
interface ReportEvidence {
  capturedAt: string;
  people: { reporter: EvidencePerson | null; reported: EvidencePerson | null };
  chat: { id: string; messages: { at: string; from: "reporter" | "reported"; body: string }[]; truncated: boolean } | null;
}
interface EvidencePerson {
  id: string;
  name: string;
  phone: string | null;
}

function ReportPerson({ user, saved }: { user: { id: string; firstName: string; lastName: string; status?: string } | null; saved?: EvidencePerson | null }) {
  if (user) return <PersonLink p={user} />;
  return (
    <span className="font-medium text-foreground">
      {saved?.name ?? "Unknown"} {saved?.phone && <span className="font-normal">({saved.phone})</span>}{" "}
      <span className="text-xs font-normal text-destructive">deleted account</span>
    </span>
  );
}

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
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("PENDING");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [suspendReported, setSuspendReported] = useState(false);
  const [endChat, setEndChat] = useState(false);
  const [loadError, setLoadError] = useState("");
  const { ready, focusId, clearFocus } = useFocusId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (focusId) params.set("id", focusId);
      else if (filter) params.set("status", filter);
      const res = await fetch(`/api/admin/reports?${params}`);
      if (!res.ok) throw new Error(`reports ${res.status}`);
      const data = await res.json();
      // The last report of a page was reviewed: step back instead of showing an empty page
      if ((data.reports || []).length === 0 && page > 1) {
        setPage(page - 1);
        return;
      }
      setReports(data.reports || []);
      setPages(data.pages || 1);
      setTotal(data.total ?? 0);
      setLoadError("");
    } catch (err) {
      console.error(err);
      setLoadError("Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, focusId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);


  function closeReview() {
    setReviewingId(null);
    setAdminNote("");
    setSuspendReported(false);
    setEndChat(false);
  }

  async function handleReview(reportId: string, status: "REVIEWED" | "DISMISSED") {
    if (suspendReported && !confirm("Suspend the reported user? Their active chats end and they can't use the site until unsuspended.")) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status, adminNote, suspendReported, endChat }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        closeReview();
        toast.success(data.actions?.length ? `Done: ${data.actions.join(", ")}.` : "Report updated");
        load();
      } else {
        toast.error(data.error || "Could not update the report.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not update the report.");
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

      {focusId && <FocusBanner onClear={clearFocus} />}
      {loadError && <LoadError message={loadError} onRetry={load} />}

      {/* Filters */}
      {!focusId && <div className="flex flex-wrap gap-2">
        {["PENDING", "REVIEWED", "DISMISSED", ""].map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilter(s); setPage(1); }}
          >
            {s ? enumLabel("reportStatus", s) : "All"}
          </Button>
        ))}
      </div>}

      <Card>
        <CardHeader>
          <CardTitle>Reports ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : loadError ? null : reports.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No reports found</p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[report.status] || ""}`}>
                        {enumLabel("reportStatus", report.status)}
                      </span>
                      <span className="text-sm font-medium">
                        {enumLabel("reportReason", report.reason)}
                      </span>
                      {report.chat?.fromChat && (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1">
                          <MessagesSquare className="h-3 w-3" /> From chat
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(report.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <ReportPerson user={report.reporter} saved={report.evidence?.people.reporter} />
                    {" reported "}
                    <ReportPerson user={report.reported} saved={report.evidence?.people.reported} />
                  </div>
                  {report.chat && (
                    <div className="text-xs text-muted-foreground border rounded-md px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-foreground">{report.chat.fromChat ? "Reported while ending their chat" : "They had a chat"}</span>
                      <span>Started {fmtDateTime(report.chat.createdAt)}</span>
                      <span>Status {enumLabel("chatStatus", report.chat.status)}</span>
                      {report.chat.endedAt && (
                        <span>
                          Ended {fmtDateTime(report.chat.endedAt)} by{" "}
                          {report.chat.endedByAdmin ? "an admin" : report.chat.endedByReporter ? "the reporter" : "the reported user"}
                        </span>
                      )}
                      <span>{report.chat.messages} messages</span>
                      <Link href={`/admin/chats/${report.chat.id}`} className="text-primary hover:underline">
                        Chat details
                      </Link>
                    </div>
                  )}
                  {report.evidence?.chat && (
                    <details className="text-xs border rounded-md px-3 py-2">
                      <summary className="cursor-pointer font-medium text-foreground">
                        Saved chat ({report.evidence.chat.messages.length} messages
                        {report.evidence.chat.truncated && ", latest only"}), kept on {fmtDateTime(report.evidence.capturedAt)} when an account was deleted
                      </summary>
                      <div className="mt-2 max-h-80 space-y-1 overflow-y-auto" dir="rtl">
                        {report.evidence.chat.messages.map((m, i) => (
                          <p key={i} className="break-words">
                            <span className={m.from === "reported" ? "font-semibold text-destructive" : "font-semibold text-primary"}>
                              {m.from === "reported" ? "Reported" : "Reporter"}
                            </span>{" "}
                            <span className="text-muted-foreground" dir="ltr">{fmtDateTime(m.at)}</span>: {m.body}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                  {report.details && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2 break-words">{report.details}</p>
                  )}
                  {report.reviewedAt && (
                    <p className="text-xs text-muted-foreground">
                      {report.status === "DISMISSED" ? "Dismissed" : "Reviewed"} {fmtDateTime(report.reviewedAt)}
                      {report.reviewedBy && <> by {report.reviewedBy}</>}
                    </p>
                  )}
                  {report.reported?.status === "SUSPENDED" && (
                    <p className="text-xs font-medium text-destructive">The reported user is suspended.</p>
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
                          <div className="flex flex-col gap-1.5 text-sm">
                            {report.reported && report.reported.status !== "SUSPENDED" && (
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={suspendReported}
                                  onChange={(e) => setSuspendReported(e.target.checked)}
                                />
                                Suspend {report.reported.firstName} {report.reported.lastName}
                              </label>
                            )}
                            {report.chat?.status === "ACTIVE" && (
                              <label className="flex items-center gap-2">
                                <input type="checkbox" checked={endChat} onChange={(e) => setEndChat(e.target.checked)} />
                                End their chat (both are told)
                              </label>
                            )}
                          </div>
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
                              onClick={closeReview}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { closeReview(); setReviewingId(report.id); }}
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
