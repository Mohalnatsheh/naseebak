import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMyProState, isAppRequest } from "@/lib/pro/my-state";

/**
 * The signed-in member's Pro state and, while sales are on, the offers of their country. Read-only, so a paused
 * member may read it too (QA WP2-02 / A-M01: the app's paused screen shows «اشتراكي في Pro»); checkout and resume
 * stay refused while paused, so a paused member gets `canBuy: false` and no offers (review X1).
 */
export async function GET(request: Request) {
  const result = await requireUser({ allowDeactivated: true });
  if ("error" in result) return result.error;
  const userId = result.session.user.id;
  const [state, me] = await Promise.all([
    getMyProState(userId, { app: isAppRequest(request) }),
    db.user.findUnique({ where: { id: userId }, select: { isDeactivated: true } }),
  ]);
  return NextResponse.json(me?.isDeactivated ? { ...state, canBuy: false, offers: [] } : state);
}
