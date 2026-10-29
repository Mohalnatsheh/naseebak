"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { ADMIN_COUNTRY_COOKIE, COUNTRIES, COUNTRY_CODES } from "@/lib/countries";
import { CountryFlag } from "@/components/shared/country-flag";
import { cn } from "@/lib/utils";

type AdminCountryValue = (typeof COUNTRY_CODES)[number] | "ALL";

const OPTIONS: { value: AdminCountryValue; flag: string; label: string }[] = [
  ...COUNTRY_CODES.map((c) => ({ value: c, flag: COUNTRIES[c].flag, label: COUNTRIES[c].nameEn })),
  { value: "ALL", flag: "", label: "All countries" },
];

/** Stores the choice for a year (read on the server by getAdminCountry) */
function saveAdminCountry(value: AdminCountryValue) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ADMIN_COUNTRY_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
}

/**
 * Country the admin panel manages: every admin list / stat API filters by the `admin_country`
 * cookie (src/lib/countries/server.ts → getAdminCountry). Settings and switches stay global.
 * The admin layout keys the page by the country, so refreshing remounts the page and it reloads its data.
 */
export function AdminCountrySelect({ current }: { current: AdminCountryValue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(value: AdminCountryValue) {
    if (value === current) return;
    saveAdminCountry(value);
    startTransition(() => router.refresh());
  }

  const active = OPTIONS.find((o) => o.value === current) ?? OPTIONS[0];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">Managing:</span>
        <span className="font-semibold" data-testid="admin-country-current">
          {active.value !== "ALL" && <CountryFlag country={active.value} className="me-1 inline h-3 w-4 align-[-1px]" />}
          {active.label}
        </span>
      </div>
      <div role="radiogroup" aria-label="Country" className={cn("ms-auto flex flex-wrap gap-1 rounded-lg bg-muted p-1", pending && "opacity-60")}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === current}
            disabled={pending}
            onClick={() => choose(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
              o.value === current ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
          >
            {o.value !== "ALL" && <CountryFlag country={o.value} className="me-1 inline h-3 w-4 align-[-1px]" />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
