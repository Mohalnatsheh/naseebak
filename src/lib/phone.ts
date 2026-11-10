/**
 * Phone numbers and sign-up name rules without zod (QA WA-10): client pages (login, sign-up, the landing page's quick
 * start, guardian forms) import from here, so the zod chunk never loads on public pages.
 * src/lib/validations/auth.ts re-exports all of it for the server schemas.
 */
import { toLatinDigits } from "@/lib/digits";
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from "@/lib/countries";

// Jordanian mobile formats: 07[789]XXXXXXX, 7[789]XXXXXXX, 9627[789]XXXXXXX, +9627[789]XXXXXXX, 009627[789]XXXXXXX
export const jordanPhoneRegex = /^(?:00962|0?0?\+?962|0)?7[789]\d{7}$/;
// Saudi mobile formats: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX
export const saudiPhoneRegex = /^(?:00966|\+966|966|0)?5\d{8}$/;

// Lebanese mobile formats: 03XXXXXX, 3XXXXXX, 7[01689]XXXXXX, 81XXXXXX (no trunk 0 on the 7x / 81 forms), 961…, +961…, 00961…
export const lebanonPhoneRegex = /^(?:00961|\+961|961|0)?(?:3\d{6}|7[01689]\d{6}|81\d{6})$/;

const PHONE_REGEX: Record<CountryCode, RegExp> = { JO: jordanPhoneRegex, SA: saudiPhoneRegex, LB: lebanonPhoneRegex };

export function cleanPhone(v: string): string {
  return toLatinDigits(v).replace(/[\s\-()]/g, "");
}

/** Valid mobile of `country` (any of its formats), or of any served country when none is given */
export function isValidPhone(v: string, country?: CountryCode): boolean {
  const cleaned = cleanPhone(v);
  return (country ? [country] : COUNTRY_CODES).some((c) => PHONE_REGEX[c].test(cleaned));
}

/**
 * The country a typed number belongs to: by its international prefix, else by its local shape
 * (7[789]XXXXXXX = Jordan, 5… = Saudi Arabia, 3… / 7[01689]… / 81… with 7 or 8 digits = Lebanon), else `fallback`.
 */
export function phoneInputCountry(v: string, fallback?: CountryCode): CountryCode | null {
  const cleaned = cleanPhone(v);
  for (const c of COUNTRY_CODES) {
    const dial = COUNTRIES[c].dialCode;
    if (cleaned.startsWith(`00${dial}`) || cleaned.startsWith(`+${dial}`) || (cleaned.startsWith(dial) && cleaned.length >= dial.length + 7)) return c;
  }
  for (const c of COUNTRY_CODES) if (PHONE_REGEX[c].test(cleaned)) return c;
  return fallback ?? null;
}

/**
 * Normalize any valid Jordanian, Saudi or Lebanese mobile to its international form (962… / 966… / 961…).
 * The country comes from the number itself; `country` only decides a number that fits neither.
 */
export function normalizePhone(phone: string, country?: CountryCode): string {
  const cleaned = cleanPhone(phone);
  const c = phoneInputCountry(cleaned, country) ?? "JO";
  const dial = COUNTRIES[c].dialCode;
  const national = cleaned.replace(new RegExp(`^(?:00${dial}|\\+${dial}|${dial}|0)`), "");
  return `${dial}${national}`;
}

/**
 * The number as a member types it at home (07XXXXXXXX / 05XXXXXXXX / 03XXXXXX or 71XXXXXX in Lebanon), from any
 * accepted format including the international one (9627…), e.g. to fill a phone field next to its +962 / +966 / +961
 * dial code (QA WA-07).
 */
export function localPhone(phone: string, country?: CountryCode): string {
  const intl = normalizePhone(phone, country);
  const c = phoneInputCountry(intl, country) ?? "JO";
  const national = intl.slice(COUNTRIES[c].dialCode.length);
  // Lebanon writes the trunk 0 only before 3XXXXXX (Touch / alfa 03, 3x): 7x and 81 numbers have none
  return COUNTRIES[c].phone.trunkZero === "if3" && !national.startsWith("3") ? national : `0${national}`;
}

/** Arabic letters and spaces; digits of any kind (٣, ۳, 3) are refused (QA WA-12) */
export const arabicNameRegex = /^(?:(?![\u0660-\u0669\u06F0-\u06F9])[\u0600-\u06FF\s])+$/;

/** A sign-up name as the server accepts it: Arabic only (no digits), at least 2 letters */
export function isArabicName(v: string): boolean {
  const t = v.replace(/\s+/g, " ").trim();
  return arabicNameRegex.test(t) && arabicLetterCount(t) >= 2;
}
/** Longest first / family name accepted at sign-up */
export const NAME_MAX_LENGTH = 40;

/** Arabic letters only (no spaces, digits or punctuation from the Arabic block). */
export function arabicLetterCount(v: string): number {
  return (v.match(/[\u0621-\u064A\u0671-\u06D3]/g) ?? []).length;
}

export const TERMS_REQUIRED_MESSAGE = "يرجى الموافقة على الشروط وسياسة الخصوصية وتأكيد أن عمرك 18 سنة أو أكثر";
