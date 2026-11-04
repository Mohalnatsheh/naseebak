"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Source = "WEB_ANDROID" | "WEB_IPHONE" | "WEB_DESKTOP" | "APP_ANDROID" | "APP_IOS" | "APP_OTHER";
type Counts = Record<Source, number> & { total: number };
interface Data {
  today: string;
  since: string | null;
  days: (Counts & { day: string })[];
  members: { registered: number; seen: number; notSeen: number };
  [window: string]: unknown;
}

const WINDOWS: [string, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "7 days"],
  ["month", "30 days"],
  ["all", "All time"],
];

const ROWS: { source: Source; label: string; app: boolean }[] = [
  { source: "WEB_ANDROID", label: "Website · Android", app: false },
  { source: "WEB_IPHONE", label: "Website · iPhone", app: false },
  { source: "WEB_DESKTOP", label: "Website · Computer", app: false },
  { source: "APP_ANDROID", label: "App · Android", app: true },
  { source: "APP_IOS", label: "App · iPhone", app: true },
  { source: "APP_OTHER", label: "App · device unknown", app: true },
];

const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const REFRESH_MS = 60_000;

/**
 * Admin dashboard: distinct members per place they used Naseebak (website by device, app by platform) for today,
 * yesterday, 7 and 30 days, plus the last 14 days. From `GET /api/admin/activity-devices` (admin's country).
 */
export function ActiveDevicesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [win, setWin] = useState("today");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/activity-devices");
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const counts = (data?.[win] as Counts | undefined) ?? null;
  const rows = ROWS.filter((r) => r.source !== "APP_OTHER" || (counts?.APP_OTHER ?? 0) > 0);
  const max = counts ? Math.max(1, ...rows.map((r) => counts[r.source])) : 1;
  const web = counts ? counts.WEB_ANDROID + counts.WEB_IPHONE + counts.WEB_DESKTOP : 0;
  const app = counts ? counts.APP_ANDROID + counts.APP_IOS + counts.APP_OTHER : 0;
  const showOther = !!data?.days.some((d) => d.APP_OTHER > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> Active by device
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Members who used Naseebak, by where. A member on two devices counts in both rows, once in the total.
            {data?.since ? ` Website counted since ${dayName(data.since)}; the app since its launch.` : " Website counting starts with the first visit after this update."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Period" className="flex rounded-lg border border-border p-0.5">
            {WINDOWS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={win === key}
                onClick={() => setWin(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  win === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {failed && !data && <p className="text-sm text-destructive">Could not load the device numbers.</p>}
        {!data && !failed && <div className="h-40 animate-pulse rounded-lg bg-muted" />}

        {data?.members && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Registered members" value={data.members.registered} hint="active or not" />
            <Stat label="Seen on a device" value={data.members.seen} hint="all time, any row below" />
            <Stat label="Not seen yet" value={data.members.notSeen} hint="no visit since counting began" />
          </div>
        )}

        {counts && (
          <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
            <ul className="space-y-2.5">
              {rows.map((r) => (
                <li key={r.source} className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    {r.app ? <Smartphone className="h-3.5 w-3.5 text-accent" /> : <Globe className="h-3.5 w-3.5 text-primary" />}
                    {r.label}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", r.app ? "bg-accent" : "bg-primary")}
                      style={{ width: `${(counts[r.source] / max) * 100}%` }}
                    />
                  </span>
                  <span className="text-end font-semibold tabular-nums">{counts[r.source].toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <Stat label="Members" value={counts.total} />
              <Stat label="Website" value={web} hint={counts.total ? `${Math.round((web / Math.max(1, web + app)) * 100)}% of visits` : undefined} />
              <Stat label="App" value={app} hint={counts.total ? `${Math.round((app / Math.max(1, web + app)) * 100)}% of visits` : undefined} />
            </div>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-start font-medium">Day</th>
                  <th className="py-2 text-end font-medium">Web Android</th>
                  <th className="py-2 text-end font-medium">Web iPhone</th>
                  <th className="py-2 text-end font-medium">Web computer</th>
                  <th className="py-2 text-end font-medium">App Android</th>
                  <th className="py-2 text-end font-medium">App iPhone</th>
                  {showOther && <th className="py-2 text-end font-medium">App ?</th>}
                  <th className="py-2 text-end font-medium">Members</th>
                </tr>
              </thead>
              <tbody>
                {[...data.days].reverse().filter((d) => !data.since || d.day >= data.since).map((d) => (
                  <tr key={d.day} className="border-b border-border/50 last:border-0 tabular-nums">
                    <td className="py-1.5 text-muted-foreground">{d.day === data.today ? "Today" : dayName(d.day)}</td>
                    <td className="py-1.5 text-end">{d.WEB_ANDROID}</td>
                    <td className="py-1.5 text-end">{d.WEB_IPHONE}</td>
                    <td className="py-1.5 text-end">{d.WEB_DESKTOP}</td>
                    <td className="py-1.5 text-end">{d.APP_ANDROID}</td>
                    <td className="py-1.5 text-end">{d.APP_IOS}</td>
                    {showOther && <td className="py-1.5 text-end">{d.APP_OTHER}</td>}
                    <td className="py-1.5 text-end font-semibold">{d.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
