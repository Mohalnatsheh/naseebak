/**
 * Countries the platform serves (db-free, safe in client components).
 * Adding a country = one entry here + its copy/legal files + its SMS provider (src/lib/sms.ts)
 * + its credit packages (src/lib/payments/packages.ts) + its places (src/lib/countries/places.ts).
 * Design: docs/superpowers/specs/2026-10-26-multi-country-design.md
 */

export const COUNTRY_CODES = ["JO", "SA"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

/** Every existing member and every visitor without a choice */
export const DEFAULT_COUNTRY: CountryCode = "JO";

/** Visitor's chosen country (public pages): set by the flag switcher or ?country= */
export const COUNTRY_COOKIE = "naseeb_country";
/** Country the admin is managing ("ALL" = every country) */
export const ADMIN_COUNTRY_COOKIE = "admin_country";

export interface CountryConfig {
  code: CountryCode;
  /** «الأردن» / «السعودية» */
  name: string;
  /** «في الأردن» / «في السعودية» */
  inName: string;
  nameEn: string;
  /** Emoji flag (the Saudi flag carries the Shahada: emoji only, never a graphic) */
  flag: string;
  /** International prefix without "+" */
  dialCode: string;
  phone: {
    /** National number after the dial code, e.g. 7[789]XXXXXXX */
    national: RegExp;
    /** Shown in the phone field after the dial code */
    placeholder: string;
    /** Local example with the trunk 0 */
    example: string;
  };
  currency: { code: string; symbol: string };
  /** Always Gregorian with Western digits (plain "ar-SA" is the Hijri calendar) */
  dateLocale: string;
  timeZone: string;
  /** Wording that differs between countries (dashboard + public pages) */
  words: {
    /** «هاتف» / «جوال» */
    phone: string;
    /** Label of the `tribe` field: «العشيرة» / «القبيلة» */
    tribe: string;
    nationalityMale: string;
    nationalityFemale: string;
  };
}

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  JO: {
    code: "JO",
    name: "الأردن",
    inName: "في الأردن",
    nameEn: "Jordan",
    flag: "🇯🇴",
    dialCode: "962",
    phone: { national: /^7[789]\d{7}$/, placeholder: "7XXXXXXXX", example: "0791234567" },
    currency: { code: "JOD", symbol: "د.أ" },
    dateLocale: "ar-JO-u-nu-latn",
    timeZone: "Asia/Amman",
    words: { phone: "هاتف", tribe: "العشيرة", nationalityMale: "أردني", nationalityFemale: "أردنية" },
  },
  SA: {
    code: "SA",
    name: "السعودية",
    inName: "في السعودية",
    nameEn: "Saudi Arabia",
    flag: "🇸🇦",
    dialCode: "966",
    phone: { national: /^5\d{8}$/, placeholder: "5XXXXXXXX", example: "0512345678" },
    currency: { code: "SAR", symbol: "ر.س" },
    dateLocale: "ar-SA-u-ca-gregory-nu-latn",
    timeZone: "Asia/Riyadh",
    words: { phone: "جوال", tribe: "القبيلة", nationalityMale: "سعودي", nationalityFemale: "سعودية" },
  },
};

export function isCountryCode(v: unknown): v is CountryCode {
  return typeof v === "string" && (COUNTRY_CODES as readonly string[]).includes(v);
}

/** "sa" / "SA" / null → a valid code (default Jordan) */
export function toCountry(v: unknown): CountryCode {
  const up = typeof v === "string" ? v.trim().toUpperCase() : "";
  return isCountryCode(up) ? up : DEFAULT_COUNTRY;
}

export function countryConfig(code: unknown): CountryConfig {
  return COUNTRIES[toCountry(code)];
}

/** The country a stored phone (962… / 966…) belongs to, or null */
export function countryOfPhone(phone: string | null | undefined): CountryCode | null {
  if (!phone) return null;
  for (const c of COUNTRY_CODES) if (phone.startsWith(COUNTRIES[c].dialCode)) return c;
  return null;
}

/** Date formatting for a country: always Gregorian, Western digits, the country's time zone */
export function formatDate(d: Date | string | number, country: unknown, opts: Intl.DateTimeFormatOptions = {}): string {
  const c = countryConfig(country);
  return new Date(d).toLocaleDateString(c.dateLocale, { timeZone: c.timeZone, ...opts });
}
export function formatTime(d: Date | string | number, country: unknown, opts: Intl.DateTimeFormatOptions = {}): string {
  const c = countryConfig(country);
  return new Date(d).toLocaleTimeString(c.dateLocale, { timeZone: c.timeZone, hour: "numeric", minute: "2-digit", ...opts });
}
