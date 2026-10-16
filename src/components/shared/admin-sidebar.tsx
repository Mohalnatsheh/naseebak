"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Users, ShieldCheck, Sparkles, CalendarHeart, FileText, Menu, LogOut, Flag, ClipboardEdit, CreditCard, Bell, Ban, Trash2, Settings, LifeBuoy, HeartHandshake, Archive, ChevronDown, Heart, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SidebarLink = { href: string; label: string; icon: typeof LayoutDashboard };

/**
 * Legacy-flow pages, grouped under "Legacy" once the new user cycle is on.
 * Profile Requests stays in the main nav: profile edits are reviewed in both flows.
 */
const LEGACY_HREFS = ["/admin/identity", "/admin/visits"];

const sidebarLinks: SidebarLink[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/identity", label: "Identity Review", icon: ShieldCheck },
  { href: "/admin/suggestions", label: "Suggestions", icon: Sparkles },
  { href: "/admin/visits", label: "Visit Requests", icon: CalendarHeart },
  { href: "/admin/matches", label: "Matches", icon: Heart },
  { href: "/admin/introductions", label: "Introductions", icon: HeartHandshake },
  { href: "/admin/chats", label: "Chats", icon: MessagesSquare },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/profile-requests", label: "Profile Requests", icon: ClipboardEdit },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/blocks", label: "Blocks", icon: Ban },
  { href: "/admin/deletions", label: "Deletions", icon: Trash2 },
  { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy },
  { href: "/admin/blog", label: "Blog", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

function NavLink({ link, onNavigate, nested }: { link: SidebarLink; onNavigate?: () => void; nested?: boolean }) {
  const pathname = usePathname();
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        nested && "ps-6",
        isActive(pathname, link.href)
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <link.icon className="h-4 w-4" />
      {link.label}
    </Link>
  );
}

function SidebarNav({ onNavigate, legacyGrouped }: { onNavigate?: () => void; legacyGrouped: boolean }) {
  const pathname = usePathname();
  const legacyLinks = sidebarLinks.filter((l) => LEGACY_HREFS.includes(l.href));
  const inLegacy = legacyLinks.some((l) => isActive(pathname, l.href));
  const [legacyOpen, setLegacyOpen] = useState(inLegacy);
  const open = legacyOpen || inLegacy;

  if (!legacyGrouped) {
    return (
      <nav className="flex flex-col gap-1">
        {sidebarLinks.map((link) => (
          <NavLink key={link.href} link={link} onNavigate={onNavigate} />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {sidebarLinks
        .filter((l) => !LEGACY_HREFS.includes(l.href))
        .map((link) => (
          <NavLink key={link.href} link={link} onNavigate={onNavigate} />
        ))}
      <button
        type="button"
        onClick={() => setLegacyOpen(!open)}
        aria-expanded={open}
        className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Archive className="h-4 w-4" />
        Legacy
        <ChevronDown className={cn("ms-auto h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        legacyLinks.map((link) => (
          <NavLink key={link.href} link={link} onNavigate={onNavigate} nested />
        ))}
    </nav>
  );
}

export function AdminSidebar({ legacyGrouped = false }: { legacyGrouped?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <Image src="/images/logo.svg" alt="Naseeb" width={100} height={44} className="h-8 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground">Admin</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Management Panel</p>
        </div>
        <div className="flex-1 px-3">
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
          <SheetContent side="left" className="w-64 p-0">
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
