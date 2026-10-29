import { z } from "zod/v4";
import { toLatinDigits } from "@/lib/digits";
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from "@/lib/countries";

// Jordanian mobile formats: 07[789]XXXXXXX, 7[789]XXXXXXX, 9627[789]XXXXXXX, +9627[789]XXXXXXX, 009627[789]XXXXXXX
export const jordanPhoneRegex = /^(?:00962|0?0?\+?962|0)?7[789]\d{7}$/;
// Saudi mobile formats: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX
export const saudiPhoneRegex = /^(?:00966|\+966|966|0)?5\d{8}$/;

const PHONE_REGEX: Record<CountryCode, RegExp> = { JO: jordanPhoneRegex, SA: saudiPhoneRegex };

function cleanPhone(v: string): string {
  return toLatinDigits(v).replace(/[\s\-()]/g, "");
}

/** Valid mobile of `country` (any of its formats), or of any served country when none is given */
export function isValidPhone(v: string, country?: CountryCode): boolean {
  const cleaned = cleanPhone(v);
  return (country ? [country] : COUNTRY_CODES).some((c) => PHONE_REGEX[c].test(cleaned));
}

/**
 * The country a typed number belongs to: by its international prefix, else by its local shape
 * (7[789]… = Jordan, 5… = Saudi Arabia), else `fallback`.
 */
export function phoneInputCountry(v: string, fallback?: CountryCode): CountryCode | null {
  const cleaned = cleanPhone(v);
  for (const c of COUNTRY_CODES) {
    const dial = COUNTRIES[c].dialCode;
    if (cleaned.startsWith(`00${dial}`) || cleaned.startsWith(`+${dial}`) || (cleaned.startsWith(dial) && cleaned.length > 10)) return c;
  }
  for (const c of COUNTRY_CODES) if (PHONE_REGEX[c].test(cleaned)) return c;
  return fallback ?? null;
}

// Arabic-Indic / Persian digits are accepted and converted first (Arabic keyboards)
const phoneSchema = z
  .string()
  .transform((v) => cleanPhone(v))
  .pipe(z.string().refine((v) => isValidPhone(v), "رقم الهاتف غير صالح. أدخل رقماً أردنياً (07…) أو سعودياً (05…)"));

const otpCodeSchema = z
  .string()
  .transform((v) => toLatinDigits(v).trim())
  .pipe(z.string().regex(/^\d{6}$/, "رمز التحقق يجب أن يكون 6 أرقام"));

/**
 * Normalize any valid Jordanian or Saudi mobile to its international form (962… / 966…).
 * The country comes from the number itself; `country` only decides a number that fits neither.
 */
export function normalizePhone(phone: string, country?: CountryCode): string {
  const cleaned = cleanPhone(phone);
  const c = phoneInputCountry(cleaned, country) ?? "JO";
  const dial = COUNTRIES[c].dialCode;
  const national = cleaned.replace(new RegExp(`^(?:00${dial}|\\+${dial}|${dial}|0)`), "");
  return `${dial}${national}`;
}

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

const arabicNameRegex = /^[\u0600-\u06FF\s]+$/;
/** Longest first / family name accepted at sign-up */
export const NAME_MAX_LENGTH = 40;

/** Arabic letters only (no spaces, digits or punctuation from the Arabic block). */
export function arabicLetterCount(v: string): number {
  return (v.match(/[\u0621-\u064A\u0671-\u06D3]/g) ?? []).length;
}

/** Trimmed, inner spaces collapsed, Arabic only, at least 2 letters, at most NAME_MAX_LENGTH chars. */
function arabicNameField(label: string) {
  return z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .max(NAME_MAX_LENGTH, `${label} طويل جداً (${NAME_MAX_LENGTH} حرفاً كحد أقصى)`)
        .regex(arabicNameRegex, `${label} يجب أن يكون بالعربية فقط`)
        .refine((v) => arabicLetterCount(v) >= 2, `${label} يجب أن يكون حرفين على الأقل`),
    );
}

export const TERMS_REQUIRED_MESSAGE = "يرجى الموافقة على الشروط وسياسة الخصوصية وتأكيد أن عمرك 18 سنة أو أكثر";

export const registerSchema = z.object({
  firstName: arabicNameField("الاسم الأول"),
  lastName: arabicNameField("اسم العائلة"),
  phone: phoneSchema,
  gender: z.enum(["MALE", "FEMALE"]),
  otp: otpCodeSchema,
  // One required tick: terms + privacy policy + "I am 18 or older"; the time is stored on the user
  termsAccepted: z.literal(true, { message: TERMS_REQUIRED_MESSAGE }),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  otp: otpCodeSchema,
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * A verified code may finish sign-in / registration for this long after it was sent
 * (covers the login → register hand-off and filling in the form). Sign-in then uses it up.
 */
export const VERIFIED_OTP_WINDOW_MS = 30 * 60 * 1000;
