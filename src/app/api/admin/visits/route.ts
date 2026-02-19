import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotificationToMany } from "@/lib/onesignal";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const visits = await db.visitRequest.findMany({
      include: {
        match: {
          include: {
            female: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                parentInfo: {
                  select: {
                    parentName: true,
                    parentPhone: true,
                    relationship: true,
                    address: true,
                    notes: true,
                  },
                },
              },
            },
            male: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                parentInfo: {
                  select: {
                    parentName: true,
                    parentPhone: true,
                    relationship: true,
                    address: true,
                    notes: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ visits });
  } catch (error) {
    console.error("Admin visits error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

const visitStatusLabels: Record<string, string> = {
  REQUESTED: "طلب زيارة مرسل",
  FAMILIES_CONTACTED: "تم التواصل مع العائلات",
  SCHEDULED: "تم تحديد موعد الزيارة",
  COMPLETED: "تمت الزيارة",
  CANCELLED: "ملغاة",
};

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
    const { visitId, status, scheduledDate, location, adminNotes } = body;

    if (!visitId || !status) {
      return NextResponse.json({ error: "معرف الزيارة والحالة مطلوبان" }, { status: 400 });
    }

    const visit = await db.visitRequest.update({
      where: { id: visitId },
      data: {
        status,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        location: location || undefined,
        adminNotes: adminNotes || undefined,
      },
      include: {
        match: { select: { femaleId: true, maleId: true } },
      },
    });

    // Notify both users
    await db.notification.createMany({
      data: [
        {
          userId: visit.match.femaleId,
          type: "VISIT_UPDATE",
          title: "تحديث طلب الزيارة",
          body: `تم تحديث حالة طلب الزيارة إلى: ${visitStatusLabels[status] || status}`,
        },
        {
          userId: visit.match.maleId,
          type: "VISIT_UPDATE",
          title: "تحديث طلب الزيارة",
          body: `تم تحديث حالة طلب الزيارة إلى: ${visitStatusLabels[status] || status}`,
        },
      ],
    });

    // Push notifications
    sendPushNotificationToMany([visit.match.femaleId, visit.match.maleId], {
      title: "تحديث طلب الزيارة",
      body: `تم تحديث حالة طلب الزيارة إلى: ${visitStatusLabels[status] || status}`,
      url: "/dashboard/matches",
    });

    return NextResponse.json({ message: "تم تحديث الزيارة", visit });
  } catch (error) {
    console.error("Admin visit update error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
