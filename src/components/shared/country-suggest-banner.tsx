"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { rememberVisitorCountry } from "@/lib/visitor-country";
import { switchCountryPath } from "@/lib/site-paths";
import { CountryFlag } from "@/components/shared/country-flag";

/**
 * SEO-safe geo suggestion (Google advises against forced IP redirects): a visitor whose IP country
 * differs from the page's country, and who never chose one, is offered the other version. «ابقَ هنا»
 * remembers the current country; «انتقل» remembers the other and opens the same page there.
 * Shown only on pages that exist per country, and only when the server knows the IP country.
 */
export function CountrySuggestBanner({ siteCountry, geoCountry, hasChoice }: { siteCountry: CountryCode; geoCountry: CountryCode | null; hasChoice: boolean }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const target = geoCountry && geoCountry !== siteCountry ? switchCountryPath(pathname, geoCountry) : null;
  if (hidden || hasChoice || !geoCountry || !target) return null;
  const geo = COUNTRIES[geoCountry];

  return (
    <div role="region" aria-label="اقتراح نسخة بلدك" className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-md rounded-2xl border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur md:bottom-6">
      <div className="flex items-center gap-3" dir="rtl">
        <CountryFlag country={geoCountry} className="h-[18px] w-6" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">يبدو أنك {geo.inName}. هل تريد نسخة {geo.name}؟</p>
        <button
          type="button"
          onClick={() => {
            rememberVisitorCountry(geoCountry);
            router.push(target);
          }}
          className="inline-flex h-10 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          انتقل
        </button>
        <button
          type="button"
          aria-label="ابقَ هنا"
          onClick={() => {
            rememberVisitorCountry(siteCountry);
            setHidden(true);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
