import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { markRead } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { upTo?: unknown } | null;
    const upTo = typeof body?.upTo === "string" ? body.upTo : undefined;
    return NextResponse.json({ marked: await markRead(id, result.session.user.id, upTo) });
  } catch (error) {
    return introErrorResponse(error, "Mark chat read");
  }
}
