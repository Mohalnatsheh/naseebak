import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { blockedId } = body;

    if (!blockedId) {
      return NextResponse.json({ error: "البيانات غير مكتملة" }, { status: 400 });
    }

    if (blockedId === session.user.id) {
      return NextResponse.json({ error: "لا يمكنك حظر نفسك" }, { status: 400 });
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

    return NextResponse.json({ message: "تم حظر المستخدم بنجاح", block });
  } catch (error) {
    console.error("Block error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
