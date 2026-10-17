import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/validations/auth";
import { touchLastActive } from "@/lib/activity";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        phone: { label: "Phone", type: "text" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        const rawPhone = credentials?.phone as string | undefined;
        const otp = credentials?.otp as string | undefined;

        if (!rawPhone || !otp) return null;
        const phone = normalizePhone(rawPhone);

        // Rate limit login attempts by phone
        const { success } = rateLimit(`login:${phone}`, {
          maxAttempts: 5,
          windowMs: 15 * 60 * 1000, // 15 minutes
        });

        if (!success) return null;

        // Verify OTP in DB: find verified OTP for phone
        // Note: expiresAt is enforced at verification time (verify-otp endpoint),
        // not at sign-in time, to support login→register redirect flow where
        // OTP may have been verified earlier but sign-in happens later.
        const verifiedOtp = await db.otp.findFirst({
          where: {
            phone,
            code: otp,
            verified: true,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!verifiedOtp) return null;

        // Look up user by phone
        const user = await db.user.findUnique({
          where: { phone },
        });

        if (!user) return null;

        // Suspended accounts stay locked out. Deactivated accounts (paused, or inside the
        // 30-day deletion grace period) may sign in: the dashboard sends them to
        // /dashboard/reactivate and every other user API refuses them (requireUser).
        if (user.status === "SUSPENDED") return null;
        await touchLastActive(user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.firstName,
          role: user.role,
          gender: user.gender,
          isVerified: user.isVerified,
        };
      },
    }),
    Credentials({
      id: "admin-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const { success } = rateLimit(`admin-login:${email}`, {
          maxAttempts: 5,
          windowMs: 15 * 60 * 1000,
        });

        if (!success) return null;

        const user = await db.user.findUnique({
          where: { email },
        });

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
      },
    }),
  ],
  session: { strategy: "jwt" },
});

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export const DEACTIVATED_ERROR = "حسابك غير مفعّل. أعد تفعيله للمتابعة";

/**
 * Signed-in user guard for user APIs. Suspended users are always refused; deactivated
 * users too, unless the route is part of the reactivation flow (`allowDeactivated`).
 */
type RequireUserResult =
  | { error: NextResponse }
  | { session: Session & { user: NonNullable<Session["user"]> & { id: string } } };

export async function requireUser(
  options: { allowDeactivated?: boolean } = {},
): Promise<RequireUserResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };
  }
  // A suspension or deactivation takes effect immediately, even for sessions issued before it
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, isDeactivated: true },
  });
  if (user?.status === "SUSPENDED") {
    return { error: NextResponse.json({ error: "تم إيقاف حسابك" }, { status: 403 }) };
  }
  if (user?.isDeactivated && !options.allowDeactivated) {
    return {
      error: NextResponse.json({ error: DEACTIVATED_ERROR, code: "DEACTIVATED" }, { status: 403 }),
    };
  }
  return { session };
}

/**
 * Dashboard guard: whether the signed-in account is suspended (wins over deactivated) or
 * deactivated, read fresh so a change applies to sessions issued before it.
 */
export async function sessionAccountGate(): Promise<"suspended" | "deactivated" | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, isDeactivated: true },
  });
  if (user?.status === "SUSPENDED") return "suspended";
  return user?.isDeactivated ? "deactivated" : null;
}
