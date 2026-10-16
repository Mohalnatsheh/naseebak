"use client";

import { useState, useEffect } from "react";
import { ClipboardEdit, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProfileRequest {
  id: string;
  changes: Record<string, unknown>;
  message: string | null;
  status: string;
  adminNote: string | null;
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
  hijab: "Hijab", beard: "Beard", drivingLicense: "Driving License",
  prefCity: "Pref City", prefEducation: "Pref Education", prefMaritalStatus: "Pref Marital Status",
  prefAgeMin: "Pref Age Min", prefAgeMax: "Pref Age Max",
  prefReligiosity: "Pref Religiosity", prefSmokingStatus: "Pref Smoking",
  willingToRelocate: "Willing to Relocate", skinColor: "Skin Color", incomeRange: "Income",
  childrenCount: "Children", dateOfBirth: "Date of Birth", fieldOfStudy: "Field of Study",
  interests: "Interests", lifestyle: "Lifestyle", wantsPhoto: "Wants Photo",
  prefHijab: "Pref Hijab", prefBeard: "Pref Beard", prefChildrenAcceptance: "Pref Children",
};

export default function AdminProfileRequestsPage() {
  const [requests, setRequests] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    try {
      const res = await fetch("/api/admin/profile-requests");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || `Failed to load requests (${res.status})`);
        return;
      }
      setLoadError("");
      setRequests(data.requests || []);
    } catch (err) {
      console.error(err);
      setLoadError("Network error, please reload");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(requestId: string, action: "APPROVED" | "REJECTED") {
    setActing(requestId);
    setErrors((prev) => ({ ...prev, [requestId]: "" }));
    try {
      const res = await fetch("/api/admin/profile-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, adminNote: adminNotes[requestId] || "" }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      } else {
        const data = await res.json().catch(() => ({}));
        setErrors((prev) => ({ ...prev, [requestId]: data.error || `Action failed (${res.status})` }));
      }
    } catch (err) {
      console.error(err);
      setErrors((prev) => ({ ...prev, [requestId]: "Network error, please try again" }));
    } finally {
      setActing(null);
    }
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.join(", ") || "—";
    return String(value);
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
          {requests.length > 0 && <Badge className="ms-2">{requests.length} pending</Badge>}
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <h3 className="font-medium text-lg">All Clear!</h3>
            <p className="text-sm text-muted-foreground">No pending profile update requests.</p>
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
                      <h3 className="font-semibold">{req.user.firstName} {req.user.lastName}</h3>
                      <div className="flex gap-2 mt-0.5">
                        <Badge variant={req.user.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                          {req.user.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(req.createdAt).toLocaleDateString()}
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
                            <td className="p-2 font-medium text-muted-foreground">{fieldLabels[key] || key}</td>
                            <td className="p-2 text-muted-foreground break-words">{formatValue(currentVal)}</td>
                            <td className="p-2 text-green-600/80 font-medium break-words">{formatValue(newVal)}</td>
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

                {/* Admin note + actions */}
                <div className="space-y-3">
                  <textarea
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Admin note (optional)..."
                    value={adminNotes[req.id] || ""}
                    onChange={(e) => setAdminNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    rows={2}
                  />
                  {errors[req.id] && (
                    <p className="text-sm text-destructive">{errors[req.id]}</p>
                  )}
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
