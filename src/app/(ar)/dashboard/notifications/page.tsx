"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Bell,
  BellOff,
  CheckCheck,
  Heart,
  Sparkles,
  CalendarHeart,
  Info,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Shield,
  CreditCard,
  LifeBuoy,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

const typeConfig: Record<
  string,
  {
    icon: typeof Bell;
    gradient: string;
    borderColor: string;
    iconBg: string;
    iconColor: string;
    dotColor: string;
  }
> = {
  SUGGESTION: {
    icon: Sparkles,
    gradient: "from-primary to-secondary",
    borderColor: "border-s-primary",
    iconBg: "from-primary/10 to-secondary/10",
    iconColor: "text-primary",
    dotColor: "bg-primary",
  },
  INTEREST: {
    icon: Heart,
    gradient: "from-accent to-accent/70",
    borderColor: "border-s-accent",
    iconBg: "from-accent/10 to-accent/5",
    iconColor: "text-accent-foreground",
    dotColor: "bg-accent",
  },
  MATCH: {
    icon: Heart,
    gradient: "from-primary to-primary",
    borderColor: "border-s-primary",
    iconBg: "from-primary/10 to-primary/10",
    iconColor: "text-primary",
    dotColor: "bg-primary",
  },
  VISIT_UPDATE: {
    icon: CalendarHeart,
    gradient: "from-secondary to-primary",
    borderColor: "border-s-secondary",
    iconBg: "from-secondary/10 to-primary/10",
    iconColor: "text-secondary",
    dotColor: "bg-secondary",
  },
  IDENTITY: {
    icon: Shield,
    gradient: "from-secondary to-primary",
    borderColor: "border-s-secondary",
    iconBg: "from-secondary/10 to-primary/10",
    iconColor: "text-secondary",
    dotColor: "bg-secondary",
  },
  PAYMENT: {
    icon: CreditCard,
    gradient: "from-green-500 to-emerald-500",
    borderColor: "border-s-green-400",
    iconBg: "from-green-100 to-emerald-100",
    iconColor: "text-green-600",
    dotColor: "bg-green-500",
  },
  SYSTEM: {
    icon: Info,
    gradient: "from-accent to-accent/70",
    borderColor: "border-s-accent",
    iconBg: "from-accent/10 to-accent/5",
    iconColor: "text-accent-foreground",
    dotColor: "bg-accent",
  },
  SUPPORT: {
    icon: LifeBuoy,
    gradient: "from-secondary to-primary",
    borderColor: "border-s-secondary",
    iconBg: "from-secondary/10 to-primary/10",
    iconColor: "text-secondary",
    dotColor: "bg-secondary",
  },
};

const defaultConfig = {
  icon: Bell,
  gradient: "from-muted-foreground to-muted-foreground/70",
  borderColor: "border-s-muted-foreground",
  iconBg: "from-muted to-muted",
  iconColor: "text-muted-foreground",
  dotColor: "bg-muted-foreground",
};

function timeAgo(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ar-JO");
}

const NOTIFICATION_LINKS: Record<string, string> = {
  SUGGESTION: "/dashboard/suggestions",
  INTEREST: "/dashboard/suggestions",
  MATCH: "/dashboard/matches",
  VISIT_UPDATE: "/dashboard/matches",
  PAYMENT: "/dashboard/payments",
  IDENTITY: "/dashboard/identity",
  SUPPORT: "/dashboard/support",
  SYSTEM: "/dashboard",
};

interface NotificationPrefs {
  suggestions: boolean;
  interests: boolean;
  matches: boolean;
  visitUpdates: boolean;
  payments: boolean;
  identity: boolean;
  support: boolean;
}

const prefLabels: { key: keyof NotificationPrefs; label: string; icon: typeof Bell }[] = [
  { key: "suggestions", label: "الاقتراحات", icon: Sparkles },
  { key: "interests", label: "طلبات الاهتمام", icon: Heart },
  { key: "matches", label: "التوافقات", icon: Heart },
  { key: "visitUpdates", label: "تحديثات الزيارات", icon: CalendarHeart },
  { key: "payments", label: "المدفوعات", icon: CreditCard },
  { key: "identity", label: "التحقق من الهوية", icon: Shield },
  { key: "support", label: "الدعم", icon: LifeBuoy },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  async function fetchPrefs() {
    try {
      const res = await fetch("/api/notifications/preferences");
      const data = await res.json();
      setPrefs(data.preferences);
    } catch {
      // Silently fail
    }
  }

  async function togglePref(key: keyof NotificationPrefs) {
    if (!prefs) return;
    const newVal = !prefs[key];
    setPrefs({ ...prefs, [key]: newVal });
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newVal }),
      });
    } catch {
      setPrefs({ ...prefs, [key]: !newVal });
    }
  }

  useEffect(() => {
    fetchNotifications();
  }, [page]);

  async function fetchNotifications() {
    try {
      const res = await fetch(`/api/notifications?page=${page}`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications/all/read", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  }

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل الإشعارات...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/5 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-primary/10 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
                  الإشعارات
                </h1>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-gradient-to-br from-secondary to-primary text-white text-xs font-bold shadow-sm animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-sm md:text-base">
              ستجد هنا جميع التحديثات والإشعارات الخاصة بحسابك
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Sheet open={prefsOpen} onOpenChange={(open) => { setPrefsOpen(open); if (open) fetchPrefs(); }}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 rounded-xl gap-2 font-semibold backdrop-blur-sm bg-card/80"
                >
                  <Settings2 className="h-4 w-4" />
                  الإعدادات
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[320px] sm:w-[380px] p-0 border-l-0 border-r" dir="rtl">
                <div className="p-6 border-b border-border/40">
                  <SheetHeader className="text-right">
                    <SheetTitle className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md shadow-primary/20">
                        <Settings2 className="h-4.5 w-4.5 text-white" />
                      </div>
                      <span className="text-lg font-bold">إعدادات الإشعارات</span>
                    </SheetTitle>
                  </SheetHeader>
                  <p className="text-xs text-muted-foreground mt-2">
                    تحكّم بأنواع الإشعارات اللي توصلك
                  </p>
                </div>

                <div className="p-5 space-y-1 overflow-y-auto">
                  {prefs ? prefLabels.map(({ key, label, icon: PrefIcon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePref(key)}
                      className="flex items-center justify-between gap-3 w-full rounded-xl px-3 py-3.5 hover:bg-muted/50 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <PrefIcon className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{label}</span>
                      </div>
                      <Switch checked={prefs[key]} onCheckedChange={() => togglePref(key)} />
                    </button>
                  )) : (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}

                  {/* System notifications - always on */}
                  <div className="flex items-center justify-between gap-3 w-full rounded-xl px-3 py-3.5 opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center flex-shrink-0">
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium text-foreground">إشعارات النظام</span>
                    </div>
                    <Switch checked disabled />
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/30">
                    <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      إشعارات النظام مفعّلة دائماً ولا يمكن إيقافها
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllRead}
                className="border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl gap-2 font-semibold backdrop-blur-sm bg-card/80"
              >
                <CheckCheck className="h-4 w-4" />
                تحديد الكل كمقروء
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Notification Cards */}
      {notifications.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-primary/5">
          <CardContent className="text-center py-16 md:py-20 space-y-5">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full animate-pulse" />
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
                <BellOff className="h-10 w-10 text-muted-foreground/40" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg text-foreground">لا توجد إشعارات</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                ستظهر الإشعارات هنا عند وجود تحديثات جديدة على حسابك مثل الاقتراحات والتوافقات والزيارات.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 pt-2">
              <Bell className="h-3.5 w-3.5" />
              <span>سيتم إعلامك فور وصول أي تحديث</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n, index) => {
            const config = typeConfig[n.type] || defaultConfig;
            const Icon = config.icon;

            return (
              <div
                key={n.id}
                style={{
                  animation: `fadeSlideIn 0.5s ease-out ${index * 0.08}s both`,
                }}
              >
                <Card
                  className={`group overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 border-s-4 ${config.borderColor} ${
                    !n.isRead
                      ? "border-border/60 bg-gradient-to-l from-primary/[0.03] to-transparent"
                      : "border-border/30"
                  }`}
                  onClick={() => {
                    if (!n.isRead) markRead(n.id);
                    const link = NOTIFICATION_LINKS[n.type];
                    if (link) router.push(link);
                  }}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start gap-4">
                      {/* Icon with gradient background */}
                      <div className="relative flex-shrink-0">
                        <div
                          className={`h-11 w-11 rounded-xl bg-gradient-to-br ${config.iconBg} flex items-center justify-center border border-border/30 group-hover:scale-110 transition-transform duration-300`}
                        >
                          <Icon className={`h-5 w-5 ${config.iconColor}`} />
                        </div>
                        {/* Unread pulse indicator */}
                        {!n.isRead && (
                          <div className="absolute -top-1 -end-1">
                            <span className="relative flex h-3 w-3">
                              <span
                                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotColor} opacity-75`}
                              />
                              <span
                                className={`relative inline-flex rounded-full h-3 w-3 ${config.dotColor} ring-2 ring-card`}
                              />
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3
                            className={`text-sm leading-snug ${
                              !n.isRead
                                ? "font-bold text-foreground"
                                : "font-medium text-foreground/80"
                            }`}
                          >
                            {n.title}
                          </h3>
                          {/* Time badge */}
                          <span className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-muted/60 border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
                            <Clock className="h-2.5 w-2.5" />
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p
                          className={`text-sm leading-relaxed ${
                            !n.isRead
                              ? "text-muted-foreground"
                              : "text-muted-foreground/70"
                          }`}
                        >
                          {n.body}
                        </p>
                        {NOTIFICATION_LINKS[n.type] && (
                          <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary/70 hover:text-primary transition-colors">
                            <ArrowLeft className="h-3 w-3" />
                            عرض التفاصيل
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronRight className="h-4 w-4 ml-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                التالي
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Inline keyframes style */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
