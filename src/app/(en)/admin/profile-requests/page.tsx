"use client";

import { useState, useEffect } from "react";
import { ClipboardEdit, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Pager, PersonLink, fmtDate, fmtDateTime } from "@/components/admin/admin-list-bits";
import { FocusBanner, LoadError, useFocusId } from "@/components/admin/inbox-focus";
import { describeOption, nationalityLabel, oppositeGender, selfLabel, type OptionField } from "@/lib/profile-options";

interface ProfileRequest {
  id: string;
  changes: Record<string, unknown>;
  message: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    gender: string;
    profile: Record<string, unknown> | null;
  };
}

const fieldLabels: Record<string, string> = {
  city: "City", area: "Area", nationality: "Nationality", education: "Education",
  job: "Job", maritalStatus: "Marital Status", religiosity: "Religiosity",
  smokingStatus: "Smoking", aboutMe: "About Me", partnerExpectations: "Partner Expectations",
  hobbies: "Hobbies", familyValues: "Family Values", tribe: "Tribe",
  familyOriginArea: "Family Origin", housingType: "Housing", monthlyExpenses: "Monthly Expenses",
  healthConditions: "Health Conditions", cookingAbility: "Cooking",
  height: "Height", weight: "Weight", numberOfSiblings: "Siblings",
  hijab: "Hijab", niqab: "Niqab", beard: "Beard", drivingLicense: "Driving License",
  prefCity: "Pref City", prefEducation: "Pref Education", prefMaritalStatus: "Pref Marital Status",
  prefAgeMin: "Pref Age Min", prefAgeMax: "Pref Age Max",
  prefReligiosity: "Pref Religiosity", prefSmokingStatus: "Pref Smoking",
  willingToRelocate: "Willing to Relocate", skinColor: "Skin Color", incomeRange: "Income",
  childrenCount: "Children", dateOfBirth: "Date of Birth", fieldOfStudy: "Field of Study",
  interests: "Interests", lifestyle: "Lifestyle", wantsPhoto: "Wants Photo",
  prefHijab: "Pref Hijab", prefBeard: "Pref Beard", prefChildrenAcceptance: "Pref Children",
};

type StatusFilter = "PENDING" | "APPROVED" | "REJECTED";

const STATUS_LABELS: Record<StatusFilter, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

/** Fields stored with a gendered option value (the member's own, or the partner they want) */
const OWN_OPTIONS: OptionField[] = ["job", "maritalStatus", "religiosity", "smokingStatus", "cookingAbility", "lifestyle"];
const PARTNER_OPTIONS: Record<string, OptionField> = {
  prefMaritalStatus: "maritalStatus",
  prefReligiosity: "religiosity",
  prefSmokingStatus: "smokingStatus",
};

/** Older rows keep codes instead of the wizards' Arabic words */
const CODES: Record<string, string> = { yes: "Yes", no: "No", maybe: "Maybe", no_children: "No children" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

function fieldLabel(key: string): string {
  if (fieldLabels[key]) return fieldLabels[key];
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A stored profile value the way an admin reads it: «1 Jan 1997», labels instead of stored forms */
function formatValue(key: string, value: unknown, gender: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((v) => formatValue(key, v, gender)).join(", ") || "—";
  if (typeof value !== "string") return String(value);
  if (ISO_DATE.test(value)) return fmtDate(value);
  if (key === "nationality") return nationalityLabel(value, gender) ?? value;
  if ((OWN_OPTIONS as string[]).includes(key)) return selfLabel(key as OptionField, value, gender);
  if (PARTNER_OPTIONS[key]) return describeOption(PARTNER_OPTIONS[key], value, oppositeGender(gender));
  return CODES[value] ?? value;
}

export default function AdminProfileRequestsPage() {
  const [requests, setRequests] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const { ready, focusId, clearFocus } = useFocusId();

  useEffect(() => {
    if (ready) fetchRequests(page, status, focusId);
  }, [ready, page, status, focusId]);

  async function fetchRequests(p: number, s: StatusFilter, id: string | null) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/profile-requests?page=${p}&status=${s}${id ? `&id=${encodeURIComponent(id)}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || `Failed to load requests (${res.status})`);
        return;
      }
      setLoadError("");
      const items: ProfileRequest[] = data.requests || [];
      // The last request of a page was reviewed: step back instead of showing an empty page
      if (items.length === 0 && p > 1) {
        setPage(p - 1);
        return;
      }
      setRequests(items);
      setTotal(data.total ?? items.length);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
      setLoadError("Network error, please reload");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(requestId: string, action: "APPROVED" | "REJECTED") {
    setActing(requestId);
    try {
      const res = await fetch("/api/admin/profile-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, adminNote: adminNotes[requestId] || "" }),
      });
      if (res.ok) {
        // Refetch so the next pending request moves up onto this page
        toast.success(action === "APPROVED" ? "Approved. The member was notified." : "Rejected. The member was notified.");
        await fetchRequests(page, status, focusId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Action failed (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error, please try again");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <ClipboardEdit className="h-7 w-7 text-primary" />
          Profile Update Requests
        </h1>
        <p className="text-muted-foreground mt-1">
          Review user-submitted profile changes
          {total > 0 && status === "PENDING" && !focusId && <Badge className="ms-2">{total} pending</Badge>}
        </p>
      </div>

      {focusId && <FocusBanner onClear={clearFocus} />}
      {!focusId && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => { setStatus(s); setPage(1); }}>
              {STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      )}

      {loadError && <LoadError message={loadError} onRetry={() => fetchRequests(page, status, focusId)} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : loadError ? null : requests.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <h3 className="font-medium text-lg">{status === "PENDING" ? "All Clear!" : "Nothing here yet"}</h3>
            <p className="text-sm text-muted-foreground">
              {status === "PENDING" ? "No pending profile update requests." : `No ${STATUS_LABELS[status].toLowerCase()} requests.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {req.user.firstName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold"><PersonLink p={req.user} /></h3>
                      <div className="flex gap-2 mt-0.5">
                        <Badge variant={req.user.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                          {req.user.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {fmtDateTime(req.createdAt)}
                  </span>
                </div>

                {/* Changes diff table */}
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left p-2 font-medium">Field</th>
                        <th className="text-left p-2 font-medium">Current</th>
                        <th className="text-left p-2 font-medium">Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(req.changes).map(([key, newVal]) => {
                        const currentVal = req.user.profile ? (req.user.profile as Record<string, unknown>)[key] : undefined;
                        return (
                          <tr key={key} className="border-b last:border-0">
                            <td className="p-2 font-medium text-muted-foreground">{fieldLabel(key)}</td>
                            <td className="p-2 text-muted-foreground break-words">{formatValue(key, currentVal, req.user.gender)}</td>
                            <td className="p-2 text-green-600/80 font-medium break-words">{formatValue(key, newVal, req.user.gender)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* User message */}
                {req.message && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <span className="font-medium">User message:</span> {req.message}
                  </div>
                )}

                {/* Reply + actions (a handled request only shows what was decided) */}
                {req.status !== "PENDING" ? (
                  <div className="space-y-2 border-t pt-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {req.status === "APPROVED" ? "Approved" : "Rejected"} {fmtDateTime(req.reviewedAt)}
                    </p>
                    {req.adminNote && <p className="rounded bg-primary/5 p-2 text-primary">Reply to the member: {req.adminNote}</p>}
                  </div>
                ) : (
                <div className="space-y-3">
                  <Label htmlFor={`reply-${req.id}`}>Reply to the member (they will see this)</Label>
                  <textarea
                    id={`reply-${req.id}`}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Optional"
                    value={adminNotes[req.id] || ""}
                    onChange={(e) => setAdminNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAction(req.id, "APPROVED")}
                      disabled={acting === req.id}
                      className="flex-1"
                    >
                      {acting === req.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 me-2" />Approve</>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleAction(req.id, "REJECTED")}
                      disabled={acting === req.id}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 me-2" />
                      Reject
                    </Button>
                  </div>
                </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Pager page={page} pages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
