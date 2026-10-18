"use client";

import Link from "next/link";
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
  Trash2,
  Users,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { notificationUrl } from "@/lib/notification-links";
import { useDashboardData } from "@/contexts/dashboard-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { LoadError } from "@/components/shared/load-error";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { PageHeader } from "@/components/shared/page-header";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  metadata?: unknown;
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
    gradient: "from-accent to-accent/70",
    borderColor: "border-s-accent",
    iconBg: "from-accent/10 to-accent/5",
    iconColor: "text-accent-foreground",
    dotColor: "bg-accent",
  },
  SYSTEM: {
    icon: Info,
    gradient: "from-accent to-accent/70",
    borderColor: "border-s-accent",
    iconBg: "from-accent/10 to-accent/5",
    iconColor: "text-accent-foreground",
    dotColor: "bg-accent",
  },
  INTRO_REQUEST: {
    icon: Users,
    gradient: "from-accent to-accent/70",
    borderColor: "border-s-accent",
    iconBg: "from-accent/10 to-accent/5",
    iconColor: "text-accent-foreground",
    dotColor: "bg-accent",
  },
  CHAT: {
    icon: MessageCircle,
    gradient: "from-primary to-secondary",
    borderColor: "border-s-primary",
    iconBg: "from-primary/10 to-secondary/10",
    iconColor: "text-primary",
    dotColor: "bg-primary",
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
  return new Date(dateStr).toLocaleDateString("ar-JO-u-nu-latn");
}

interface NotificationPrefs {
  suggestions: boolean;
  interests: boolean;
  matches: boolean;
  visitUpdates: boolean;
  payments: boolean;
  identity: boolean;
  support: boolean;
  introRequests: boolean;
  chatMessages: boolean;
}

const prefLabels: { key: keyof NotificationPrefs; label: string; icon: typeof Bell }[] = [
  { key: "suggestions", label: "الاقتراحات", icon: Sparkles },
  { key: "interests", label: "طلبات الاهتمام", icon: Heart },
  { key: "matches", label: "التوافقات", icon: Heart },
  { key: "visitUpdates", label: "تحديثات الزيارات", icon: CalendarHeart },
  { key: "introRequests", label: "طلبات التعارف", icon: Users },
  { key: "chatMessages", label: "رسائل المحادثات", icon: MessageCircle },
  { key: "payments", label: "المدفوعات", icon: CreditCard },
  { key: "support", label: "الدعم", icon: LifeBuoy },
];

// Legacy-only and new-cycle-only notification kinds
const LEGACY_PREFS: (keyof NotificationPrefs)[] = ["interests", "visitUpdates"];
const NEW_CYCLE_PREFS: (keyof NotificationPrefs)[] = ["introRequests", "chatMessages"];

export default function NotificationsPage() {
  const router = useRouter();
  const { counts } = useDashboardData();
  const visiblePrefs = prefLabels.filter(({ key }) =>
    counts.flags.introRequests
      ? !LEGACY_PREFS.includes(key) && (key !== "chatMessages" || counts.flags.chat)
      : !NEW_CYCLE_PREFS.includes(key)
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [prefsFailed, setPrefsFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function fetchPrefs() {
    setPrefsFailed(false);
    try {
      const res = await fetch("/api/notifications/preferences");
      if (!res.ok) throw new Error(`prefs ${res.status}`);
      const data = await res.json();
      setPrefs(data.preferences);
    } catch {
      setPrefsFailed(true);
    }
  }

  async function togglePref(key: keyof NotificationPrefs) {
    if (!prefs) return;
    const newVal = !prefs[key];
    setPrefs({ ...prefs, [key]: newVal });
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newVal }),
      });
      if (!res.ok) throw new Error(`prefs ${res.status}`);
    } catch {
      // Roll back: the switch must never look saved when it wasn't
      setPrefs((cur) => (cur ? { ...cur, [key]: !newVal } : cur));
      toast.error("تعذّر حفظ الإعداد، حاول مرة أخرى");
    }
  }

  useEffect(() => {
    // Every page change shows the spinner again (no stale page under a new page number)
    setLoading(true);
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, reloadKey]);

  async function fetchNotifications() {
    setLoadFailed(false);
    try {
      const res = await fetch(`/api/notifications?page=${page}`);
      if (!res.ok) throw new Error(`notifications ${res.status}`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications/all/read", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent("naseeb:notifications-read"));
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
      window.dispatchEvent(new CustomEvent("naseeb:notifications-read"));
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteNotification(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "DELETE" });
      if (res.ok) {
        const wasUnread = notifications.find((n) => n.id === id && !n.isRead);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
        window.dispatchEvent(new CustomEvent("naseeb:notifications-read"));
      } else {
        toast.error("تعذّر حذف الإشعار");
      }
    } catch (err) {
      console.error(err);
      toast.error("تعذّر حذف الإشعار، تحقّق من الاتصال");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteAllNotifications() {
    setDeletingAll(true);
    try {
      const res = await fetch("/api/notifications", { method: "DELETE" });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
        setDeleteAllConfirm(false);
        window.dispatchEvent(new CustomEvent("naseeb:notifications-read"));
      } else {
        toast.error("تعذّر حذف الإشعارات، حاول مرة أخرى");
      }
    } catch (err) {
      console.error(err);
      toast.error("تعذّر حذف الإشعارات، تحقّق من الاتصال");
    } finally {
      setDeletingAll(false);
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
      <PageHeader
        icon={Bell}
        title="الإشعارات"
        count={unreadCount}
        description="ستجد هنا جميع التحديثات والإشعارات الخاصة بحسابك"
      >
        <Sheet open={prefsOpen} onOpenChange={(open) => { setPrefsOpen(open); if (open) fetchPrefs(); }}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="h-11 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 rounded-xl gap-2 font-semibold backdrop-blur-sm bg-card/80"
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
                اختر التنبيهات التي تصل إلى جهازك. تبقى كل الإشعارات محفوظة هنا.
              </p>
            </div>

            <div className="p-5 space-y-1 overflow-y-auto">
              {prefs ? visiblePrefs.map(({ key, label, icon: PrefIcon }) => (
                // A label, not a button: the Switch inside is already a button (no nested buttons)
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between gap-3 w-full rounded-xl px-3 py-3.5 hover:bg-muted/50 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <PrefIcon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <Switch checked={prefs[key]} onCheckedChange={() => togglePref(key)} />
                </label>
              )) : prefsFailed ? (
                <LoadError message="تعذّر تحميل إعدادات الإشعارات." onRetry={fetchPrefs} className="py-6" />
              ) : (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}

              {/* System notifications - always on */}
              <div className="flex items-center justify-between gap-3 w-full rounded-xl px-3 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Info className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    إشعارات النظام <span className="text-xs font-normal text-muted-foreground">(دائماً مفعّلة)</span>
                  </span>
                </div>
                {/* Always on: drawn as "on", not greyed out, but can't be changed */}
                <Switch checked disabled aria-label="إشعارات النظام مفعّلة دائماً" className="disabled:opacity-100 disabled:cursor-default" />
              </div>
            </div>

            <div className="p-5 pt-0 space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/30">
                <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  إشعارات النظام مفعّلة دائماً ولا يمكن إيقافها
                </p>
              </div>
              <Link
                href="/dashboard/install"
                onClick={() => setPrefsOpen(false)}
                className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm transition-colors hover:bg-primary/10"
              >
                <Smartphone className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1">
                  <span className="block font-semibold text-foreground">تثبيت التطبيق والإشعارات</span>
                  <span className="block text-xs text-muted-foreground">لا تصلك الإشعارات؟ اتبع الخطوات لجهازك</span>
                </span>
              </Link>
            </div>
          </SheetContent>
        </Sheet>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={markAllRead}
            className="h-11 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl gap-2 font-semibold backdrop-blur-sm bg-card/80"
          >
            <CheckCheck className="h-4 w-4" />
            تحديد الكل كمقروء
          </Button>
        )}
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => setDeleteAllConfirm(true)}
            className="h-11 text-destructive/80 hover:text-destructive hover:bg-destructive/5 rounded-xl gap-2 font-medium"
          >
            <Trash2 className="h-4 w-4" />
            حذف الكل
          </Button>
        )}
      </PageHeader>

      {/* Notification Cards */}
      {loadFailed ? (
        <LoadError
          message="تعذّر تحميل الإشعارات. تحقّق من الاتصال وحاول مرة أخرى."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : notifications.length === 0 ? (
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
                ستظهر الإشعارات هنا عند وجود تحديثات جديدة على حسابك مثل الاقتراحات والتوافقات وطلبات التعارف.
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
                    router.push(notificationUrl(n.type, n.metadata));
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
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Time badge */}
                            <span className="inline-flex items-center gap-1 rounded-lg bg-muted/60 border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
                              <Clock className="h-2.5 w-2.5" />
                              {timeAgo(n.createdAt)}
                            </span>
                            {/* Delete button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                              disabled={deletingId === n.id}
                              className="-m-2 h-11 w-11 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="حذف الإشعار"
                            >
                              {deletingId === n.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
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
                        {/* The whole card is clickable with a mouse; this real link is the keyboard / screen-reader path */}
                        <Link
                          href={notificationUrl(n.type, n.metadata)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!n.isRead) markRead(n.id);
                          }}
                          className="inline-flex min-h-11 items-center gap-1 mt-1 -mb-2 rounded text-xs font-semibold text-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                          عرض التفاصيل
                          <span className="sr-only">: {n.title}</span>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" className="h-11" disabled={page <= 1} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <ChevronRight className="h-4 w-4 me-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {totalPages}
              </span>
              <Button variant="outline" className="h-11" disabled={page >= totalPages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                التالي
                <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete All Confirmation Dialog */}
      <ConfirmActionDialog
        open={deleteAllConfirm}
        onOpenChange={(o) => !deletingAll && setDeleteAllConfirm(o)}
        title="حذف جميع الإشعارات"
        description="ستُحذف كل الإشعارات من هذه الصفحة. لا يمكن التراجع عن ذلك."
        confirmLabel="حذف الكل"
        destructive
        busy={deletingAll}
        onConfirm={deleteAllNotifications}
      />

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
