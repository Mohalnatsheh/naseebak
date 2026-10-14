"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, Loader2, Zap, Trash2, ChevronLeft, ChevronRight,
  Search, ArrowRight, ArrowLeft, ChevronDown, ChevronUp,
  Check, X, UserRound, Plus, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// --- Types ---

interface SuggestionRow {
  id: string;
  compatibilityScore: number;
  status: string;
  source: string;
  createdAt: string;
  recipient: { id: string; firstName: string; lastName: string; gender: string };
  candidate: { id: string; firstName: string; lastName: string; gender: string };
}

interface SearchUser {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  status: string;
  matchCredits: number;
  profile: { city: string | null } | null;
  identityDoc?: { status: string } | null;
}

interface PreferenceDetail {
  field: string;
  label: string;
  matched: boolean;
  weight: number;
  userPref: string | null;
  candidateValue: string | null;
}

interface QualityDetail {
  hasCompleteProfile: boolean;
  hasPhotos: boolean;
  hasQuiz: boolean;
  hasIdentityVerified: boolean;
}

interface CompatibilityBreakdown {
  totalScore: number;
  preferenceScore: number;
  preferenceWeight: number;
  preferenceDetails: {
    userToCandidate: PreferenceDetail[];
    candidateToUser: PreferenceDetail[];
  };
  personalityScore: number;
  personalityWeight: number;
  hasPersonalityData: boolean;
  qualityScore: number;
  qualityWeight: number;
  qualityUserDetail: QualityDetail;
  qualityCandidateDetail: QualityDetail;
}

interface CandidateResult {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    gender: string;
    profile: { city: string | null; education: string | null; maritalStatus: string | null } | null;
  };
  breakdown: CompatibilityBreakdown;
  alreadySuggested: boolean;
}

interface UserSuggestionAsRecipient {
  id: string;
  compatibilityScore: number;
  status: string;
  source: string;
  createdAt: string;
  candidate: { id: string; firstName: string; lastName: string; gender: string };
}

interface UserSuggestionAsCandidate {
  id: string;
  compatibilityScore: number;
  status: string;
  source: string;
  createdAt: string;
  recipient: { id: string; firstName: string; lastName: string; gender: string };
}

// --- Helpers ---

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

function scoreColor(s: number): string {
  if (s >= 70) return "text-green-600";
  if (s >= 50) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(s: number): string {
  if (s >= 70) return "bg-green-500";
  if (s >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function pctBar(value: number, colorClass: string) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium w-10 text-right">{pct}%</span>
    </div>
  );
}

// --- Component ---

export default function AdminSuggestionsPage() {
  const [tab, setTab] = useState<"browse" | "manage" | "generate">("browse");

  // ── Browse state ──
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [browseFilter, setBrowseFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Manage User state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);

  const [userSuggestionsRecipient, setUserSuggestionsRecipient] = useState<UserSuggestionAsRecipient[]>([]);
  const [userSuggestionsCandidate, setUserSuggestionsCandidate] = useState<UserSuggestionAsCandidate[]>([]);
  const [userSugLoading, setUserSugLoading] = useState(false);

  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [candidatesTotal, setCandidatesTotal] = useState(0);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateLimit, setCandidateLimit] = useState(10);
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  // ── Generate state ──
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState("");

  // ── Browse data ──
  useEffect(() => {
    if (tab === "browse") fetchSuggestions();
  }, [tab, browsePage, browseFilter]);

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

  async function handleDeleteBrowse(id: string) {
    if (!confirm("Delete this suggestion?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/suggestions/${id}`, { method: "DELETE" });
      if (res.ok) setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  // ── Manage User: search ──
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery.trim())}&page=1`);
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Manage User: select a user ──
  const loadUserData = useCallback(async (user: SearchUser) => {
    setSelectedUser(user);
    setSearchResults([]);
    setSearchQuery("");
    setExpandedCandidate(null);
    setCandidateLimit(10);

    // Fetch existing suggestions + candidates in parallel
    setUserSugLoading(true);
    setCandidatesLoading(true);

    try {
      const [sugRes, candRes] = await Promise.all([
        fetch(`/api/admin/suggestions/user/${user.id}`),
        fetch(`/api/admin/suggestions/candidates?userId=${user.id}&limit=10`),
      ]);
      const sugData = await sugRes.json();
      const candData = await candRes.json();

      setUserSuggestionsRecipient(sugData.asRecipient || []);
      setUserSuggestionsCandidate(sugData.asCandidate || []);
      setCandidates(candData.candidates || []);
      setCandidatesTotal(candData.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setUserSugLoading(false);
      setCandidatesLoading(false);
    }
  }, []);

  // ── Manage User: load more candidates ──
  async function loadMoreCandidates() {
    if (!selectedUser) return;
    const newLimit = candidateLimit + 10;
    setCandidatesLoading(true);
    try {
      const res = await fetch(`/api/admin/suggestions/candidates?userId=${selectedUser.id}&limit=${newLimit}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
      setCandidatesTotal(data.total || 0);
      setCandidateLimit(newLimit);
    } catch (err) {
      console.error(err);
    } finally {
      setCandidatesLoading(false);
    }
  }

  // ── Manage User: assign candidate ──
  async function handleAssign(candidateId: string, score: number) {
    if (!selectedUser) return;
    setAssigning(candidateId);
    try {
      const res = await fetch("/api/admin/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedUser.id,
          candidateId,
          compatibilityScore: score,
        }),
      });
      if (res.ok) {
        // Mark candidate as already suggested locally
        setCandidates((prev) =>
          prev.map((c) => c.user.id === candidateId ? { ...c, alreadySuggested: true } : c)
        );
        // Refresh existing suggestions
        const sugRes = await fetch(`/api/admin/suggestions/user/${selectedUser.id}`);
        const sugData = await sugRes.json();
        setUserSuggestionsRecipient(sugData.asRecipient || []);
        setUserSuggestionsCandidate(sugData.asCandidate || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAssigning(null);
    }
  }

  // ── Manage User: delete suggestion ──
  async function handleDeleteUserSuggestion(id: string) {
    if (!confirm("Delete this suggestion?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/suggestions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUserSuggestionsRecipient((prev) => prev.filter((s) => s.id !== id));
        setUserSuggestionsCandidate((prev) => prev.filter((s) => s.id !== id));
        // Also refresh candidates to un-mark alreadySuggested
        if (selectedUser) {
          const candRes = await fetch(`/api/admin/suggestions/candidates?userId=${selectedUser.id}&limit=${candidateLimit}`);
          const candData = await candRes.json();
          setCandidates(candData.candidates || []);
          setCandidatesTotal(candData.total || 0);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  // ── Generate ──
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

  // ── Render ──
  const allUserSuggestions = [
    ...userSuggestionsRecipient.map((s) => ({
      id: s.id,
      otherUser: s.candidate,
      direction: "outgoing" as const,
      score: s.compatibilityScore,
      status: s.status,
      source: s.source,
      createdAt: s.createdAt,
    })),
    ...userSuggestionsCandidate.map((s) => ({
      id: s.id,
      otherUser: s.recipient,
      direction: "incoming" as const,
      score: s.compatibilityScore,
      status: s.status,
      source: s.source,
      createdAt: s.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          Suggestions Management
        </h1>
        <p className="text-muted-foreground mt-1">Browse, manage per-user, and auto-generate match suggestions</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <Button variant={tab === "browse" ? "default" : "ghost"} size="sm" onClick={() => setTab("browse")}>
          Browse All
        </Button>
        <Button variant={tab === "manage" ? "default" : "ghost"} size="sm" onClick={() => setTab("manage")}>
          Manage User
        </Button>
        <Button variant={tab === "generate" ? "default" : "ghost"} size="sm" onClick={() => setTab("generate")}>
          Auto-Generate
        </Button>
      </div>

      {/* ═══════════ BROWSE TAB ═══════════ */}
      {tab === "browse" && (
        <>
          <div className="flex flex-wrap gap-2">
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
                          <td colSpan={7} className="p-3"><div className="h-6 bg-muted animate-pulse rounded" /></td>
                        </tr>
                      ))
                    ) : suggestions.length === 0 ? (
                      <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">No suggestions found</td></tr>
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
                          <td className="p-3"><Badge className={statusStyles[s.status] || ""}>{s.status}</Badge></td>
                          <td className="p-3 text-sm">{s.source}</td>
                          <td className="p-3 text-sm text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                          <td className="p-3">
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteBrowse(s.id)} disabled={deleting === s.id}>
                              {deleting === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
      )}

      {/* ═══════════ MANAGE USER TAB ═══════════ */}
      {tab === "manage" && (
        <>
          {/* User Search */}
          {!selectedUser && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Find User</CardTitle>
                <CardDescription>Search by name or phone number to manage their suggestions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="max-w-md"
                  />
                  <Button onClick={handleSearch} disabled={searchLoading}>
                    {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4 me-2" />Search</>}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="border rounded-lg divide-y">
                    {searchResults.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 p-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <UserRound className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant={u.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                                {u.gender === "MALE" ? "Male" : "Female"}
                              </Badge>
                              {u.profile?.city && <span className="text-xs text-muted-foreground">{u.profile.city}</span>}
                            </div>
                          </div>
                        </div>
                        <Button size="sm" className="shrink-0" onClick={() => loadUserData(u)}>Select</Button>
                      </div>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && searchQuery && !searchLoading && (
                  <p className="text-sm text-muted-foreground">No users found for &quot;{searchQuery}&quot;</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Selected User Card */}
          {selectedUser && (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserRound className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{selectedUser.firstName} {selectedUser.lastName}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge variant={selectedUser.gender === "MALE" ? "default" : "secondary"}>
                            {selectedUser.gender === "MALE" ? "Male" : "Female"}
                          </Badge>
                          {selectedUser.profile?.city && (
                            <span className="text-sm text-muted-foreground">{selectedUser.profile.city}</span>
                          )}
                          <Badge variant="outline" className="text-xs">{selectedUser.matchCredits} credits</Badge>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedUser(null); setSearchQuery(""); }}>
                      Change User
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Existing Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Existing Suggestions ({allUserSuggestions.length})</CardTitle>
                  <CardDescription>All suggestions involving this user</CardDescription>
                </CardHeader>
                <CardContent>
                  {userSugLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  ) : allUserSuggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No suggestions yet for this user.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 text-xs font-medium">Dir</th>
                            <th className="text-left p-2 text-xs font-medium">Other User</th>
                            <th className="text-left p-2 text-xs font-medium">Score</th>
                            <th className="text-left p-2 text-xs font-medium">Status</th>
                            <th className="text-left p-2 text-xs font-medium">Source</th>
                            <th className="text-left p-2 text-xs font-medium">Date</th>
                            <th className="text-left p-2 text-xs font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allUserSuggestions.map((s) => (
                            <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="p-2" title={s.direction === "outgoing" ? "Recipient (receives suggestion)" : "Candidate (suggested to someone else)"}>
                                {s.direction === "outgoing" ? (
                                  <ArrowRight className="h-4 w-4 text-primary" />
                                ) : (
                                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                                )}
                              </td>
                              <td className="p-2">
                                <p className="text-sm">{s.otherUser.firstName} {s.otherUser.lastName}</p>
                                <Badge variant={s.otherUser.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                                  {s.otherUser.gender === "MALE" ? "M" : "F"}
                                </Badge>
                              </td>
                              <td className="p-2">
                                <span className={`text-sm font-bold ${scoreColor(s.score)}`}>{Math.round(s.score)}%</span>
                              </td>
                              <td className="p-2"><Badge className={`text-xs ${statusStyles[s.status] || ""}`}>{s.status}</Badge></td>
                              <td className="p-2 text-xs text-muted-foreground">{s.source}</td>
                              <td className="p-2 text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                              <td className="p-2">
                                {s.status === "PENDING" && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-9 w-9 p-0"
                                    onClick={() => handleDeleteUserSuggestion(s.id)}
                                    disabled={deleting === s.id}
                                  >
                                    {deleting === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* System Candidates */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">System Candidates ({candidatesTotal} total)</CardTitle>
                  <CardDescription>
                    AI-scored candidates for {selectedUser.firstName}. Click a card to see the detailed breakdown.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {candidatesLoading && candidates.length === 0 ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                      ))}
                    </div>
                  ) : candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No eligible candidates found.</p>
                  ) : (
                    <>
                      {candidates.map((c) => {
                        const isExpanded = expandedCandidate === c.user.id;
                        const b = c.breakdown;
                        return (
                          <div key={c.user.id} className="border rounded-lg overflow-hidden">
                            {/* Summary row */}
                            <div
                              className="flex items-center justify-between gap-2 p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => setExpandedCandidate(isExpanded ? null : c.user.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Score ring */}
                                <div className="relative h-12 w-12 flex-shrink-0">
                                  <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                                    <path
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      fill="none" stroke="currentColor" strokeWidth="3" className="text-muted"
                                    />
                                    <path
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      fill="none" strokeWidth="3" strokeDasharray={`${b.totalScore}, 100`}
                                      className={b.totalScore >= 70 ? "stroke-green-500" : b.totalScore >= 50 ? "stroke-amber-500" : "stroke-red-500"}
                                    />
                                  </svg>
                                  <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${scoreColor(b.totalScore)}`}>
                                    {b.totalScore}
                                  </span>
                                </div>

                                <div>
                                  <p className="text-sm font-medium">{c.user.firstName} {c.user.lastName}</p>
                                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                    <Badge variant={c.user.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                                      {c.user.gender === "MALE" ? "M" : "F"}
                                    </Badge>
                                    {c.user.profile?.city && (
                                      <span className="text-xs text-muted-foreground">{c.user.profile.city}</span>
                                    )}
                                    {c.user.profile?.education && (
                                      <span className="text-xs text-muted-foreground">{c.user.profile.education}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {c.alreadySuggested ? (
                                  <Badge variant="outline" className="text-xs">Already Suggested</Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); handleAssign(c.user.id, b.totalScore); }}
                                    disabled={assigning === c.user.id}
                                  >
                                    {assigning === c.user.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <><Plus className="h-3 w-3 me-1" />Assign</>
                                    )}
                                  </Button>
                                )}
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </div>

                            {/* Expanded breakdown */}
                            {isExpanded && (
                              <div className="border-t p-4 bg-muted/20 space-y-5">
                                {/* Preference Match */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold">Preference Match (weight: {b.preferenceWeight}%)</h4>
                                  </div>
                                  {pctBar(b.preferenceScore, scoreBg(b.preferenceScore * 100))}

                                  {/* User → Candidate preferences */}
                                  {b.preferenceDetails.userToCandidate.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5">
                                        {selectedUser.firstName}&apos;s prefs vs {c.user.firstName}
                                      </p>
                                      <div className="grid gap-1">
                                        {b.preferenceDetails.userToCandidate.map((d) => (
                                          <div key={d.field} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                            {d.matched ? (
                                              <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                            ) : (
                                              <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                            )}
                                            <span className="font-medium w-24 shrink-0">{d.label}</span>
                                            <span className="text-muted-foreground">Wants: {d.userPref}</span>
                                            <span className="text-muted-foreground mx-1">/</span>
                                            <span>Has: {d.candidateValue}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Candidate → User preferences */}
                                  {b.preferenceDetails.candidateToUser.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5">
                                        {c.user.firstName}&apos;s prefs vs {selectedUser.firstName}
                                      </p>
                                      <div className="grid gap-1">
                                        {b.preferenceDetails.candidateToUser.map((d) => (
                                          <div key={d.field} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                            {d.matched ? (
                                              <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                            ) : (
                                              <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                            )}
                                            <span className="font-medium w-24 shrink-0">{d.label}</span>
                                            <span className="text-muted-foreground">Wants: {d.userPref}</span>
                                            <span className="text-muted-foreground mx-1">/</span>
                                            <span>Has: {d.candidateValue}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {b.preferenceDetails.userToCandidate.length === 0 && b.preferenceDetails.candidateToUser.length === 0 && (
                                    <p className="text-xs text-muted-foreground mt-2">No preferences set — full score by default</p>
                                  )}
                                </div>

                                {/* Personality */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold">Personality (weight: {b.personalityWeight}%)</h4>
                                  </div>
                                  {b.hasPersonalityData ? (
                                    pctBar(b.personalityScore, scoreBg(b.personalityScore * 100))
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No quiz data — weight redistributed to other factors</p>
                                  )}
                                </div>

                                {/* Profile Quality */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold">Profile Quality (weight: {b.qualityWeight}%)</h4>
                                  </div>
                                  {pctBar(b.qualityScore, scoreBg(b.qualityScore * 100))}

                                  <div className="grid grid-cols-2 gap-4 mt-3">
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{selectedUser.firstName}</p>
                                      <QualityChecklist detail={b.qualityUserDetail} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{c.user.firstName}</p>
                                      <QualityChecklist detail={b.qualityCandidateDetail} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Load more */}
                      {candidates.length < candidatesTotal && (
                        <div className="flex justify-center pt-2">
                          <Button variant="outline" size="sm" onClick={loadMoreCandidates} disabled={candidatesLoading}>
                            {candidatesLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>Load More ({candidatesTotal - candidates.length} remaining)</>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* ═══════════ AUTO-GENERATE TAB ═══════════ */}
      {tab === "generate" && (
        <Card>
          <CardHeader>
            <CardTitle>Auto-Generate Suggestions</CardTitle>
            <CardDescription>
              Automatically generate suggestions for all eligible users using the matching algorithm.
              This creates up to 3 suggestions per user with scores above 30%.
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
                <><Zap className="h-4 w-4 me-2" />Generate All Suggestions</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QualityChecklist({ detail }: { detail: QualityDetail }) {
  const items = [
    { label: "Profile", ok: detail.hasCompleteProfile },
    { label: "Photos", ok: detail.hasPhotos },
    { label: "Quiz", ok: detail.hasQuiz },
    { label: "Identity", ok: detail.hasIdentityVerified },
  ];
  return (
    <div className="grid gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs">
          {item.ok ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <X className="h-3.5 w-3.5 text-red-500" />
          )}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
