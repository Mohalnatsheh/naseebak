import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminEndConversation, ModerationError } from "@/lib/admin/moderation";

/** End (freeze) a chat as an admin. Both people are told; message content is never read. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const ended = await adminEndConversation(id, result.session.user.id);
    if (!ended) return NextResponse.json({ error: "This chat is not active" }, { status: 409 });
    return NextResponse.json({ ended: true });
  } catch (error) {
    if (error instanceof ModerationError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Admin end chat error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
