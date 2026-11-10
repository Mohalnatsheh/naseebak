"use client";

import { AdminLoadError } from "@/components/admin/admin-states";
import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDateTime } from "@/components/admin/admin-list-bits";
import type { DailyRunSummary } from "@/lib/cron/daily";

/** «1 reminder», «3 reminders»; words ending in s/sh/ch/x take «es» («0 re-engagement pushes», QA WEB-PAY-15) */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : /(s|sh|ch|x)$/.test(word) ? "es" : "s"}`;

function line(run: DailyRunSummary): string {
  const t = run.totals;
  return [
    plural(t.reminders, "reminder"),
    plural(t.suggestions, "suggestion"),
    `${t.expired} expired`,
    plural(t.reengaged, "re-engagement push"),
    plural(t.deletions, "deletion"),
    // Older runs stored before these were added have no field
    plural(t.refunds ?? 0, "«مهتم» refund"),
    plural(t.nudges ?? 0, "family nudge"),
  ].join(", ");
}

/** Admin → Settings: when the daily scheduler last ran, what it did, and a "Run now" button. */
export function DailyJobsCard() {
  const [run, setRun] = useState<DailyRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // A failed load says so: «have not run yet» would be a wrong value (ADM-04)
  function loadLastRun() {
    return fetch("/api/admin/cron/run")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        setRun(d?.lastRun ?? null);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadLastRun();
  }, []);

  async function runNow() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cron/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Run failed");
        toast.error(data.error || "Run failed");
      } else setRun(data.lastRun ?? null);
    } catch {
      setError("Run failed");
      toast.error("Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Daily jobs
          </CardTitle>
          <CardDescription>
            Reminders, expiry notices (with «مهتم» refunds), suggestion top-ups, chat family nudges, re-engagement and account deletions. Every task is safe to run
            twice.
          </CardDescription>
        </div>
        <Button size="sm" onClick={runNow} disabled={running} className="shrink-0">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 me-1" />}
          Run now
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : loadFailed && !run ? (
          <AdminLoadError message="Couldn't load the last run." onRetry={() => { setLoading(true); void loadLastRun(); }} />
        ) : run ? (
          <>
            <p>
              <span className="font-medium">Daily jobs: last run {fmtDateTime(run.finishedAt)}</span>
              {" — "}
              {line(run)}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{run.trigger === "admin" ? "Run by an admin" : "Scheduler"}</Badge>
              <span>{(run.durationMs / 1000).toFixed(1)}s</span>
              {run.totals.errors > 0 && (
                <Badge variant="destructive">{plural(run.totals.errors, "task")} failed</Badge>
              )}
              <button className="underline underline-offset-4" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? "Hide details" : "Details"}
              </button>
            </div>
            {showDetails && (
              <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                {JSON.stringify(run.tasks, null, 2)}
              </pre>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Daily jobs have not run yet.</p>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
