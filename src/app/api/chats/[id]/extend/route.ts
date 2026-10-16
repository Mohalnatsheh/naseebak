import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { extendConversation } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    return NextResponse.json({ conversation: await extendConversation(id, result.session.user.id) });
  } catch (error) {
    return introErrorResponse(error, "Extend chat");
  }
}
