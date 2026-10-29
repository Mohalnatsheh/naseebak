"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, DollarSign, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changePct as pct } from "@/lib/admin/revenue";

interface Day {
  day: string;
  started: number;
  paid: number;
  revenue: number;
  payers: number;
  refunded: number;
  conversion?: number | null;
}
interface Period {
  revenue: number;
  paid: number;
  started: number;
  refunded: number;
  change: number | null;
  conversion: number | null;
}
interface Revenue {
  asOf: string;
  days: Day[];
  today: Day;
  yesterday: Day;
  dayBefore: Day;
  pace: { todayRevenue: number; yesterdaySameTime: number; change: number | null };
  week: Period;
  month: Period;
  allTime: { revenue: number; paid: number; payers: number; refunded: number };
  todayPackages: { package: string; count: number; revenue: number }[];
  recent: { id: string; at: string; amount: number; package: string; member: { id: string; firstName: string } | null }[];
}

const jod = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} JOD`;
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const REFRESH_MS = 60_000;

function Change({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">new · {suffix}</span>;
  const up = value > 0;
  const flat = value === 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", flat ? "text-muted-foreground" : up ? "text-emerald-700" : "text-destructive")}>
      {!flat && <Icon className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {value}% <span className="font-normal text-muted-foreground">{suffix}</span>
    </span>
  );
}

function DayTile({ title, d, change, changeSuffix, highlight }: { title: string; d: Day; change: number | null; changeSuffix: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", highlight && "border-emerald-300 bg-emerald-50/50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{dayName(d.day)}</span>
      </div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{jod(d.revenue)}</div>
      <div className="mt-1"><Change value={change} suffix={changeSuffix} /></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-muted-foreground">Paid</div><div className="font-semibold tabular-nums">{d.paid}</div></div>
        <div><div className="text-muted-foreground">Checkouts</div><div className="font-semibold tabular-nums">{d.started}</div></div>
        <div><div className="text-muted-foreground">Finished</div><div className="font-semibold tabular-nums">{d.conversion == null ? "—" : `${d.conversion}%`}</div></div>
      </div>
      {d.refunded > 0 && <div className="mt-2 text-xs text-destructive">Refunded {jod(d.refunded)}</div>}
    </div>
  );
}

function Bars({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.revenue));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5">
        {days.map((d, i) => {
          const last = i === days.length - 1;
          return (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
                <span className="text-muted-foreground">{dayName(d.day)}</span> · <b>{jod(d.revenue)}</b> · {d.paid} paid / {d.started} checkouts
              </span>
              <span className="mb-1 text-center text-[10px] tabular-nums text-muted-foreground">{d.revenue > 0 ? d.revenue : ""}</span>
              <div
                className={cn("w-full rounded-t-md", last ? "bg-emerald-500" : "bg-primary/70 group-hover:bg-primary")}
                style={{ height: `${Math.max(d.revenue > 0 ? 4 : 1, (d.revenue / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {days.map((d, i) => (
          <span key={d.day} className="flex-1 text-center text-[10px] text-muted-foreground">
            {i % 2 === days.length % 2 || i === days.length - 1 ? new Date(`${d.day}T12:00:00Z`).getUTCDate() : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

/** Admin dashboard: revenue today / yesterday / the day before, trends and the latest payments (refreshes every minute) */
export function RevenuePanel() {
  const [data, setData] = useState<Revenue | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/revenue");
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setError("");
      setLoadedAt(Date.now());
    } catch {
      setError("Could not load revenue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" /> Revenue
          <span className="text-xs font-normal text-muted-foreground">Amman days · completed payments</span>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("me-1 h-3.5 w-3.5", loading && "animate-spin")} />
          {loadedAt ? new Date(loadedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit" }) : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <DayTile title="Today" d={data.today} change={data.pace.change} changeSuffix={`vs yesterday by now (${jod(data.pace.yesterdaySameTime)})`} highlight />
              <DayTile title="Yesterday" d={data.yesterday} change={pct(data.yesterday.revenue, data.dayBefore.revenue)} changeSuffix="vs the day before" />
              <DayTile title="Day before" d={data.dayBefore} change={pct(data.dayBefore.revenue, data.days[data.days.length - 4]?.revenue ?? 0)} changeSuffix="vs its day before" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { t: "Last 7 days", p: data.week, s: "vs the 7 before" },
                { t: "Last 30 days", p: data.month, s: "vs the 30 before" },
              ].map(({ t, p, s }) => (
                <div key={t} className="rounded-xl border bg-card p-4">
                  <div className="text-sm text-muted-foreground">{t}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{jod(p.revenue)}</div>
                  <Change value={p.change} suffix={s} />
                  <div className="mt-2 text-xs text-muted-foreground">
                    {p.paid} paid of {p.started} checkouts{p.conversion != null ? ` (${p.conversion}%)` : ""}
                    {p.paid > 0 && ` · avg ${jod(Math.round((p.revenue / p.paid) * 10) / 10)}`}
                  </div>
                </div>
              ))}
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">All time</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{jod(data.allTime.revenue)}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {data.allTime.paid} payments · {data.allTime.payers} paying members
                  {data.allTime.refunded > 0 && <> · <span className="text-destructive">refunded {jod(data.allTime.refunded)}</span></>}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-medium">Last 14 days</span>
                <span className="text-xs text-muted-foreground">JOD per day · today in green · hover a bar for details</span>
              </div>
              <Bars days={data.days} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-4">
                <div className="mb-2 text-sm font-medium">Today&apos;s packages</div>
                {data.todayPackages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment yet today.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.todayPackages.map((p) => (
                      <li key={p.package} className="flex justify-between gap-2">
                        <span>{p.package}</span>
                        <span className="tabular-nums text-muted-foreground">{p.count} × · <b className="text-foreground">{jod(p.revenue)}</b></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium">Latest payments</span>
                  <Link href="/admin/payments" className="text-xs text-primary hover:underline">All payments</Link>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {data.recent.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {p.member ? (
                          <Link href={`/admin/users/${p.member.id}`} className="font-medium text-primary hover:underline"><bdi>{p.member.firstName}</bdi></Link>
                        ) : (
                          <span className="text-muted-foreground">Deleted account</span>
                        )}
                        <span className="text-muted-foreground"> · {p.package}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{ago(p.at, loadedAt)} · <b className="text-foreground">{jod(p.amount)}</b></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

