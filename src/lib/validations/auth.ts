import { z } from "zod/v4";
import { toLatinDigits } from "@/lib/digits";
import { arabicLetterCount, arabicNameRegex, cleanPhone, isValidPhone, NAME_MAX_LENGTH, TERMS_REQUIRED_MESSAGE } from "@/lib/phone";

// Phone and name helpers live in the zod-free src/lib/phone.ts (client pages import them from there)
export {
  arabicLetterCount, cleanPhone, isValidPhone, jordanPhoneRegex, localPhone, NAME_MAX_LENGTH, normalizePhone,
  phoneInputCountry, saudiPhoneRegex, TERMS_REQUIRED_MESSAGE,
} from "@/lib/phone";

// Arabic-Indic / Persian digits are accepted and converted first (Arabic keyboards)
const phoneSchema = z
  .string()
  .transform((v) => cleanPhone(v))
  .pipe(z.string().refine((v) => isValidPhone(v), "الرقم غير صالح. تحقّق منه وحاول مرة أخرى."));

const otpCodeSchema = z
  .string()
  .transform((v) => toLatinDigits(v).trim())
  .pipe(z.string().regex(/^\d{6}$/, "رمز التحقق يجب أن يكون 6 أرقام"));

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

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

/** A member's name, the same rule as sign-up (Admin → member → Edit name) */
export const memberNameSchema = z.object({
  firstName: arabicNameField("الاسم الأول"),
  lastName: arabicNameField("اسم العائلة"),
});


export const registerSchema = z.object({
  firstName: arabicNameField("الاسم الأول"),
  lastName: arabicNameField("اسم العائلة"),
  phone: phoneSchema,
  gender: z.enum(["MALE", "FEMALE"]),
  otp: otpCodeSchema,
  // One required tick: terms + privacy policy + "I am 18 or older"; the time is stored on the user
  termsAccepted: z.literal(true, { message: TERMS_REQUIRED_MESSAGE }),
  // Optional: the country the member picked (app / dial-code switch); it must be the number's country
  country: z.string().length(2).optional(),
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
