"use client";

import { useEffect, useRef } from "react";
import NextLink from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { localizedPath } from "@/lib/site-paths";
import { phoneWord } from "@/lib/phone-field";
import { useActiveCountries } from "@/components/shared/visitor-country";
import { CountryFlag } from "@/components/shared/country-flag";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** «عبر واتساب» / «برسالة نصية» */
export function channelWords(whatsapp: boolean): string {
  return whatsapp ? "عبر واتساب" : "برسالة نصية";
}

/**
 * «ما رقم هاتفك؟»: one grouped field (a country row when 2+ countries are open, then the LTR number row next to its
 * dial code), the hint, «إرسال الرمز» and the terms line. The same in sign-in and sign-up.
 */
export function PhoneStep({
  country,
  onCountryChange,
  phone,
  onPhoneChange,
  error,
  sending,
  onSubmit,
}: {
  country: CountryCode;
  onCountryChange: (c: CountryCode) => void;
  /** As typed, Western digits */
  phone: string;
  onPhoneChange: (v: string) => void;
  /** Shown under the field (a bad number, or the server's refusal such as closed registration) */
  error: string;
  sending: boolean;
  onSubmit: () => void;
}) {
  const cfg = COUNTRIES[country];
  const countries = useActiveCountries();
  const inputRef = useRef<HTMLInputElement>(null);
  // The keypad opens by itself, as in the app
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const linkClass = "py-3 font-semibold text-primary underline underline-offset-2";
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h1 className="font-display text-display-sm text-ink">ما رقم هاتفك؟</h1>
      <p className="mt-1 mb-5 text-body text-muted-ink">سنرسل لك رمز دخول من 6 أرقام {channelWords(cfg.otpByWhatsapp)}.</p>

      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-card focus-within:ring-2 focus-within:ring-primary/30",
          error ? "border-destructive" : "border-border",
        )}
      >
        {countries.length >= 2 && (
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger
              type="button"
              aria-label={`الدولة: ${cfg.name}. تغيير الدولة`}
              className="flex min-h-13 w-full items-center gap-3 border-b border-border px-4 text-body text-ink transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40"
            >
              <CountryFlag country={country} className="h-[18px] w-6" />
              <span className="flex-1 text-start">{cfg.name}</span>
              <ChevronLeft className="size-5 text-muted-ink" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {countries.map((code) => {
                const c = COUNTRIES[code];
                return (
                  <DropdownMenuItem key={code} onSelect={() => onCountryChange(code)} className="min-h-11 gap-2 text-base">
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
        )}
        <div dir="ltr" className="flex min-h-14 items-center gap-3 px-4">
          <span className="border-e border-border pe-3 text-headline font-normal text-muted-ink">+{cfg.dialCode}</span>
          <input
            ref={inputRef}
            id="auth-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            aria-label={`رقم ${phoneWord(country)}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "auth-phone-error auth-phone-hint" : "auth-phone-hint"}
            placeholder={cfg.phone.placeholder}
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="h-12 min-w-0 flex-1 bg-transparent text-left text-title font-medium text-ink outline-none placeholder:text-muted-ink/50"
          />
        </div>
      </div>
      {error && (
        <p id="auth-phone-error" role="alert" className="mt-2 px-1 text-label text-destructive">
          {error}
        </p>
      )}
      <p id="auth-phone-hint" className="mt-2 px-1 text-caption text-muted-ink">
        لا يظهر رقمك لأي عضو.
      </p>

      <Button type="submit" disabled={sending || !phone.trim()} className="mt-6 h-13 w-full rounded-xl text-body font-bold">
        {sending && <Loader2 className="size-5 animate-spin" aria-hidden />}
        إرسال الرمز
      </Button>

      <p className="mt-4 text-center text-caption text-muted-ink">
        بالمتابعة توافق على{" "}
        <NextLink href={localizedPath("/terms", country)} target="_blank" className={linkClass}>
          الشروط
        </NextLink>{" "}
        و
        <NextLink href={localizedPath("/privacy", country)} target="_blank" className={linkClass}>
          سياسة الخصوصية
        </NextLink>
        .
      </p>
    </form>
  );
}
