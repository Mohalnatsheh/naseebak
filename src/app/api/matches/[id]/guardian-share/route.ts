import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { shareGuardianForMatch } from "@/lib/intro/requests";
import { introErrorResponse } from "@/lib/intro/http";

const shareSchema = z.object({ consent: z.literal(true).optional() });

/** Share my guardian contact on this match (credit_on_interest matches); returns the new intro state */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = shareSchema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    const state = await shareGuardianForMatch({
      matchId: id,
      userId: result.session.user.id,
      consent: parsed.data.consent,
    });
    return NextResponse.json(state);
  } catch (error) {
    return introErrorResponse(error, "Guardian share");
  }
}
