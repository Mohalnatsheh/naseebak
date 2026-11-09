import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { signalTyping } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";

/**
 * «يكتب الآن…»: the client calls this at most every 3 s while the member types. Nothing is stored; the partner
 * sees it through Ably `typing` or the chat GET's `partnerTyping`. 204, or the chat's refusal (closed, blocked).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    await signalTyping(id, result.session.user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return introErrorResponse(error, "Chat typing");
  }
}
