import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { FollowUpError, setMatchOutcome } from "@/lib/intro/followup";
import { getMatchIntroState } from "@/lib/intro/requests";
import { introErrorResponse } from "@/lib/intro/http";

const schema = z.object({ outcome: z.enum(["CONTINUING", "NOT_A_MATCH", "ENGAGED"]) });

/** «ما زلنا نتعارف» / «تمت الخطبة» / «لم يحصل نصيب» on a match; returns the new intro state */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    const userId = result.session.user.id;
    await setMatchOutcome({ matchId: id, userId, outcome: parsed.data.outcome });
    return NextResponse.json(await getMatchIntroState(id, userId));
  } catch (error) {
    if (error instanceof FollowUpError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    }
    return introErrorResponse(error, "Match outcome");
  }
}
