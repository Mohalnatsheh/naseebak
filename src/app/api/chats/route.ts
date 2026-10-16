import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listConversations } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    return NextResponse.json({ conversations: await listConversations(result.session.user.id) });
  } catch (error) {
    return introErrorResponse(error, "List chats");
  }
}
