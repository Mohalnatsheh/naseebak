import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelPendingBetween } from "@/lib/matches/state";
import { publishChatEvent } from "@/lib/ably";
import { closeSuggestionsBetween } from "@/lib/suggestions/mutual";
import { endPausedChats } from "@/lib/reports";

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const blocks = await db.block.findMany({
      where: { blockerId: session.user.id },
      include: {
        blocked: {
          select: { id: true, firstName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("Blocks list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

const blockSchema = z.object({ blockedId: z.string().min(1).max(64) });

/**
 * Block someone. Closes any match with them for both sides (hidden for them, a closed card for
 * me) and cancels pending intro requests between the two (credits are never refunded).
 */
export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const parsed = blockSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "البيانات غير مكتملة" }, { status: 400 });
    }
    const { blockedId } = parsed.data;

    if (blockedId === session.user.id) {
      return NextResponse.json({ error: "لا يمكنك حظر نفسك" }, { status: 400 });
    }

    const target = await db.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    // Check for existing block
    const existing = await db.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: session.user.id,
          blockedId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "هذا المستخدم محظور مسبقاً" }, { status: 409 });
    }

    const block = await db.block.create({
      data: {
        blockerId: session.user.id,
        blockedId,
      },
    });
    await cancelPendingBetween(session.user.id, blockedId);
    // A block ends their open chat for good (unblocking later doesn't silently reopen it)
    const open = await db.conversation.findMany({
      where: {
        status: "ACTIVE",
        match: {
          OR: [
            { femaleId: session.user.id, maleId: blockedId },
            { femaleId: blockedId, maleId: session.user.id },
          ],
        },
      },
      select: { id: true },
    });
    for (const c of open) {
      await db.conversation.update({ where: { id: c.id }, data: { status: "ENDED", endedById: session.user.id, endedAt: new Date() } });
      await publishChatEvent(c.id, "status", { status: "ENDED" }).catch(() => {});
    }
    // A chat paused for a report review ends for good too (a later review must not reopen it)
    await endPausedChats(
      {
        OR: [
          { femaleId: session.user.id, maleId: blockedId },
          { femaleId: blockedId, maleId: session.user.id },
        ],
      },
      { endedById: session.user.id },
    );
    await closeSuggestionsBetween(session.user.id, blockedId).catch((e) => console.error("Close suggestions on block:", e));

    return NextResponse.json({ message: "تم حظر المستخدم بنجاح", block });
  } catch (error) {
    console.error("Block error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
