"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOutAndUnlinkPush } from "@/lib/push-client";
import Image from "next/image";
import {
  Bell,
  User,
  LogOut,
  Heart,
  CreditCard,
  Sparkles,
  Home,
  Brain,
  Camera,
  ChevronRight,
  ChevronLeft,
  LifeBuoy,
  Gift,
  Settings,
  MessageCircle,
  Ban,
  Coins,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import { matchesHref } from "@/lib/matches/links";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { navBadges, type BadgeTone } from "@/lib/nav-badges";

/** Badge colours (design review P2-4 / DS-16): red only for "act now", navy for plain counts, gold for good news */
const BADGE_TONE: Record<BadgeTone, string> = {
  urgent: "bg-destructive text-white",
  count: "bg-primary text-primary-foreground",
  news: "bg-accent text-primary-deep",
};

interface NavLink {
  href: string;
  label: string;
  icon: typeof Home;
  femaleOnly?: boolean;
  badge?: number;
  tone?: BadgeTone;
}

/** One set of names on web and app (design review P1-3): الرئيسية · الاقتراحات · التوافقات · المحادثات · حسابي */
const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/dashboard/suggestions", label: "الاقتراحات", icon: Sparkles },
  { href: "/dashboard/matches", label: "التوافقات", icon: Heart },
  { href: "/dashboard/chats", label: "المحادثات", icon: MessageCircle },
  { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
];

/** Account pages: «حسابي» in the bottom bar is active on these */
const ACCOUNT_PREFIXES = ["/dashboard/account", "/dashboard/profile", "/dashboard/photos", "/dashboard/personality-quiz", "/dashboard/payments", "/dashboard/pro", "/dashboard/blocks", "/dashboard/support", "/dashboard/referral", "/dashboard/install"];

const accountLinks: NavLink[] = [
  { href: "/dashboard/profile", label: "الملف الشخصي", icon: User },
  { href: "/dashboard/photos", label: "صوري", icon: Camera },
  { href: "/dashboard/personality-quiz", label: "اختبار الشخصية", icon: Brain },
  { href: "/dashboard/payments", label: "الرصيد", icon: CreditCard },
  // Shown only when the Pro page is worth a link (`counts.pro.showPage`)
  { href: PRO_PAGE_PATH, label: "عضوية Pro", icon: Crown },
  { href: "/dashboard/blocks", label: "المحظورون", icon: Ban },
  { href: "/dashboard/support", label: "الدعم والملاحظات", icon: LifeBuoy },
  { href: "/dashboard/referral", label: "ادعُ صديقاً", icon: Gift },
  // Pause / delete live at the bottom of the profile page
  { href: "/dashboard/profile#account-settings", label: "إعدادات الحساب", icon: Settings },
];

function isActiveLink(href: string, pathname: string, matchesTab = false): boolean {
  // In-page links (e.g. the profile's account settings) never take the active state from their page
  if (href.includes("#")) return false;
  // Shared suggestions: the matches are the «التوافقات» tab of the suggestions page (?tab=matches)
  if (href.startsWith("/dashboard/matches") || href.includes("tab=matches")) {
    return pathname.startsWith("/dashboard/matches") || (pathname.startsWith("/dashboard/suggestions") && matchesTab);
  }
  if (href === "/dashboard/suggestions") return pathname.startsWith("/dashboard/suggestions") && !matchesTab;
  // A whole path segment: /dashboard/pro is not active on /dashboard/profile
  return href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  link,
  pathname,
  matchesTab,
  collapsed,
  onClick,
}: {
  link: NavLink;
  pathname: string;
  matchesTab: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const isActive = isActiveLink(link.href, pathname, matchesTab);

  return (
    <Link prefetch={false}
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
          <span className={cn("absolute -top-1.5 -start-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption font-bold tabular-nums", BADGE_TONE[link.tone ?? "count"])}>
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
  const matchesTab = useSearchParams()?.get("tab") === "matches";
  const [collapsed, setCollapsed] = useState(false);
  const { profile, unreadCount, counts, loading } = useDashboardData();

  const userData = profile ? {
    firstName: profile.firstName,
    lastName: profile.lastName,
    gender: profile.gender,
  } : null;

  const isMale = userData?.gender === "MALE";
  const filterLinks = (links: NavLink[]) =>
    links.filter((l) => !l.femaleOnly || !isMale);

  // Keyed by each link's own page, before «التوافقات» is pointed at the suggestions page's tab (review X4a)
  const badges = navBadges({
    unreadNotifications: unreadCount,
    unreadChats: counts.unreadChats,
    pendingIntros: counts.pendingIntros,
    mutualSuggestions: !!counts.flags.mutualSuggestions,
    likedYou: counts.likedYou,
    newSuggestions: counts.newSuggestions,
  });
  const mainLinksWithBadge = mainLinks
    // Chats appear once the chat switch is on (or the user already has chats to read). Until the switches load,
    // the slots are those of the switches-on cycle, so nothing is inserted or removed under the reader (QA WM-02)
    .filter((link) => link.href !== "/dashboard/chats" || loading || counts.flags.chat || counts.hasChats)
    .map((link) => {
      const b = badges[link.href];
      return b && b.n > 0 ? { ...link, badge: b.n, tone: b.tone } : link;
    })
    // «التوافقات» opens the matches: the tab of the suggestions page with shared suggestions on, else the old page
    .map((link) => (link.href === "/dashboard/matches" ? { ...link, href: matchesHref(counts.flags.mutualSuggestions) } : link));
  const filteredMainLinks = filterLinks(mainLinksWithBadge);
  // Same name for the balance as the home and payments pages
  const creditsLabel = counts.flags.introRequests ? "رصيدك" : "رصيد الاقتراحات";
  const filteredAccountLinks = filterLinks(
    accountLinks
      .filter((link) => link.href !== PRO_PAGE_PATH || !!counts.pro?.showPage)
      .map((link) => {
        if (link.href === "/dashboard/payments") return { ...link, label: creditsLabel };
        if (link.href === "/dashboard/referral" && userData?.gender === "FEMALE") return { ...link, label: "ادعي صديقة" };
        return link;
      })
  );

  // Bottom bar: الرئيسية · الاقتراحات · التوافقات · المحادثات (when on) · حسابي, the app's names (P1-3).
  // Notifications live behind the bell in the top bar.
  const bottomLinks: (NavLink & { active: (p: string) => boolean })[] = filteredMainLinks
    .filter((l) => l.href !== "/dashboard/notifications")
    .map((l) => ({ ...l, active: (p: string) => isActiveLink(l.href, p, matchesTab) }));
  const accountActive = ACCOUNT_PREFIXES.some((p) => pathname.startsWith(p));
  // A chat room is full screen on phones
  const hideBottomBar = /^\/dashboard\/chats\/[^/]+/.test(pathname);

  const handleSignOut = () => {
    void signOutAndUnlinkPush("/login");
  };

  // Desktop only: phones use the bottom bar and the «حسابي» page
  const sidebar = (
    <>
      {/* Logo + user info */}
      <div className={cn("p-4 border-b border-border/40", collapsed && "p-3")}>
        <div className="flex items-center justify-between mb-3">
          <Link prefetch={false} href="/dashboard" className="flex min-h-11 items-center gap-2">
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={110}
              height={48}
              className="w-auto flex-shrink-0 h-8"
            />
          </Link>
          <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
              className="h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
        </div>

        {/* Until the profile loads, a placeholder of the same height keeps the menu below from jumping (QA WA-06) */}
        {!collapsed && !userData && (
          <div className="h-[58px] rounded-xl border border-border/30 bg-muted/40" aria-hidden />
        )}
        {!collapsed && userData && (
          <div className="flex h-[58px] items-center gap-3 p-2.5 bg-muted/40 rounded-xl border border-border/30">
            <MemberAvatar name={userData.firstName ?? ""} size={36} pro={!!counts.pro?.isPro} />
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
            "text-xs tracking-wide text-muted-foreground font-semibold px-3 mb-2",
            collapsed && "text-center px-0"
          )}
        >
          {collapsed ? "—" : "القائمة الرئيسية"}
        </p>
        <div className="flex flex-col gap-0.5 mb-4">
          {filteredMainLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              pathname={pathname}
              matchesTab={matchesTab}
              collapsed={collapsed}
            />
          ))}
        </div>

        <p
          className={cn(
            "text-xs tracking-wide text-muted-foreground font-semibold px-3 mb-2",
            collapsed && "text-center px-0"
          )}
        >
          {collapsed ? "—" : "الحساب"}
        </p>
        <div className="flex flex-col gap-0.5">
          {filteredAccountLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              pathname={pathname}
              matchesTab={matchesTab}
              collapsed={collapsed}
            />
          ))}
        </div>
      </div>

      {/* Logout button */}
      <div className="p-3 border-t border-border/40">
        <button
          onClick={handleSignOut}
          className={cn(
            "flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:text-destructive hover:bg-destructive/5 transition-all duration-200",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "تسجيل الخروج" : undefined}
        >
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-destructive/5 flex-shrink-0">
            <LogOut className="h-4 w-4" />
          </div>
          {!collapsed && <span>تسجيل الخروج</span>}
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
        {sidebar}
      </aside>

      {/* Mobile top bar: logo, balance, bell */}
      <header className="md:hidden fixed top-[var(--app-banner-offset,0px)] inset-x-0 z-50 bg-background border-b border-border/40 shadow-sm w-full">
        <div className="h-[2px] bg-gradient-to-l from-primary via-accent to-primary/50" />
        <div className="flex items-center justify-between px-4 h-14">
          <Link prefetch={false} href="/dashboard" className="flex min-h-11 items-center gap-2">
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
              <Link prefetch={false}
                href="/dashboard/payments"
                aria-label={`رصيدك ${counts.credits}`}
                className="me-1 inline-flex h-11 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 text-sm font-bold text-foreground"
              >
                <Coins className="h-3.5 w-3.5 text-accent-foreground" />
                {counts.credits}
              </Link>
            )}
            <Link prefetch={false}
              href="/dashboard/notifications"
              aria-label={unreadCount > 0 ? `الإشعارات (${unreadCount} غير مقروءة)` : "الإشعارات"}
              className="relative h-11 w-11 rounded-xl flex items-center justify-center hover:bg-muted/60 transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {unreadCount > 0 && (
                <span aria-hidden="true" className="absolute top-1 start-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption font-bold tabular-nums text-primary-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar: الرئيسية · الاقتراحات · التوافقات · المحادثات · حسابي (the account page) */}
      {!hideBottomBar && (
        <nav
          aria-label="التنقل الرئيسي"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 pb-[env(safe-area-inset-bottom)]"
        >
          {/* min-h: at 200% text the labels grow the bar instead of being clipped (QA WM-05) */}
          <ul className="flex min-h-16 items-stretch">
            {bottomLinks.map((link) => {
              const active = link.active(pathname);
              const badge = link.badge ?? 0;
              return (
                <li key={link.href} className="flex-1">
                  <Link prefetch={false}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={badge > 0 ? `${link.label} (${badge})` : undefined}
                    className={cn(
                      "flex h-full flex-col items-center justify-center gap-1 text-xs transition-colors",
                      active ? "font-bold text-primary" : "font-medium text-muted-foreground"
                    )}
                  >
                    <span className={cn("relative flex h-8 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/10")}>
                      <link.icon className="h-5 w-5" aria-hidden />
                      {badge > 0 ? (
                        <span aria-hidden className={cn("absolute -top-1 end-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption font-bold tabular-nums", BADGE_TONE[link.tone ?? "count"])}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                    </span>
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <Link prefetch={false}
                href="/dashboard/account"
                aria-current={accountActive ? "page" : undefined}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-1 text-xs transition-colors",
                  accountActive ? "font-bold text-primary" : "font-medium text-muted-foreground"
                )}
              >
                <span className={cn("flex h-8 w-12 items-center justify-center rounded-full", accountActive && "bg-primary/10")}>
                  <User className="h-5 w-5" aria-hidden />
                </span>
                حسابي
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
