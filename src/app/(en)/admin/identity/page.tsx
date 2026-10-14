"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, FileText, User, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface IdentityDoc {
  id: string;
  documentType: string;
  frontImageUrl?: string;
  backImageUrl?: string | null;
  status: string;
  rejectionReason?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { firstName: string; lastName: string } | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    gender: string;
    photos?: { id: string; url: string }[];
  };
}

function documentTypeLabel(type: string) {
  if (type === "selfie") return "Selfie";
  return type === "national_id" ? "National ID (legacy)" : "Passport (legacy)";
}

const rejectionReasons = [
  { value: "", label: "Select reason..." },
  { value: "الصورة غير واضحة", label: "Blurry / Face not clear" },
  { value: "الوجه غير ظاهر بالكامل", label: "Face covered / not fully visible" },
  { value: "الصورة لا تطابق صور الملف الشخصي", label: "Does not match profile photos" },
  { value: "الصورة ليست سيلفي حقيقية", label: "Not a real selfie (screenshot / photo of photo)" },
  { value: "Other", label: "Other" },
];

const statusBadgeStyles: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PENDING: "bg-amber-100 text-amber-800",
};

export default function AdminIdentityPage() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [docs, setDocs] = useState<IdentityDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // History pagination
  const [histPage, setHistPage] = useState(1);
  const [histTotalPages, setHistTotalPages] = useState(1);

  useEffect(() => {
    fetchDocs();
  }, [tab, histPage]);

  async function fetchDocs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (tab === "history") params.set("page", String(histPage));
      const res = await fetch(`/api/admin/identity?${params}`);
      const data = await res.json();
      setDocs(data.docs || []);
      if (tab === "history") {
        setHistTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(docId: string, action: "approve" | "reject") {
    setActing(docId);
    try {
      const res = await fetch("/api/admin/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          action,
          reviewNotes: notes[docId] || "",
          rejectionReason: action === "reject" ? (reasons[docId] || "") : undefined,
        }),
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  const pendingCount = tab === "pending" ? docs.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Identity Verification
        </h1>
        <p className="text-muted-foreground mt-1">Review pending verification selfies and compare them with profile photos</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={tab === "pending" ? "default" : "ghost"}
          size="sm"
          onClick={() => { setTab("pending"); }}
        >
          Pending
          {tab === "pending" && docs.length > 0 && <Badge className="ms-2" variant="secondary">{docs.length}</Badge>}
        </Button>
        <Button
          variant={tab === "history" ? "default" : "ghost"}
          size="sm"
          onClick={() => { setTab("history"); setHistPage(1); }}
        >
          History
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            {tab === "pending" ? (
              <>
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <h3 className="font-medium text-lg">All Clear!</h3>
                <p className="text-sm text-muted-foreground">No pending identity verifications.</p>
              </>
            ) : (
              <>
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="font-medium text-lg">No History</h3>
                <p className="text-sm text-muted-foreground">No reviewed documents yet.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : tab === "pending" ? (
        <div className="space-y-4">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{doc.user.firstName} {doc.user.lastName}</h3>
                      <p className="text-sm text-muted-foreground break-all">{doc.user.email}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {doc.user.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                        <Badge variant="outline" className="text-xs gap-1">
                          <FileText className="h-3 w-3" />
                          {documentTypeLabel(doc.documentType)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Selfie vs. profile photos */}
                {(doc.frontImageUrl || doc.backImageUrl) && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {doc.frontImageUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {doc.documentType === "selfie" ? "Selfie" : "Front"}
                        </p>
                        <img
                          src={doc.frontImageUrl}
                          alt={doc.documentType === "selfie" ? "Selfie" : "ID Front"}
                          className="rounded border max-h-48 w-full object-contain bg-muted"
                        />
                      </div>
                    )}
                    {doc.backImageUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Back</p>
                        <img
                          src={doc.backImageUrl}
                          alt="ID Back"
                          className="rounded border max-h-48 w-full object-contain bg-muted"
                        />
                      </div>
                    )}
                    {doc.documentType === "selfie" && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Profile photos ({doc.user.photos?.length ?? 0})
                        </p>
                        {doc.user.photos && doc.user.photos.length > 0 ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {doc.user.photos.slice(0, 4).map((photo) => (
                              <img
                                key={photo.id}
                                src={photo.url}
                                alt="Profile photo"
                                className="rounded border h-24 w-full object-cover bg-muted"
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded border h-48 flex items-center justify-center bg-muted text-xs text-muted-foreground text-center p-3">
                            No profile photos yet — verify the selfie is a clear, real face photo
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <select
                        value={reasons[doc.id] || ""}
                        onChange={(e) => setReasons((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        {rejectionReasons.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <Input
                      placeholder="Review notes (optional)..."
                      value={notes[doc.id] || ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAction(doc.id, "approve")}
                      disabled={acting === doc.id}
                      className="flex-1"
                    >
                      {acting === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 me-2" />Approve</>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleAction(doc.id, "reject")}
                      disabled={acting === doc.id}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 me-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* History Tab - Table */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium">User</th>
                    <th className="text-left p-3 text-sm font-medium">Type</th>
                    <th className="text-left p-3 text-sm font-medium">Status</th>
                    <th className="text-left p-3 text-sm font-medium">Reason</th>
                    <th className="text-left p-3 text-sm font-medium">Reviewed By</th>
                    <th className="text-left p-3 text-sm font-medium">Reviewed At</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-sm">{doc.user.firstName} {doc.user.lastName}</p>
                        <p className="text-xs text-muted-foreground break-all">{doc.user.email}</p>
                      </td>
                      <td className="p-3 text-sm">{documentTypeLabel(doc.documentType)}</td>
                      <td className="p-3">
                        <Badge className={statusBadgeStyles[doc.status] || ""}>{doc.status}</Badge>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground min-w-[160px]">{doc.rejectionReason || doc.reviewNotes || "—"}</td>
                      <td className="p-3 text-sm">
                        {doc.reviewedBy ? `${doc.reviewedBy.firstName} ${doc.reviewedBy.lastName}` : "—"}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                        {doc.reviewedAt ? new Date(doc.reviewedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {histTotalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t">
                <p className="text-sm text-muted-foreground">Page {histPage} of {histTotalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={histPage <= 1} onClick={() => setHistPage(histPage - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={histPage >= histTotalPages} onClick={() => setHistPage(histPage + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
