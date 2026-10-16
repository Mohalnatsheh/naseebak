import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import { calculateCompatibility } from "@/lib/matching/score";
import { parsePagination } from "@/lib/utils";
import { getCycleFlags } from "@/lib/settings";
import type { Prisma } from "@prisma/client";
import { notifyMany } from "@/lib/notify";
import { MUTUAL_SUGGESTION_MS } from "@/lib/suggestions/mutual";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);
    const status = url.searchParams.get("status") || "";

    // Shared (MUTUAL) suggestions expire lazily: a PENDING row past expiresAt is shown as EXPIRED
    const now = new Date();
    const where: Prisma.SuggestionWhereInput =
      status === "EXPIRED"
        ? { OR: [{ status: "EXPIRED" }, { status: "PENDING", expiresAt: { lt: now } }] }
        : status === "PENDING"
          ? { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
          : status
            ? { status: status as "ACCEPTED" | "REJECTED" }
            : {};

    const [suggestions, total, flags] = await Promise.all([
      db.suggestion.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          compatibilityScore: true,
          status: true,
          source: true,
          createdAt: true,
          flow: true,
          expiresAt: true,
          recipientDecision: true,
          candidateDecision: true,
          recipient: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
          candidate: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
        },
      }),
      db.suggestion.count({ where }),
      getCycleFlags(),
    ]);

    return NextResponse.json({
      flags,
      suggestions,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin suggestions list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

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

    // Simultaneous flow: both people see the suggestion and decide
    const { mutualSuggestions } = await getCycleFlags();
    const suggestion = await db.suggestion.create({
      data: {
        recipientId,
        candidateId,
        compatibilityScore: computedScore || 85,
        source: "ADMIN",
        ...(mutualSuggestions && { flow: "MUTUAL" as const, expiresAt: new Date(Date.now() + MUTUAL_SUGGESTION_MS) }),
      },
    });
    if (mutualSuggestions) {
      await notifyMany([recipientId, candidateId], {
        type: "SUGGESTION",
        title: "اقتراح جديد من الإدارة",
        body: "لديك اقتراح توافق جديد من فريق نصيبك. قم بمراجعته.",
        url: "/dashboard/suggestions",
      });
      return NextResponse.json({ message: "تم إنشاء الاقتراح", suggestion });
    }

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
