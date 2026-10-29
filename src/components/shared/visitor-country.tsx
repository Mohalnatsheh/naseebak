"use client";

import { createContext, useContext, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, type CountryCode } from "@/lib/countries";
import { rememberVisitorCountry } from "@/lib/visitor-country";
import { localizedPath, switchCountryPath } from "@/lib/site-paths";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/shared/country-flag";

/** The visitor's country, read on the server (cookie / geo header, else Jordan) by the (ar) layout */
const VisitorCountryContext = createContext<CountryCode>(DEFAULT_COUNTRY);

export function VisitorCountryProvider({ country, children }: { country: CountryCode; children: React.ReactNode }) {
  return <VisitorCountryContext.Provider value={country}>{children}</VisitorCountryContext.Provider>;
}

/** Public pages: the country whose copy, phone format and prices to show */
export function useVisitorCountry(): CountryCode {
  return useContext(VisitorCountryContext);
}

/** Links on public pages: "/faq" → "/sa/faq" for a Saudi visitor (pages without a country URL unchanged) */
export function useSitePath(): (href: string) => string {
  const country = useVisitorCountry();
  return (href: string) => localizedPath(href, country);
}

/**
 * Flag + name of the visitor's country (🇯🇴 الأردن / 🇸🇦 السعودية) with a menu to switch at any time:
 * stores the cookie, then opens the same page in that country (/faq ↔ /sa/faq) or re-renders a page that
 * has no country URL. Flags: CountryFlag (Saudi Arabia as a plain green badge, never the Shahada).
 */
export function CountrySwitcher({
  onDark = false,
  variant = "menu",
  compact = false,
  className,
}: {
  onDark?: boolean;
  /** menu = flag button with a dropdown (navbar); row = both countries as buttons (mobile menu) */
  variant?: "menu" | "row";
  /** Flag only (the name stays for screen readers): the phone top bar */
  compact?: boolean;
  className?: string;
}) {
  const current = useVisitorCountry();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  /** A page with country URLs goes to the other country's URL (/faq ↔ /sa/faq); others re-render */
  function choose(code: CountryCode) {
    if (code === current) return;
    rememberVisitorCountry(code);
    const target = switchCountryPath(pathname || "/", code);
    startTransition(() => (target ? router.push(target + (typeof window !== "undefined" ? window.location.hash : "")) : router.refresh()));
  }

  const cfg = COUNTRIES[current];
  if (variant === "row") {
    return (
      <div role="radiogroup" aria-label="البلد" className={cn("grid grid-cols-2 gap-2", pending && "opacity-70", className)}>
        {COUNTRY_CODES.map((code) => {
          const c = COUNTRIES[code];
          const on = code === current;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(code)}
              className={cn(
                "inline-flex h-12 items-center justify-center gap-2 rounded-xl border text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                on ? "border-primary bg-primary/5 text-primary" : "border-border/60 text-foreground/80 hover:bg-muted/60"
              )}
            >
              <CountryFlag country={code} className="h-[14px] w-5" />
              {c.name}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger
        aria-label={`البلد: ${cfg.name}. تغيير البلد`}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11",
          onDark ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-border/60 bg-muted/40 text-foreground hover:bg-muted/70",
          pending && "opacity-70",
          className
        )}
      >
        <CountryFlag country={current} className="h-[14px] w-5" />
        <span className={cn(compact && "sr-only")}>{cfg.name}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {COUNTRY_CODES.map((code) => {
          const c = COUNTRIES[code];
          return (
            <DropdownMenuItem key={code} onSelect={() => choose(code)} className="gap-2 text-base">
              <CountryFlag country={code} className="h-[14px] w-5" />
              <span className="flex-1">{c.name}</span>
              {code === current && <Check className="h-4 w-4 text-primary" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
