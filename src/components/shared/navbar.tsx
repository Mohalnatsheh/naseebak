"use client";

import { useState, useEffect } from "react";
import Link from "@/components/shared/site-link";
import { usePathname } from "next/navigation";
import { splitCountryPath } from "@/lib/site-paths";
import Image from "next/image";
import { Menu, ArrowLeft, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CountrySwitcher } from "@/components/shared/visitor-country";

// The visitor's country shows as an emoji flag + name in the switcher (the Saudi flag carries the
// Shahada: never drawn as a graphic next to the logo)

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

/** Public pages whose top is the landing's navy band (P2-7 / DS-20) */
const NAVY_TOP = ["/about", "/faq", "/contact", "/privacy", "/terms", "/refund-policy", "/blog"];
export function opensOnNavy(path: string): boolean {
  return path === "/" || NAVY_TOP.some((p) => path === p || path.startsWith(`${p}/`));
}

export function Navbar() {
  // Without the country part: /sa is the home page too
  const { path: pathname } = splitCountryPath(usePathname());
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  // At the top of the home page and the public pages that share its navy hero (P2-7) the bar sits over navy: light
  // text, white logo
  const onDark = opensOnNavy(pathname) && !scrolled;

  useEffect(() => {
    fetch("/api/settings/registration-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.registrationOpen === false) setRegistrationClosed(true);
      })
      .catch(() => {});
  }, []);

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
        // Below the Android «تطبيق نصيبك» bar while it is on screen (AppDownloadBanner sets the variable)
        "fixed top-[var(--app-banner-offset,0px)] right-0 left-0 z-50 transition-[background-color,border-color,box-shadow] duration-500",
        scrolled
          ? "bg-background/60 backdrop-blur-xl border-b border-border/40 shadow-sm shadow-primary/5"
          : "bg-transparent"
      )}
    >
      {registrationClosed && (
        <div className="bg-gradient-to-l from-primary to-secondary text-primary-foreground">
          <div className="container mx-auto max-w-7xl flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>التسجيل مغلق حالياً — يمكن للمستخدمين الحاليين تسجيل الدخول</span>
          </div>
        </div>
      )}
      <nav className="container mx-auto max-w-7xl flex items-center justify-between px-4 py-3 md:py-4">
        {/* Logo / Brand */}
        <Link href="/" className="group flex items-center gap-2 relative">
          <Image
            src="/images/logo.svg"
            alt="نصيبك"
            width={120}
            height={52}
            className={cn("h-12 w-auto transition-transform duration-300 group-hover:scale-105", onDark && "brightness-0 invert")}
            priority
            loading="eager"
          />
        </Link>

        {/* Desktop nav links */}
        <div
          className={cn(
            "hidden xl:flex items-center gap-1 backdrop-blur-sm rounded-full px-1.5 py-1 border",
            onDark ? "bg-white/10 border-white/15" : "bg-muted/40 border-border/30"
          )}
        >
          {sectionLinks.map((link) => {
            const sectionId = link.href.replace("#", "");
            const isActive = isHome && activeSection === sectionId;
            return (
              <Link
                key={link.href}
                href={`/${link.href}`}
                className={cn(
                  "relative whitespace-nowrap text-sm font-medium px-4 py-2 rounded-full transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : onDark
                    ? "text-white/75 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className={cn("h-4 w-px mx-1", onDark ? "bg-white/20" : "bg-border/50")} />
          {pageLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative whitespace-nowrap text-sm font-medium px-4 py-2 rounded-full transition-all duration-300",
                pathname === link.href
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : onDark
                  ? "text-white/75 hover:text-white hover:bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-2.5">
          <CountrySwitcher onDark={onDark} />
          <Button
            variant="ghost"
            asChild
            className={cn("font-medium", onDark ? "text-white/85 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:text-foreground")}
          >
            <Link href="/login">تسجيل الدخول</Link>
          </Button>
          <Button
            asChild
            className={cn(
              "transition-all duration-300 rounded-xl px-5 font-semibold",
              onDark
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "bg-gradient-to-l from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
            )}
          >
            <Link href="/register">
              ابدأ التسجيل
              <ArrowLeft className="h-4 w-4 ms-1.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile: country flag + menu */}
        <div className="flex items-center gap-1.5 xl:hidden">
          <CountrySwitcher onDark={onDark} compact className="md:hidden" />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="xl:hidden">
              <Button
                variant="ghost"
                size="icon"
                aria-label="فتح القائمة"
                className={cn("h-10 w-10 rounded-xl", onDark ? "text-white hover:bg-white/10 hover:text-white" : "hover:bg-muted/60")}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            {/* Scrolls on short phones, so «تسجيل الدخول» at the bottom is always reachable */}
            <SheetContent side="right" className="w-80 border-r-0 overflow-y-auto overscroll-contain" showCloseButton={false}>
              {/* Mobile menu header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <SheetTitle className="sr-only">القائمة</SheetTitle>
                  <SheetDescription className="sr-only">روابط صفحات نصيبك وتسجيل الدخول</SheetDescription>
                  <Image
                    src="/images/logo.svg"
                    alt="نصيبك"
                    width={120}
                    height={52}
                    className="h-12 w-auto"
                  />
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

              <div className="my-3 h-px bg-border/30" />

              {/* Country (switch any time) */}
              <div className="px-1">
                <p className="mb-2 px-1 text-sm font-semibold text-muted-foreground">البلد</p>
                <CountrySwitcher variant="row" />
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
                    ابدأ التسجيل
                    <ArrowLeft className="h-4 w-4 ms-1.5" />
                  </Link>
                </Button>
              </div>

              {/* Bottom decoration: in the flow, so it never sits on top of the buttons */}
              <div className="mt-auto flex shrink-0 justify-center pb-8 pt-4">
                <p className="text-xs text-muted-foreground">
                  الزواج بالحلال
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
