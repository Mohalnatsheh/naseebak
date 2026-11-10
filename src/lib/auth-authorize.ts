/**
 * The two `authorize` callbacks of src/lib/auth.ts, kept apart so they can be tested without
 * NextAuth. Sign-in limits count failed attempts only (5 per 15 minutes, in Postgres so they
 * survive deploys); a member who keeps signing in successfully is never locked out.
 */
import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { db } from "@/lib/db";
import { rateLimitDb, rateLimitDbBlocked } from "@/lib/rate-limit-db";
import { normalizePhone, VERIFIED_OTP_WINDOW_MS } from "@/lib/validations/auth";
import { toLatinDigits } from "@/lib/digits";
import { touchLastActive } from "@/lib/activity";
import { RATE_LIMITED_CODE } from "@/lib/login-limit";
import { clientIp } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/admin-alert";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Thrown from `authorize`: signIn() then answers with code "rate_limited:<minutes>" */
export function loginRateLimited(resetAt: number, now = Date.now()): CredentialsSignin {
  const error = new CredentialsSignin();
  const minutes = Math.max(1, Math.ceil((resetAt - now) / 60_000));
  error.code = `${RATE_LIMITED_CODE}:${minutes}`;
  return error;
}

async function guarded<T>(key: string, attempt: () => Promise<T | null>): Promise<T | null> {
  const { blocked, resetAt } = await rateLimitDbBlocked(key, LOGIN_MAX_FAILURES);
  if (blocked) throw loginRateLimited(resetAt);
  const result = await attempt();
  if (!result) await rateLimitDb(key, { maxAttempts: LOGIN_MAX_FAILURES, windowMs: LOGIN_WINDOW_MS });
  return result;
}

export async function authorizePhoneLogin(credentials: Partial<Record<string, unknown>> | undefined) {
  const rawPhone = credentials?.phone as string | undefined;
  const rawOtp = credentials?.otp as string | undefined;
  if (!rawPhone || !rawOtp) return null;
  // Arabic-keyboard digits (٠-٩) are the same code
  const otp = toLatinDigits(rawOtp).trim();
  const phone = normalizePhone(rawPhone);

  return guarded(`login:${phone}`, async () => {
    // A code verified by /api/auth/verify-otp, sent within the last 30 minutes (the login →
    // register hand-off needs more than the 5-minute entry window). Used up on success below.
    const verifiedOtp = await db.otp.findFirst({
      where: {
        phone,
        code: otp,
        verified: true,
        createdAt: { gt: new Date(Date.now() - VERIFIED_OTP_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!verifiedOtp) return null;

    const user = await db.user.findUnique({ where: { phone } });
    if (!user) return null;

    // Suspended accounts stay locked out. Deactivated accounts (paused, or inside the
    // 30-day deletion grace period) may sign in: the dashboard sends them to
    // /dashboard/reactivate and every other user API refuses them (requireUser).
    if (user.status === "SUSPENDED") return null;
    // Single use: the code can't sign anyone in again
    await db.otp.deleteMany({ where: { phone, verified: true } });
    await touchLastActive(user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.firstName,
      role: user.role,
      gender: user.gender,
      isVerified: user.isVerified,
    };
  });
}

/**
 * Admin sign-in limits (QA ADM-07, 2026-11-11). Only two buckets can refuse a sign-in, so a stranger can't lock the
 * real admin out from other addresses, and one address can't try many accounts:
 * - email + IP: 5 failures per 15 minutes (the usual typo limit, only for that address);
 * - IP: 20 failures per 15 minutes, whatever email.
 * Failures on one email from every address (50 per 15 minutes) never refuse a correct password (review X1): they only
 * email the admins once per window, a sign of a spread-out attack.
 */
export const ADMIN_EMAIL_IP_MAX_FAILURES = LOGIN_MAX_FAILURES;
export const ADMIN_IP_MAX_FAILURES = 20;
export const ADMIN_EMAIL_ALERT_FAILURES = 50;

/** The buckets that refuse a sign-in */
export function adminLoginBuckets(email: string, ip: string): { key: string; max: number }[] {
  return [
    { key: `admin-login:${email}:${ip}`, max: ADMIN_EMAIL_IP_MAX_FAILURES },
    { key: `admin-login-ip:${ip}`, max: ADMIN_IP_MAX_FAILURES },
  ];
}

/** Emails the admins were told about, until when (one alert per window and email; one process) */
const alertedUntil = new Map<string, number>();

async function countEmailWideFailure(email: string): Promise<void> {
  const { success, resetAt } = await rateLimitDb(`admin-login:${email}`, {
    maxAttempts: ADMIN_EMAIL_ALERT_FAILURES,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (success || (alertedUntil.get(email) ?? 0) > Date.now()) return;
  alertedUntil.set(email, resetAt);
  await sendAdminAlert(
    "Many failed admin sign-ins",
    `More than ${ADMIN_EMAIL_ALERT_FAILURES} failed admin sign-ins for ${email} in 15 minutes, from several addresses. ` +
      "Each address is limited on its own; the right password still signs in. Consider changing that admin's password.",
  ).catch((e) => console.error("[admin-login] alert failed", e));
}

export async function authorizeAdminLogin(
  credentials: Partial<Record<string, unknown>> | undefined,
  request?: Request,
) {
  const rawEmail = credentials?.email;
  const password = credentials?.password;
  if (typeof rawEmail !== "string" || typeof password !== "string" || !rawEmail.trim() || !password) return null;
  const email = rawEmail.trim().toLowerCase();
  const ip = request ? clientIp(request) : "unknown";
  const buckets = adminLoginBuckets(email, ip);

  for (const bucket of buckets) {
    const { blocked, resetAt } = await rateLimitDbBlocked(bucket.key, bucket.max);
    if (blocked) throw loginRateLimited(resetAt);
  }

  // Stored emails may carry capitals from before lowercasing: match without case
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, role: "ADMIN" },
  });
  const isValid = !!user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !isValid) {
    for (const bucket of buckets) {
      await rateLimitDb(bucket.key, { maxAttempts: bucket.max, windowMs: LOGIN_WINDOW_MS });
    }
    await countEmailWideFailure(email);
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.firstName,
    role: user.role,
    gender: user.gender,
    isVerified: user.isVerified,
  };
}
