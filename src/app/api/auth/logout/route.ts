import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeWebSessions } from "@/lib/session-revocation";

/**
 * Website sign-out, server half (QA WA-01): revokes this member's web sessions, so a request still in flight can't
 * sign them back in with a refreshed cookie. The client then calls NextAuth's signOut() (signOutAndUnlinkPush).
 * Web cookie only: the app's Bearer sessions are signed out through /api/mobile/auth.
 */
export async function POST() {
  try {
    const session = await auth();
    if (session?.user?.id) await revokeWebSessions(session.user.id);
  } catch (error) {
    // Sign-out still goes ahead in the browser; the cookie is cleared there
    console.error("Logout revoke error:", error);
  }
  return NextResponse.json({ message: "تم تسجيل الخروج بنجاح" });
}
