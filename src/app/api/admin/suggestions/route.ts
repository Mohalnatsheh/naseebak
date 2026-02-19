import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import { calculateCompatibility } from "@/lib/matching/score";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const status = url.searchParams.get("status") || "";
    const limit = 20;
    const skip = (page - 1) * limit;

    const where = status ? { status: status as "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" } : {};

    const [suggestions, total] = await Promise.all([
      db.suggestion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          compatibilityScore: true,
          status: true,
          source: true,
          createdAt: true,
          recipient: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
          candidate: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
        },
      }),
      db.suggestion.count({ where }),
    ]);

    return NextResponse.json({
      suggestions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin suggestions list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const body = await request.json();
    const { recipientId, candidateId, compatibilityScore: manualScore } = body;

    if (!recipientId || !candidateId) {
      return NextResponse.json({ error: "كلا المستخدمين مطلوبان" }, { status: 400 });
    }

    // Auto-compute score if not manually specified
    let computedScore = manualScore;
    if (!computedScore) {
      try {
        const [userA, userB] = await Promise.all([
          db.user.findUnique({
            where: { id: recipientId },
            select: {
              id: true, gender: true, profile: true,
              personalityResult: { select: { vector: true } },
              photos: { select: { id: true } },
              identityDoc: { select: { status: true } },
            },
          }),
          db.user.findUnique({
            where: { id: candidateId },
            select: {
              id: true, gender: true, profile: true,
              personalityResult: { select: { vector: true } },
              photos: { select: { id: true } },
              identityDoc: { select: { status: true } },
            },
          }),
        ]);
        if (userA && userB) {
          computedScore = calculateCompatibility(userA as any, userB as any);
        }
      } catch {
        // Fall back to default
      }
    }

    const suggestion = await db.suggestion.create({
      data: {
        recipientId,
        candidateId,
        compatibilityScore: computedScore || 85,
        source: "ADMIN",
      },
    });

    // Notify the recipient
    await db.notification.create({
      data: {
        userId: recipientId,
        type: "SUGGESTION",
        title: "اقتراح جديد من الإدارة",
        body: "لديك اقتراح توافق جديد من فريق نصيبك. قم بمراجعته.",
      },
    });

    // Push notification
    sendPushNotification({
      userId: recipientId,
      title: "اقتراح جديد من الإدارة",
      body: "لديك اقتراح توافق جديد من فريق نصيبك. قم بمراجعته.",
      url: "/dashboard/suggestions",
    });

    return NextResponse.json({ message: "تم إنشاء الاقتراح", suggestion });
  } catch (error) {
    console.error("Admin suggestion error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
