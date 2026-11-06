"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { BarChart3, LayoutDashboard, Users, ShieldCheck, Sparkles, CalendarHeart, FileText, Menu, LogOut, Flag, ClipboardEdit, CreditCard, Bell, BellRing, Ban, Trash2, Settings, LifeBuoy, HeartHandshake, Archive, ChevronDown, Heart, MessagesSquare, Inbox, MessageCircleQuestion, Globe2, Megaphone, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SidebarLink = { href: string; label: string; icon: typeof LayoutDashboard; todo?: TodoKey };
type TodoKey = "reports" | "support" | "profileRequests" | "contactMessages" | "identity" | "all";
type TodoCounts = Partial<Record<TodoKey, number>>;

/**
 * Legacy-flow pages, grouped under "Legacy" once the new user cycle is on.
 * Profile Requests stays in the main nav: profile edits are reviewed in both flows.
 */
const LEGACY_HREFS = ["/admin/identity", "/admin/visits"];

/** The nav in sections, most-used first (admin page use, Nov 2026). `todo` = badge with what waits (/api/admin/today?todo=1) */
const sidebarGroups: { title: string | null; links: SidebarLink[] }[] = [
  {
    title: null,
    links: [
      { href: "/admin", label: "Today", icon: LayoutDashboard },
      { href: "/admin/insights", label: "Insights", icon: BarChart3 },
    ],
  },
  {
    title: "Needs action",
    links: [
      { href: "/admin/inbox", label: "Inbox (all waiting)", icon: Inbox, todo: "all" },
      { href: "/admin/reports", label: "Reports", icon: Flag, todo: "reports" },
      { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy, todo: "support" },
      { href: "/admin/profile-requests", label: "Profile Requests", icon: ClipboardEdit, todo: "profileRequests" },
      { href: "/admin/messages", label: "Contact Messages", icon: Inbox, todo: "contactMessages" },
    ],
  },
  {
    title: "Members & money",
    links: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/deletions", label: "Deletions", icon: Trash2 },
      { href: "/admin/blocks", label: "Blocks", icon: Ban },
      { href: "/admin/referrals", label: "Referrals", icon: Gift },
    ],
  },
  {
    title: "Matching",
    links: [
      { href: "/admin/suggestions", label: "Suggestions", icon: Sparkles },
      { href: "/admin/matches", label: "Matches", icon: Heart },
      { href: "/admin/introductions", label: "Introductions", icon: HeartHandshake },
      { href: "/admin/chats", label: "Chats", icon: MessagesSquare },
    ],
  },
  {
    title: "Reach members",
    links: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/notifications/automatic", label: "Automatic messages", icon: BellRing },
      { href: "/admin/alerts", label: "Popup Alerts", icon: Megaphone },
      { href: "/admin/polls", label: "Naseebak Question", icon: MessageCircleQuestion },
      { href: "/admin/blog", label: "Blog", icon: FileText },
    ],
  },
  {
    title: "Setup",
    links: [
      { href: "/admin/countries", label: "Countries", icon: Globe2 },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    title: "Legacy",
    links: [
      { href: "/admin/identity", label: "Identity Review", icon: ShieldCheck, todo: "identity" },
      { href: "/admin/visits", label: "Visit Requests", icon: CalendarHeart },
    ],
  },
];
const sidebarLinks = sidebarGroups.flatMap((g) => g.links);

/** To-do counts for the badges, refreshed every minute */
function useTodoCounts(): TodoCounts {
  const [counts, setCounts] = useState<TodoCounts>({});
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/admin/today?todo=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d?.todo) return;
          const t = d.todo as Record<string, number>;
          // «Inbox» counts everything waiting (identity is legacy: only counted on its own link)
          setCounts({ ...t, all: (t.reports ?? 0) + (t.support ?? 0) + (t.profileRequests ?? 0) + (t.contactMessages ?? 0) });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return counts;
}

function isActive(pathname: string, href: string) {
  // «Automatic messages» has its own link under the same path
  if (href === "/admin/notifications") return pathname === href;
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

function NavLink({ link, onNavigate, nested, counts }: { link: SidebarLink; onNavigate?: () => void; nested?: boolean; counts: TodoCounts }) {
  const n = link.todo ? (counts[link.todo] ?? 0) : 0;
  const pathname = usePathname();
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        nested && "ps-6",
        isActive(pathname, link.href)
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <link.icon className="h-4 w-4" />
      {link.label}
      {n > 0 && (
        <span className="ms-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">{n}</span>
      )}
    </Link>
  );
}

function SidebarNav({ onNavigate, legacyGrouped }: { onNavigate?: () => void; legacyGrouped: boolean }) {
  const pathname = usePathname();
  const counts = useTodoCounts();
  const legacyLinks = sidebarLinks.filter((l) => LEGACY_HREFS.includes(l.href));
  const inLegacy = legacyLinks.some((l) => isActive(pathname, l.href));
  const [legacyOpen, setLegacyOpen] = useState(inLegacy);
  const open = legacyOpen || inLegacy;

  return (
    <nav className="flex flex-col gap-1 pb-4">
      {sidebarGroups.map((group) => {
        // Legacy pages fold away once the new cycle is on (still opened by a badge or when you're on them)
        if (group.title === "Legacy" && legacyGrouped) {
          return (
            <div key="legacy" className="mt-2">
              <button
                type="button"
                onClick={() => setLegacyOpen(!open)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Archive className="h-3.5 w-3.5" />
                Legacy
                <ChevronDown className={cn("ms-auto h-4 w-4 transition-transform", open && "rotate-180")} />
              </button>
              {/* The legacy flows are off: no badge pulling the admin in */}
              {open && group.links.map((link) => <NavLink key={link.href} link={link} onNavigate={onNavigate} nested counts={{}} />)}
            </div>
          );
        }
        return (
          <div key={group.title ?? "home"} className={cn(group.title && "mt-2")}>
            {group.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{group.title}</p>}
            {group.links.map((link) => (
              <NavLink key={link.href} link={link} onNavigate={onNavigate} counts={counts} />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function AdminSidebar({ legacyGrouped = false }: { legacyGrouped?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card sticky top-0 h-screen">
        <div className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Image src="/images/logo.svg" alt="Naseeb" width={100} height={44} className="h-8 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground">Admin</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav legacyGrouped={legacyGrouped} />
        </div>
        <div className="p-3 border-t">
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/images/logo.svg" alt="Naseeb" width={90} height={40} className="h-7 w-auto" />
          <span className="text-sm font-semibold text-muted-foreground">Admin</span>
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0" closeLabel="Close" aria-describedby={undefined}>
            <div className="p-6">
              <SheetTitle className="sr-only">Naseeb Admin</SheetTitle>
              <div className="flex items-center gap-2">
                <Image src="/images/logo.svg" alt="Naseeb" width={100} height={44} className="h-8 w-auto" />
                <span className="text-sm font-semibold text-muted-foreground">Admin</span>
              </div>
            </div>
            <div className="px-3 overflow-y-auto">
              <SidebarNav legacyGrouped={legacyGrouped} onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="mt-auto p-3 border-t">
              <button
                onClick={() => signOut({ callbackUrl: "/admin/login" })}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
