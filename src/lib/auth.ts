import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";

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
        const phone = credentials?.phone as string | undefined;
        const otp = credentials?.otp as string | undefined;

        if (!phone || !otp) return null;

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

        // Check if account is suspended or deactivated
        if (user.status === "SUSPENDED") return null;
        if (user.isDeactivated) return null;

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
