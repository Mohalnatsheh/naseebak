import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getMyProState, isAppRequest } from "@/lib/pro/my-state";

/** The signed-in member's Pro state and, while sales are on, the offers of their country */
export async function GET(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  return NextResponse.json(await getMyProState(result.session.user.id, { app: isAppRequest(request) }));
}
