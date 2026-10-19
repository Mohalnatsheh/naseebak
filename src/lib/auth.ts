import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { authorizeAdminLogin, authorizePhoneLogin } from "@/lib/auth-authorize";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        phone: { label: "Phone", type: "text" },
        otp: { label: "OTP", type: "text" },
      },
      authorize: authorizePhoneLogin,
    }),
    Credentials({
      id: "admin-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeAdminLogin,
    }),
  ],
  session: { strategy: "jwt" },
});

export async function requireAdmin(): Promise<{ error: NextResponse } | { session: Session }> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  // The token's role can be stale: a removed/demoted (or deleted) admin loses access at once
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "ADMIN" || user.status === "SUSPENDED") {
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
  // Deleted account: its token may still be valid, but there is no one to act for
  if (!user) {
    return { error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };
  }
  if (user.status === "SUSPENDED") {
    return { error: NextResponse.json({ error: "تم إيقاف حسابك" }, { status: 403 }) };
  }
  if (user.isDeactivated && !options.allowDeactivated) {
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
