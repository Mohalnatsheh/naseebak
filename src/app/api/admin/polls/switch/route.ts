import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { POLLS_SETTING, REWARD_SETTING, ROUND_DAYS_SETTING } from "@/lib/engagement/polls";

const bodySchema = z
  .object({
    enabled: z.boolean().optional(),
    roundDays: z.number().int().min(1).max(30).optional(),
    rewardCredits: z.number().int().min(0).max(5).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

/** The switch (visitors + members see the question), days per question, credits per answer */
export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    const { enabled, roundDays, rewardCredits } = parsed.data;
    if (enabled !== undefined) await setSetting(POLLS_SETTING, String(enabled));
    if (roundDays !== undefined) await setSetting(ROUND_DAYS_SETTING, String(roundDays));
    if (rewardCredits !== undefined) await setSetting(REWARD_SETTING, String(rewardCredits));
    return NextResponse.json({ ok: true, ...parsed.data });
  } catch (error) {
    console.error("[admin polls] settings failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
