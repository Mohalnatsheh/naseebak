import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { getMatchIntroState, sendIntroRequest } from "@/lib/intro/requests";
import { introErrorResponse } from "@/lib/intro/http";

/** Family / chat introduction state for one match */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    return NextResponse.json(await getMatchIntroState(id, result.session.user.id));
  } catch (error) {
    return introErrorResponse(error, "Match intro state");
  }
}

const sendSchema = z.object({ type: z.enum(["FAMILY", "CHAT"]) });

/** Send a family or chat request (1 credit, never refunded) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = sendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    const sent = await sendIntroRequest({ matchId: id, senderId: result.session.user.id, type: parsed.data.type });
    return NextResponse.json({ message: "تم إرسال الطلب", ...sent });
  } catch (error) {
    return introErrorResponse(error, "Send intro request");
  }
}
