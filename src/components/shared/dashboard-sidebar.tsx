"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Image from "next/image";
import {
  Menu,
  Bell,
  User,
  LogOut,
  Heart,
  FileCheck,
  CreditCard,
  Sparkles,
  Home,
  Brain,
  Camera,
  X,
  ChevronRight,
  ChevronLeft,
  LifeBuoy,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: typeof Home;
  femaleOnly?: boolean;
  badge?: number;
}

const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/dashboard/suggestions", label: "الاقتراحات", icon: Sparkles },
  { href: "/dashboard/matches", label: "التوافقات", icon: Heart },
  { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
];

const accountLinks: NavLink[] = [
  { href: "/dashboard/profile", label: "الملف الشخصي", icon: User },
  { href: "/dashboard/photos", label: "صوري", icon: Camera },
  { href: "/dashboard/personality-quiz", label: "اختبار الشخصية", icon: Brain },
  { href: "/dashboard/identity", label: "التحقق من الهوية", icon: FileCheck },
  { href: "/dashboard/payments", label: "رصيد التوافقات", icon: CreditCard },
  { href: "/dashboard/support", label: "الدعم والملاحظات", icon: LifeBuoy },
  { href: "/dashboard/referral", label: "ادعِ صاحبك", icon: Gift },
];

function NavItem({
  link,
  pathname,
  collapsed,
  onClick,
}: {
  link: NavLink;
  pathname: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const isActive =
    link.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(link.href);

  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
      title={collapsed ? link.label : undefined}
    >
      <div className="relative">
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
            isActive ? "bg-primary/10" : "bg-muted/60"
          )}
        >
          <link.icon className={cn("h-4 w-4", isActive && "text-primary")} />
        </div>
        {link.badge && link.badge > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {link.badge > 99 ? "99+" : link.badge}
          </span>
        ) : null}
      </div>
      {!collapsed && <span>{link.label}</span>}
      {isActive && !collapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-primary rounded-e-full" />
      )}
    </Link>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userData, setUserData] = useState<{
    firstName?: string;
    lastName?: string;
    gender?: string;
  } | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        setUserData({
          firstName: data.user?.firstName,
          lastName: data.user?.lastName,
          gender: data.user?.gender,
        });
      } catch {
        // Silently fail
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    async function fetchUnread() {
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count || 0);
        }
      } catch {
        // Silently fail
      }
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);

    function handleNotificationsRead() {
      fetchUnread();
    }
    window.addEventListener("naseeb:notifications-read", handleNotificationsRead);

    return () => {
      clearInterval(interval);
      window.removeEventListener("naseeb:notifications-read", handleNotificationsRead);
    };
  }, []);

  const isMale = userData?.gender === "MALE";
  const filterLinks = (links: NavLink[]) =>
    links.filter((l) => !l.femaleOnly || !isMale);

  const mainLinksWithBadge = mainLinks.map((link) =>
    link.href === "/dashboard/notifications" ? { ...link, badge: unreadCount } : link
  );
  const filteredMainLinks = filterLinks(mainLinksWithBadge);
  const filteredAccountLinks = filterLinks(accountLinks);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  const sidebarContent = (mobile: boolean) => (
    <>
      {/* Logo + user info */}
      <div className={cn("p-4 border-b border-border/40", collapsed && !mobile && "p-3")}>
        <div className="flex items-center justify-between mb-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={110}
              height={48}
              className={cn("w-auto flex-shrink-0", collapsed && !mobile ? "h-8" : "h-8")}
            />
          </Link>
          {mobile ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="إغلاق القائمة"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {(!collapsed || mobile) && userData && (
          <div className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl border border-border/30">
            <Avatar className="h-9 w-9 border border-primary/20 flex-shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-sm font-bold">
                {userData.firstName?.charAt(0) || "؟"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {userData.firstName} {userData.lastName}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isMale ? "ذكر" : "أنثى"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        <p
          className={cn(
            "text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 mb-2",
            collapsed && !mobile && "text-center px-0"
          )}
        >
          {collapsed && !mobile ? "—" : "القائمة الرئيسية"}
        </p>
        <div className="flex flex-col gap-0.5 mb-4">
          {filteredMainLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              pathname={pathname}
              collapsed={collapsed && !mobile}
              onClick={mobile ? () => setMobileOpen(false) : undefined}
            />
          ))}
        </div>

        <p
          className={cn(
            "text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 mb-2",
            collapsed && !mobile && "text-center px-0"
          )}
        >
          {collapsed && !mobile ? "—" : "الحساب"}
        </p>
        <div className="flex flex-col gap-0.5">
          {filteredAccountLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              pathname={pathname}
              collapsed={collapsed && !mobile}
              onClick={mobile ? () => setMobileOpen(false) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Logout button */}
      <div className="p-3 border-t border-border/40">
        <button
          onClick={handleSignOut}
          className={cn(
            "flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-all duration-200",
            collapsed && !mobile && "justify-center px-2"
          )}
          title={collapsed && !mobile ? "تسجيل الخروج" : undefined}
        >
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-destructive/5 flex-shrink-0">
            <LogOut className="h-4 w-4" />
          </div>
          {(!collapsed || mobile) && <span>تسجيل الخروج</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col sticky top-0 h-screen border-l border-border/40 bg-card/50 backdrop-blur-sm transition-all duration-300",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile hamburger + sheet */}
      <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-background border-b border-border/40 shadow-sm w-full">
        <div className="h-[2px] bg-gradient-to-l from-primary via-accent to-primary/50" />
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={100}
              height={44}
              className="h-8 w-auto"
            />
          </Link>

          <div className="flex items-center gap-1">
            <Link href="/dashboard/notifications" className="relative h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted/60 transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-rose-500 px-1 text-[9px] font-bold text-white shadow-sm animate-in zoom-in duration-300">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="فتح القائمة" className="h-10 w-10 rounded-xl">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            <SheetContent side="right" className="w-80 p-0 border-r-0 flex flex-col" showCloseButton={false}>
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              {sidebarContent(true)}
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </div>
    </>
  );
}
