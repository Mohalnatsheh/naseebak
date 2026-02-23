import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { visitId } = await params;

    const feedbacks = await db.visitFeedback.findMany({
      where: { visitId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, gender: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ feedbacks });
  } catch (error) {
    console.error("Admin visit feedback GET error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
