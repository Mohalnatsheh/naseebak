"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Users, ShieldCheck, Sparkles, CalendarHeart, FileText, Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/identity", label: "Identity Review", icon: ShieldCheck },
  { href: "/admin/suggestions", label: "Suggestions", icon: Sparkles },
  { href: "/admin/visits", label: "Visit Requests", icon: CalendarHeart },
  { href: "/admin/blog", label: "Blog", icon: FileText },
];

function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {sidebarLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === link.href
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <link.icon className="h-4 w-4" />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminSidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card">
        <div className="p-6">
          <h2 className="text-xl font-bold text-primary">Naseeb Admin</h2>
          <p className="text-xs text-muted-foreground mt-1">Management Panel</p>
        </div>
        <div className="flex-1 px-3">
          <SidebarNav />
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
        <h2 className="text-lg font-bold text-primary">Naseeb Admin</h2>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-6">
              <SheetTitle className="text-xl font-bold text-primary">Naseeb Admin</SheetTitle>
            </div>
            <div className="px-3">
              <SidebarNav />
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
