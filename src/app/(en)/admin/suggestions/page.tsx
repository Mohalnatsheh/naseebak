"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  const [females, setFemales] = useState<UserOption[]>([]);
  const [males, setMales] = useState<UserOption[]>([]);
  const [selectedFemale, setSelectedFemale] = useState("");
  const [selectedMale, setSelectedMale] = useState("");
  const [score, setScore] = useState("85");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/users?page=1");
        const data = await res.json();
        const users = data.users || [];
        setFemales(users.filter((u: UserOption) => u.gender === "FEMALE"));
        setMales(users.filter((u: UserOption) => u.gender === "MALE"));
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
    if (!selectedFemale || !selectedMale) {
      setError("Please select both users");
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
          femaleId: selectedFemale,
          maleId: selectedMale,
          compatibilityScore: parseFloat(score),
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setSelectedFemale("");
        setSelectedMale("");
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

      <Card>
        <CardHeader>
          <CardTitle>Create New Suggestion</CardTitle>
          <CardDescription>Select a female user and a male user to create a match suggestion</CardDescription>
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
                Suggestion created successfully! The female user has been notified.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Female User</Label>
                <select
                  value={selectedFemale}
                  onChange={(e) => setSelectedFemale(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select female user...</option>
                  {females.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.firstName} {f.lastName} ({f.profile?.city || "N/A"})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Male User</Label>
                <select
                  value={selectedMale}
                  onChange={(e) => setSelectedMale(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select male user...</option>
                  {males.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} ({m.profile?.city || "N/A"})
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
