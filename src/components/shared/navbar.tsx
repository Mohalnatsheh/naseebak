"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
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
        <Link href="/" className="group flex items-center gap-2 relative">
          <Image
            src="/images/logo.svg"
            alt="نصيبك"
            width={120}
            height={52}
            className="h-12 w-auto transition-transform duration-300 group-hover:scale-105"
            priority
          />
          <JordanFlag className="h-4 w-6 rounded-[2px] shadow-sm" />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1 bg-muted/40 backdrop-blur-sm rounded-full px-1.5 py-1 border border-border/30">
          {sectionLinks.map((link) => {
            const sectionId = link.href.replace("#", "");
            const isActive = isHome && activeSection === sectionId;
            return (
              <Link
                key={link.href}
                href={`/${link.href}`}
                className={cn(
                  "relative text-sm font-medium px-4 py-2 rounded-full transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="h-4 w-px bg-border/50 mx-1" />
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
              aria-label="فتح القائمة"
              className="h-10 w-10 rounded-xl hover:bg-muted/60"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 border-r-0" showCloseButton={false}>
            {/* Mobile menu header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <SheetTitle className="sr-only">القائمة</SheetTitle>
                <Image
                  src="/images/logo.svg"
                  alt="نصيبك"
                  width={120}
                  height={52}
                  className="h-12 w-auto"
                />
                <JordanFlag className="h-4 w-6 rounded-[2px] shadow-sm" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="إغلاق القائمة"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Mobile section links */}
            <div className="flex flex-col gap-1">
              {sectionLinks.map((link) => (
                <Link
                  key={link.href}
                  href={`/${link.href}`}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 text-lg font-medium text-foreground/80 hover:text-primary hover:bg-primary/5 rounded-xl px-4 py-3.5 transition-all duration-200"
                >
                  {link.label}
                </Link>
                ))}
            </div>

            <div className="my-3 h-px bg-border/30" />

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
                الزواج بالحلال
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
