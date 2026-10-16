import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { sendMessage } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";

const schema = z.object({ body: z.string().max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const message = await sendMessage({ conversationId: id, senderId: result.session.user.id, body: parsed.data.body });
    return NextResponse.json({ message });
  } catch (error) {
    return introErrorResponse(error, "Send chat message");
  }
}
