"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ChevronDown,
  Settings,
  X,
  LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function JordanFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 600" className={className} aria-label="علم الأردن">
      <rect width="1200" height="200" fill="#000" />
      <rect y="200" width="1200" height="200" fill="#fff" />
      <rect y="400" width="1200" height="200" fill="#007A3D" />
      <polygon points="0,0 450,300 0,600" fill="#CE1126" />
      <polygon points="135,260 150,300 190,300 158,325 170,365 135,343 100,365 112,325 80,300 120,300" fill="#fff" />
    </svg>
  );
}

const navLinks = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/dashboard/suggestions", label: "الاقتراحات", icon: Sparkles },
  { href: "/dashboard/matches", label: "التوافقات", icon: Heart },
  { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
];

const secondaryLinks = [
  { href: "/dashboard/profile", label: "الملف الشخصي", icon: User },
  { href: "/dashboard/identity", label: "التحقق من الهوية", icon: FileCheck },
  { href: "/dashboard/payments", label: "الباقات والاشتراكات", icon: CreditCard },
  { href: "/dashboard/support", label: "الدعم والملاحظات", icon: LifeBuoy },
];

export function DashboardNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Placeholder notification count - replace with real data
  const notificationCount = 0;

  return (
    <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border/40">
      {/* Top gradient line */}
      <div className="h-[2px] bg-gradient-to-l from-primary via-accent to-primary/50" />

      <nav className="container mx-auto flex items-center justify-between px-4 h-16">
        {/* Logo */}
        <Link href="/dashboard" className="group flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm shadow-primary/20 group-hover:shadow-md group-hover:shadow-primary/30 transition-all duration-300">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
          <span className="text-xl font-black bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent hidden sm:inline">
            نصيبك
          </span>
          <JordanFlag className="h-3.5 w-5 rounded-[2px] shadow-sm hidden sm:block" />
        </Link>

        {/* Desktop navigation links */}
        <div className="hidden md:flex items-center gap-0.5 mx-4">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(link.href);
            const isNotification = link.href === "/dashboard/notifications";

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                  isActive
                    ? "text-primary bg-primary/8"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <link.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                {link.label}
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
                )}
                {/* Notification badge */}
                {isNotification && notificationCount > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 h-4.5 min-w-4.5 px-1 rounded-full bg-gradient-to-br from-accent to-accent text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse">
                    {notificationCount > 9 ? "+9" : notificationCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Desktop right side: notification bell + user dropdown */}
        <div className="hidden md:flex items-center gap-2">
          {/* Notification bell */}
          <Link href="/dashboard/notifications">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-lg hover:bg-muted/60"
            >
              <Bell className={cn(
                "h-4.5 w-4.5",
                pathname === "/dashboard/notifications" ? "text-primary" : "text-muted-foreground"
              )} />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-accent border-2 border-background animate-pulse" />
              )}
            </Button>
          </Link>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative flex items-center gap-2 h-9 pe-2 ps-1 rounded-xl hover:bg-muted/60 border border-transparent hover:border-border/40 transition-all duration-200"
              >
                <Avatar className="h-7 w-7 border border-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-xs font-bold">
                    م
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 rounded-xl p-1.5">
              {/* User info header */}
              <div className="px-3 py-2.5 mb-1">
                <p className="text-sm font-semibold text-foreground">مرحباً بك</p>
                <p className="text-xs text-muted-foreground mt-0.5">إدارة حسابك</p>
              </div>
              <DropdownMenuSeparator className="mx-1" />
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer gap-2.5 py-2.5 px-3 my-0.5">
                <Link href="/dashboard/profile">
                  <User className="h-4 w-4 text-muted-foreground" />
                  الملف الشخصي
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer gap-2.5 py-2.5 px-3 my-0.5">
                <Link href="/dashboard/identity">
                  <FileCheck className="h-4 w-4 text-muted-foreground" />
                  التحقق من الهوية
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer gap-2.5 py-2.5 px-3 my-0.5">
                <Link href="/dashboard/payments">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  الباقات والاشتراكات
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer gap-2.5 py-2.5 px-3 my-0.5">
                <Link href="/dashboard/support">
                  <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                  الدعم والملاحظات
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-1" />
              <DropdownMenuItem className="rounded-lg cursor-pointer gap-2.5 py-2.5 px-3 my-0.5 text-destructive focus:text-destructive focus:bg-destructive/5">
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile menu button */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-muted/60">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0 border-r-0">
            {/* Sidebar header */}
            <div className="p-5 border-b border-border/40 bg-gradient-to-l from-primary/5 to-transparent">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm shadow-primary/20">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <SheetTitle className="text-xl font-black bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
                    نصيبك
                  </SheetTitle>
                  <JordanFlag className="h-3.5 w-5 rounded-[2px] shadow-sm" />
                </div>
              </div>

              {/* User card */}
              <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary font-bold">
                    م
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">مرحباً بك</p>
                  <p className="text-xs text-muted-foreground">إدارة حسابك</p>
                </div>
              </div>
            </div>

            {/* Navigation links */}
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 mb-2">
                القائمة الرئيسية
              </p>
              <div className="flex flex-col gap-0.5">
                {navLinks.map((link) => {
                  const isActive =
                    link.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(link.href);
                  const isNotification = link.href === "/dashboard/notifications";

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary/8 text-primary border border-primary/10"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                        isActive
                          ? "bg-primary/10"
                          : "bg-muted/60"
                      )}>
                        <link.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                      </div>
                      {link.label}
                      {isActive && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-primary rounded-s-full" />
                      )}
                      {isNotification && notificationCount > 0 && (
                        <span className="ms-auto h-5 min-w-5 px-1 rounded-full bg-gradient-to-br from-accent to-accent text-white text-[10px] font-bold flex items-center justify-center">
                          {notificationCount > 9 ? "+9" : notificationCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Secondary links */}
            <div className="p-3 pt-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 mb-2 mt-2">
                الإعدادات
              </p>
              <div className="flex flex-col gap-0.5">
                {secondaryLinks.map((link) => {
                  const isActive = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary/8 text-primary border border-primary/10"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                        isActive
                          ? "bg-primary/10"
                          : "bg-muted/60"
                      )}>
                        <link.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                      </div>
                      {link.label}
                      {isActive && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-primary rounded-s-full" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Logout at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/40 bg-card/80 backdrop-blur-sm">
              <button className="flex items-center gap-3 w-full rounded-xl px-3 py-3 text-sm font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-all duration-200">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-destructive/5">
                  <LogOut className="h-4 w-4" />
                </div>
                تسجيل الخروج
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
