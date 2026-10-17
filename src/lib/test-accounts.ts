/**
 * Test accounts on a live site. They form their own group: they are only ever suggested to each
 * other, never to real users (and real users never to them), so testing the full cycle never touches
 * real people or their credits. Some of them log in with a fixed code instead of an SMS.
 *
 * Extra test numbers (fixed code + test group) come from the server setting EXTRA_TEST_PHONES,
 * comma separated, any Jordanian format ("0790000777, 962790000778").
 */
import { normalizePhone } from "@/lib/validations/auth";

/** Fixed login code for test numbers (no SMS is sent) */
export const TEST_OTP = "111111";

/** Built-in numbers that log in with TEST_OTP */
const FIXED_OTP_PHONES = ["962796922292", "962777000001", "962777000002"];

/** Demo accounts created by prisma/seed.mjs (part of the test group; most can't use the fixed code) */
const SEEDED_PHONES = ["962790000002", "962790000003", "962790000004", "962790000005", "962790000006"];

function extraPhones(): string[] {
  return (process.env.EXTRA_TEST_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p));
}

/** Logs in with TEST_OTP instead of an SMS */
export function hasFixedOtp(phone: string): boolean {
  return FIXED_OTP_PHONES.includes(phone) || extraPhones().includes(phone);
}

/** Every test-group number (international format 962…) */
export function testPhones(): string[] {
  return [...new Set([...FIXED_OTP_PHONES, ...SEEDED_PHONES, ...extraPhones()])];
}

export function isTestPhone(phone: string | null | undefined): boolean {
  return !!phone && testPhones().includes(phone);
}
