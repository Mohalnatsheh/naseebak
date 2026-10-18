/**
 * Test accounts on a live site. They form their own group: they are only ever suggested to each
 * other, never to real users (and real users never to them), so testing the full cycle never touches
 * real people or their credits. They log in with a fixed code instead of an SMS.
 *
 * Extra test numbers (fixed code + test group) come from the server setting EXTRA_TEST_PHONES,
 * comma separated, any Jordanian format ("0790000777, 962790000778").
 *
 * On production (NODE_ENV=production) only EXTRA_TEST_PHONES count: the built-in and seeded demo
 * numbers are ordinary numbers there (no fixed code, not in the test group), since a real person
 * may own or register one. Local Docker (also a production build) opts back in with
 * ALLOW_BUILTIN_TEST_PHONES=true.
 */
import { normalizePhone } from "@/lib/validations/auth";

/** Fixed login code for test numbers (no SMS is sent) */
export const TEST_OTP = "111111";

/** Built-in numbers that log in with TEST_OTP (development only) */
const FIXED_OTP_PHONES = ["962796922292", "962777000001", "962777000002"];

/** Demo accounts created by prisma/seed.mjs (test group in development only; no fixed code) */
const SEEDED_PHONES = ["962790000002", "962790000003", "962790000004", "962790000005", "962790000006"];

function builtInsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_BUILTIN_TEST_PHONES === "true";
}

function extraPhones(): string[] {
  return (process.env.EXTRA_TEST_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p));
}

/** Logs in with TEST_OTP instead of an SMS */
export function hasFixedOtp(phone: string): boolean {
  if (extraPhones().includes(phone)) return true;
  return builtInsAllowed() && FIXED_OTP_PHONES.includes(phone);
}

/** Every test-group number (international format 962…) */
export function testPhones(): string[] {
  const builtIns = builtInsAllowed() ? [...FIXED_OTP_PHONES, ...SEEDED_PHONES] : [];
  return [...new Set([...builtIns, ...extraPhones()])];
}

export function isTestPhone(phone: string | null | undefined): boolean {
  return !!phone && testPhones().includes(phone);
}
