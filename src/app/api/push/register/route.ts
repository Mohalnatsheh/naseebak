import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { playerId } = await request.json();
    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { oneSignalPlayerId: playerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push register error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
