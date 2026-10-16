import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { ModerationError, setSuspended } from "@/lib/admin/moderation";

const bodySchema = z.object({
  action: z.enum(["suspend", "unsuspend"]),
  userIds: z.array(z.string().min(1)).min(1).max(100),
});

/** Suspend or unsuspend several users at once. Admins and unknown ids are skipped and reported. */
export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request: action and userIds are required" }, { status: 400 });
    }
    const { action, userIds } = parsed.data;
    const suspend = action === "suspend";

    let changed = 0;
    let unchanged = 0;
    const failed: { userId: string; error: string }[] = [];
    for (const userId of [...new Set(userIds)]) {
      try {
        const res = await setSuspended(userId, suspend, session.user.id);
        if (res.changed) changed++;
        else unchanged++;
      } catch (error) {
        if (error instanceof ModerationError) {
          failed.push({ userId, error: error.message });
        } else {
          console.error("Bulk suspend error for", userId, error);
          failed.push({ userId, error: "Server error" });
        }
      }
    }

    return NextResponse.json({ action, changed, unchanged, failed });
  } catch (error) {
    console.error("Admin bulk suspend error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
