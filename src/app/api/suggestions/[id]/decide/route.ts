import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { introErrorResponse } from "@/lib/intro/http";
import { decideSuggestion } from "@/lib/suggestions/mutual";

const schema = z.object({
  interested: z.boolean(),
  introPreference: z.enum(["CHAT", "FAMILY"]).optional(),
  guardianConsent: z.boolean().optional(),
});

/**
 * "مهتم" / "لا" on a simultaneous suggestion. Works even after the switch is turned off, so nothing in flight is lost.
 * With `credit_on_interest` on, "مهتم" costs 1 credit and needs `introPreference` (FAMILY: guardian consent).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const { id } = await params;
    const res = await decideSuggestion({ suggestionId: id, userId: result.session.user.id, ...parsed.data });
    return NextResponse.json(res);
  } catch (error) {
    return introErrorResponse(error, "Decide suggestion");
  }
}
