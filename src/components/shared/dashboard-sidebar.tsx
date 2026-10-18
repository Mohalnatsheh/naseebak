"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAndUnlinkPush } from "@/lib/push-client";
import Image from "next/image";
import {
  Menu,
  Bell,
  User,
  LogOut,
  Heart,
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
  Settings,
  MessageCircle,
  Ban,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";

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
  { href: "/dashboard/chats", label: "المحادثات", icon: MessageCircle },
  { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
];

const accountLinks: NavLink[] = [
  { href: "/dashboard/profile", label: "الملف الشخصي", icon: User },
  { href: "/dashboard/photos", label: "صوري", icon: Camera },
  { href: "/dashboard/personality-quiz", label: "اختبار الشخصية", icon: Brain },
  { href: "/dashboard/payments", label: "الرصيد", icon: CreditCard },
  { href: "/dashboard/blocks", label: "المحظورون", icon: Ban },
  { href: "/dashboard/support", label: "الدعم والملاحظات", icon: LifeBuoy },
  { href: "/dashboard/referral", label: "ادعُ صديقاً", icon: Gift },
  // Pause / delete live at the bottom of the profile page
  { href: "/dashboard/profile#account-settings", label: "إعدادات الحساب", icon: Settings },
];

function isActiveLink(href: string, pathname: string): boolean {
  // In-page links (e.g. the profile's account settings) never take the active state from their page
  if (href.includes("#")) return false;
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

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
  const isActive = isActiveLink(link.href, pathname);

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
          <span className="absolute -top-1.5 -start-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white shadow-sm">
            {link.badge > 99 ? "99+" : link.badge}
          </span>
        ) : null}
      </div>
      {!collapsed && <span>{link.label}</span>}
      {isActive && !collapsed && (
        <div className="absolute start-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-accent rounded-e-full" />
      )}
    </Link>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { profile, unreadCount, counts } = useDashboardData();

  const userData = profile ? {
    firstName: profile.firstName,
    lastName: profile.lastName,
    gender: profile.gender,
  } : null;

  const isMale = userData?.gender === "MALE";
  const filterLinks = (links: NavLink[]) =>
    links.filter((l) => !l.femaleOnly || !isMale);

  const badges: Record<string, number> = {
    "/dashboard/notifications": unreadCount,
    "/dashboard/matches": counts.pendingIntros,
    "/dashboard/chats": counts.unreadChats,
  };
  const mainLinksWithBadge = mainLinks
    // Chats appear once the chat switch is on (or the user already has chats to read)
    .filter((link) => link.href !== "/dashboard/chats" || counts.flags.chat || counts.hasChats)
    .map((link) => (badges[link.href] ? { ...link, badge: badges[link.href] } : link));
  const filteredMainLinks = filterLinks(mainLinksWithBadge);
  // Same name for the balance as the home and payments pages
  const creditsLabel = counts.flags.introRequests ? "رصيدك" : "رصيد الاقتراحات";
  const filteredAccountLinks = filterLinks(
    accountLinks.map((link) => (link.href === "/dashboard/payments" ? { ...link, label: creditsLabel } : link))
  );

  // Bottom bar: home, suggestions, matches, chats (when on); everything else is under «المزيد»
  const bottomLinks: (NavLink & { short?: string })[] = filteredMainLinks
    .filter((l) => l.href !== "/dashboard/notifications")
    .map((l) => (l.href === "/dashboard/suggestions" ? { ...l, short: "اقتراحات" } : l.href === "/dashboard/matches" ? { ...l, short: "توافقات" } : l.href === "/dashboard/chats" ? { ...l, short: "محادثات" } : l));
  const moreActive = !bottomLinks.some((l) => isActiveLink(l.href, pathname)) && pathname !== "/dashboard/notifications";
  // A chat room is full screen on phones
  const hideBottomBar = /^\/dashboard\/chats\/[^/]+/.test(pathname);

  const handleSignOut = () => {
    void signOutAndUnlinkPush("/login");
  };

  const sidebarContent = (mobile: boolean) => (
    <>
      {/* Logo + user info */}
      <div className={cn("p-4 border-b border-border/40", collapsed && !mobile && "p-3")}>
        <div className="flex items-center justify-between mb-3">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2">
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={110}
              height={48}
              className="w-auto flex-shrink-0 h-8"
            />
          </Link>
          {mobile ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="إغلاق القائمة"
              className="h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
              className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
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
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2">
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={100}
              height={44}
              className="h-8 w-auto"
            />
          </Link>

          <div className="flex items-center gap-1">
            {/* Credits at a glance: «مهتم» uses one */}
            {typeof counts.credits === "number" && (
              <Link
                href="/dashboard/payments"
                aria-label={`رصيدك ${counts.credits}`}
                className="me-1 inline-flex h-11 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 text-sm font-bold text-foreground"
              >
                <Coins className="h-3.5 w-3.5 text-accent-foreground" />
                {counts.credits}
              </Link>
            )}
            <Link
              href="/dashboard/notifications"
              aria-label={unreadCount > 0 ? `الإشعارات (${unreadCount} غير مقروءة)` : "الإشعارات"}
              className="relative h-11 w-11 rounded-xl flex items-center justify-center hover:bg-muted/60 transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {unreadCount > 0 && (
                <span aria-hidden="true" className="absolute top-1 start-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white shadow-sm animate-in zoom-in duration-300">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="right" className="w-80 p-0 border-r-0 flex flex-col" showCloseButton={false}>
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              <SheetDescription className="sr-only">صفحات لوحة التحكم وحسابك</SheetDescription>
              {sidebarContent(true)}
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </div>

      {/* Mobile bottom tab bar: the main pages one tap away; «المزيد» opens the full menu */}
      {!hideBottomBar && (
        <nav
          aria-label="التنقل الرئيسي"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="flex h-16 items-stretch">
            {bottomLinks.map((link) => {
              const active = isActiveLink(link.href, pathname);
              return (
                <li key={link.href} className="flex-1">
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/10")}>
                      <link.icon className="h-5 w-5" />
                      {link.badge && link.badge > 0 ? (
                        <span className="absolute -top-1 end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                          {link.badge > 99 ? "99+" : link.badge}
                        </span>
                      ) : null}
                    </span>
                    {link.short ?? link.label}
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="المزيد من الصفحات"
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  moreActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-primary/10")}>
                  <Menu className="h-5 w-5" />
                </span>
                المزيد
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
