import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const doc = await db.identityDoc.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        documentType: true,
        status: true,
        rejectionReason: true,
        reviewNotes: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ doc });
  } catch (error) {
    console.error("Identity status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
