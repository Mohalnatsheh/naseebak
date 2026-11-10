import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getMyProState, isAppRequest } from "@/lib/pro/my-state";

/**
 * The signed-in member's Pro state and, while sales are on, the offers of their country. Read-only, so a paused
 * member may read it too (QA WP2-02 / A-M01: the app's paused screen shows «اشتراكي في Pro»); checkout and resume
 * stay refused while paused.
 */
export async function GET(request: Request) {
  const result = await requireUser({ allowDeactivated: true });
  if ("error" in result) return result.error;
  return NextResponse.json(await getMyProState(result.session.user.id, { app: isAppRequest(request) }));
}
