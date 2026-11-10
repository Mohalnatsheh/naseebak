"use client";

import { AdminLoadError } from "@/components/admin/admin-states";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Growth {
  active: { d1: number; d7: number; d30: number; total: number };
  cohorts: { week: string; joined: number; women: number; setup: number; interest: number; matched: number; chatted: number; paid: number; active7: number }[];
  interest: { week: string; given: number; matched: number; answered: number; open: boolean }[];
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const weekLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Cell({ n, of, strong }: { n: number; of: number; strong?: boolean }) {
  const p = pct(n, of);
  return (
    <td className="py-1.5 text-end tabular-nums">
      <span className={cn(strong && "font-semibold")}>{p}%</span>
      <span className="ms-1 text-[11px] text-muted-foreground">{n}</span>
    </td>
  );
}

/**
 * Admin dashboard: are more people coming back? Active members, sign-up weeks and how far each got, and the weekly
 * «مهتم» → match rate (GET /api/admin/growth, admin's country).
 */
export function GrowthPanel() {
  const [data, setData] = useState<Growth | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/growth")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Growth) => {
        if (!live) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" /> Growth & retention
        </CardTitle>
        <p className="text-xs text-muted-foreground">Weeks start on Saturday (Amman). Percentages of the members who joined that week.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {failed && <AdminLoadError message="Couldn't load the growth numbers." onRetry={() => setAttempt((n) => n + 1)} />}
        {!data && !failed && <div className="h-40 animate-pulse rounded-lg bg-muted" />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Active in 24 h", data.active.d1],
                ["Active 7 days", data.active.d7],
                ["Active 30 days", data.active.d30],
                ["Open accounts", data.active.total],
              ].map(([label, n]) => (
                <div key={label as string} className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold tabular-nums">{(n as number).toLocaleString()}</p>
                  {label !== "Open accounts" && (
                    <p className="text-[11px] text-muted-foreground">{pct(n as number, data.active.total)}% of accounts</p>
                  )}
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <p className="mb-1.5 text-sm font-medium">Sign-up weeks: how far they got</p>
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 text-start font-medium">Joined week</th>
                    <th className="py-2 text-end font-medium">Joined</th>
                    <th className="py-2 text-end font-medium">Women</th>
                    <th className="py-2 text-end font-medium">Finished setup</th>
                    <th className="py-2 text-end font-medium">Said «مهتم»</th>
                    <th className="py-2 text-end font-medium">Matched</th>
                    <th className="py-2 text-end font-medium">Chatted</th>
                    <th className="py-2 text-end font-medium">Paid</th>
                    <th className="py-2 text-end font-medium">Active this week</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.week} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 text-muted-foreground">{weekLabel(c.week)}</td>
                      <td className="py-1.5 text-end font-semibold tabular-nums">{c.joined}</td>
                      <Cell n={c.women} of={c.joined} />
                      <Cell n={c.setup} of={c.joined} />
                      <Cell n={c.interest} of={c.joined} />
                      <Cell n={c.matched} of={c.joined} />
                      <Cell n={c.chatted} of={c.joined} />
                      <Cell n={c.paid} of={c.joined} />
                      <Cell n={c.active7} of={c.joined} strong />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <p className="mb-1.5 text-sm font-medium">«مهتم» → match, by the week it was given</p>
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 text-start font-medium">Week</th>
                    <th className="py-2 text-end font-medium">«مهتم» given</th>
                    <th className="py-2 text-end font-medium">Answered</th>
                    <th className="py-2 text-end font-medium">Became a match</th>
                  </tr>
                </thead>
                <tbody>
                  {data.interest.map((i) => (
                    <tr key={i.week} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 text-muted-foreground">
                        {weekLabel(i.week)}
                        {i.open && <span className="ms-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">still open</span>}
                      </td>
                      <td className="py-1.5 text-end font-semibold tabular-nums">{i.given.toLocaleString()}</td>
                      <Cell n={i.answered} of={i.given} />
                      <Cell n={i.matched} of={i.given} strong />
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                «still open»: cards from that week can still be answered, so its rate will rise.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
