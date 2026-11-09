import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { setReaction } from "@/lib/chat/service";
import { REACTION_EMOJI } from "@/lib/chat/reactions";
import { introErrorResponse } from "@/lib/intro/http";

const schema = z.object({ emoji: z.enum(REACTION_EMOJI).nullable() });

/**
 * React to a message: `{ emoji: "❤️" | "👍" | "😊" | "🤲" | null }` → `{ reactions: [{ emoji, mine }] }`. The same
 * emoji again (or null) removes mine. Open chats only; no push and no unread count.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id, messageId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const out = await setReaction({ conversationId: id, messageId, userId: result.session.user.id, emoji: parsed.data.emoji });
    return NextResponse.json(out);
  } catch (error) {
    return introErrorResponse(error, "Chat reaction");
  }
}
