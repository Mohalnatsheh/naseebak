import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const docs = await db.identityDoc.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, gender: true },
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

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

    // If approved, update user's verified status and status enum
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
      // If rejected, set user status to REJECTED
      await db.user.update({
        where: { id: doc.userId },
        data: {
          status: "REJECTED",
        },
      });
    }

    // Create notification for the user
    const identityTitle = action === "approve" ? "تم التحقق من هويتك" : "تم رفض وثيقة الهوية";
    const identityBody = action === "approve"
      ? "تهانينا! تم التحقق من هويتك بنجاح. يمكنك الآن استخدام جميع ميزات المنصة."
      : `تم رفض وثيقة الهوية. ${rejectionReason || reviewNotes || "يرجى رفع وثيقة جديدة واضحة."}`;

    await db.notification.create({
      data: {
        userId: doc.userId,
        type: "IDENTITY",
        title: identityTitle,
        body: identityBody,
      },
    });

    // Push notification
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
