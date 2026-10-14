"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, UserCheck, Heart, Sparkles, ShieldCheck, CreditCard,
  TrendingUp, Clock, DollarSign, Flag, ClipboardEdit,
  ArrowUpRight, ArrowDownRight, UserPlus, LifeBuoy,
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
  completedPayments: number;
  pendingReports: number;
  pendingProfileRequests: number;
  pendingSupportTickets: number;
  flaggedUsers: number;
  registrationsThisWeek: number;
  registrationsLastWeek: number;
}

interface ActivityItem {
  type: string;
  description: string;
  date: string;
}

const activityColors: Record<string, { bg: string; dot: string }> = {
  registration: { bg: "bg-blue-50", dot: "bg-blue-500" },
  match: { bg: "bg-pink-50", dot: "bg-pink-500" },
  payment: { bg: "bg-green-50", dot: "bg-green-500" },
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        setStats(data.stats);
        setActivity(data.recentActivity || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = stats
    ? [
        { label: "Total Users", value: stats.totalUsers, icon: Users, gradient: "from-blue-500 to-blue-600", lightBg: "bg-blue-50", lightColor: "text-blue-600", shadowColor: "shadow-blue-500/20", borderColor: "from-blue-400 to-blue-600" },
        { label: "Male Users", value: stats.maleUsers, icon: Users, gradient: "from-indigo-500 to-indigo-600", lightBg: "bg-indigo-50", lightColor: "text-indigo-600", shadowColor: "shadow-indigo-500/20", borderColor: "from-indigo-400 to-indigo-600" },
        { label: "Female Users", value: stats.femaleUsers, icon: Users, gradient: "from-pink-500 to-pink-600", lightBg: "bg-pink-50", lightColor: "text-pink-600", shadowColor: "shadow-pink-500/20", borderColor: "from-pink-400 to-pink-600" },
        { label: "Verified Users", value: stats.verifiedUsers, icon: UserCheck, gradient: "from-green-500 to-green-600", lightBg: "bg-green-50", lightColor: "text-green-600", shadowColor: "shadow-green-500/20", borderColor: "from-green-400 to-green-600" },
        { label: "Pending Verifications", value: stats.pendingVerifications, icon: Clock, gradient: "from-amber-500 to-amber-600", lightBg: "bg-amber-50", lightColor: "text-amber-600", shadowColor: "shadow-amber-500/20", borderColor: "from-amber-400 to-amber-600" },
        { label: "Mutual Matches", value: stats.totalMatches, icon: Heart, gradient: "from-red-500 to-red-600", lightBg: "bg-red-50", lightColor: "text-red-600", shadowColor: "shadow-red-500/20", borderColor: "from-red-400 to-red-600" },
        { label: "Total Suggestions", value: stats.totalSuggestions, icon: Sparkles, gradient: "from-purple-500 to-purple-600", lightBg: "bg-purple-50", lightColor: "text-purple-600", shadowColor: "shadow-purple-500/20", borderColor: "from-purple-400 to-purple-600" },
        { label: "Total Revenue", value: `${Number(stats.totalRevenue).toFixed(0)} JOD`, icon: DollarSign, gradient: "from-emerald-500 to-emerald-600", lightBg: "bg-emerald-50", lightColor: "text-emerald-600", shadowColor: "shadow-emerald-500/20", borderColor: "from-emerald-400 to-emerald-600", isString: true },
        { label: "Flagged Users", value: stats.flaggedUsers, icon: Flag, gradient: "from-red-500 to-red-600", lightBg: "bg-red-50", lightColor: "text-red-600", shadowColor: "shadow-red-500/20", borderColor: "from-red-400 to-red-600" },
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
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-transparent border border-blue-200/30 p-6 md:p-8"
          style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-100/40 rounded-full translate-x-16 -translate-y-16 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-100/20 rounded-full -translate-x-8 translate-y-8 blur-2xl" />
          <div className="relative space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
            </div>
            <p className="text-muted-foreground text-sm md:text-base ml-[52px]">
              Platform overview and key metrics
            </p>
          </div>
        </div>

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
            {statCards.map((card, index) => (
              <div
                key={card.label}
                className="group relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300"
                style={{ animation: `fadeSlideIn 0.5s ease-out ${index * 0.08}s both` }}
              >
                <div className={`h-1 bg-gradient-to-r ${card.borderColor}`} />
                <div className={`absolute -top-6 -right-6 w-20 h-20 ${card.lightBg} rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-500 blur-xl`} />
                <div className="relative p-5 pt-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <p className="text-sm text-muted-foreground font-medium">{card.label}</p>
                      <p className="text-3xl font-bold text-foreground tracking-tight">
                        {"isString" in card ? card.value : (card.value as number).toLocaleString()}
                      </p>
                    </div>
                    <div className={`h-12 w-12 rounded-xl ${card.lightBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${card.shadowColor} shadow-sm`}>
                      <card.icon className={`h-6 w-6 ${card.lightColor}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
                  </div>
                  <Badge variant="secondary">{stats.pendingVerifications}</Badge>
                </Link>
                <Link href="/admin/reports" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Flag className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium">Pending Reports</span>
                  </div>
                  <Badge variant="secondary">{stats.pendingReports}</Badge>
                </Link>
                <Link href="/admin/profile-requests" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <ClipboardEdit className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium">Profile Requests</span>
                  </div>
                  <Badge variant="secondary">{stats.pendingProfileRequests}</Badge>
                </Link>
                <Link href="/admin/support" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <LifeBuoy className="h-5 w-5 text-purple-600" />
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
                        <Badge className="bg-red-100 text-red-800">
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
                      const colors = activityColors[item.type] || { bg: "bg-gray-50", dot: "bg-gray-500" };
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`mt-1.5 h-2 w-2 rounded-full ${colors.dot} shrink-0`} />
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
