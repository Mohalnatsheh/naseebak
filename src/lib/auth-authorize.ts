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

export async function authorizeAdminLogin(credentials: Partial<Record<string, unknown>> | undefined) {
  const email = credentials?.email as string | undefined;
  const password = credentials?.password as string | undefined;
  if (!email || !password) return null;

  return guarded(`admin-login:${email.trim().toLowerCase()}`, async () => {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || user.role !== "ADMIN" || !user.passwordHash) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

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
