// Who is voting: a signed-in member (role USER) votes as themselves; anyone else votes as a visitor browser,
// identified by a random first-party cookie (only its hash is stored).
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTestPhone } from "@/lib/test-accounts";
import { visitorKeyOf } from "@/lib/engagement/polls";

export const VISITOR_COOKIE = "nsb_pv";
const YEAR = 60 * 60 * 24 * 365;

export type Voter =
  | { kind: "member"; userId: string; gender: "MALE" | "FEMALE" | null; test: boolean }
  | { kind: "visitor"; visitorKey: string | null }
  | { kind: "blocked" };

/** `createCookie`: give a new visitor a cookie (only when they vote) */
export async function resolveVoter({ createCookie = false } = {}): Promise<Voter> {
  const session = await auth().catch(() => null);
  if (session?.user?.id && session.user.role === "USER") {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { status: true, isDeactivated: true, gender: true, phone: true },
    });
    if (user) {
      if (user.status === "SUSPENDED" || user.isDeactivated) return { kind: "blocked" };
      return { kind: "member", userId: session.user.id, gender: user.gender ?? null, test: isTestPhone(user.phone) };
    }
  }
  const jar = await cookies();
  let value = jar.get(VISITOR_COOKIE)?.value ?? null;
  if (!value && createCookie) {
    value = randomBytes(16).toString("hex");
    jar.set(VISITOR_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: YEAR,
      path: "/",
    });
  }
  return { kind: "visitor", visitorKey: value ? visitorKeyOf(value) : null };
}
