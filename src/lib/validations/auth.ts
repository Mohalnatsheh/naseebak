import { z } from "zod/v4";

// Matches all Jordanian mobile formats:
// 07[789]XXXXXXX, 7[789]XXXXXXX, 9627[789]XXXXXXX, +9627[789]XXXXXXX, 009627[789]XXXXXXX
export const jordanPhoneRegex = /^(?:00962|0?0?\+?962|0)?7[789]\d{7}$/;

const phoneSchema = z.string().regex(jordanPhoneRegex, "رقم الهاتف غير صالح. الصيغ المقبولة: 07X, 7X, 9627X, +9627X, 009627X");

/**
 * Normalize any valid Jordanian phone format to 962XXXXXXXXX (international)
 * Call this before sending to the API.
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
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
  code: z.string().length(6, "رمز التحقق يجب أن يكون 6 أرقام"),
});

const arabicNameRegex = /^[\u0600-\u06FF\s]+$/;

export const registerSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").regex(arabicNameRegex, "الاسم الأول يجب أن يكون بالعربية فقط"),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").regex(arabicNameRegex, "اسم العائلة يجب أن يكون بالعربية فقط"),
  phone: phoneSchema,
  gender: z.enum(["MALE", "FEMALE"]),
  otp: z.string().length(6, "رمز التحقق يجب أن يكون 6 أرقام"),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, "رمز التحقق يجب أن يكون 6 أرقام"),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
