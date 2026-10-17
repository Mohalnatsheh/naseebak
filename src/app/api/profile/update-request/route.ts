import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateOfBirthError } from "@/lib/validations/profile";

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { changes, message } = body;

    if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "يرجى تحديد التعديلات المطلوبة" }, { status: 400 });
    }
    if (typeof changes.dateOfBirth === "string" && changes.dateOfBirth) {
      const dobError = dateOfBirthError(changes.dateOfBirth);
      if (dobError) return NextResponse.json({ error: dobError }, { status: 400 });
    }

    // Check if user already has a pending request
    const existing = await db.profileUpdateRequest.findFirst({
      where: { userId: session.user.id, status: "PENDING" },
    });

    if (existing) {
      return NextResponse.json(
        { error: "لديك طلب تعديل قيد المراجعة بالفعل" },
        { status: 409 }
      );
    }

    const updateRequest = await db.profileUpdateRequest.create({
      data: {
        userId: session.user.id,
        changes,
        message: message || null,
      },
    });

    return NextResponse.json({ message: "تم إرسال طلب التعديل بنجاح", request: updateRequest });
  } catch (error: unknown) {
    // Log the detail, never send it to the browser
    console.error("Profile update request error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const requests = await db.profileUpdateRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Profile update request list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
