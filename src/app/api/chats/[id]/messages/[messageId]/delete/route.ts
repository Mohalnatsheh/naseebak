import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { deleteMessage } from "@/lib/chat/delete";
import { introErrorResponse } from "@/lib/intro/http";

const schema = z.object({ scope: z.enum(["me", "everyone"]) });

/**
 * Delete a message (Pro): `{ scope: "me" | "everyone" }` → `{ ok: true }`. «For everyone» only my own message, in an
 * open chat; «for me» in any chat I can read. Nothing is erased, nobody is notified.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id, messageId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const out = await deleteMessage({ conversationId: id, messageId, userId: result.session.user.id, scope: parsed.data.scope });
    return NextResponse.json(out);
  } catch (error) {
    return introErrorResponse(error, "Chat message delete");
  }
}
