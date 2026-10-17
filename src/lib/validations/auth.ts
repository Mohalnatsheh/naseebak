import { z } from "zod/v4";
import { toLatinDigits } from "@/lib/digits";

// Matches all Jordanian mobile formats:
// 07[789]XXXXXXX, 7[789]XXXXXXX, 9627[789]XXXXXXX, +9627[789]XXXXXXX, 009627[789]XXXXXXX
export const jordanPhoneRegex = /^(?:00962|0?0?\+?962|0)?7[789]\d{7}$/;

// Arabic-Indic / Persian digits are accepted and converted first (Arabic keyboards)
const phoneSchema = z
  .string()
  .transform((v) => toLatinDigits(v).replace(/[\s\-()]/g, ""))
  .pipe(z.string().regex(jordanPhoneRegex, "رقم الهاتف غير صالح. الصيغ المقبولة: 07X, 7X, 9627X, +9627X, 009627X"));

const otpCodeSchema = z
  .string()
  .transform((v) => toLatinDigits(v).trim())
  .pipe(z.string().regex(/^\d{6}$/, "رمز التحقق يجب أن يكون 6 أرقام"));

/**
 * Normalize any valid Jordanian phone format to 962XXXXXXXXX (international)
 * Call this before sending to the API.
 */
export function normalizePhone(phone: string): string {
  const cleaned = toLatinDigits(phone).replace(/[\s\-()]/g, "");
  // Remove leading 00962, +962, 962, or 0
  const normalized = cleaned.replace(/^(?:00962|\+962|962|0)/, "");
  // normalized should now be 7[789]XXXXXXX (9 digits)
  return `962${normalized}`;
}

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

const arabicNameRegex = /^[\u0600-\u06FF\s]+$/;

export const registerSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").regex(arabicNameRegex, "الاسم الأول يجب أن يكون بالعربية فقط"),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").regex(arabicNameRegex, "اسم العائلة يجب أن يكون بالعربية فقط"),
  phone: phoneSchema,
  gender: z.enum(["MALE", "FEMALE"]),
  otp: otpCodeSchema,
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
