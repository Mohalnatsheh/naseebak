/**
 * Per-number fixed login codes for real members (NOT test accounts).
 *
 * Unlike EXTRA_TEST_PHONES (which puts a number in the isolated test group and uses TEST_OTP),
 * a number listed here keeps every normal-member behaviour — real suggestions, matches, payments —
 * but logs in with a chosen code and no SMS/WhatsApp is sent.
 *
 * Server setting FIXED_OTP_OVERRIDES: comma-separated "phone:code" pairs, phone in any accepted
 * Jordanian/Saudi/Lebanese format ("9613000777:123456, 0790000777:654321"). Empty by default, so
 * nothing changes for anyone else. Real numbers live only in the server .env, never in the repo.
 */
import { normalizePhone } from "@/lib/phone";

function overrides(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (process.env.FIXED_OTP_OVERRIDES ?? "").split(",")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const rawPhone = pair.slice(0, idx).trim();
    const code = pair.slice(idx + 1).trim();
    if (!rawPhone || !code) continue;
    map.set(normalizePhone(rawPhone), code);
  }
  return map;
}

/** The fixed login code for this number, or null. When set, the SMS is skipped and the number stays a normal member. */
export function fixedOtpOverride(phone: string): string | null {
  return overrides().get(normalizePhone(phone)) ?? null;
}
