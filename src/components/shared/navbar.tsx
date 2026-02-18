"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const sectionLinks = [
  { href: "#features", label: "المميزات" },
  { href: "#how-it-works", label: "كيف تعمل المنصة" },
];

const pageLinks = [
  { href: "/about", label: "من نحن" },
  { href: "/contact", label: "تواصل معنا" },
  { href: "/blog", label: "المدونة" },
  { href: "/faq", label: "الأسئلة الشائعة" },
];

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);

      if (!isHome) return;
      const sections = sectionLinks.map((l) => l.href.replace("#", ""));
      for (const section of [...sections].reverse()) {
        const el = document.getElementById(section);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) {
            setActiveSection(section);
            return;
          }
        }
      }
      setActiveSection("");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHome]);

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-background/60 backdrop-blur-xl border-b border-border/40 shadow-sm shadow-primary/5"
          : "bg-transparent"
      )}
    >
      <nav className="container mx-auto max-w-7xl flex items-center justify-between px-4 py-3 md:py-4">
        {/* Logo / Brand */}
        <Link href="/" className="group flex items-center gap-2.5 relative">
          <div className="relative">
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-500",
              scrolled
                ? "bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/20"
                : "bg-gradient-to-br from-primary/90 to-primary/60 shadow-lg shadow-primary/30"
            )}>
              <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div className="absolute -inset-1 bg-primary/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          <span className={cn(
            "text-2xl font-black tracking-tight transition-all duration-300",
            scrolled
              ? "bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent"
              : "text-primary"
          )}>
            نصيب
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1 bg-muted/40 backdrop-blur-sm rounded-full px-1.5 py-1 border border-border/30">
          {isHome && sectionLinks.map((link) => {
            const sectionId = link.href.replace("#", "");
            const isActive = activeSection === sectionId;
            return (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "relative text-sm font-medium px-4 py-2 rounded-full transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                {link.label}
              </a>
            );
          })}
          {isHome && (
            <div className="h-4 w-px bg-border/50 mx-1" />
          )}
          {pageLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative text-sm font-medium px-4 py-2 rounded-full transition-all duration-300",
                pathname === link.href
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-2.5">
          <Button
            variant="ghost"
            asChild
            className="text-muted-foreground hover:text-foreground font-medium"
          >
            <Link href="/login">تسجيل الدخول</Link>
          </Button>
          <Button
            asChild
            className="bg-gradient-to-l from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 rounded-xl px-5 font-semibold"
          >
            <Link href="/register">
              إنشاء حساب
              <ArrowLeft className="h-4 w-4 ms-1.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl hover:bg-muted/60"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 border-r-0">
            {/* Mobile menu header */}
            <div className="flex items-center gap-2.5 mb-8">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/20">
                <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
              </div>
              <SheetTitle className="text-2xl font-black bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
                نصيب
              </SheetTitle>
            </div>

            {/* Mobile section links (only on home) */}
            {isHome && (
              <div className="flex flex-col gap-1">
                {sectionLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 text-lg font-medium text-foreground/80 hover:text-primary hover:bg-primary/5 rounded-xl px-4 py-3.5 transition-all duration-200"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            {isHome && <div className="my-3 h-px bg-border/30" />}

            {/* Mobile page links */}
            <div className="flex flex-col gap-1">
              {pageLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 text-lg font-medium rounded-xl px-4 py-3.5 transition-all duration-200",
                    pathname === link.href
                      ? "text-primary bg-primary/5"
                      : "text-foreground/80 hover:text-primary hover:bg-primary/5"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Mobile auth buttons */}
            <div className="mt-8 flex flex-col gap-3 px-1">
              <Button
                variant="outline"
                asChild
                className="w-full h-12 rounded-xl font-semibold text-base border-border/60"
              >
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  تسجيل الدخول
                </Link>
              </Button>
              <Button
                asChild
                className="w-full h-12 rounded-xl font-semibold text-base bg-gradient-to-l from-primary to-primary/85 shadow-md shadow-primary/20"
              >
                <Link href="/register" onClick={() => setMobileOpen(false)}>
                  إنشاء حساب
                  <ArrowLeft className="h-4 w-4 ms-1.5" />
                </Link>
              </Button>
            </div>

            {/* Bottom decoration */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center">
              <p className="text-xs text-muted-foreground/40">
                منصة نصيب للتيسير الزواج
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
