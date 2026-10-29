/**
 * Mobile app sign-in (Bearer tokens). The web keeps NextAuth's cookie; a native app can't use that cookie safely, so
 * after the same phone + verified-code check (`authorizePhoneLogin`) it gets a random token. Only its SHA-256 is
 * stored (`mobile_sessions`), it expires after MOBILE_TOKEN_DAYS, and logout revokes it. Members only: a token never
 * belongs to an admin, and admin routes (`requireAdmin`) never accept one.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Session } from "next-auth";
import { db } from "@/lib/db";

export const MOBILE_TOKEN_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;
/** lastUsedAt is written at most this often (a busy app polls every few seconds) */
const TOUCH_EVERY_MS = 10 * 60 * 1000;
const PREFIX = "nsb_";

export function hashMobileToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(authorization: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "");
  return m && m[1].startsWith(PREFIX) ? m[1] : null;
}

export async function createMobileSession(userId: string, device?: string | null, now = new Date()) {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + MOBILE_TOKEN_DAYS * DAY);
  await db.mobileSession.create({
    data: { userId, tokenHash: hashMobileToken(token), device: device?.slice(0, 120) || null, expiresAt, lastUsedAt: now },
  });
  return { token, expiresAt };
}

/** The member a valid Bearer token belongs to, shaped like NextAuth's session (null when missing, wrong or expired) */
export async function sessionFromBearer(authorization: string | null | undefined, now = new Date()): Promise<Session | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const row = await db.mobileSession.findUnique({
    where: { tokenHash: hashMobileToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, email: true, firstName: true, role: true, gender: true, isVerified: true } },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= now || row.user.role !== "USER") return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.mobileSession.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => {});
  }
  const u = row.user;
  return {
    user: { id: u.id, email: u.email, name: u.firstName, role: u.role, gender: u.gender, isVerified: u.isVerified },
    expires: row.expiresAt.toISOString(),
  } as Session;
}

/** Logout: the token stops working at once */
export async function revokeMobileToken(token: string, now = new Date()): Promise<boolean> {
  const { count } = await db.mobileSession.updateMany({
    where: { tokenHash: hashMobileToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
  return count > 0;
}

/** Every app session of a member (account deletion, suspension, "sign out everywhere") */
export async function revokeAllMobileSessions(userId: string, now = new Date()): Promise<number> {
  const { count } = await db.mobileSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  return count;
}
