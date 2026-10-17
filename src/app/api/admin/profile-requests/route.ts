import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { buildProfileUpdate } from "@/lib/admin/profile-changes";
import { safePagination } from "@/lib/admin/query";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { page, pageSize, skip } = safePagination(new URL(request.url).searchParams, 20);
    const where = { status: "PENDING" as const };

    const [requests, total] = await Promise.all([
      db.profileUpdateRequest.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true, firstName: true, lastName: true, gender: true,
              profile: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.profileUpdateRequest.count({ where }),
    ]);

    return NextResponse.json({ requests, total, page, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error("Admin profile requests error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const { requestId, action, adminNote } = body;

    if (!requestId || typeof requestId !== "string" || !["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const updateRequest = await db.profileUpdateRequest.findUnique({
      where: { id: requestId },
    });

    if (!updateRequest || updateRequest.status !== "PENDING") {
      return NextResponse.json({ error: "الطلب غير موجود أو تمت مراجعته" }, { status: 404 });
    }

    const note = typeof adminNote === "string" && adminNote.trim() ? adminNote.trim() : null;
    const updateData =
      action === "APPROVED" ? buildProfileUpdate((updateRequest.changes ?? {}) as Record<string, unknown>) : {};

    // Apply the changes and close the request together; the PENDING guard stops a double review
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.profileUpdateRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: action, adminNote: note, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      if (Object.keys(updateData).length > 0) {
        await tx.profile.update({ where: { userId: updateRequest.userId }, data: updateData });
      }
      return tx.profileUpdateRequest.findUnique({ where: { id: requestId } });
    });

    if (!updated) {
      return NextResponse.json({ error: "الطلب غير موجود أو تمت مراجعته" }, { status: 409 });
    }

    const approved = action === "APPROVED";
    const title = approved ? "تمت الموافقة على تعديل ملفك" : "تم رفض تعديل ملفك";
    const baseBody = approved
      ? "تمت مراجعة طلب تعديل ملفك الشخصي والموافقة عليه."
      : "تمت مراجعة طلب تعديل ملفك الشخصي ولم تتم الموافقة عليه.";
    await notify({
      userId: updateRequest.userId,
      type: "SYSTEM",
      title,
      body: note ? `${baseBody} ملاحظة الإدارة: ${note}` : baseBody,
      url: "/dashboard/profile",
    });

    return NextResponse.json({
      message: action === "APPROVED" ? "تمت الموافقة على التعديل" : "تم رفض التعديل",
      request: updated,
    });
  } catch (error) {
    console.error("Admin profile request review error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
