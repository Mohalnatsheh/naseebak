"use client";

import { ChevronDown } from "lucide-react";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { useActiveCountries } from "@/components/shared/visitor-country";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CountryFlag } from "@/components/shared/country-flag";
import { cn } from "@/lib/utils";

/**
 * Dial-code switch at the start of a phone field (🇯🇴 +962 / 🇸🇦 +966). Sits inside the field's
 * left edge (the field is LTR); the parent pads the input to make room.
 */
export function DialCodeToggle({
  country,
  onChange,
  disabled,
  className,
}: {
  country: CountryCode;
  onChange: (c: CountryCode) => void;
  disabled?: boolean;
  className?: string;
}) {
  const cfg = COUNTRIES[country];
  const countries = useActiveCountries();
  // Only one country open: show its code, nothing to choose
  if (countries.length < 2 && countries.includes(country)) {
    return (
      <span
        aria-label={`رمز الدولة ${cfg.name} +${cfg.dialCode}`}
        className={cn("inline-flex h-9 items-center gap-1.5 px-1.5 text-sm text-muted-foreground", className)}
      >
        <CountryFlag country={country} className="h-[14px] w-5" />
        <span dir="ltr" className="font-medium">
          +{cfg.dialCode}
        </span>
      </span>
    );
  }
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger
        type="button"
        disabled={disabled}
        aria-label={`رمز الدولة ${cfg.name} +${cfg.dialCode}. تغيير الدولة`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60",
          className
        )}
      >
        <CountryFlag country={country} className="h-[14px] w-5" />
        <span dir="ltr" className="font-medium">
          +{cfg.dialCode}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {countries.map((code) => {
          const c = COUNTRIES[code];
          return (
            <DropdownMenuItem key={code} onSelect={() => onChange(code)} className="gap-2 text-base">
              <CountryFlag country={code} className="h-[14px] w-5" />
              <span className="flex-1">{c.name}</span>
              <span dir="ltr" className="text-sm text-muted-foreground">
                +{c.dialCode}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
