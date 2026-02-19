"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, Zap, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  profile: { city: string | null } | null;
}

interface SuggestionRow {
  id: string;
  compatibilityScore: number;
  status: string;
  source: string;
  createdAt: string;
  recipient: { id: string; firstName: string; lastName: string; gender: string };
  candidate: { id: string; firstName: string; lastName: string; gender: string };
}

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

export default function AdminSuggestionsPage() {
  const [tab, setTab] = useState<"browse" | "create">("browse");

  // Browse state
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [browseFilter, setBrowseFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  // Create state
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [score, setScore] = useState("85");
  const [createLoading, setCreateLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState("");

  // Load browse data
  useEffect(() => {
    if (tab === "browse") fetchSuggestions();
  }, [tab, browsePage, browseFilter]);

  // Load users for create tab
  useEffect(() => {
    if (tab === "create" && users.length === 0) {
      fetch("/api/admin/users?page=1")
        .then((r) => r.json())
        .then((data) => setUsers(data.users || []))
        .catch(console.error)
        .finally(() => setCreateLoading(false));
    }
  }, [tab]);

  async function fetchSuggestions() {
    setBrowseLoading(true);
    try {
      const params = new URLSearchParams({ page: String(browsePage) });
      if (browseFilter) params.set("status", browseFilter);
      const res = await fetch(`/api/admin/suggestions?${params}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setBrowseTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setBrowseLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this suggestion?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/suggestions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateResult("");
    try {
      const res = await fetch("/api/admin/suggestions/generate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setGenerateResult(`Generated ${data.count} suggestions successfully!`);
      } else {
        setGenerateResult(data.error || "Failed to generate suggestions");
      }
    } catch {
      setGenerateResult("An unexpected error occurred");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRecipient || !selectedCandidate) {
      setError("Please select both users");
      return;
    }
    if (selectedRecipient === selectedCandidate) {
      setError("Recipient and candidate must be different users");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedRecipient,
          candidateId: selectedCandidate,
          compatibilityScore: parseFloat(score),
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setSelectedRecipient("");
        setSelectedCandidate("");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create suggestion");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function scoreColor(s: number): string {
    if (s >= 70) return "text-green-600";
    if (s >= 50) return "text-amber-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          Suggestions Management
        </h1>
        <p className="text-muted-foreground mt-1">Browse, create, and generate match suggestions</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button variant={tab === "browse" ? "default" : "ghost"} size="sm" onClick={() => setTab("browse")}>
          All Suggestions
        </Button>
        <Button variant={tab === "create" ? "default" : "ghost"} size="sm" onClick={() => setTab("create")}>
          Create / Generate
        </Button>
      </div>

      {tab === "browse" ? (
        <>
          {/* Status filter */}
          <div className="flex gap-2">
            {["", "PENDING", "ACCEPTED", "REJECTED", "EXPIRED"].map((s) => (
              <Button
                key={s}
                variant={browseFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => { setBrowseFilter(s); setBrowsePage(1); }}
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
                      <th className="text-left p-3 text-sm font-medium">Recipient</th>
                      <th className="text-left p-3 text-sm font-medium">Candidate</th>
                      <th className="text-left p-3 text-sm font-medium">Score</th>
                      <th className="text-left p-3 text-sm font-medium">Status</th>
                      <th className="text-left p-3 text-sm font-medium">Source</th>
                      <th className="text-left p-3 text-sm font-medium">Date</th>
                      <th className="text-left p-3 text-sm font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {browseLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          <td colSpan={7} className="p-3">
                            <div className="h-6 bg-muted animate-pulse rounded" />
                          </td>
                        </tr>
                      ))
                    ) : suggestions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center p-8 text-muted-foreground">
                          No suggestions found
                        </td>
                      </tr>
                    ) : (
                      suggestions.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <p className="text-sm font-medium">{s.recipient.firstName} {s.recipient.lastName}</p>
                            <Badge variant={s.recipient.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                              {s.recipient.gender === "MALE" ? "M" : "F"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <p className="text-sm font-medium">{s.candidate.firstName} {s.candidate.lastName}</p>
                            <Badge variant={s.candidate.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                              {s.candidate.gender === "MALE" ? "M" : "F"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <span className={`font-bold ${scoreColor(s.compatibilityScore)}`}>
                              {Math.round(s.compatibilityScore)}%
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge className={statusStyles[s.status] || ""}>{s.status}</Badge>
                          </td>
                          <td className="p-3 text-sm">{s.source}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(s.id)}
                              disabled={deleting === s.id}
                            >
                              {deleting === s.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {browseTotalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <p className="text-sm text-muted-foreground">Page {browsePage} of {browseTotalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={browsePage <= 1} onClick={() => setBrowsePage(browsePage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={browsePage >= browseTotalPages} onClick={() => setBrowsePage(browsePage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Auto-generate */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Generate Suggestions</CardTitle>
              <CardDescription>
                Automatically generate suggestions for all eligible users using the matching algorithm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {generateResult && (
                <div className={`rounded-lg p-3 text-sm mb-4 ${
                  generateResult.includes("successfully") || generateResult.includes("Generated")
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-destructive/10 border border-destructive/20 text-destructive"
                }`}>
                  {generateResult}
                </div>
              )}
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Zap className="h-4 w-4 me-2" />Generate Suggestions</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Manual create */}
          <Card>
            <CardHeader>
              <CardTitle>Create New Suggestion</CardTitle>
              <CardDescription>Select a recipient and a candidate</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
                )}
                {success && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Suggestion created successfully!
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Recipient (receives suggestion)</Label>
                    <select
                      value={selectedRecipient}
                      onChange={(e) => setSelectedRecipient(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select recipient...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({u.gender === "FEMALE" ? "F" : "M"}, {u.profile?.city || "N/A"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Candidate (suggested person)</Label>
                    <select
                      value={selectedCandidate}
                      onChange={(e) => setSelectedCandidate(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select candidate...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({u.gender === "FEMALE" ? "F" : "M"}, {u.profile?.city || "N/A"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Compatibility Score (%)</Label>
                  <Input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} className="max-w-[200px]" />
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 me-2" />Create Suggestion</>}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
