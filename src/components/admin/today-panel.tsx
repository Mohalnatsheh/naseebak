"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ClipboardEdit, Flag, Inbox, LifeBuoy, ShieldCheck, AlertTriangle, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Pulse = {
  signups: number;
  active: number;
  interest: number;
  matches: number;
  paid: number;
  unpaid: number;
  revenue: { currency: string; amount: number }[];
};
type Job = { finishedAt: string; errors: number } | null;
type Today = {
  todo: { reports: number; support: number; profileRequests: number; contactMessages: number; identity: number };
  clock: string;
  pulse: { today: Pulse; yesterday: Pulse; week: Pulse; usual: Pulse & { activeDays: number } };
  jobs: { morning: Job; evening: Job; frequent: Job };
  now: string;
};

const TODO = [
  { key: "reports", label: "Reports to review", href: "/admin/reports", icon: Flag },
  { key: "support", label: "Open support tickets", href: "/admin/support", icon: LifeBuoy },
  { key: "profileRequests", label: "Profile changes to approve", href: "/admin/profile-requests", icon: ClipboardEdit },
  { key: "contactMessages", label: "Unanswered contact messages", href: "/admin/messages", icon: Inbox },
  { key: "identity", label: "Identity documents (legacy)", href: "/admin/identity", icon: ShieldCheck, hideWhenZero: true },
] as const;

const ROWS: { key: keyof Pulse | "revenueMain"; label: string; hint: string; lowerIsBetter?: boolean }[] = [
  { key: "active", label: "Active members", hint: "Members who opened the website or app" },
  { key: "signups", label: "Sign-ups", hint: "New member accounts" },
  { key: "interest", label: "«مهتم» given", hint: "Both sides of a card" },
  { key: "matches", label: "New matches", hint: "Both said «مهتم»" },
  { key: "paid", label: "Payments completed", hint: "Count of paid payments" },
  { key: "revenueMain", label: "Revenue", hint: "Completed payments, main currency" },
  { key: "unpaid", label: "Unfinished payments", hint: "Started but not paid (left, cancelled or declined)", lowerIsBetter: true },
];

function value(p: Pulse, key: (typeof ROWS)[number]["key"], currency: string): number {
  if (key === "revenueMain") return p.revenue.find((r) => r.currency === currency)?.amount ?? 0;
  return p[key] as number;
}

function ago(iso: string, now: Date): string {
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** A job is late when its last run is older than its schedule allows */
function jobState(job: Job, maxAgeMin: number, now: Date): "ok" | "late" | "errors" | "never" {
  if (!job) return "never";
  if (job.errors > 0) return "errors";
  return now.getTime() - new Date(job.finishedAt).getTime() > maxAgeMin * 60000 ? "late" : "ok";
}

function Trend({ pct, lowerIsBetter }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const flat = Math.abs(pct) < 10;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        flat ? "bg-muted text-muted-foreground" : good ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"
      )}
    >
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

/**
 * Admin home, top: what waits for an admin, today's numbers (so far, usual by this hour, yesterday, full-day average) and
 * whether the scheduled jobs ran. Data: GET /api/admin/today.
 */
export function TodayPanel() {
  const [data, setData] = useState<Today | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/admin/today")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => !cancelled && (setData(d), setFailed(false)))
        .catch(() => !cancelled && setFailed(true));
    load();
    const timer = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (failed && !data) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Could not load today&apos;s numbers. Refresh the page.</div>;
  }
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  const now = new Date(data.now);
  const currency = [...data.pulse.week.revenue].sort((a, b) => b.amount - a.amount)[0]?.currency ?? "JOD";
  const todo = TODO.filter((t) => !("hideWhenZero" in t) || data.todo[t.key] > 0);
  const waiting = todo.reduce((n, t) => n + data.todo[t.key], 0);
  const jobs = [
    { label: "Morning job (06:00)", state: jobState(data.jobs.morning, 26 * 60, now), job: data.jobs.morning, does: "Expiry, refunds, new suggestions, clean-up" },
    { label: "Evening job (18:00)", state: jobState(data.jobs.evening, 26 * 60, now), job: data.jobs.evening, does: "Reminders and nudges" },
    { label: "Every 15 minutes", state: jobState(data.jobs.frequent, 45, now), job: data.jobs.frequent, does: "Unfinished-payment reminder" },
  ];
  const jobsOk = jobs.every((j) => j.state === "ok");

  return (
    <div className="space-y-6">
      {/* To do */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">To do</h2>
          {waiting === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> All clear
            </span>
          ) : (
            <Link href="/admin/inbox" className="text-sm font-medium text-primary hover:underline">
              Open the inbox ({waiting}) →
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {todo.map((t) => {
            const n = data.todo[t.key];
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border p-4 transition-colors",
                  n > 0 ? "border-amber-300 bg-amber-50 hover:bg-amber-100" : "border-border/60 bg-card hover:bg-muted/50"
                )}
              >
                <t.icon className={cn("h-5 w-5 shrink-0", n > 0 ? "text-amber-700" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <p className={cn("text-2xl font-bold tabular-nums", n > 0 ? "text-amber-900" : "text-muted-foreground")}>{n}</p>
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Today's numbers */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle className="text-lg">Today&apos;s numbers</CardTitle>
              <Link href="/admin/insights" className="text-sm font-medium text-primary hover:underline">
                See Insights →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Up to {data.clock} Amman time. «Usual by now» = the average of the last 7 days up to this same hour, so the evening peak doesn&apos;t read as a drop.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="p-3 text-left font-medium">Metric</th>
                    <th className="p-3 text-right font-medium">So far</th>
                    <th className="p-3 text-right font-medium">Usual by now</th>
                    <th className="p-3 text-right font-medium">vs usual</th>
                    <th className="hidden p-3 text-right font-medium sm:table-cell">Yesterday</th>
                    <th className="hidden p-3 text-right font-medium sm:table-cell">Full-day avg</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const so = value(data.pulse.today, row.key, currency);
                    // Activity tracking began 2026-11-04: divide by the days that have data
                    const days = row.key === "active" ? Math.max(1, data.pulse.usual.activeDays) : 7;
                    const usual = value(data.pulse.usual, row.key, currency) / days;
                    const avg = value(data.pulse.week, row.key, currency) / days;
                    const yest = value(data.pulse.yesterday, row.key, currency);
                    // Too few a day for a % to mean anything
                    const pct = usual >= 3 ? Math.round(((so - usual) / usual) * 100) : null;
                    const fmt = (n: number) => (row.key === "revenueMain" ? `${n.toFixed(n < 100 ? 1 : 0)} ${currency}` : Math.round(n).toLocaleString());
                    return (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="p-3">
                          <p className="font-medium">{row.label}</p>
                          <p className="hidden text-xs text-muted-foreground sm:block">{row.hint}</p>
                        </td>
                        <td className="p-3 text-right text-base font-bold tabular-nums">{fmt(so)}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{fmt(usual)}</td>
                        <td className="p-3 text-right">
                          <Trend pct={pct} lowerIsBetter={row.lowerIsBetter} />
                        </td>
                        <td className="hidden p-3 text-right tabular-nums sm:table-cell">{fmt(yest)}</td>
                        <td className="hidden p-3 text-right tabular-nums text-muted-foreground sm:table-cell">{fmt(avg)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              {jobsOk ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              Scheduled jobs
            </CardTitle>
            <p className="text-xs text-muted-foreground">{jobsOk ? "Everything ran on time with no errors." : "Something needs a look — see below."}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((j) => (
              <div key={j.label} className="flex items-start gap-3 rounded-lg border p-3">
                <span
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    j.state === "ok" ? "bg-emerald-500" : j.state === "errors" ? "bg-destructive" : "bg-amber-500"
                  )}
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{j.label}</p>
                  <p className="text-xs text-muted-foreground">{j.does}</p>
                  <p className={cn("mt-0.5 text-xs", j.state === "ok" ? "text-muted-foreground" : "font-semibold text-amber-700")}>
                    {j.state === "never"
                      ? "Has not run yet"
                      : `Last run ${ago(j.job!.finishedAt, now)}${j.state === "errors" ? ` · ${j.job!.errors} task error(s)` : j.state === "late" ? " · late" : ""}`}
                  </p>
                </div>
              </div>
            ))}
            <Link href="/admin/settings" className="block text-xs text-primary hover:underline">
              Job details and «Run now» in Settings
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
