"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, Search, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  profile: { city: string | null } | null;
}

export default function AdminSuggestionsPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [score, setScore] = useState("85");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState("");

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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/users?page=1");
        const data = await res.json();
        setUsers(data.users || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          Manual Suggestions
        </h1>
        <p className="text-muted-foreground mt-1">Create manual match suggestions between users</p>
      </div>

      {/* Auto-generate suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Generate Suggestions</CardTitle>
          <CardDescription>
            Automatically generate suggestions for all eligible users using the matching algorithm.
            Scores compatible profiles based on preferences, personality, and profile quality.
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
              <>
                <Zap className="h-4 w-4 me-2" />
                Generate Suggestions
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create New Suggestion</CardTitle>
          <CardDescription>Select a recipient (who sees the suggestion) and a candidate (who is suggested)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Suggestion created successfully! The recipient has been notified.
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
              <Input
                type="number"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="max-w-[200px]"
              />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4 me-2" />
                  Create Suggestion
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
