import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { respondToIntroRequest } from "@/lib/intro/requests";
import { introErrorResponse } from "@/lib/intro/http";

const respondSchema = z.object({ accept: z.boolean(), consent: z.boolean().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = respondSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    const res = await respondToIntroRequest({ requestId: id, userId: result.session.user.id, ...parsed.data });
    return NextResponse.json({
      message: res.status === "ACCEPTED" ? "تم قبول الطلب" : "تم الرد على الطلب",
      ...res,
    });
  } catch (error) {
    return introErrorResponse(error, "Respond intro request");
  }
}
