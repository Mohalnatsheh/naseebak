"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, UserCheck, Heart, Sparkles, ShieldCheck, 
  TrendingUp, Clock, DollarSign, Flag, ClipboardEdit,
  ArrowUpRight, ArrowDownRight, LifeBuoy, HeartHandshake, MessagesSquare, Coins,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Stats {
  totalUsers: number;
  maleUsers: number;
  femaleUsers: number;
  verifiedUsers: number;
  pendingVerifications: number;
  totalMatches: number;
  totalSuggestions: number;
  activeSubscriptions: number;
  suspendedUsers: number;
  totalRevenue: number;
  revenueThisWeek: number;
  completedPayments: number;
  pendingReports: number;
  pendingProfileRequests: number;
  pendingSupportTickets: number;
  flaggedUsers: number;
  registrationsThisWeek: number;
  registrationsLastWeek: number;
}

interface RequestCounts {
  sent: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  cancelled: number;
}

interface CycleStats {
  intro: Record<"FAMILY" | "CHAT" | "ALL", RequestCounts>;
  activeChats: number;
  creditsSpentThisWeek: number;
  funnel: { key: string; label: string; count: number; pct: number }[];
}

interface ActivityItem {
  type: string;
  description: string;
  date: string;
}

const activityDots: Record<string, string> = {
  registration: "bg-primary",
  match: "bg-accent",
  payment: "bg-emerald-500",
};

/** Brand-token colour sets for stat tiles (CLAUDE.md colour rules). */
const tones = {
  primary: { bar: "from-primary/70 to-primary", bg: "bg-primary/10", text: "text-primary" },
  secondary: { bar: "from-secondary/70 to-secondary", bg: "bg-secondary/10", text: "text-secondary" },
  accent: { bar: "from-accent/70 to-accent", bg: "bg-accent/15", text: "text-accent-foreground" },
  success: { bar: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50", text: "text-emerald-600" },
  warning: { bar: "from-amber-400 to-amber-600", bg: "bg-amber-50", text: "text-amber-600" },
  danger: { bar: "from-destructive/70 to-destructive", bg: "bg-destructive/10", text: "text-destructive" },
  muted: { bar: "from-muted-foreground/40 to-muted-foreground/60", bg: "bg-muted", text: "text-muted-foreground" },
} as const;

interface StatCard {
  label: string;
  value: number | string;
  icon: typeof Users;
  tone: keyof typeof tones;
  legacy?: boolean;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [cycle, setCycle] = useState<CycleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const data = await res.json();
        setStats(data.stats);
        setActivity(data.recentActivity || []);
        setCycle(data.cycle ?? null);
      } catch (err) {
        console.error(err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards: StatCard[] = stats
    ? [
        { label: "Total Users", value: stats.totalUsers, icon: Users, tone: "primary" },
        { label: "Male Users", value: stats.maleUsers, icon: Users, tone: "secondary" },
        { label: "Female Users", value: stats.femaleUsers, icon: Users, tone: "accent" },
        { label: "Mutual Matches", value: stats.totalMatches, icon: Heart, tone: "accent" },
        { label: "Total Suggestions", value: stats.totalSuggestions, icon: Sparkles, tone: "primary" },
        { label: "Total Revenue", value: `${Number(stats.totalRevenue).toFixed(0)} JOD`, icon: DollarSign, tone: "success" },
        { label: "Revenue This Week", value: `${Number(stats.revenueThisWeek).toFixed(0)} JOD`, icon: DollarSign, tone: "success" },
        { label: "Flagged Users", value: stats.flaggedUsers, icon: Flag, tone: "danger" },
        { label: "Verified Users", value: stats.verifiedUsers, icon: UserCheck, tone: "muted", legacy: true },
        { label: "Pending Verifications", value: stats.pendingVerifications, icon: Clock, tone: "muted", legacy: true },
      ]
    : [];

  return (
    <div className="relative min-h-screen">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative space-y-8 pb-8">
        {/* Page Header */}
        <div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 p-6 md:p-8"
          style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full translate-x-16 -translate-y-16 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-accent/10 rounded-full -translate-x-8 translate-y-8 blur-2xl" />
          <div className="relative space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
            </div>
            <p className="text-muted-foreground text-sm md:text-base ml-[52px]">
              Platform overview and key metrics
            </p>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load the dashboard numbers. Refresh the page; if it keeps failing, check the server logs.
          </div>
        )}

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-6" style={{ animation: `fadeSlideIn 0.5s ease-out ${i * 0.07}s both` }}>
                <div className="h-1 w-full bg-muted rounded-full mb-5 overflow-hidden">
                  <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent animate-shimmer" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="h-3 w-24 bg-muted rounded-full animate-pulse" />
                    <div className="h-8 w-16 bg-muted rounded-lg animate-pulse" />
                  </div>
                  <div className="h-12 w-12 bg-muted rounded-xl animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {statCards.map((card, index) => {
              const tone = tones[card.tone];
              return (
              <div
                key={card.label}
                className="group relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300"
                style={{ animation: `fadeSlideIn 0.5s ease-out ${index * 0.08}s both` }}
              >
                <div className={`h-1 bg-gradient-to-r ${tone.bar}`} />
                <div className={`absolute -top-6 -right-6 w-20 h-20 ${tone.bg} rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-500 blur-xl`} />
                <div className="relative p-5 pt-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                        {card.label}
                        {card.legacy && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Legacy</Badge>}
                      </p>
                      <p className="text-3xl font-bold text-foreground tracking-tight">
                        {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                      </p>
                    </div>
                    <div className={`h-12 w-12 rounded-xl ${tone.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
                      <card.icon className={`h-6 w-6 ${tone.text}`} />
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* New user cycle (switch intro_requests_enabled) */}
        {cycle && <NewCycleSection cycle={cycle} />}

        {/* Quick Actions + Registration Trend + Activity */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Link href="/admin/identity" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium">Pending Identity Reviews</span>
                    {cycle && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Legacy</Badge>}
                  </div>
                  <Badge variant="secondary">{stats.pendingVerifications}</Badge>
                </Link>
                <Link href="/admin/reports" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Flag className="h-5 w-5 text-destructive" />
                    <span className="text-sm font-medium">Pending Reports</span>
                  </div>
                  <Badge variant="secondary">{stats.pendingReports}</Badge>
                </Link>
                <Link href="/admin/profile-requests" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <ClipboardEdit className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">Profile Requests</span>
                  </div>
                  <Badge variant="secondary">{stats.pendingProfileRequests}</Badge>
                </Link>
                <Link href="/admin/support" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <LifeBuoy className="h-5 w-5 text-secondary" />
                    <span className="text-sm font-medium">Support Tickets</span>
                  </div>
                  <Badge variant="secondary">{stats.pendingSupportTickets}</Badge>
                </Link>
              </CardContent>
            </Card>

            {/* Registration Trend */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Registration Trend</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">This Week</p>
                      <p className="text-3xl font-bold">{stats.registrationsThisWeek}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Last Week</p>
                      <p className="text-3xl font-bold text-muted-foreground">{stats.registrationsLastWeek}</p>
                    </div>
                  </div>
                  {stats.registrationsLastWeek > 0 && (
                    <div className="flex items-center gap-2">
                      {stats.registrationsThisWeek >= stats.registrationsLastWeek ? (
                        <Badge className="bg-green-100 text-green-800">
                          <ArrowUpRight className="h-3 w-3 me-1" />
                          +{Math.round(((stats.registrationsThisWeek - stats.registrationsLastWeek) / stats.registrationsLastWeek) * 100)}%
                        </Badge>
                      ) : (
                        <Badge className="bg-destructive/10 text-destructive">
                          <ArrowDownRight className="h-3 w-3 me-1" />
                          {Math.round(((stats.registrationsThisWeek - stats.registrationsLastWeek) / stats.registrationsLastWeek) * 100)}%
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">vs last week</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
              <CardContent>
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
                ) : (
                  <div className="space-y-3">
                    {activity.slice(0, 8).map((item, i) => {
                      const dot = activityDots[item.type] || "bg-muted-foreground";
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`mt-1.5 h-2 w-2 rounded-full ${dot} shrink-0`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{item.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-200%); }
          100% { transform: translateX(400%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}

const requestColumns: { key: keyof RequestCounts; label: string; className?: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "pending", label: "Pending", className: "text-amber-600" },
  { key: "accepted", label: "Accepted", className: "text-emerald-600" },
  { key: "declined", label: "Declined", className: "text-destructive" },
  { key: "expired", label: "Expired", className: "text-muted-foreground" },
  { key: "cancelled", label: "Cancelled", className: "text-muted-foreground" },
];

function NewCycleSection({ cycle }: { cycle: CycleStats }) {
  const rows: { key: "FAMILY" | "CHAT" | "ALL"; label: string }[] = [
    { key: "FAMILY", label: "Family introductions" },
    { key: "CHAT", label: "Chat requests" },
    { key: "ALL", label: "All requests" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">New user cycle</h2>
        <Badge className="bg-primary/10 text-primary">Switch on</Badge>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-primary" /> Introduction requests
            </CardTitle>
            <Link href="/admin/introductions" className="text-sm text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Type</th>
                    {requestColumns.map((c) => (
                      <th key={c.key} className="text-right p-3 font-medium">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.key === "ALL" ? "font-semibold bg-muted/30" : "border-b"}>
                      <td className="p-3">{r.label}</td>
                      {requestColumns.map((c) => (
                        <td key={c.key} className={`p-3 text-right tabular-nums ${c.className ?? ""}`}>
                          {cycle.intro[r.key][c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground px-3 py-2 border-t">
              Pending requests past their 7-day expiry count as expired.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4">
          <MiniStat icon={MessagesSquare} label="Active chats" value={cycle.activeChats} />
          <MiniStat
            icon={Coins}
            label="Credits spent on requests (7 days)"
            value={cycle.creditsSpentThisWeek}
            hint="From the credit history"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Funnel</CardTitle>
          <p className="text-sm text-muted-foreground">All-time, members only (no admins). &quot;Profile ready&quot; = finished the setup, the same gate as suggestions. Share of registered.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {cycle.funnel.map((step) => (
            <div key={step.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{step.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="text-foreground font-semibold">{step.count.toLocaleString()}</span> · {step.pct}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                  style={{ width: `${Math.max(step.pct, step.count > 0 ? 1 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
