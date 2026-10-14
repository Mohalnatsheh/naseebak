import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") || "pending";
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);

    if (tab === "history") {
      const [docs, total] = await Promise.all([
        db.identityDoc.findMany({
          where: { status: { not: "PENDING" } },
          skip,
          take: pageSize,
          orderBy: { reviewedAt: "desc" },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, gender: true },
            },
            reviewedBy: {
              select: { firstName: true, lastName: true },
            },
          },
        }),
        db.identityDoc.count({ where: { status: { not: "PENDING" } } }),
      ]);

      return NextResponse.json({
        docs,
        total,
        page,
        totalPages: Math.ceil(total / pageSize),
      });
    }

    // Default: pending — include profile photos so admins can compare them with the selfie
    const docs = await db.identityDoc.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            gender: true,
            photos: { select: { id: true, url: true }, orderBy: { order: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ docs });
  } catch (error) {
    console.error("Admin identity error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { docId, action, reviewNotes, rejectionReason } = body;

    if (!docId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
    }

    const doc = await db.identityDoc.update({
      where: { id: docId },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        reviewNotes: reviewNotes || null,
        rejectionReason: action === "reject" ? (rejectionReason || null) : null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    });

    if (action === "approve") {
      await db.user.update({
        where: { id: doc.userId },
        data: {
          isVerified: true,
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      });
    } else {
      // Verification is optional — a rejected selfie only removes the verified badge,
      // it does not block or reject the account itself.
      await db.user.update({
        where: { id: doc.userId },
        data: {
          isVerified: false,
          verifiedAt: null,
        },
      });
    }

    const identityTitle = action === "approve" ? "تم التحقق من هويتك" : "تم رفض صورة التحقق";
    const identityBody = action === "approve"
      ? "تهانينا! تم التحقق من هويتك بنجاح وأصبح حسابك يحمل شارة الحساب الموثّق."
      : `تم رفض صورة التحقق. ${rejectionReason || reviewNotes || "يرجى التقاط صورة سيلفي جديدة وواضحة."}`;

    await db.notification.create({
      data: {
        userId: doc.userId,
        type: "IDENTITY",
        title: identityTitle,
        body: identityBody,
      },
    });

    sendPushNotification({
      userId: doc.userId,
      title: identityTitle,
      body: identityBody,
      url: "/dashboard/identity",
    });

    return NextResponse.json({ message: `تم ${action === "approve" ? "قبول" : "رفض"} الهوية بنجاح`, doc });
  } catch (error) {
    console.error("Admin identity review error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
